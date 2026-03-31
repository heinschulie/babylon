/**
 * Timekeeper agent — monitors step execution via JSONL files and makes health judgments.
 *
 * Watches `raw_output.jsonl` files to distinguish between healthy progress
 * and pathological behavior (stalling, looping). Signals termination via
 * `.kill` files when intervention is needed.
 */

import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { join } from "path";
import { quickPrompt } from "./agent-sdk";
import { getWorkflowModels } from "./utils";

export interface KillFilePayload {
  reason: "looping" | "stalling";
  description: string;
  state: "looping" | "stalling";
  last_tool_calls: string[];
  lines_at_kill: number;
  killed_at: string;
}

export interface HealthState {
  state: "healthy" | "throttled" | "stalling" | "looping";
  reason?: string;
  lastToolCalls?: string[];
}

export interface TimekeeperConfig {
  /** Log directory containing step subdirectories */
  logDir: string;
  /** ADW ID for logging context */
  adwId: string;
  /** Issue number being processed */
  issueNumber: number;
  /** How often to check (default: 2 minutes after first check) */
  checkIntervalMs?: number;
  /** Initial delay before first check (default: 1 minute) */
  initialDelayMs?: number;
  /** Grace period for stalling detection (default: 2 minutes) */
  stallingGraceMs?: number;
}

export interface JsonlEntry {
  type: string;
  tool_name?: string;
  parameters?: Record<string, any>;
  timestamp?: string;
  rate_limit_event?: boolean;
  [key: string]: any;
}

/**
 * Parse a JSONL file and return the entries.
 */
function parseJsonlFile(filePath: string): JsonlEntry[] {
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, "utf-8").trim();
    if (!content) return [];

    return content
      .split("\n")
      .filter(line => line.trim())
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { type: "parse_error", raw: line };
        }
      });
  } catch {
    return [];
  }
}

/**
 * Extract recent tool calls from JSONL entries with arguments.
 */
function extractRecentToolCalls(entries: JsonlEntry[], count: number = 6): { name: string; argsHash?: string }[] {
  return entries
    .filter(entry => entry.type === "tool_use" || entry.tool_name || (entry.type === "assistant" && entry.message?.content))
    .slice(-count)
    .map(entry => {
      let name = "unknown";
      let argsHash: string | undefined;

      if (entry.tool_name) {
        // Old format - tool_name directly on entry
        name = entry.tool_name;
        if (entry.parameters) {
          argsHash = JSON.stringify(entry.parameters).slice(0, 200);
        }
      } else if (entry.type === "assistant" && entry.message?.content) {
        // New format - tool calls in message.content array
        const toolCall = entry.message.content.find((c: any) => c.type === "tool_use");
        if (toolCall) {
          name = toolCall.name || "unknown";
          if (toolCall.input) {
            argsHash = JSON.stringify(toolCall.input).slice(0, 200);
          }
        }
      } else if (entry.type === "tool_use") {
        name = entry.type;
      }

      return { name, argsHash };
    });
}

/**
 * Check if agent is in a looping state, distinguishing obvious from ambiguous cases.
 */
