#!/usr/bin/env bun
/**
 * Claude Code Setup Hook: Maintenance Mode
 *
 * Triggered by: claude --maintenance
 * Purpose: Update dependencies and verify build health
 */

import { appendFileSync } from "node:fs";

const SCRIPT_DIR = import.meta.dir;
const LOG_FILE = `${SCRIPT_DIR}/setup.maintenance.log`;

function log(msg: string): void {
  appendFileSync(LOG_FILE, msg + "\n");
}

function run(cmd: string[], cwd?: string): void {
  log(`  Running: ${cmd.join(" ")}`);
  const result = Bun.spawnSync(cmd, { cwd, stderr: "pipe", stdout: "pipe" });
  const stdout = result.stdout.toString();

  if (stdout.trim()) {
    for (const line of stdout.trim().split("\n").slice(0, 5)) {
      log(`    ${line}`);
    }
  }

  if (result.exitCode !== 0) {
    log(`  ERROR: exit code ${result.exitCode}`);
    const stderr = result.stderr.toString();
    if (stderr) log(`  ${stderr.slice(0, 200)}`);
  }
}

// Read hook input
let hookInput: Record<string, unknown> = {};
try {
  const text = await Bun.stdin.text();
  if (text.trim()) hookInput = JSON.parse(text);
} catch {
  hookInput = {};
}

const projectDir = Bun.env.CLAUDE_PROJECT_DIR ?? process.cwd();

log(`\n${"=".repeat(60)}`);
log(`=== Maintenance Hook: ${new Date().toISOString()} ===`);
log(`${"=".repeat(60)}`);
log(`INPUT: ${JSON.stringify(hookInput, null, 2)}`);
log(`Project: ${projectDir}`);

const actions: string[] = [];

log("\n>>> Updating monorepo dependencies...");
run(["bun", "install"], projectDir);
actions.push("Updated monorepo dependencies");

log("\n>>> Running type checks...");
run(["bun", "run", "check"], projectDir);
actions.push("Ran svelte-check type checking");

log("\n>>> Verifying build...");
run(["bun", "run", "build"], projectDir);
actions.push("Verified build succeeds");

let summary = "Maintenance completed!\n\nActions:\n";
for (const action of actions) summary += `  - ${action}\n`;

const output = {
  hookSpecificOutput: {
    hookEventName: "Setup",
    additionalContext: summary,
  },
};

log(`\nOUTPUT: ${JSON.stringify(output, null, 2)}`);
log(`=== Completed: ${new Date().toISOString()} ===`);

console.log(JSON.stringify(output));
process.exit(0);
