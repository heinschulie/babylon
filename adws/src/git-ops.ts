import { exec } from "./utils";
import {
  getRepoUrl,
  extractRepoPath,
  makeIssueComment,
  fetchIssue,
} from "./github";
import type { ADWState } from "./state";
import type { Logger } from "./logger";

/** Get current git branch name. */
export async function getCurrentBranch(cwd?: string): Promise<string> {
  const { stdout } = await exec(
    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
    { cwd }
  );
  return stdout;
}

/** Push current branch to remote. */
export async function pushBranch(
  branchName: string,
  cwd?: string
): Promise<[boolean, string | null]> {
  const { stderr, exitCode } = await exec(
    ["git", "push", "-u", "origin", branchName],
    { cwd }
  );
  if (exitCode !== 0) return [false, stderr];
  return [true, null];
}

/** Check if a PR exists for a branch. Returns PR URL if it exists. */
export async function checkPrExists(
  branchName: string
): Promise<string | null> {
  try {
    const repoUrl = await getRepoUrl();
    const repoPath = extractRepoPath(repoUrl);

    const { stdout, exitCode } = await exec([
      "gh",
      "pr",
      "list",
      "--repo",
      repoPath,
      "--head",
      branchName,
      "--json",
      "url",
    ]);

    if (exitCode === 0) {
      const prs = JSON.parse(stdout);
      if (prs.length > 0) return prs[0].url;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Create and checkout a new branch. */
export async function createBranch(
  branchName: string,
  cwd?: string
): Promise<[boolean, string | null]> {
  const { stderr, exitCode } = await exec(
    ["git", "checkout", "-b", branchName],
    { cwd }
  );

  if (exitCode !== 0) {
    if (stderr.includes("already exists")) {
      const result = await exec(["git", "checkout", branchName], { cwd });
      if (result.exitCode !== 0) return [false, result.stderr];
      return [true, null];
    }
    return [false, stderr];
  }
  return [true, null];
}

/** Stage all changes and commit. */
export async function commitChanges(
  message: string,
  cwd?: string
): Promise<[boolean, string | null]> {
  // Check for changes
  const status = await exec(["git", "status", "--porcelain"], { cwd });
  if (!status.stdout) return [true, null]; // No changes

  // Stage all
  const add = await exec(["git", "add", "-A"], { cwd });
  if (add.exitCode !== 0) return [false, add.stderr];

  // Commit
  const commit = await exec(["git", "commit", "-m", message], { cwd });
  if (commit.exitCode !== 0) return [false, commit.stderr];
  return [true, null];
}

/** Get PR number for a branch. */
export async function getPrNumber(
  branchName: string
): Promise<string | null> {
  try {
    const repoUrl = await getRepoUrl();
    const repoPath = extractRepoPath(repoUrl);

    const { stdout, exitCode } = await exec([
      "gh",
      "pr",
      "list",
      "--repo",
      repoPath,
      "--head",
      branchName,
      "--json",
      "number",
      "--limit",
      "1",
    ]);

    if (exitCode === 0) {
      const prs = JSON.parse(stdout);
      if (prs.length > 0) return String(prs[0].number);
    }
  } catch {
    // ignore
  }
  return null;
}

/** Approve a PR. */
export async function approvePr(
  prNumber: string,
  logger: Logger
): Promise<[boolean, string | null]> {
  try {
    const repoUrl = await getRepoUrl();
    const repoPath = extractRepoPath(repoUrl);

    const { stderr, exitCode } = await exec([
      "gh",
      "pr",
      "review",
      prNumber,
      "--repo",
      repoPath,
      "--approve",
      "--body",
      "ADW Ship workflow approved this PR after validating all state fields.",
    ]);

    if (exitCode !== 0) return [false, stderr];
    logger.info(`Approved PR #${prNumber}`);
    return [true, null];
  } catch (e) {
    return [false, `Failed to get repo info: ${e}`];
  }
}

/** Merge a PR. */
export async function mergePr(
  prNumber: string,
  logger: Logger,
  mergeMethod: "merge" | "squash" | "rebase" = "squash"
): Promise<[boolean, string | null]> {
  try {
    const repoUrl = await getRepoUrl();
    const repoPath = extractRepoPath(repoUrl);

    // Check mergeability
    const { stdout, exitCode: viewCode } = await exec([
      "gh",
      "pr",
      "view",
      prNumber,
      "--repo",
      repoPath,
      "--json",
      "mergeable,mergeStateStatus",
    ]);

    if (viewCode !== 0) return [false, `Failed to check PR status`];

    const prStatus = JSON.parse(stdout);
    if (prStatus.mergeable !== "MERGEABLE") {
      return [false, `PR is not mergeable. Status: ${prStatus.mergeStateStatus ?? "unknown"}`];
    }

    // Merge
    const { stderr, exitCode } = await exec([
      "gh",
      "pr",
      "merge",
      prNumber,
      "--repo",
      repoPath,
      `--${mergeMethod}`,
      "--body",
      "Merged by ADW Ship workflow after successful validation.",
    ]);

    if (exitCode !== 0) return [false, stderr];
    logger.info(`Merged PR #${prNumber} using ${mergeMethod} method`);
    return [true, null];
  } catch (e) {
    return [false, `Failed to get repo info: ${e}`];
  }
}

/** Standard git finalization: push branch and create/update PR. */
export async function finalizeGitOperations(
  state: ADWState,
  logger: Logger,
  cwd?: string
): Promise<void> {
  let branchName = state.get("branch_name") as string | undefined;

  if (!branchName) {
    const currentBranch = await getCurrentBranch(cwd);
    if (currentBranch && currentBranch !== "main") {
      logger.warn(`No branch name in state, using current branch: ${currentBranch}`);
      branchName = currentBranch;
    } else {
      logger.error("No branch name in state and current branch is main, skipping git ops");
      return;
    }
  }

  // Push
  const [pushSuccess, pushError] = await pushBranch(branchName, cwd);
  if (!pushSuccess) {
    logger.error(`Failed to push branch: ${pushError}`);
    return;
  }
  logger.info(`Pushed branch: ${branchName}`);

  // Handle PR
  const prUrl = await checkPrExists(branchName);
  const issueNumber = state.get("issue_number") as string | undefined;
  const adwId = state.get("adw_id") as string;

  if (prUrl) {
    logger.info(`Found existing PR: ${prUrl}`);
    if (issueNumber && adwId) {
      await makeIssueComment(issueNumber, `${adwId}_ops: Pull request: ${prUrl}`);
    }
  } else {
    if (issueNumber) {
      try {
        const repoUrl = await getRepoUrl();
        const repoPath = extractRepoPath(repoUrl);
        const issue = await fetchIssue(issueNumber, repoPath);

        // Import dynamically to avoid circular deps
        const { createPullRequest } = await import("./workflow-ops");
        const [newPrUrl, error] = await createPullRequest(
          branchName,
          issue,
          state,
          logger,
          cwd
        );

        if (newPrUrl) {
          logger.info(`Created PR: ${newPrUrl}`);
          if (adwId) {
            await makeIssueComment(
              issueNumber,
              `${adwId}_ops: Pull request created: ${newPrUrl}`
            );
          }
        } else {
          logger.error(`Failed to create PR: ${error}`);
        }
      } catch (e) {
        logger.error(`Failed to fetch issue for PR creation: ${e}`);
      }
    }
  }
}
