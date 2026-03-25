import { join } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { exec, getProjectRoot } from "./utils";
import type { ADWState } from "./state";
import type { Logger } from "./logger";

/** Create a git worktree for isolated ADW execution. */
export async function createWorktree(
  adwId: string,
  branchName: string,
  logger: Logger
): Promise<[string | null, string | null]> {
  const projectRoot = getProjectRoot();
  const treesDir = join(projectRoot, "trees");
  mkdirSync(treesDir, { recursive: true });

  const worktreePath = join(treesDir, adwId);

  if (existsSync(worktreePath)) {
    logger.warn(`Worktree already exists at ${worktreePath}`);
    return [worktreePath, null];
  }

  // Fetch latest
  logger.info("Fetching latest changes from origin");
  await exec(["git", "fetch", "origin"], { cwd: projectRoot });

  // Create worktree with new branch from origin/main
  let result = await exec(
    ["git", "worktree", "add", "-b", branchName, worktreePath, "origin/main"],
    { cwd: projectRoot }
  );

  if (result.exitCode !== 0) {
    // Branch may already exist — try without -b
    if (result.stderr.includes("already exists")) {
      result = await exec(
        ["git", "worktree", "add", worktreePath, branchName],
        { cwd: projectRoot }
      );
    }

    if (result.exitCode !== 0) {
      const errorMsg = `Failed to create worktree: ${result.stderr}`;
      logger.error(errorMsg);
      return [null, errorMsg];
    }
  }

  logger.info(`Created worktree at ${worktreePath} for branch ${branchName}`);
  return [worktreePath, null];
}

/** Validate worktree exists in state, filesystem, and git. */
export async function validateWorktree(
  adwId: string,
  state: ADWState
): Promise<[boolean, string | null]> {
  const worktreePath = state.get("worktree_path") as string | undefined;
  if (!worktreePath) return [false, "No worktree_path in state"];

  if (!existsSync(worktreePath))
    return [false, `Worktree directory not found: ${worktreePath}`];

  const { stdout } = await exec(["git", "worktree", "list"]);
  if (!stdout.includes(worktreePath))
    return [false, "Worktree not registered with git"];

  return [true, null];
}

/** Get absolute path to worktree. */
export function getWorktreePath(adwId: string): string {
  return join(getProjectRoot(), "trees", adwId);
}

/** Remove a worktree and clean up. */
export async function removeWorktree(
  adwId: string,
  logger: Logger
): Promise<[boolean, string | null]> {
  const worktreePath = getWorktreePath(adwId);

  const result = await exec([
    "git",
    "worktree",
    "remove",
    worktreePath,
    "--force",
  ]);

  if (result.exitCode !== 0) {
    if (existsSync(worktreePath)) {
      try {
        const { rmSync } = await import("fs");
        rmSync(worktreePath, { recursive: true, force: true });
        logger.warn(`Manually removed worktree directory: ${worktreePath}`);
      } catch (e) {
        return [
          false,
          `Failed to remove worktree: ${result.stderr}, manual cleanup failed: ${e}`,
        ];
      }
    }
  }

  logger.info(`Removed worktree at ${worktreePath}`);
  return [true, null];
}

/** Set up worktree environment by creating .ports.env file. */
export function setupWorktreeEnvironment(
  worktreePath: string,
  backendPort: number,
  frontendPort: number,
  logger: Logger
): void {
  const portsEnvPath = join(worktreePath, ".ports.env");
  const content = [
    `BACKEND_PORT=${backendPort}`,
    `FRONTEND_PORT=${frontendPort}`,
    `VITE_BACKEND_URL=http://localhost:${backendPort}`,
  ].join("\n");

  writeFileSync(portsEnvPath, content + "\n");
  logger.info(
    `Created .ports.env with Backend: ${backendPort}, Frontend: ${frontendPort}`
  );
}

/** Deterministically assign ports based on ADW ID. */
export function getPortsForAdw(adwId: string): [number, number] {
  // Convert first 8 alphanumeric chars from base 36
  const idChars = adwId
    .slice(0, 8)
    .replace(/[^a-z0-9]/gi, "");

  let index: number;
  try {
    index = parseInt(idChars, 36) % 15;
  } catch {
    // Fallback to simple hash
    let hash = 0;
    for (let i = 0; i < adwId.length; i++) {
      hash = (hash * 31 + adwId.charCodeAt(i)) | 0;
    }
    index = Math.abs(hash) % 15;
  }

  return [9100 + index, 9200 + index];
}

/** Check if a port is available for binding. */
export async function isPortAvailable(port: number): Promise<boolean> {
  try {
    const server = Bun.listen({
      hostname: "localhost",
      port,
      socket: {
        data() {},
        open() {},
        close() {},
        error() {},
      },
    });
    server.stop();
    return true;
  } catch {
    return false;
  }
}

/** Find available ports starting from deterministic assignment. */
export async function findNextAvailablePorts(
  adwId: string,
  maxAttempts: number = 15
): Promise<[number, number]> {
  const [baseBackend] = getPortsForAdw(adwId);
  const baseIndex = baseBackend - 9100;

  for (let offset = 0; offset < maxAttempts; offset++) {
    const index = (baseIndex + offset) % 15;
    const backendPort = 9100 + index;
    const frontendPort = 9200 + index;

    const [backendOk, frontendOk] = await Promise.all([
      isPortAvailable(backendPort),
      isPortAvailable(frontendPort),
    ]);

    if (backendOk && frontendOk) return [backendPort, frontendPort];
  }

  throw new Error("No available ports in the allocated range");
}
