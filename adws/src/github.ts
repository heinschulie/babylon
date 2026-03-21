import {
  GitHubIssueSchema,
  GitHubIssueListItemSchema,
  type GitHubIssue,
  type GitHubIssueListItem,
  type GitHubComment,
} from "./schemas";
import { exec } from "./utils";
import { R2Uploader } from "./r2-uploader";
import type { Logger } from "./logger";

/** Bot identifier to prevent webhook loops */
export const ADW_BOT_IDENTIFIER = "[ADW-AGENTS]";

/**
 * Get environment with GitHub token if available.
 * Returns undefined to inherit parent env when no PAT is set.
 */
function getGitHubEnv(): Record<string, string> | undefined {
  const pat = process.env.GITHUB_PAT;
  if (!pat) return undefined;
  return {
    GH_TOKEN: pat,
    PATH: process.env.PATH ?? "",
  };
}

/** Get GitHub repository URL from git remote. */
export async function getRepoUrl(): Promise<string> {
  const { stdout, exitCode } = await exec([
    "git",
    "remote",
    "get-url",
    "origin",
  ]);
  if (exitCode !== 0) {
    throw new Error("No git remote 'origin' found.");
  }
  return stdout;
}

/** Extract owner/repo from GitHub URL. */
export function extractRepoPath(githubUrl: string): string {
  return githubUrl.replace("https://github.com/", "").replace(".git", "");
}

/** Fetch a single GitHub issue by number. */
export async function fetchIssue(
  issueNumber: string,
  repoPath: string
): Promise<GitHubIssue> {
  const env = getGitHubEnv();
  const { stdout, stderr, exitCode } = await exec(
    [
      "gh",
      "issue",
      "view",
      issueNumber,
      "-R",
      repoPath,
      "--json",
      "number,title,body,state,author,assignees,labels,milestone,comments,createdAt,updatedAt,closedAt,url",
    ],
    { env }
  );

  if (exitCode !== 0) {
    throw new Error(`Failed to fetch issue #${issueNumber}: ${stderr}`);
  }

  return GitHubIssueSchema.parse(JSON.parse(stdout));
}

/** Post a comment to a GitHub issue. */
export async function makeIssueComment(
  issueId: string,
  comment: string
): Promise<void> {
  const repoUrl = await getRepoUrl();
  const repoPath = extractRepoPath(repoUrl);

  // Ensure bot identifier prefix
  if (!comment.startsWith(ADW_BOT_IDENTIFIER)) {
    comment = `${ADW_BOT_IDENTIFIER} ${comment}`;
  }

  const env = getGitHubEnv();
  const { stderr, exitCode } = await exec(
    ["gh", "issue", "comment", issueId, "-R", repoPath, "--body", comment],
    { env }
  );

  if (exitCode !== 0) {
    throw new Error(`Failed to post comment: ${stderr}`);
  }
}

/** Mark an issue as in-progress (add label + assign). */
export async function markIssueInProgress(issueId: string): Promise<void> {
  const repoUrl = await getRepoUrl();
  const repoPath = extractRepoPath(repoUrl);
  const env = getGitHubEnv();

  // Add label (may fail if label doesn't exist)
  await exec(
    ["gh", "issue", "edit", issueId, "-R", repoPath, "--add-label", "in_progress"],
    { env }
  );

  // Assign to self
  await exec(
    ["gh", "issue", "edit", issueId, "-R", repoPath, "--add-assignee", "@me"],
    { env }
  );
}

/** Fetch all open issues from a repository. */
export async function fetchOpenIssues(
  repoPath: string
): Promise<GitHubIssueListItem[]> {
  const env = getGitHubEnv();
  const { stdout, exitCode } = await exec(
    [
      "gh",
      "issue",
      "list",
      "--repo",
      repoPath,
      "--state",
      "open",
      "--json",
      "number,title,body,labels,createdAt,updatedAt",
      "--limit",
      "1000",
    ],
    { env }
  );

  if (exitCode !== 0) return [];

  try {
    const data = JSON.parse(stdout);
    return data.map((item: unknown) => GitHubIssueListItemSchema.parse(item));
  } catch {
    return [];
  }
}