function detectLooping(toolCalls: { name: string; argsHash?: string }[]): {
  verdict: "looping" | "ambiguous" | "not_looping";
  description?: string;
  toolCalls?: string[]
} {
  if (toolCalls.length < 3) return { verdict: "not_looping" };

  const recentCalls = toolCalls.slice(-6);

  // Group calls by tool name and args hash
  const callGroups = new Map<string, { count: number; argsHashes: Set<string> }>();

  for (const call of recentCalls) {
    const key = call.name;
    if (!callGroups.has(key)) {
      callGroups.set(key, { count: 0, argsHashes: new Set() });
    }
    const group = callGroups.get(key)!;
    group.count++;
    if (call.argsHash) {
      group.argsHashes.add(call.argsHash);
    }
  }

  // Check for obvious looping (same tool with identical arguments 3+ times)
  for (const [toolName, group] of callGroups.entries()) {
    if (group.count >= 3) {
      // If all args are the same (or no args), it's obvious looping
      if (group.argsHashes.size <= 1) {
        return {
          verdict: "looping",
          description: `Agent called ${toolName} ${group.count} times with identical arguments`,
          toolCalls: recentCalls.map(c => c.name)
        };
      }
      // Same tool name with different args - ambiguous
      else {
        return {
          verdict: "ambiguous",
          description: `Agent called ${toolName} ${group.count} times with different arguments`,
          toolCalls: recentCalls.map(c => c.name)
        };
      }
    }
  }

  // Check for immediate repetition (same tool called 2+ times in a row)
  if (recentCalls.length >= 2) {
    const last = recentCalls[recentCalls.length - 1];
    const secondLast = recentCalls[recentCalls.length - 2];

    if (last.name === secondLast.name) {
      if (last.argsHash === secondLast.argsHash) {
        return {
          verdict: "looping",
          description: `Agent called ${last.name} repeatedly with identical arguments`,
          toolCalls: recentCalls.map(c => c.name)
        };
      } else {
        return {
          verdict: "ambiguous",
          description: `Agent called ${last.name} repeatedly with different arguments`,
          toolCalls: recentCalls.map(c => c.name)
        };
      }
    }
  }

  return { verdict: "not_looping" };
}

/**
 * Use haiku LLM to classify agent health for ambiguous cases.
 */
async function classifyWithHaiku(
  recentEntries: JsonlEntry[],
  heuristicVerdict: string
): Promise<"HEALTHY" | "LOOPING" | "STALLING"> {
  try {
    const models = getWorkflowModels();
    const recentLines = recentEntries.slice(-10).map(entry => JSON.stringify(entry)).join('\n');

    const prompt = `You are a build health monitor. Given these recent agent actions from a JSONL log, classify the agent's health as one of: HEALTHY (making progress), LOOPING (repeating the same action without progress), STALLING (no meaningful activity).

Recent actions:
${recentLines}

Heuristic assessment: ${heuristicVerdict}

Respond with exactly one word: HEALTHY, LOOPING, or STALLING.`;

    const result = await quickPrompt(prompt, {
      model: models.research, // haiku model
      timeout: 15000, // 15 second timeout
    });

    // Parse single-word response
    const response = result.result?.trim().toUpperCase();
    if (response === "HEALTHY" || response === "LOOPING" || response === "STALLING") {
      console.log(`[timekeeper] Haiku classification: ${response}`);
      return response;
    }

    console.log(`[timekeeper] Haiku returned unexpected response: ${response}, falling back to HEALTHY`);
    return "HEALTHY"; // Safe default
  } catch (error) {
    console.log(`[timekeeper] Haiku classification failed: ${error}, falling back to HEALTHY`);
    return "HEALTHY"; // Safe default on failure
  }
}

/**
 * Assess the health of the running step based on JSONL content.
 */
async function assessStepHealth(
  entries: JsonlEntry[],
  hasNewActivity: boolean,
  timeSinceLastNewLine: number,
  stallingGraceMs: number,
): Promise<HealthState> {
  if (entries.length === 0) {
    return { state: "stalling", reason: "No JSONL entries found" };
  }

  // Check for rate limiting
  const hasRecentRateLimit = entries
    .slice(-10)
    .some(entry => entry.rate_limit_event || entry.type === "rate_limit");

  // Get recent tool calls for looping detection
  const recentToolCalls = extractRecentToolCalls(entries, 6);

  // Check for looping behavior
  const looping = detectLooping(recentToolCalls);

  if (looping.verdict === "looping") {
    return {
      state: "looping",
      reason: looping.description,
      lastToolCalls: looping.toolCalls || recentToolCalls.map(c => c.name),
    };
  }

  // Handle ambiguous cases with haiku
  if (looping.verdict === "ambiguous") {
    const haikuResult = await classifyWithHaiku(entries, looping.description || "ambiguous tool usage");

    if (haikuResult === "LOOPING") {
      return {
        state: "looping",
        reason: `Haiku confirmed looping: ${looping.description}`,
        lastToolCalls: looping.toolCalls || recentToolCalls.map(c => c.name),
      };
    }
    // HEALTHY or STALLING from haiku - continue with activity-based assessment
  }

  // Check for new activity based on line count growth
  if (hasNewActivity) {
    // New activity detected - healthy
    return { state: "healthy" };
  }

  if (hasRecentRateLimit) {
    // Rate limited but no new entries - treat as throttled (patience)
    return { state: "throttled", reason: "Rate limited, waiting for recovery" };
  }

  // No new activity and no rate limit - report stalling (main loop manages grace period)
  return {
    state: "stalling",
    reason: `No new JSONL activity for ${Math.round(timeSinceLastNewLine / 1000)}s`,
    lastToolCalls: recentToolCalls.map(c => c.name),
  };
}

