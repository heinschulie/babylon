#!/usr/bin/env bun
/**
 * CLI runner for health check. Exit 0 = healthy, exit 1 = failures.
 * Usage: bun run adws/scripts/health-check.ts
 */
import { runHealthCheck } from "../src/health-check";

const logger = {
  info: (msg: string) => console.log(msg),
  error: (msg: string) => console.error(msg),
  warn: (msg: string) => console.warn(msg),
  debug: () => {},
};

const result = await runHealthCheck(process.cwd(), logger);
if (!result.ok) {
  console.error("\nFAILED:", result.failures.join("\n"));
  process.exit(1);
}
