import { resolve, dirname } from "path";

// ─── Review result types & parsing ──────────────────────────────────────────

/** Review issue from the /review skill JSON output. */
export interface ReviewIssue {
  review_issue_number: number;
  screenshot_path: string;
  issue_description: string;
  issue_resolution: string;
  issue_severity: "blocker" | "tech_debt" | "skippable";
}

/** Parsed review result from /review skill. */
export interface ReviewResult {
  success: boolean;
  review_summary?: string;
  review_issues: ReviewIssue[];
  screenshots?: string[];
}

/**
 * Parse review result JSON from the /review skill output.
 * Returns a safe default with a blocker issue on empty or unparseable input.
 */
export function parseReviewResult(raw: string | undefined): ReviewResult {
  if (!raw) {
    return {
      success: false,
      review_issues: [
        {
          review_issue_number: 1,
          screenshot_path: "",
          issue_description: "Review returned no output",
          issue_resolution: "Re-run review",
          issue_severity: "blocker",
        },
      ],
    };
  }

  try {
    return parseJson<ReviewResult>(raw);
  } catch (e) {
    return {
      success: false,
      review_issues: [
        {
          review_issue_number: 1,
          screenshot_path: "",
          issue_description: `Failed to parse review result: ${e}`,
          issue_resolution: "Fix review output format",
          issue_severity: "blocker",
        },
      ],
    };
  }
}

/**
 * Extract a verdict from a parsed review result.
 * - PASS: no issues or only skippable/tech_debt issues
 * - FAIL: at least one blocker issue
 * - PASS_WITH_ISSUES: success but has non-blocker issues
 */
export function extractReviewVerdict(result: ReviewResult): { ok: boolean; verdict: string } {
  const blockerCount = result.review_issues.filter(
    (i) => i.issue_severity === "blocker"
  ).length;

  if (result.success && blockerCount === 0) {
    const hasIssues = result.review_issues.length > 0;
    return { ok: true, verdict: hasIssues ? "PASS_WITH_ISSUES" : "PASS" };
  }

  if (blockerCount > 0) {
    return { ok: false, verdict: "FAIL" };
  }

  // success is false but no blockers — trust the issue list over the flag
  return { ok: true, verdict: "PASS_WITH_ISSUES" };
}

/**
 * Generate a short 8-character UUID for ADW tracking.
 */
export function makeAdwId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * Parse JSON that may be wrapped in markdown code blocks.
 */
export function parseJson<T = unknown>(text: string): T {
  // Try to extract JSON from markdown code blocks
  const codeBlockPattern = /```(?:json)?\s*\n(.*?)\n```/s;
  const match = text.match(codeBlockPattern);

  let jsonStr = match ? match[1].trim() : text.trim();

  // Try to find JSON boundaries if not already clean
  if (!jsonStr.startsWith("[") && !jsonStr.startsWith("{")) {
    const arrayStart = jsonStr.indexOf("[");
    const arrayEnd = jsonStr.lastIndexOf("]");
    const objStart = jsonStr.indexOf("{");
    const objEnd = jsonStr.lastIndexOf("}");

    if (arrayStart !== -1 && (objStart === -1 || arrayStart < objStart)) {
      if (arrayEnd !== -1) jsonStr = jsonStr.slice(arrayStart, arrayEnd + 1);
    } else if (objStart !== -1) {
      if (objEnd !== -1) jsonStr = jsonStr.slice(objStart, objEnd + 1);
    }
  }

  try {
    return JSON.parse(jsonStr) as T;
  } catch (e) {
    throw new Error(
      `Failed to parse JSON: ${e}. Text was: ${jsonStr.slice(0, 200)}...`
    );
  }
}

/**
 * Check that all required environment variables are set.
 * Throws if any are missing.
 * API key is stored as CONVEX_ANTHROPIC_API_KEY (not ANTHROPIC_API_KEY) to avoid Bun auto-injecting it into SDK subprocesses.
 */
export function checkEnvVars(vars: string[] = ["CLAUDE_CODE_PATH"]): void {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

/**
 * Get filtered environment variables safe for subprocess execution.
 * Filtered env for CLI subprocess execution.
 */
export function getSafeSubprocessEnv(): Record<string, string> {
  const env: Record<string, string | undefined> = {
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

  // Add GH_TOKEN alias
  if (process.env.GITHUB_PAT) {
    env.GH_TOKEN = process.env.GITHUB_PAT;
  }

  // Filter out undefined values
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) result[k] = v;
  }
  return result;
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
