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

/** Sub-issue shape returned by fetchSubIssues(). */
export interface SubIssue {
  number: number;
  title: string;
  body: string;
  state: string;
  labels: string[];
}

/**
 * Create a GitHub issue and link it as a sub-issue to a parent.
 * Uses gh CLI to create, then GraphQL addSubIssue mutation to link.
 */
export async function createSubIssue(
  parentIssueNumber: number,
  title: string,
  body: string,
  labels?: string[]
): Promise<{ number: number; url: string }> {
  const repoUrl = await getRepoUrl();
  const repoPath = extractRepoPath(repoUrl);
  const env = getGitHubEnv();

  // Create the issue
  const createArgs = [
    "gh", "issue", "create",
    "-R", repoPath,
    "--title", title,
    "--body", body,
  ];
  if (labels && labels.length > 0) {
    createArgs.push("--label", labels.join(","));
  }

  const create = await exec(createArgs, { env });
  if (create.exitCode !== 0) {
    throw new Error(`Failed to create sub-issue: ${create.stderr}`);
  }

  // gh issue create outputs the URL — extract issue number from it
  const url = create.stdout.trim();
  const issueNumMatch = url.match(/\/issues\/(\d+)$/);
  if (!issueNumMatch) {
    throw new Error(`Could not parse issue number from: ${url}`);
  }
  const childNumber = parseInt(issueNumMatch[1], 10);

  const [owner, repo] = repoPath.split("/");

  // Get parent node ID via GraphQL (using proper variable binding)
  const parentNodeQuery = await exec(
    [
      "gh", "api", "graphql",
      "-f", "query=query($owner:String!,$name:String!,$num:Int!){repository(owner:$owner,name:$name){issue(number:$num){id}}}",
      "-F", `owner=${owner}`,
      "-F", `name=${repo}`,
      "-F", `num=${parentIssueNumber}`,
    ],
    { env }
  );
  if (parentNodeQuery.exitCode !== 0) {
    throw new Error(`Failed to fetch parent node ID: ${parentNodeQuery.stderr}`);
  }
  const parentId = JSON.parse(parentNodeQuery.stdout).data.repository.issue.id;

  // Get child node ID
  const childNodeQuery = await exec(
    [
      "gh", "api", "graphql",
      "-f", "query=query($owner:String!,$name:String!,$num:Int!){repository(owner:$owner,name:$name){issue(number:$num){id}}}",
      "-F", `owner=${owner}`,
      "-F", `name=${repo}`,
      "-F", `num=${childNumber}`,
    ],
    { env }
  );
  if (childNodeQuery.exitCode !== 0) {
    throw new Error(`Failed to fetch child node ID: ${childNodeQuery.stderr}`);
  }
  const childId = JSON.parse(childNodeQuery.stdout).data.repository.issue.id;

  // Link as sub-issue via addSubIssue mutation
  const linkResult = await exec(
    [
      "gh", "api", "graphql",
      "-f", "query=mutation($parentId:ID!,$childId:ID!){addSubIssue(input:{issueId:$parentId,subIssueId:$childId}){issue{id}subIssue{id}}}",
      "-F", `parentId=${parentId}`,
      "-F", `childId=${childId}`,
    ],
    { env }
  );
  if (linkResult.exitCode !== 0) {
    throw new Error(`Failed to link sub-issue: ${linkResult.stderr}`);
  }

  return { number: childNumber, url };
}

/**
 * Fetch sub-issues of a parent issue via GraphQL.
 * Supports filtering by state: "open" | "closed" | "all" (default "open").
 */
export async function fetchSubIssues(
  parentIssueNumber: number,
  state: "open" | "closed" | "all" = "open"
): Promise<SubIssue[]> {
  const repoUrl = await getRepoUrl();
  const repoPath = extractRepoPath(repoUrl);
  const env = getGitHubEnv();
  const [owner, name] = repoPath.split("/");

  // Map state param to GitHub SubIssueOrder filter values
  const stateFilter = state === "all" ? "" : `,states:[${state === "open" ? "OPEN" : "CLOSED"}]`;

  const result = await exec(
    [
      "gh", "api", "graphql",
      "-f", `query=query($owner:String!,$name:String!,$num:Int!){repository(owner:$owner,name:$name){issue(number:$num){subIssues(first:100${stateFilter}){nodes{number title body state labels(first:20){nodes{name}}}}}}}`,
      "-F", `owner=${owner}`,
      "-F", `name=${name}`,
      "-F", `num=${parentIssueNumber}`,
    ],
    { env }
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to fetch sub-issues: ${result.stderr}`);
  }

  const data = JSON.parse(result.stdout);
  const nodes = data.data.repository.issue.subIssues.nodes as Array<{
    number: number;
    title: string;
    body: string;
    state: string;
    labels: { nodes: Array<{ name: string }> };
  }>;

  return nodes.map((n) => ({
    number: n.number,
    title: n.title,
    body: n.body,
    state: n.state.toLowerCase(),
    labels: n.labels.nodes.map((l) => l.name),
  }));
}

/**
 * Close a sub-issue with a comment (e.g. referencing the resolving commit).
 */
export async function closeSubIssue(
  issueNumber: number,
  comment: string
): Promise<void> {
  const repoUrl = await getRepoUrl();
  const repoPath = extractRepoPath(repoUrl);
  const env = getGitHubEnv();

  const { exitCode, stderr } = await exec(
    [
      "gh", "issue", "close",
      String(issueNumber),
      "-R", repoPath,
      "--comment", comment,
    ],
    { env }
  );

  if (exitCode !== 0) {
    throw new Error(`Failed to close issue #${issueNumber}: ${stderr}`);
  }
}

/**
 * Parse "Blocked by" issue numbers from a sub-issue body.
 * Deterministic regex extraction — no LLM involvement.
 *
 * Handles:
 *   - "Blocked by: #42"
 *   - "Blocked by: #12, #34"
 *   - "Blocked by: #12 and #34"
 *   - "Blocked by: None — can start immediately"
 *   - Missing Dependencies section entirely
 */
export function parseBlockers(body: string): number[] {
  const match = body.match(/^\s*-\s*\*\*Blocked by\*\*:\s*(.+)$/im);
  if (!match) return [];

  const value = match[1].trim();
  if (/^none/i.test(value)) return [];

  const numbers: number[] = [];
  for (const m of value.matchAll(/#(\d+)/g)) {
    numbers.push(parseInt(m[1], 10));
  }
  return [...new Set(numbers)];
}

/**
 * Filter sub-issues to only those whose blockers are all resolved.
 *
 * A blocker is considered resolved if:
 *   - It appears in `closedNumbers` (explicitly closed), OR
 *   - It does NOT appear in any open issue's number (external ref — assume resolved)
 *
 * @returns unblocked issues ready to work + blocked map (issue# → open blocker#s)
 */
export function filterUnblockedIssues(
  issues: SubIssue[],
  closedNumbers: Set<number>
): { unblocked: SubIssue[]; blocked: Map<number, number[]> } {
  const openNumbers = new Set(issues.map(i => i.number));

  const unblocked: SubIssue[] = [];
  const blocked = new Map<number, number[]>();

  for (const issue of issues) {
    const blockers = parseBlockers(issue.body);
    const unresolvedBlockers = blockers.filter(
      b => openNumbers.has(b) && !closedNumbers.has(b)
    );

    if (unresolvedBlockers.length === 0) {
      unblocked.push(issue);
    } else {
      blocked.set(issue.number, unresolvedBlockers);
    }
  }

  return { unblocked, blocked };
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
