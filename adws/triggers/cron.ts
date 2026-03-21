/**
 * Cron-based ADW trigger — polls GitHub issues on interval.
 *
 * Detects:
 * 1. New issues without comments
 * 2. Issues where the latest comment is exactly "adw"
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
import { resolve, dirname } from "path";

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

/** Check if an issue should be processed. */
async function shouldProcessIssue(issueNumber: number): Promise<boolean> {
  const comments = await fetchIssueComments(REPO_PATH, issueNumber);

  if (comments.length === 0) {
    console.log(`Issue #${issueNumber} has no comments — marking for processing`);
    return true;
  }

  const latest = comments[comments.length - 1];
  const commentBody = ((latest.body as string) ?? "").toLowerCase().trim();
  const commentId = latest.id as string | undefined;

  if (issueLastComment.get(issueNumber) === commentId) return false;

  if (commentBody === "adw") {
    console.log(`Issue #${issueNumber} — latest comment is 'adw'`);
    issueLastComment.set(issueNumber, commentId);
    return true;
  }

  return false;
}

/** Trigger the ADW workflow for an issue. */
async function triggerAdwWorkflow(issueNumber: number): Promise<boolean> {
  try {
    const adwsDir = dirname(dirname(new URL(import.meta.url).pathname));
    const scriptPath = resolve(adwsDir, "adw_plan_build_iso.py");
    const repoRoot = dirname(adwsDir);

    console.log(`Triggering ADW workflow for issue #${issueNumber}`);

    const proc = Bun.spawn(
      [process.execPath, scriptPath, String(issueNumber)],
      {
        cwd: repoRoot,
        env: getSafeSubprocessEnv(),
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const exitCode = await proc.exited;
    if (exitCode === 0) {
      console.log(`Successfully triggered workflow for issue #${issueNumber}`);
      return true;
    } else {
      const stderr = await new Response(proc.stderr).text();
      console.error(`Failed to trigger workflow for issue #${issueNumber}: ${stderr}`);
      return false;
    }
  } catch (e) {
    console.error(`Exception triggering workflow for issue #${issueNumber}: ${e}`);
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

    const qualifying: number[] = [];

    for (const issue of issues) {
      if (!issue.number || processedIssues.has(issue.number)) continue;
      if (await shouldProcessIssue(issue.number)) {
        qualifying.push(issue.number);
      }
    }

    if (qualifying.length > 0) {
      console.log(`Found ${qualifying.length} qualifying issues: ${qualifying}`);

      for (const issueNumber of qualifying) {
        if (shutdownRequested) break;
        if (await triggerAdwWorkflow(issueNumber)) {
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
