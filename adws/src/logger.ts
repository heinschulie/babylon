import { join } from "path";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "fs";
import { getProjectRoot } from "./utils";
import type { StepUsage } from "./agent-sdk";

export interface Logger {
  info: (msg: string) => void;
  error: (msg: string) => void;
  debug: (msg: string) => void;
  warn: (msg: string) => void;
}

/** Structured summary extracted from agent output. */
export interface StepSummary {
  status: "pass" | "fail";
  action: string;
  decision: string;
  blockers: string;
  files_changed: string;
  visual_validation?: "passed" | "failed" | "skipped";
  expert_consulted?: string;
  expert_advice_summary?: string;
}

/** Screenshot artifact reference stored in step status.json. */
export interface Screenshot {
  name: string;
  url: string;
  path: string;
  github_comment_id?: number;
}

/** Per-agent status entry written to step-level status.json. */
export interface AgentStatus {
  status: "pass" | "fail";
  duration_ms?: number;
  usage?: StepUsage;
  summary?: StepSummary;
  post_sha?: string;
  visual_validation?: "passed" | "failed" | "skipped";
  screenshots?: Screenshot[];
}

/** Quality summary aggregated from review steps. */
export interface QualitySummary {
  issues_reviewed: number;
  passed: number;
  failed: number;
  sub_issues_created: number;
}

/** Top-level workflow status written to logDir/status.json. */
export interface WorkflowStatus {
  workflow: string;
  adw_id: string;
  status: "pass" | "fail" | "pass_with_issues";
  duration_ms: number;
  started_at: string;
  finished_at: string;
  steps: Record<string, Record<string, AgentStatus>>;
  totals: StepUsage;
  quality?: QualitySummary;
}

/** Extended logger returned by taggedLogger — adds finalize() for status + rename. */
export interface TaggedLogger extends Logger {
  /** Call when the agent is done. Writes status.json and renames log on error. */
  finalize: (ok: boolean, usage?: StepUsage, summary?: StepSummary, extras?: StepStatusExtras) => void;
}

/** ANSI escape codes. */
const ANSI = {
  RESET: "\x1b[0m",
  CYAN: "\x1b[36m",
  YELLOW: "\x1b[33m",
  MAGENTA: "\x1b[35m",
  GREEN: "\x1b[32m",
  BLUE: "\x1b[34m",
  BRIGHT_RED: "\x1b[91m",
  BRIGHT_CYAN: "\x1b[96m",
  BRIGHT_YELLOW: "\x1b[93m",
  BRIGHT_MAGENTA: "\x1b[95m",
  BRIGHT_GREEN: "\x1b[92m",
  BRIGHT_BLUE: "\x1b[94m",
  RED: "\x1b[31m",
};

/** ANSI colors readable on both light and dark terminals. */
const TAG_COLORS = [
  ANSI.CYAN, ANSI.YELLOW, ANSI.MAGENTA, ANSI.GREEN, ANSI.BLUE,
  ANSI.BRIGHT_RED, ANSI.BRIGHT_CYAN, ANSI.BRIGHT_YELLOW,
  ANSI.BRIGHT_MAGENTA, ANSI.BRIGHT_GREEN, ANSI.BRIGHT_BLUE, ANSI.RED,
];

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

/** Handle renaming log file to .error.log on failure. */
function handleLogFileRename(logFile: string, ok: boolean): void {
  if (ok) return;

  const errorFile = logFile.replace(/\.log$/, ".error.log");
  try {
    renameSync(logFile, errorFile);
  } catch {
    // ignore rename failures
  }
}

/** Extra fields that can be attached to a step status entry. */
export interface StepStatusExtras {
  postSha?: string;
  visual_validation?: "passed" | "failed" | "skipped";
  screenshots?: Screenshot[];
}