/**
 * Write a kill file to signal step termination.
 */
function writeKillFile(stepDir: string, payload: KillFilePayload): void {
  const killFilePath = join(stepDir, ".kill");
  writeFileSync(killFilePath, JSON.stringify(payload, null, 2));
}

/**
 * Check if a kill file already exists.
 */
function killFileExists(stepDir: string): boolean {
  return existsSync(join(stepDir, ".kill"));
}

/**
 * Get the last modification time of the JSONL file.
 */
function getJsonlLastModified(stepDir: string): number {
  const jsonlPath = join(stepDir, "raw_output.jsonl");
  if (!existsSync(jsonlPath)) return 0;

  try {
    return statSync(jsonlPath).mtime.getTime();
  } catch {
    return 0;
  }
}

/**
 * Find the currently active step directory in the log directory.
 * Returns the step directory that has the most recent JSONL activity.
 */
function findActiveStepDir(logDir: string, issueNumber: number): { stepDir: string; stepName: string } | null {
  try {
    const { readdirSync } = require("fs");
    const entries = readdirSync(logDir, { withFileTypes: true });

    let mostRecentDir = null;
    let mostRecentTime = 0;
    let mostRecentStepName = "";

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      // Look for step directories with pattern: {issue}_{step}_{name}
      const dirName = entry.name;
      const stepPattern = new RegExp(`^${issueNumber}_(\\d+)_(.+)$`);
      const match = dirName.match(stepPattern);

      if (!match) continue;

      const stepDir = join(logDir, dirName);
      const jsonlTime = getJsonlLastModified(stepDir);

      // Also check if status.json exists and is not marked as complete
      const statusPath = join(stepDir, "status.json");
      if (existsSync(statusPath)) {
        try {
          const status = JSON.parse(readFileSync(statusPath, "utf-8"));
          if (status.completed) continue; // Skip completed steps
        } catch {
          // Ignore parse errors, treat as potentially active
        }
      }

      if (jsonlTime > mostRecentTime) {
        mostRecentTime = jsonlTime;
        mostRecentDir = stepDir;
        mostRecentStepName = match[2]; // Extract step name from pattern
      }
    }

    return mostRecentDir ? { stepDir: mostRecentDir, stepName: mostRecentStepName } : null;
  } catch {
    return null;
  }
}

/**
 * Main timekeeper monitoring loop.
 */
