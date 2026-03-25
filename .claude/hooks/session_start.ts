#!/usr/bin/env bun
/**
 * Claude Code SessionStart Hook: Load Environment Variables
 *
 * Triggered by: Session start, resume, clear, or compact
 * Purpose: Load environment variables from .env file into CLAUDE_ENV_FILE
 */

import { appendFileSync } from "node:fs";

const SCRIPT_DIR = import.meta.dir;
const LOG_FILE = `${SCRIPT_DIR}/session_start.log`;

function appendLog(msg: string): void {
  console.error(msg);
  appendFileSync(LOG_FILE, msg + "\n");
}

// Header
const now = new Date().toISOString();
appendFileSync(LOG_FILE, `\n${"=".repeat(60)}\n=== SessionStart Hook: ${now} ===\n${"=".repeat(60)}\n`);

// Read hook input from stdin
let hookInput: Record<string, unknown> = {};
try {
  const text = await Bun.stdin.text();
  if (text.trim()) hookInput = JSON.parse(text);
} catch {
  hookInput = {};
}

appendLog("");
appendLog("HOOK INPUT (JSON received via stdin from Claude Code):");
appendLog("-".repeat(60));
appendLog(Object.keys(hookInput).length ? JSON.stringify(hookInput, null, 2) : "{}");
appendLog("");

const projectDir = Bun.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const envFilePath = Bun.env.CLAUDE_ENV_FILE;
const source = (hookInput.source as string) ?? "unknown";
const sessionId = (hookInput.session_id as string) ?? "unknown";

appendLog("Claude Code SessionStart Hook: Loading Environment");
appendLog("-".repeat(60));
appendLog(`Source: ${source}`);
appendLog(`Session ID: ${sessionId}`);
appendLog(`Project directory: ${projectDir}`);
appendLog(`CLAUDE_ENV_FILE: ${envFilePath ?? "not set"}`);
appendLog(`Log file: ${LOG_FILE}`);

const dotenvPath = `${projectDir}/.env`;
const loadedVars: string[] = [];

if (envFilePath) {
  const dotenvFile = Bun.file(dotenvPath);
  if (await dotenvFile.exists()) {
    appendLog(`\n>>> Loading variables from ${dotenvPath}...`);
    const content = await dotenvFile.text();
    const exportLines: string[] = [];

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;

      const key = trimmed.slice(0, eqIdx).trim();
      let value = trimmed.slice(eqIdx + 1).trim();

      // Strip surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      const escaped = value.replace(/'/g, "'\"'\"'");
      exportLines.push(`export ${key}='${escaped}'`);
      loadedVars.push(key);
      appendLog(`  Loaded: ${key}`);
    }

    appendFileSync(envFilePath, exportLines.join("\n") + "\n");
  } else {
    appendLog(`\n>>> No .env file found at ${dotenvPath}`);
  }

  // Mock variable
  appendLog("\n>>> Adding mock session variable...");
  appendFileSync(envFilePath, "export MOCK_SESSION_VAR='hello_from_session_start'\n");
  loadedVars.push("MOCK_SESSION_VAR");
  appendLog("  Added: MOCK_SESSION_VAR='hello_from_session_start'");
} else {
  appendLog("\n>>> CLAUDE_ENV_FILE not available - cannot persist variables");
}

appendLog("\n" + "-".repeat(60));
appendLog("SessionStart Complete!");
appendLog("-".repeat(60));

const contextParts = [`SessionStart hook ran (source: ${source}).`];
if (loadedVars.length) {
  contextParts.push(`Loaded environment variables: ${loadedVars.join(", ")}`);
} else {
  contextParts.push("No CLAUDE_ENV_FILE available - environment variables not persisted.");
}

const output = {
  hookSpecificOutput: {
    hookEventName: "SessionStart",
    additionalContext: contextParts.join(" "),
  },
};

appendLog("");
appendLog("HOOK OUTPUT (JSON returned via stdout to Claude Code):");
appendLog("-".repeat(60));
appendLog(JSON.stringify(output, null, 2));

appendFileSync(LOG_FILE, `\n=== SessionStart Hook Completed: ${new Date().toISOString()} ===\n`);

console.log(JSON.stringify(output));
process.exit(0);
