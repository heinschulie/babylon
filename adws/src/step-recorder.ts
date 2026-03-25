/**
 * StepRecorder — single source of truth for structured step output.
 *
 * Both classic `runStep()` and ralph use this to produce per-step
 * status.json, .log files, and deterministic files_changed via git diff.
 */

import { join } from "path";
import { mkdirSync, renameSync, existsSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import { getHeadSha, diffFileList } from "./git-ops";
import type { StepUsage } from "./agent-sdk";
import type { Logger, StepSummary, AgentStatus, TaggedLogger, StepStatusExtras } from "./logger";
import { taggedLogger } from "./logger";

/** Context returned by openStep(). */
export interface StepContext {
  /** Tagged logger that writes to .log file in the step directory. */
  log: TaggedLogger;
  /** Close the step — writes status.json, computes files_changed, renames log on failure. */
  close(ok: boolean, usage?: StepUsage, summary?: StepSummary, extras?: Omit<StepStatusExtras, "postSha">): Promise<void>;
}

function safeWriteJson(file: string, data: unknown): void {
  try {
    writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  } catch {
    // ignore
  }
}

function safeReadJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

/**
 * Open a new step for recording.
 *
 * Captures the current HEAD sha for later diff, creates the step directory,
 * and returns a StepContext with a tagged logger and close() method.
 *
 * @param logDir  - The workflow log directory (e.g. temp/builds/42_ralph_abc12345)
 * @param stepName - Step directory name (e.g. "42_03_tdd")
 * @param tag     - Agent/tag name for the logger (e.g. "tdd")
 * @param parent  - Parent logger for forwarding to execution.log
 * @param opts    - Optional cwd for git operations
 */
export async function openStep(
  logDir: string,
  stepName: string,
  tag: string,
  parent: Logger,
  opts?: { cwd?: string },
): Promise<StepContext> {
  const startTime = Date.now();
  const cwd = opts?.cwd;

  // Capture pre-step SHA for deterministic files_changed
  let preSha: string | null = null;
  try {
    preSha = await getHeadSha(cwd);
  } catch {
    // Not a git repo or git unavailable — files_changed will be empty
  }

  // Create step directory
  const stepDir = join(logDir, "steps", stepName);
  mkdirSync(stepDir, { recursive: true });

  // Create tagged logger
  const log = taggedLogger(parent, tag, { logDir, step: stepName });

  return {
    log,
    async close(ok: boolean, usage?: StepUsage, summary?: StepSummary, extras?: Omit<StepStatusExtras, "postSha">): Promise<void> {
      // Compute deterministic files_changed via git diff
      let filesChanged: string[] = [];
      let postSha: string | undefined;
      if (preSha) {
        try {
          filesChanged = await diffFileList(preSha, "HEAD", cwd);
          postSha = await getHeadSha(cwd);
        } catch {
          // ignore git failures
        }
      }

      // Overwrite summary.files_changed with deterministic result
      let finalSummary = summary;
      if (filesChanged.length > 0) {
        finalSummary = {
          status: summary?.status ?? (ok ? "pass" : "fail"),
          action: summary?.action ?? "",
          decision: summary?.decision ?? "",
          blockers: summary?.blockers ?? "none",
          files_changed: filesChanged.join(", "),
        };
      } else if (summary) {
        finalSummary = summary;
      }

      // Write status.json via the tagged logger's finalize (includes post_sha + extras)
      log.finalize(ok, usage, finalSummary, { postSha, ...extras });
    },
  };
}
