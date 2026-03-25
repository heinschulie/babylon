/**
 * Cron-based ADW trigger — polls GitHub issues on interval.
 *
 * Workflow selection (first match wins):
 * 1. Comment keyword: "adw <workflow_name>" (e.g. "adw sdlc")
 * 2. Issue label: "workflow:<name>" (e.g. "workflow:adw_sdlc")
 * 3. Default: adw_plan_build
 *
 * Triggers on:
 * 1. New issues without comments
 * 2. Issues where the latest comment starts with "adw"
 *
 * Usage: bun run adws/triggers/cron.ts
 */

import { getSafeSubprocessEnv } from "../src/utils";
import {
  fetchOpenIssues,
  fetchIssueComments,
  getRepoUrl,
  extractRepoPath,
} from "../src/github";
import type { GitHubIssueListItem } from "../src/schemas";
import { resolve, dirname } from "path";
import { existsSync } from "fs";

const DEFAULT_WORKFLOW = "adw_plan_build";
const WORKFLOW_LABEL_PREFIX = "workflow:";
const ADWS_DIR = dirname(dirname(new URL(import.meta.url).pathname));

// Get repo info
let REPO_PATH: string;
try {
  const url = await getRepoUrl();
  REPO_PATH = extractRepoPath(url);
} catch (e) {
  console.error(`ERROR: ${e}`);
  process.exit(1);
}

/** Processed issue numbers (avoid re-triggering). */
const processedIssues = new Set<number>();
/** Track last processed comment ID per issue. */
const issueLastComment = new Map<number, string | undefined>();

let shutdownRequested = false;

function handleSignal() {
  console.log("\nShutdown requested...");
  shutdownRequested = true;
}

/** Resolve workflow script path, validating it exists. */
function resolveWorkflowPath(workflow: string): string | null {
  const name = workflow.startsWith("adw_") ? workflow : `adw_${workflow}`;
  const scriptPath = resolve(ADWS_DIR, `workflows/${name}.ts`);
  return existsSync(scriptPath) ? scriptPath : null;
}

/** Extract workflow name from issue labels. */
function workflowFromLabels(issue: GitHubIssueListItem): string | null {
  const label = issue.labels.find((l) =>
    l.name.startsWith(WORKFLOW_LABEL_PREFIX)
  );
  return label ? label.name.slice(WORKFLOW_LABEL_PREFIX.length) : null;
}

/** Extract workflow name from comment keyword (e.g. "adw sdlc" → "adw_sdlc"). */
function workflowFromComment(commentBody: string): string | null {
  const parts = commentBody.split(/\s+/);
  if (parts.length < 2) return null;
  return parts.slice(1).join("_");
}

interface TriggerInfo {
  workflow: string;
  scriptPath: string;
}

/** Check if an issue should be processed, returning workflow info or null. */
async function evaluateIssue(
  issue: GitHubIssueListItem
): Promise<TriggerInfo | null> {
  const comments = await fetchIssueComments(REPO_PATH, issue.number);

  let workflowName: string | null = null;

  if (comments.length === 0) {
    console.log(
      `Issue #${issue.number} has no comments — marking for processing`
    );
    // Use label or default
    workflowName = workflowFromLabels(issue) ?? DEFAULT_WORKFLOW;
  } else {
    const latest = comments[comments.length - 1];
    const commentBody = ((latest.body as string) ?? "").toLowerCase().trim();
    const commentId = latest.id as string | undefined;

    if (issueLastComment.get(issue.number) === commentId) return null;

    if (commentBody.startsWith("adw")) {
      console.log(
        `Issue #${issue.number} — latest comment: '${commentBody}'`
      );
      issueLastComment.set(issue.number, commentId);

      // Comment keyword takes priority, then label, then default
      workflowName =
        workflowFromComment(commentBody) ??
        workflowFromLabels(issue) ??
        DEFAULT_WORKFLOW;
    }
  }

  if (!workflowName) return null;

  const scriptPath = resolveWorkflowPath(workflowName);
  if (!scriptPath) {
    console.error(
      `Issue #${issue.number} — unknown workflow '${workflowName}', skipping`
    );
    return null;
  }

  return { workflow: workflowName, scriptPath };
}

/** Trigger the ADW workflow for an issue. */
async function triggerWorkflow(
  issueNumber: number,
  info: TriggerInfo
): Promise<boolean> {
  try {
    const repoRoot = dirname(ADWS_DIR);

    console.log(
      `Triggering workflow '${info.workflow}' for issue #${issueNumber}`
    );

    const proc = Bun.spawn(
      [process.execPath, info.scriptPath, String(issueNumber)],
      {
        cwd: repoRoot,
        env: getSafeSubprocessEnv(),
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const exitCode = await proc.exited;
    if (exitCode === 0) {
      console.log(
        `Successfully completed '${info.workflow}' for issue #${issueNumber}`
      );
      return true;
    } else {
      const stderr = await new Response(proc.stderr).text();
      console.error(
        `Failed '${info.workflow}' for issue #${issueNumber}: ${stderr}`
      );
      return false;
    }
  } catch (e) {
    console.error(
      `Exception in '${info.workflow}' for issue #${issueNumber}: ${e}`
    );
    return false;
  }
}

/** Main polling function. */
async function checkAndProcessIssues(): Promise<void> {
  if (shutdownRequested) return;

  const start = Date.now();
  console.log("Starting issue check cycle");

  try {
    const issues = await fetchOpenIssues(REPO_PATH);
    if (issues.length === 0) {
      console.log("No open issues found");
      return;
    }

    const qualifying: { issueNumber: number; info: TriggerInfo }[] = [];

    for (const issue of issues) {
      if (!issue.number || processedIssues.has(issue.number)) continue;
      const info = await evaluateIssue(issue);
      if (info) qualifying.push({ issueNumber: issue.number, info });
    }

    if (qualifying.length > 0) {
      console.log(
        `Found ${qualifying.length} qualifying issues: ${qualifying.map((q) => `#${q.issueNumber}→${q.info.workflow}`).join(", ")}`
      );

      for (const { issueNumber, info } of qualifying) {
        if (shutdownRequested) break;
        if (await triggerWorkflow(issueNumber, info)) {
          processedIssues.add(issueNumber);
        }
      }
    } else {
      console.log("No new qualifying issues found");
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`Check cycle completed in ${elapsed}s`);
    console.log(`Total processed issues in session: ${processedIssues.size}`);
  } catch (e) {
    console.error(`Error during check cycle: ${e}`);
  }
}

if (import.meta.main) {
  console.log("Starting ADW cron trigger");
  console.log(`Repository: ${REPO_PATH}`);
  console.log(`Default workflow: ${DEFAULT_WORKFLOW}`);
  console.log("Polling interval: 20 seconds");

  process.on("SIGINT", handleSignal);
  process.on("SIGTERM", handleSignal);

  // Initial check
  await checkAndProcessIssues();

  // Polling loop
  const interval = setInterval(async () => {
    if (shutdownRequested) {
      clearInterval(interval);
      console.log("Shutdown complete");
      process.exit(0);
    }
    await checkAndProcessIssues();
  }, 20_000);
}
