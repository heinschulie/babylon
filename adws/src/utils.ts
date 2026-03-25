import { resolve, dirname, join, isAbsolute } from "path";
import { readdirSync, statSync, existsSync } from "fs";
import type { StepUsage } from "./agent-sdk";
import { makeIssueComment } from "./github";


/**
 * Generate a short 8-character UUID for ADW tracking.
 */
export function makeAdwId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** JSON boundary detection results. */
interface JsonBoundaries {
  content: string;
  found: boolean;
}

/** JSON parsing utilities for handling markdown-wrapped JSON */
export class JsonParser {

  /** Extract JSON content from markdown code blocks. */
  private static extractFromCodeBlock(text: string): string {
    const codeBlockPattern = /```(?:json)?\s*\n(.*?)\n```/s;
    const match = text.match(codeBlockPattern);
    return match ? match[1].trim() : text.trim();
  }

  /** Find JSON boundaries in text that doesn't start with { or [. */
  private static findJsonBoundaries(text: string): JsonBoundaries {
    if (text.startsWith("[") || text.startsWith("{")) {
      return { content: text, found: true };
    }

    const candidates = [
      { start: text.indexOf("["), end: text.lastIndexOf("]") },
      { start: text.indexOf("{"), end: text.lastIndexOf("}") }
    ];

    // Find the first valid candidate (prefer arrays if they start earlier)
    for (const candidate of candidates) {
      if (candidate.start !== -1 && candidate.end !== -1 && candidate.end > candidate.start) {
        return {
          content: text.slice(candidate.start, candidate.end + 1),
          found: true
        };
      }
    }

    return { content: text, found: false };
  }

  /** Parse JSON that may be wrapped in markdown code blocks. */
  static parse<T = unknown>(text: string): T {
    const extracted = this.extractFromCodeBlock(text);
    const boundaries = this.findJsonBoundaries(extracted);

    try {
      return JSON.parse(boundaries.content) as T;
    } catch (e) {
      const preview = boundaries.content.slice(0, 200);
      throw new Error(
        `Failed to parse JSON: ${e}. Text was: ${preview}${boundaries.content.length > 200 ? '...' : ''}`
      );
    }
  }
}


/** Environment variable management utilities */
export class EnvironmentManager {
  /**
   * Check that all required environment variables are set.
   * Throws if any are missing.
   * API key is stored as CONVEX_ANTHROPIC_API_KEY (not ANTHROPIC_API_KEY) to avoid Bun auto-injecting it into SDK subprocesses.
   */
  static checkRequired(vars: string[] = ["CLAUDE_CODE_PATH"]): void {
    const missing = vars.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}`
      );
    }
  }

  /** Create base environment variables for subprocess execution. */
  private static createBaseEnv(): Record<string, string | undefined> {
    return {
      GITHUB_PAT: process.env.GITHUB_PAT,
      CLAUDE_CODE_PATH: process.env.CLAUDE_CODE_PATH ?? "claude",
      CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR:
        process.env.CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR ?? "true",
      E2B_API_KEY: process.env.E2B_API_KEY,
      CLOUDFLARED_TUNNEL_TOKEN: process.env.CLOUDFLARED_TUNNEL_TOKEN,
      HOME: process.env.HOME,
      USER: process.env.USER,
      PATH: process.env.PATH,
      SHELL: process.env.SHELL,
      TERM: process.env.TERM,
      LANG: process.env.LANG,
      LC_ALL: process.env.LC_ALL,
      PWD: process.cwd(),
    };
  }

  /** Add aliases to environment variables. */
  private static addAliases(env: Record<string, string | undefined>): void {
    if (process.env.GITHUB_PAT) {
      env.GH_TOKEN = process.env.GITHUB_PAT;
    }
  }

  /** Filter out undefined values from environment object. */
  private static filterDefined(env: Record<string, string | undefined>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [k, v] of Object.entries(env)) {
      if (v !== undefined) result[k] = v;
    }
    return result;
  }

  /**
   * Get filtered environment variables safe for subprocess execution.
   * Filtered env for CLI subprocess execution.
   */
  static getSafeSubprocessEnv(): Record<string, string> {
    const env = this.createBaseEnv();
    this.addAliases(env);
    return this.filterDefined(env);
  }
}


/**
 * Get the project root directory (parent of adws/).
 */
export function getProjectRoot(): string {
  // This file is at adws/src/utils.ts, project root is 2 levels up
  return resolve(dirname(new URL(import.meta.url).pathname), "..", "..");
}

/**
 * Execute a subprocess command and return stdout/stderr/exitCode.
 * Uses Bun.spawn when available, falls back to child_process for Node/Vitest.
 */
export async function exec(
  cmd: string[],
  opts?: { cwd?: string; env?: Record<string, string> }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  if (typeof globalThis.Bun !== "undefined") {
    const proc = Bun.spawn(cmd, {
      cwd: opts?.cwd,
      env: opts?.env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
  }

  // Node/Vitest fallback
  const { execFileSync } = await import("child_process");
  try {
    const stdout = execFileSync(cmd[0], cmd.slice(1), {
      cwd: opts?.cwd,
      env: opts?.env ? { ...process.env, ...opts.env } : undefined,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return { stdout: (stdout ?? "").trim(), stderr: "", exitCode: 0 };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (err.stdout ?? "").trim(),
      stderr: (err.stderr ?? "").trim(),
      exitCode: err.status ?? 1,
    };
  }
}

// ─── Standardized ADW Workflow Utilities ────────────────────────────────────

/** Environment-derived ADW workflow configuration. */
export interface ADWEnv {
  prompt: string | null;
  workingDir: string;
  models: WorkflowModels;
}

/** Read ADW workflow config from environment variables. */
export function getAdwEnv(): ADWEnv {
  return {
    prompt: process.env.ADW_PROMPT ?? null,
    workingDir: process.env.ADW_WORKING_DIR ?? process.cwd(),
    models: getWorkflowModels(),
  };
}

/** Options for final GitHub status comments. */
export interface FinalStatusOpts {
  workflow: string;
  adwId: string;
  ok: boolean;
  startTime: number;
  steps: { step: string; ok: boolean; usage: StepUsage }[];
  totals: StepUsage;
}

/** Standard workflow configuration options. */
export interface WorkflowOptions {
  adwId: string;
  workingDir?: string;
  issueNumber?: string;
  models?: WorkflowModels;
}

/** Standard step result extending QueryResult. */
export interface StandardStepResult {
  success: boolean;
  error?: string;
  result?: string;
  usage?: StepUsage;
}

/** Model selection for different workflow phases. */
export interface WorkflowModels {
  research: string;
  default: string;
  review: string;
}

/**
 * Format ms as human-readable duration (e.g. "2m 34s").
 */
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/**
 * Create a standardized step banner for workflow progress.
 */
export function createStepBanner(stepName: string, stepNumber?: number, totalSteps?: number): string {
  const prefix = stepNumber && totalSteps ? `STEP ${stepNumber}/${totalSteps}: ` : "";
  return `${"═".repeat(60)}\n  ${prefix}${stepName.toUpperCase()}\n${"═".repeat(60)}`;
}

/**
 * Extract plan file path from step result text.
 * Falls back to deterministic adwId-based lookup — never uses mtime.
 */
export function extractPlanPath(resultText: string, workingDir: string, adwId: string): string | null {
  if (!resultText) return null;

  const text = resultText.trim();

  // Try absolute path first
  const absMatch = text.match(/\/[^\s`"']+\.md/);
  if (absMatch && existsSync(absMatch[0])) {
    return absMatch[0];
  }

