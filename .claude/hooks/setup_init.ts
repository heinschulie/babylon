#!/usr/bin/env bun
/**
 * Claude Code Setup Hook: Repository Initialization
 *
 * Triggered by: claude --init or claude --init-only
 * Purpose: Install dependencies and push Convex schema for first-time setup
 */

import { appendFileSync } from "node:fs";

const SCRIPT_DIR = import.meta.dir;
const LOG_FILE = `${SCRIPT_DIR}/setup.init.log`;

// Header
const now = new Date().toISOString();
appendFileSync(LOG_FILE, `\n${"=".repeat(60)}\n=== Init Hook Started: ${now} ===\n${"=".repeat(60)}\n`);

function log(msg: string): void {
  console.error(msg);
  appendFileSync(LOG_FILE, msg + "\n");
}

function run(cmd: string[], cwd?: string): string {
  log(`  Running: ${cmd.join(" ")}`);
  const result = Bun.spawnSync(cmd, { cwd, stderr: "pipe", stdout: "pipe" });
  const stdout = result.stdout.toString();
  const lines: string[] = [];

  if (stdout.trim()) {
    for (const line of stdout.trim().split("\n").slice(0, 10)) {
      log(`    ${line}`);
      lines.push(line);
    }
  }

  if (result.exitCode !== 0) {
    log(`  ERROR: Command failed with code ${result.exitCode}`);
    const stderr = result.stderr.toString();
    if (stderr) log(`  STDERR: ${stderr.slice(0, 500)}`);
    process.exit(2);
  }

  return lines.join("\n");
}

// Read hook input from stdin
let hookInput: Record<string, unknown> = {};
try {
  const text = await Bun.stdin.text();
  if (text.trim()) hookInput = JSON.parse(text);
} catch {
  hookInput = {};
}

log("");
log("HOOK INPUT (JSON received via stdin from Claude Code):");
log("-".repeat(60));
log(Object.keys(hookInput).length ? JSON.stringify(hookInput, null, 2) : "{}");
log("");

const trigger = (hookInput.trigger as string) ?? "init";
const sessionId = (hookInput.session_id as string) ?? "unknown";
const projectDir = Bun.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const envFile = Bun.env.CLAUDE_ENV_FILE;

log("Claude Code Setup Hook: Initializing Repository");
log("-".repeat(60));
log(`Trigger: --${trigger}`);
log(`Session ID: ${sessionId}`);
log(`Project directory: ${projectDir}`);
log(`Log file: ${LOG_FILE}`);

const actions: string[] = [];

// Install monorepo dependencies
log("\n>>> Installing monorepo dependencies...");
run(["bun", "install"], projectDir);
log("Dependencies installed with bun");
actions.push("Installed monorepo dependencies with bun");

// Push Convex schema/functions
log("\n>>> Pushing Convex schema and functions...");
run(["npx", "convex", "dev", "--once"], projectDir);
log("Convex schema and functions pushed");
actions.push("Pushed Convex schema and functions");

// Persist environment variables
if (envFile) {
  log("\n>>> Setting up session environment variables...");
  const convexUrl = Bun.env.PUBLIC_CONVEX_URL ?? "";
  const siteUrl = Bun.env.SITE_URL ?? "http://localhost:5173";
  let envLines = "";
  if (convexUrl) envLines += `export CONVEX_URL='${convexUrl}'\n`;
  envLines += `export SITE_URL='${siteUrl}'\n`;
  appendFileSync(envFile, envLines);
  actions.push("Set session environment variables");
}

log("\n" + "-".repeat(60));
log("Setup Complete!");
log("-".repeat(60));

let summary = "Setup completed successfully!\n\n";
summary += "What was done:\n";
for (const action of actions) summary += `  - ${action}\n`;
summary += "\nTo start the application:\n";
summary += "  1. bun run dev (SvelteKit + Convex)\n";
summary += "\nThen visit http://localhost:5173\n";
summary += `\nLog file: ${LOG_FILE}`;

const hookOutput = {
  hookSpecificOutput: { hookEventName: "Setup", additionalContext: summary },
};

log("");
log("HOOK OUTPUT (JSON returned via stdout to Claude Code):");
log("-".repeat(60));
log(JSON.stringify(hookOutput, null, 2));

appendFileSync(LOG_FILE, `\n=== Init Hook Completed: ${new Date().toISOString()} ===\n`);

console.log(JSON.stringify(hookOutput, null, 2));
process.exit(0);
