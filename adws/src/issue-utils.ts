import type { IssueClassSlashCommand, GitHubIssue } from "./schemas";
import type { QueryResult } from "./agent-sdk";

/** Parse a classification result into an IssueClassSlashCommand. */
export function parseClassification(
  result: QueryResult
): { issueClass: IssueClassSlashCommand; error?: undefined } | { issueClass?: undefined; error: string } {
  if (!result.success || !result.result) {
    return { error: `Classification failed: ${result.error ?? "no result"}` };
  }
  const match = result.result.match(/\/chore|\/bug|\/feature|0/);
  if (!match || match[0] === "0") {
    return { error: `Invalid classification: ${result.result}` };
  }
  return { issueClass: match[0] as IssueClassSlashCommand };
}

/** Build the type-specific plan prompt for an issue. */
export function buildIssuePlanPrompt(
  issueClass: IssueClassSlashCommand,
  issueNumber: string,
  adwId: string,
  issueJson: string
): { command: string; prompt: string } {
  return {
    command: issueClass,
    prompt: `${issueClass} ${issueNumber} ${adwId} ${issueJson}`,
  };
}

/** Fetch an issue, classify it, and return everything needed for planning. */
export async function fetchAndClassifyIssue(
  issueNumber: string,
  adwId: string,
  opts: { model?: string; cwd?: string; logger?: any }
): Promise<
  | { ok: true; issue: GitHubIssue; issueClass: IssueClassSlashCommand; planPrompt: string; issueJson: string }
  | { ok: false; error: string }
> {
  const { fetchIssue, getRepoUrl, extractRepoPath } = await import("./github");
  const { runClassifyStep } = await import("./agent-sdk");

  // Fetch repo info
  let repoPath: string;
  try {
    const repoUrl = await getRepoUrl();
    repoPath = extractRepoPath(repoUrl);
  } catch (e) {
    return { ok: false, error: `Failed to get repo URL: ${e}` };
  }

  // Fetch issue
  let issue: GitHubIssue;
  try {
    issue = await fetchIssue(issueNumber, repoPath);
  } catch (e) {
    return { ok: false, error: `Failed to fetch issue: ${e}` };
  }

  // Classify
  const issueJson = JSON.stringify({
    number: issue.number,
    title: issue.title,
    body: issue.body,
  });

  const classifyResult = await runClassifyStep(issueJson, {
    model: opts.model,
    cwd: opts.cwd,
    logger: opts.logger,
  });

  const parsed = parseClassification(classifyResult);
  if (parsed.error) {
    return { ok: false, error: parsed.error };
  }

  const { prompt: planPrompt } = buildIssuePlanPrompt(
    parsed.issueClass,
    issueNumber,
    adwId,
    issueJson
  );

  return {
    ok: true,
    issue,
    issueClass: parsed.issueClass,
    planPrompt,
    issueJson,
  };
}