/** Fetch all comments for a specific issue. */
export async function fetchIssueComments(
  repoPath: string,
  issueNumber: number
): Promise<Record<string, unknown>[]> {
  const env = getGitHubEnv();
  const { stdout, exitCode } = await exec(
    [
      "gh",
      "issue",
      "view",
      String(issueNumber),
      "--repo",
      repoPath,
      "--json",
      "comments",
    ],
    { env }
  );

  if (exitCode !== 0) return [];

  try {
    const data = JSON.parse(stdout);
    const comments = (data.comments ?? []) as Record<string, unknown>[];
    comments.sort((a, b) =>
      String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""))
    );
    return comments;
  } catch {
    return [];
  }
}

/** Find the latest comment containing a keyword (skipping bot comments). */
export function findKeywordFromComment(
  keyword: string,
  issue: GitHubIssue
): GitHubComment | null {
  // Sort newest first
  const sorted = [...issue.comments].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  for (const comment of sorted) {
    if (comment.body.includes(ADW_BOT_IDENTIFIER)) continue;
    if (comment.body.includes(keyword)) return comment;
  }

  return null;
}

/** Review issue shape from /review command output. */
interface ReviewIssueForPost {
  review_issue_number: number;
  screenshot_path: string;
  issue_description: string;
  issue_resolution: string;
  issue_severity: "blocker" | "tech_debt" | "skippable";
}

/** Review result shape from /review command output. */
interface ReviewResultForPost {
  success: boolean;
  review_summary?: string;
  review_issues: ReviewIssueForPost[];
  screenshots?: string[];
}

/** Post review results to a GitHub issue with R2-hosted screenshots. */
export async function postReviewToIssue(
  issueNumber: string,
  adwId: string,
  review: ReviewResultForPost,
  logger: Logger
): Promise<void> {
  const uploader = new R2Uploader(logger);

  // Upload screenshots to R2
  const allScreenshots = [
    ...(review.screenshots ?? []),
    ...review.review_issues.map((i) => i.screenshot_path).filter(Boolean),
  ];
  const uniqueScreenshots = [...new Set(allScreenshots)];

  let urlMap: Record<string, string> = {};
  if (uniqueScreenshots.length > 0) {
    urlMap = await uploader.uploadScreenshots(uniqueScreenshots, adwId);
    logger.info(`Uploaded ${Object.keys(urlMap).length} screenshots to R2`);
  }

  // Build markdown comment
  const verdict = review.success ? "PASS ✅" : "FAIL ❌";
  const lines: string[] = [
    `## Review ${verdict}`,
    "",
  ];

  if (review.review_summary) {
    lines.push(review.review_summary, "");
  }

  // Screenshots section
  const showcaseScreenshots = (review.screenshots ?? []).filter(Boolean);
  if (showcaseScreenshots.length > 0) {
    lines.push("### Screenshots", "");
    for (const path of showcaseScreenshots) {
      const url = urlMap[path];
      if (url && url !== path) {
        lines.push(`![${path.split("/").pop() ?? "screenshot"}](${url})`, "");
      } else {
        lines.push(`- \`${path}\` (upload failed)`, "");
      }
    }
  }

  // Issues section
  if (review.review_issues.length > 0) {
    lines.push("### Issues", "");
    for (const issue of review.review_issues) {
      const severity = issue.issue_severity.toUpperCase();
      lines.push(`**#${issue.review_issue_number} [${severity}]** — ${issue.issue_description}`);
      lines.push(`> Resolution: ${issue.issue_resolution}`);
      if (issue.screenshot_path) {
        const url = urlMap[issue.screenshot_path];
        if (url && url !== issue.screenshot_path) {
          lines.push(`> ![issue-${issue.review_issue_number}](${url})`);
        }
      }
      lines.push("");
    }
  }

  lines.push(`---`, `ADW ID: \`${adwId}\``);

  const comment = lines.join("\n");

  try {
    await makeIssueComment(issueNumber, comment);
    logger.info(`Posted review results to issue #${issueNumber}`);
  } catch (e) {
    logger.error(`Failed to post review to issue #${issueNumber}: ${e}`);
  }
}
