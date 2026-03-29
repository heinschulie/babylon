/**
 * Health check — verifies the codebase compiles and builds cleanly.
 *
 * Used at loop startup to fail fast if the base branch is broken,
 * and available for ad-hoc checks from other modules.
 */

import { exec } from "./utils";
import type { Logger } from "./logger";

export interface HealthCheckResult {
  ok: boolean;
  failures: string[];
}

/**
 * Run all health checks against the codebase.
 * Returns ok: true only if every check passes.
 */
export async function runHealthCheck(
  cwd: string,
  logger: Logger,
): Promise<HealthCheckResult> {
  const failures: string[] = [];

  // 1. Type check (svelte-check across all apps)
  logger.info("[health-check] Running bun run check...");
  const check = await exec(["bun", "run", "check"], { cwd });
  if (check.exitCode !== 0) {
    const errorLines = check.stdout
      .split("\n")
      .filter((l) => l.includes("Error:"))
      .slice(0, 10)
      .join("\n");
    failures.push(`bun run check failed (exit ${check.exitCode}):\n${errorLines}`);
    logger.error(`[health-check] bun run check FAILED`);
  } else {
    logger.info("[health-check] bun run check passed");
  }

  // 2. Build (Vite bundling, SSR, imports)
  logger.info("[health-check] Running bun run build...");
  const build = await exec(["bun", "run", "build"], { cwd });
  if (build.exitCode !== 0) {
    const errorLines = build.stderr
      .split("\n")
      .filter((l) => l.includes("error") || l.includes("Error"))
      .slice(0, 10)
      .join("\n");
    failures.push(`bun run build failed (exit ${build.exitCode}):\n${errorLines}`);
    logger.error(`[health-check] bun run build FAILED`);
  } else {
    logger.info("[health-check] bun run build passed");
  }

  const ok = failures.length === 0;
  if (ok) {
    logger.info("[health-check] All checks passed");
  } else {
    logger.error(`[health-check] ${failures.length} check(s) failed`);
  }

  return { ok, failures };
}