/** Write agent status entry for this step. */
function writeAgentStatus(
  logDir: string,
  step: string,
  tag: string,
  ok: boolean,
  startTime: number,
  usage?: StepUsage,
  summary?: StepSummary,
  extras?: StepStatusExtras,
): void {
  const stepDir = join(logDir, "steps", step);
  const statusFile = join(stepDir, "status.json");
  const existing = safeReadJson<Record<string, AgentStatus>>(statusFile) ?? {};

  const entry: AgentStatus = {
    status: ok ? "pass" : "fail",
    duration_ms: Date.now() - startTime,
  };
  if (usage) entry.usage = usage;
  if (summary) entry.summary = summary;
  if (extras?.postSha) entry.post_sha = extras.postSha;
  if (extras?.visual_validation) entry.visual_validation = extras.visual_validation;
  if (extras?.screenshots?.length) entry.screenshots = extras.screenshots;

  existing[tag] = entry;
  safeWriteJson(statusFile, existing);
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
  const colorTag = `${color}[${tag}]${ANSI.RESET}`;
  const plainTag = `[${tag}]`;
  const startTime = Date.now();

  // Per-agent file logging
  let agentLogFile: string | null = null;
  if (opts?.logDir && opts?.step) {
    const stepDir = join(opts.logDir, "steps", opts.step);
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
    finalize(ok: boolean, usage?: StepUsage, summary?: StepSummary, extras?: StepStatusExtras) {
      if (!agentLogFile || !opts?.logDir || !opts?.step) return;

      handleLogFileRename(agentLogFile, ok);
      writeAgentStatus(opts.logDir, opts.step, tag, ok, startTime, usage, summary, extras);
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
  // Collect step statuses from steps/ subdirectory
  const steps: Record<string, Record<string, AgentStatus>> = {};
  const stepsDir = join(logDir, "steps");
  try {
    if (existsSync(stepsDir)) {
      for (const entry of readdirSync(stepsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const stepStatusFile = join(stepsDir, entry.name, "status.json");
        const stepStatus = safeReadJson<Record<string, AgentStatus>>(stepStatusFile);
        if (stepStatus) {
          steps[entry.name] = stepStatus;
        }
      }
    }
  } catch {
    // ignore
  }

  // Scan review steps for quality summary
  let reviewsPassed = 0;
  let reviewsFailed = 0;
  let subIssuesCreated = 0;
  for (const [stepName, agents] of Object.entries(steps)) {
    if (!stepName.includes("review")) continue;
    for (const agent of Object.values(agents)) {
      const verdict = agent.summary?.action;
      // Count based on step status — review steps that failed indicate FAIL verdict
      if (agent.status === "pass") reviewsPassed++;
      else reviewsFailed++;
    }
  }

  const issuesReviewed = reviewsPassed + reviewsFailed;
  const quality: QualitySummary | undefined = issuesReviewed > 0
    ? { issues_reviewed: issuesReviewed, passed: reviewsPassed, failed: reviewsFailed, sub_issues_created: subIssuesCreated }
    : undefined;

  // Derive status: pass_with_issues when reviews fail but pipeline succeeded
  let derivedStatus: "pass" | "fail" | "pass_with_issues";
  if (!opts.ok) {
    derivedStatus = "fail";
  } else if (reviewsFailed > 0) {
    derivedStatus = "pass_with_issues";
  } else {
    derivedStatus = "pass";
  }

  const status: WorkflowStatus = {
    workflow: opts.workflow,
    adw_id: opts.adwId,
    status: derivedStatus,
    duration_ms: Date.now() - opts.startTime,
    started_at: new Date(opts.startTime).toISOString(),
    finished_at: new Date().toISOString(),
    steps,
    totals: opts.totals,
    ...(quality && { quality }),
  };

  safeWriteJson(join(logDir, "status.json"), status);
}

/**
 * Create a dual-output logger (console + file).
 * Returns the logger and the logDir path for use by taggedLogger.
 */
export function createLogger(adwId: string, triggerType: string, issueNumber?: number): Logger & { logDir: string; nextStep: (name: string, stepIssueNumber?: number) => string } {
  const projectRoot = getProjectRoot();
  const folderName = issueNumber
    ? `${issueNumber}_${triggerType}_${adwId}`
    : `${triggerType}_${adwId}`;
  const logDir = join(projectRoot, "temp", "builds", folderName);
  mkdirSync(logDir, { recursive: true });

  const logFile = join(logDir, "execution.log");
  let stepCounter = 0;

  function appendLog(level: string, msg: string): void {
    safeAppend(logFile, `${timestamp()} - ${level} - ${stripAnsi(msg)}\n`);
  }

  const logger = {
    logDir,
    nextStep(name: string, stepIssueNumber?: number): string {
      stepCounter++;
      const counter = String(stepCounter).padStart(2, "0");
      return stepIssueNumber
        ? `${stepIssueNumber}_${counter}_${name}`
        : `${counter}_${name}`;
    },
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