export async function runTimekeeper(config: TimekeeperConfig): Promise<void> {
  const {
    logDir,
    adwId,
    issueNumber,
    checkIntervalMs = 2 * 60 * 1000, // 2 minutes
    initialDelayMs = 1 * 60 * 1000,   // 1 minute
    stallingGraceMs = 2 * 60 * 1000,  // 2 minutes
  } = config;

  console.log(`[timekeeper] Starting monitoring for ${adwId} issue #${issueNumber}`);
  console.log(`[timekeeper] Watching log directory: ${logDir}`);

  let stallingStartTime: number | null = null;
  let currentStepDir: string | null = null;
  let currentStepName = "";
  let lastLineCount = 0;
  let lastNewLineTime = Date.now();

  // Initial delay before first check
  await new Promise(resolve => setTimeout(resolve, initialDelayMs));

  while (true) {
    // Find the currently active step
    const activeStep = findActiveStepDir(logDir, issueNumber);

    if (!activeStep) {
      console.log(`[timekeeper] No active step found for issue #${issueNumber}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      continue;
    }

    // Check if we switched to a new step
    if (currentStepDir !== activeStep.stepDir) {
      if (currentStepDir) {
        console.log(`[timekeeper] Switched from ${currentStepName} to ${activeStep.stepName}`);
      } else {
        console.log(`[timekeeper] Started monitoring ${activeStep.stepName}`);
      }
      currentStepDir = activeStep.stepDir;
      currentStepName = activeStep.stepName;
      // Reset timers and counters when switching steps
      stallingStartTime = null;
      lastLineCount = 0;
      lastNewLineTime = Date.now();
    }

    // Check if step is complete (kill file exists)
    if (killFileExists(currentStepDir)) {
      console.log(`[timekeeper] Kill file exists for ${currentStepName}, continuing to monitor for new steps`);
      currentStepDir = null;
      currentStepName = "";
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      continue;
    }

    // Parse current JSONL file
    const jsonlPath = join(currentStepDir, "raw_output.jsonl");
    const entries = parseJsonlFile(jsonlPath);
    const currentTime = Date.now();
    const currentLineCount = entries.length;

    // Check for new activity based on line count growth
    const hasNewActivity = currentLineCount > lastLineCount;
    if (hasNewActivity) {
      lastNewLineTime = currentTime;
      lastLineCount = currentLineCount;
    }

    const timeSinceLastNewLine = currentTime - lastNewLineTime;

    // Assess health
    const health = await assessStepHealth(entries, hasNewActivity, timeSinceLastNewLine, stallingGraceMs);

    console.log(`[timekeeper] ${currentStepName}: ${health.state} ${health.reason ? `(${health.reason})` : ""}`);

    // Handle state-specific logic
    switch (health.state) {
      case "healthy":
        // Reset stalling timer if we were previously stalling
        stallingStartTime = null;
        break;

      case "throttled":
        // Patience - agent is rate limited but progressing
        stallingStartTime = null;
        break;

      case "stalling":
        if (stallingStartTime === null) {
          // First time detecting stalling - start grace period
          stallingStartTime = currentTime;
          console.log(`[timekeeper] ${currentStepName}: Stalling detected, starting grace period`);
        } else {
          // Check if grace period has elapsed
          const stallingDuration = currentTime - stallingStartTime;
          if (stallingDuration > stallingGraceMs) {
            console.log(`[timekeeper] ${currentStepName}: Stalling grace period exceeded, killing step`);
            writeKillFile(currentStepDir, {
              reason: "stalling",
              description: `No JSONL activity for ${Math.round(stallingDuration / 1000)}s`,
              state: "stalling",
              last_tool_calls: health.lastToolCalls || [],
              lines_at_kill: entries.length,
              killed_at: new Date().toISOString(),
            });
            // Continue monitoring for next step
            stallingStartTime = null;
            currentStepDir = null;
            currentStepName = "";
            continue;
          }
        }
        break;

      case "looping":
        console.log(`[timekeeper] ${currentStepName}: Looping detected, killing step immediately`);
        writeKillFile(currentStepDir, {
          reason: "looping",
          description: health.reason || "Detected looping behavior",
          state: "looping",
          last_tool_calls: health.lastToolCalls || [],
          lines_at_kill: entries.length,
          killed_at: new Date().toISOString(),
        });
        // Continue monitoring for next step
        stallingStartTime = null;
        currentStepDir = null;
        currentStepName = "";
        continue;
    }

    // Wait for next check
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }
}

/**
 * Spawn a timekeeper process for the given log directory.
 * Returns a promise that resolves when monitoring ends and a function to terminate monitoring.
 */
export function spawnTimekeeper(config: TimekeeperConfig): {
  promise: Promise<void>;
  terminate: () => void;
} {
  let shouldTerminate = false;

  const promise = runTimekeeperWithTermination({ ...config, shouldTerminate: () => shouldTerminate });
  const terminate = () => { shouldTerminate = true; };

  return { promise, terminate };
}

/**
 * Modified timekeeper that checks for termination signal.
 */
async function runTimekeeperWithTermination(
  config: TimekeeperConfig & { shouldTerminate: () => boolean }
): Promise<void> {
  const {
    logDir,
    adwId,
    issueNumber,
    shouldTerminate,
    checkIntervalMs = 2 * 60 * 1000,
    initialDelayMs = 1 * 60 * 1000,
    stallingGraceMs = 2 * 60 * 1000,
  } = config;

  console.log(`[timekeeper] Starting monitoring for ${adwId} issue #${issueNumber}`);
  console.log(`[timekeeper] Watching log directory: ${logDir}`);

  let stallingStartTime: number | null = null;
  let currentStepDir: string | null = null;
  let currentStepName = "";
  let lastLineCount = 0;
  let lastNewLineTime = Date.now();

  // Initial delay before first check
  await new Promise(resolve => setTimeout(resolve, initialDelayMs));

  while (!shouldTerminate()) {
    // Find the currently active step
    const activeStep = findActiveStepDir(logDir, issueNumber);

    if (!activeStep) {
      console.log(`[timekeeper] No active step found for issue #${issueNumber}, waiting...`);
      await new Promise(resolve => setTimeout(resolve, Math.min(checkIntervalMs, 10000))); // Check more frequently when no active step
      continue;
    }

    // Check if we switched to a new step
    if (currentStepDir !== activeStep.stepDir) {
      if (currentStepDir) {
        console.log(`[timekeeper] Switched from ${currentStepName} to ${activeStep.stepName}`);
      } else {
        console.log(`[timekeeper] Started monitoring ${activeStep.stepName}`);
      }
      currentStepDir = activeStep.stepDir;
      currentStepName = activeStep.stepName;
      // Reset timers and counters when switching steps
      stallingStartTime = null;
      lastLineCount = 0;
      lastNewLineTime = Date.now();
    }

    // Check if step is complete (kill file exists)
    if (killFileExists(currentStepDir)) {
      console.log(`[timekeeper] Kill file exists for ${currentStepName}, continuing to monitor for new steps`);
      currentStepDir = null;
      currentStepName = "";
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      continue;
    }

    // Parse current JSONL file
    const jsonlPath = join(currentStepDir, "raw_output.jsonl");
    const entries = parseJsonlFile(jsonlPath);
    const currentTime = Date.now();
    const currentLineCount = entries.length;

    // Check for new activity based on line count growth
    const hasNewActivity = currentLineCount > lastLineCount;
    if (hasNewActivity) {
      lastNewLineTime = currentTime;
      lastLineCount = currentLineCount;
    }

    const timeSinceLastNewLine = currentTime - lastNewLineTime;

    // Assess health
    const health = await assessStepHealth(entries, hasNewActivity, timeSinceLastNewLine, stallingGraceMs);

    console.log(`[timekeeper] ${currentStepName}: ${health.state} ${health.reason ? `(${health.reason})` : ""}`);

    // Handle state-specific logic
    switch (health.state) {
      case "healthy":
        stallingStartTime = null;
        break;

      case "throttled":
        stallingStartTime = null;
        break;

      case "stalling":
        if (stallingStartTime === null) {
          stallingStartTime = currentTime;
          console.log(`[timekeeper] ${currentStepName}: Stalling detected, starting grace period`);
        } else {
          const stallingDuration = currentTime - stallingStartTime;
          if (stallingDuration > stallingGraceMs) {
            console.log(`[timekeeper] ${currentStepName}: Stalling grace period exceeded, killing step`);
            writeKillFile(currentStepDir, {
              reason: "stalling",
              description: `No JSONL activity for ${Math.round(stallingDuration / 1000)}s`,
              state: "stalling",
              last_tool_calls: health.lastToolCalls || [],
              lines_at_kill: entries.length,
              killed_at: new Date().toISOString(),
            });
            stallingStartTime = null;
            currentStepDir = null;
            currentStepName = "";
            continue;
          }
        }
        break;

      case "looping":
        console.log(`[timekeeper] ${currentStepName}: Looping detected, killing step immediately`);
        writeKillFile(currentStepDir, {
          reason: "looping",
          description: health.reason || "Detected looping behavior",
          state: "looping",
          last_tool_calls: health.lastToolCalls || [],
          lines_at_kill: entries.length,
          killed_at: new Date().toISOString(),
        });
        stallingStartTime = null;
        currentStepDir = null;
        currentStepName = "";
        continue;
    }

    // Wait for next check
    await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
  }

  console.log(`[timekeeper] Monitoring ended for ${adwId} issue #${issueNumber}`);
}