  // Try relative path
  const relMatch = text.match(/(?:temp\/specs\/[^\s`"']+\.md)/);
  if (relMatch) {
    const resolved = join(workingDir, relMatch[0]);
    if (existsSync(resolved)) return resolved;
  }

  // Deterministic fallback: find plan-{adwId}*.md in temp/specs/
  const specsDir = join(workingDir, "temp", "specs");
  try {
    const match = readdirSync(specsDir).find(
      (f) => f.endsWith(".md") && f.includes(adwId)
    );
    if (match) return join(specsDir, match);
  } catch {
    // specs dir may not exist
  }

  return null;
}

/**
 * Create a default empty usage object for consistent tracking.
 */
export function createDefaultStepUsage(): StepUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    total_cost_usd: 0,
    duration_ms: 0,
    num_turns: 0,
  };
}

/**
 * Create a function for posting step progress comments to GitHub issues.
 * Returns a no-op function if no issue number provided.
 */
export function createCommentStep(issueNumber: string | undefined): (msg: string) => Promise<void> {
  return async function(msg: string): Promise<void> {
    if (!issueNumber) return;
    try {
      await makeIssueComment(issueNumber, msg);
    } catch {
      // never crash on comment failures
    }
  };
}

/**
 * Create a function for posting final workflow status as readable markdown.
 * Returns a no-op function if no issue number provided.
 */
export function createFinalStatusComment(issueNumber: string | undefined): (opts: FinalStatusOpts) => Promise<void> {
  return async function(opts: FinalStatusOpts): Promise<void> {
    if (!issueNumber) return;

    const status = opts.ok ? "PASS ✅" : "FAIL ❌";
    const dur = fmtDuration(Date.now() - opts.startTime);
    const lines = [
      `## Workflow ${status}`,
      "",
      `**Workflow:** \`${opts.workflow}\`  `,
      `**ADW ID:** \`${opts.adwId}\`  `,
      `**Duration:** ${dur}`,
      "",
      "| Step | Status | Duration |",
      "|------|--------|----------|",
    ];

    for (const s of opts.steps) {
      lines.push(`| ${s.step} | ${s.ok ? "✅" : "❌"} | ${fmtDuration(s.usage.duration_ms)} |`);
    }

    lines.push(
      "",
      `**Tokens:** ${opts.totals.input_tokens.toLocaleString()} in / ${opts.totals.output_tokens.toLocaleString()} out (cache read: ${opts.totals.cache_read_tokens.toLocaleString()})  `,
      `**Cost:** $${opts.totals.total_cost_usd.toFixed(4)}`,
    );

    try {
      await makeIssueComment(issueNumber, lines.join("\n"));
    } catch {
      // never crash on comment failures
    }
  };
}

/**
 * Get workflow models with consistent environment variable patterns.
 */
export function getWorkflowModels(): WorkflowModels {
  return {
    research: process.env.ADW_RESEARCH_MODEL ?? "claude-haiku-4-5-20251001",
    default: process.env.ADW_MODEL ?? "claude-sonnet-4-20250514",
    review: process.env.ADW_REVIEW_MODEL ?? (process.env.ADW_MODEL ?? "claude-sonnet-4-20250514"),
  };
}



