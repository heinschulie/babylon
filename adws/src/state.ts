import { join } from "path";
import { mkdirSync, existsSync, readFileSync, readdirSync } from "fs";
import { ADWStateDataSchema, type ADWStateData } from "./schemas";
import { getProjectRoot } from "./utils";
import type { Logger } from "./logger";

const CORE_FIELDS = new Set([
  "adw_id",
  "issue_number",
  "branch_name",
  "plan_file",
  "issue_class",
  "worktree_path",
  "backend_port",
  "frontend_port",
  "model_set",
  "base_branch",
  "all_adws",
]);

export class ADWState {
  readonly adwId: string;
  private data: Record<string, unknown>;
  private logDir: string | undefined;

  constructor(adwId: string, logDir?: string) {
    if (!adwId) throw new Error("adw_id is required for ADWState");
    this.adwId = adwId;
    this.logDir = logDir;
    this.data = { adw_id: adwId };
  }

  setLogDir(dir: string): void {
    this.logDir = dir;
  }

  update(fields: Partial<ADWStateData>): void {
    for (const [key, value] of Object.entries(fields)) {
      if (CORE_FIELDS.has(key)) {
        this.data[key] = value;
      }
    }
  }

  get<K extends keyof ADWStateData>(key: K): ADWStateData[K] | undefined;
  get(key: string, defaultValue?: unknown): unknown;
  get(key: string, defaultValue?: unknown): unknown {
    return this.data[key] ?? defaultValue;
  }

  appendAdwId(adwId: string): void {
    const allAdws = (this.data.all_adws as string[]) ?? [];
    if (!allAdws.includes(adwId)) {
      allAdws.push(adwId);
      this.data.all_adws = allAdws;
    }
  }

  getWorkingDirectory(): string {
    const worktreePath = this.data.worktree_path as string | undefined;
    if (worktreePath) return worktreePath;
    return getProjectRoot();
  }

  getStatePath(): string {
    if (this.logDir) {
      return join(this.logDir, "state.json");
    }
    // Legacy fallback (should not be hit once all callers pass logDir)
    return join(getProjectRoot(), "temp", "builds", `_state_${this.adwId}.json`);
  }

  async save(_workflowStep?: string): Promise<void> {
    const statePath = this.getStatePath();
    mkdirSync(join(statePath, ".."), { recursive: true });

    // Validate with Zod before saving
    const stateData = ADWStateDataSchema.parse(this.data);
    await Bun.write(statePath, JSON.stringify(stateData, null, 2));
  }

  /** Find the build directory for this adwId by scanning temp/builds/. */
  private static findLogDir(adwId: string): string | undefined {
    const buildsDir = join(getProjectRoot(), "temp", "builds");
    if (!existsSync(buildsDir)) return undefined;
    try {
      for (const entry of readdirSync(buildsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (!entry.name.endsWith(`_${adwId}`)) continue;
        const candidate = join(buildsDir, entry.name, "state.json");
        if (existsSync(candidate)) return join(buildsDir, entry.name);
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  static load(adwId: string, logger?: Logger, logDir?: string): ADWState | null {
    // 1. Try explicit logDir
    // 2. Scan temp/builds/ for dir ending with _{adwId}
    // 3. Legacy _state_{adwId}.json fallback
    const resolvedLogDir = logDir ?? ADWState.findLogDir(adwId);

    const candidates: string[] = [];
    if (resolvedLogDir) candidates.push(join(resolvedLogDir, "state.json"));
    candidates.push(join(getProjectRoot(), "temp", "builds", `_state_${adwId}.json`));

    for (const statePath of candidates) {
      if (!existsSync(statePath)) continue;

      try {
        const raw = readFileSync(statePath, "utf-8");
        const data = JSON.parse(raw);
        const stateData = ADWStateDataSchema.parse(data);

        const state = new ADWState(stateData.adw_id, resolvedLogDir);
        state.data = stateData as Record<string, unknown>;

        if (logger) {
          logger.info(`Found existing state from ${statePath}`);
          logger.debug(`State: ${JSON.stringify(stateData, null, 2)}`);
        }

        return state;
      } catch (e) {
        if (logger) logger.error(`Failed to load state from ${statePath}: ${e}`);
      }
    }

    return null;
  }

  static fromStdin(): ADWState | null {
    // In Bun, check if stdin is a TTY
    if (process.stdin.isTTY) return null;
    try {
      // Synchronous stdin read isn't straightforward in Bun
      // This is rarely used — keep as no-op for now
      return null;
    } catch {
      return null;
    }
  }

  toStdout(): void {
    const outputData: Record<string, unknown> = {
      adw_id: this.data.adw_id,
      issue_number: this.data.issue_number,
      branch_name: this.data.branch_name,
      plan_file: this.data.plan_file,
      issue_class: this.data.issue_class,
      worktree_path: this.data.worktree_path,
      base_branch: this.data.base_branch,
      backend_port: this.data.backend_port,
      frontend_port: this.data.frontend_port,
      all_adws: this.data.all_adws ?? [],
    };
    console.log(JSON.stringify(outputData, null, 2));
  }
}
