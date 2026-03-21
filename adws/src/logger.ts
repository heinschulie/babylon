import { join } from "path";
import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "fs";
import { getProjectRoot } from "./utils";
import type { StepUsage } from "./agent-sdk";

export interface Logger {
  info: (msg: string) => void;
  error: (msg: string) => void;
  debug: (msg: string) => void;
  warn: (msg: string) => void;
}

/** Per-agent status entry written to step-level status.json. */
export interface AgentStatus {
  status: "pass" | "fail";
  duration_ms?: number;
  usage?: StepUsage;
}

/** Top-level workflow status written to logDir/status.json. */
export interface WorkflowStatus {
  workflow: string;
  adw_id: string;
  status: "pass" | "fail";
  duration_ms: number;
  started_at: string;
  finished_at: string;
  steps: Record<string, Record<string, AgentStatus>>;
  totals: StepUsage;
}

/** Extended logger returned by taggedLogger — adds finalize() for status + rename. */
export interface TaggedLogger extends Logger {
  /** Call when the agent is done. Writes status.json and renames log on error. */
  finalize: (ok: boolean, usage?: StepUsage) => void;
}

/** ANSI colors readable on both light and dark terminals. */
const TAG_COLORS = [
  "\x1b[36m",  // cyan
  "\x1b[33m",  // yellow
  "\x1b[35m",  // magenta
  "\x1b[32m",  // green
  "\x1b[34m",  // blue
  "\x1b[91m",  // bright red
  "\x1b[96m",  // bright cyan
  "\x1b[93m",  // bright yellow
  "\x1b[95m",  // bright magenta
  "\x1b[92m",  // bright green
  "\x1b[94m",  // bright blue
  "\x1b[31m",  // red
];
const RESET = "\x1b[0m";
let colorIndex = 0;

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function safeAppend(file: string, line: string): void {
  try {
    appendFileSync(file, line);
  } catch {
    // Silently ignore file write errors
  }
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
 * Create a tagged logger that:
 * - Prefixes every console line with a colored [tag]
 * - Writes to a per-agent log file: {logDir}/{step}/{tag}.log
 * - Also forwards to the parent logger for the unified execution.log timeline
 * - finalize(ok, usage?) writes status.json (with stats) and renames the file to {tag}.error.log on failure
 */
export function taggedLogger(parent: Logger, tag: string, opts?: { logDir?: string; step?: string }): TaggedLogger {
  const color = TAG_COLORS[colorIndex % TAG_COLORS.length];
  colorIndex++;
  const colorTag = `${color}[${tag}]${RESET}`;
  const plainTag = `[${tag}]`;
  const startTime = Date.now();

  // Per-agent file logging
  let agentLogFile: string | null = null;
  if (opts?.logDir && opts?.step) {
    const stepDir = join(opts.logDir, opts.step);
    mkdirSync(stepDir, { recursive: true });
    agentLogFile = join(stepDir, `${tag}.log`);
  }

  function appendAgent(level: string, msg: string): void {
    if (!agentLogFile) return;
    safeAppend(agentLogFile, `${timestamp()} - ${level} - ${msg}\n`);
  }

  const logger: TaggedLogger = {
    info(msg) {
      parent.info(`${colorTag} ${msg}`);
      appendAgent("INFO", msg);
    },
    error(msg) {
      parent.error(`${colorTag} ${msg}`);
      appendAgent("ERROR", msg);
    },
    debug(msg) {
      parent.debug(`${plainTag} ${msg}`);
      appendAgent("DEBUG", msg);
    },
    warn(msg) {
      parent.warn(`${colorTag} ${msg}`);
      appendAgent("WARN", msg);
    },
    finalize(ok: boolean, usage?: StepUsage) {
      if (!agentLogFile || !opts?.logDir || !opts?.step) return;
      const stepDir = join(opts.logDir, opts.step);

      // Rename to .error.log on failure
      if (!ok) {
        const errorFile = agentLogFile.replace(/\.log$/, ".error.log");
        try {
          renameSync(agentLogFile, errorFile);
          agentLogFile = errorFile;
        } catch {
          // ignore
        }
      }

      // Write/update status.json for this step
      const statusFile = join(stepDir, "status.json");
      const existing = safeReadJson<Record<string, AgentStatus>>(statusFile) ?? {};
      const entry: AgentStatus = {
        status: ok ? "pass" : "fail",
        duration_ms: Date.now() - startTime,
      };
      if (usage) entry.usage = usage;
      existing[tag] = entry;
      safeWriteJson(statusFile, existing);
    },
  };

  return logger;
}

/**
 * Write the top-level workflow status.json that aggregates all step statuses.
 * Reads each step's status.json from subdirectories and merges them.
 */
export function writeWorkflowStatus(
  logDir: string,
  opts: {
    workflow: string;
    adwId: string;
    ok: boolean;
    startTime: number;
    totals: StepUsage;
  },
): void {
  // Collect step statuses from subdirectories
  const steps: Record<string, Record<string, AgentStatus>> = {};
  try {
    for (const entry of readdirSync(logDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const stepStatusFile = join(logDir, entry.name, "status.json");
      const stepStatus = safeReadJson<Record<string, AgentStatus>>(stepStatusFile);
      if (stepStatus) {
        steps[entry.name] = stepStatus;
      }
    }
  } catch {
    // ignore
  }

  const status: WorkflowStatus = {
    workflow: opts.workflow,
    adw_id: opts.adwId,
    status: opts.ok ? "pass" : "fail",
    duration_ms: Date.now() - opts.startTime,
    started_at: new Date(opts.startTime).toISOString(),
    finished_at: new Date().toISOString(),
    steps,
    totals: opts.totals,
  };

  safeWriteJson(join(logDir, "status.json"), status);
}

/**
 * Create a dual-output logger (console + file).
 * Returns the logger and the logDir path for use by taggedLogger.
 */
export function createLogger(adwId: string, triggerType: string): Logger & { logDir: string } {
  const projectRoot = getProjectRoot();
  const logDir = join(projectRoot, "agents", adwId, triggerType);
  mkdirSync(logDir, { recursive: true });

  const logFile = join(logDir, "execution.log");

  function appendLog(level: string, msg: string): void {
    safeAppend(logFile, `${timestamp()} - ${level} - ${stripAnsi(msg)}\n`);
  }

  const logger = {
    logDir,
    info(msg: string) {
      console.log(msg);
      appendLog("INFO", msg);
    },
    error(msg: string) {
      console.error(msg);
      appendLog("ERROR", msg);
    },
    debug(msg: string) {
      appendLog("DEBUG", msg);
    },
    warn(msg: string) {
      console.warn(msg);
      appendLog("WARN", msg);
    },
  };

  return logger;
}
