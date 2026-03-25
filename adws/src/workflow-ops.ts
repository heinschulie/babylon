import { join } from "path";
import { existsSync, readdirSync } from "fs";
import {
  type AgentTemplateRequest,
  type AgentPromptResponse,
  type GitHubIssue,
  type IssueClassSlashCommand,
  type ADWExtractionResult,
} from "./schemas";
import { executeTemplate } from "./agent";
import {
  getRepoUrl,
  extractRepoPath,
} from "./github";
import { ADWState } from "./state";
import { exec, getProjectRoot, makeAdwId, JsonParser } from "./utils";
import type { Logger } from "./logger";

// Agent name constants
const AGENT_PLANNER = "sdlc_planner";
const AGENT_IMPLEMENTOR = "sdlc_implementor";
const AGENT_BRANCH_GENERATOR = "branch_generator";
const AGENT_PR_CREATOR = "pr_creator";

// Common model name
const MODEL_SONNET = "sonnet";

/** Available ADW workflows for runtime validation. */
export const AVAILABLE_ADW_WORKFLOWS = [
  "adw_plan_iso",
  "adw_patch_iso",
  "adw_build_iso",
  "adw_test_iso",
  "adw_review_iso",
  "adw_document_iso",
  "adw_ship_iso",
  "adw_sdlc_ZTE_iso",
  "adw_plan_build_iso",
  "adw_plan_build_test_iso",
  "adw_plan_build_test_review_iso",
  "adw_plan_build_document_iso",
  "adw_plan_build_review_iso",
  "adw_sdlc_iso",
];


/** Extract ADW workflow, ID, and model_set from text via regex. */
export function extractAdwInfo(
  text: string,
  _tempAdwId: string
): ADWExtractionResult {
  const lower = text.toLowerCase();

  // Match longest workflow name first (sort by length descending)
  const sorted = [...AVAILABLE_ADW_WORKFLOWS].sort((a, b) => b.length - a.length);
  let workflow: string | undefined;
  for (const wf of sorted) {
    // Match with or without leading slash, with or without _iso suffix in text
    const bare = wf.replace(/_iso$/, "");
    if (lower.includes(wf) || lower.includes(`/${wf}`) || lower.includes(bare) || lower.includes(`/${bare}`)) {
      workflow = wf;
      break;
    }
  }

  // Extract 8-char alphanumeric ADW ID (e.g. "adw-a1b2c3d4" or "adw_id: a1b2c3d4")
  const idMatch = text.match(/(?:adw[-_]id[:\s]+|adw[-_])([a-z0-9]{8})\b/i);
  const adwId = idMatch?.[1];

  // Extract model_set if specified
  const modelMatch = lower.match(/model[_\s]*set[:\s]*(base|heavy)/);
  const modelSet = (modelMatch?.[1] ?? "base") as "base" | "heavy";

  if (workflow) {
    return { workflow_command: workflow, adw_id: adwId, model_set: modelSet };
  }

  return { model_set: "base" };
}


/** Create minimal issue JSON for agent requests. */
function createMinimalIssue(issue: GitHubIssue): string {
  return JSON.stringify({
    number: issue.number,
    title: issue.title,
    body: issue.body,
  });
}

/** Agent request factory for consistent request creation */
class AgentRequestFactory {
  /** Create an agent template request with common defaults. */
  static create(
    agentName: string,
    slashCommand: string,
    args: string[],
    adwId: string,
    workingDir?: string
  ): AgentTemplateRequest {
    return {
      agent_name: agentName,
      slash_command: slashCommand as AgentTemplateRequest["slash_command"],
      args,
      adw_id: adwId,
      model: MODEL_SONNET,
      working_dir: workingDir,
    };
  }

  /** Create a commit request with specific pattern. */
  static createCommitRequest(
    agentName: string,
    issueType: string,
    issueJson: string,
    adwId: string,
    workingDir?: string
  ): AgentTemplateRequest {
    return this.create(
      `${agentName}_committer`,
      "/commit",
      [agentName, issueType, issueJson],
      adwId,
      workingDir
    );
  }

  /** Create a pull request creation request. */
  static createPullRequestRequest(
    branchName: string,
    issueJson: string,
    planFile: string,
    adwId: string,
    workingDir?: string
  ): AgentTemplateRequest {
    return this.create(
      AGENT_PR_CREATOR,
      "/pull_request",
      [branchName, issueJson, planFile, adwId],
      adwId,
      workingDir
    );
  }

  /** Create a patch request with specific arguments. */
  static createPatchRequest(
    agentName: string,
    args: string[],
    adwId: string,
    workingDir?: string
  ): AgentTemplateRequest {
    return this.create(agentName, "/patch", args, adwId, workingDir);
  }
}

/** Build implementation plan for the issue. */
export async function buildPlan(
  issue: GitHubIssue,
  command: string,
  adwId: string,
  logger: Logger,
  workingDir?: string
): Promise<AgentPromptResponse> {
  const minimalIssue = createMinimalIssue(issue);
  const request = AgentRequestFactory.create(
    AGENT_PLANNER,
    command,
    [String(issue.number), adwId, minimalIssue],
    adwId,
    workingDir
  );

  return executeTemplate(request);
}

/** Implement a plan using the /implement command. */
export async function implementPlan(
  planFile: string,
  adwId: string,
  logger: Logger,
  agentName?: string,
  workingDir?: string
): Promise<AgentPromptResponse> {
  const request = AgentRequestFactory.create(
    agentName ?? AGENT_IMPLEMENTOR,
    "/implement",
    [planFile],
    adwId,
    workingDir
  );

  return executeTemplate(request);
}

/** Generate a git branch name for the issue. */
export async function generateBranchName(
  issue: GitHubIssue,
  issueClass: IssueClassSlashCommand,
  adwId: string,
  logger: Logger
): Promise<[string | null, string | null]> {
  const issueType = issueClass.replace("/", "");
  const minimalIssue = createMinimalIssue(issue);
  const request = AgentRequestFactory.create(
    AGENT_BRANCH_GENERATOR,
    "/generate_branch_name",
    [issueType, adwId, minimalIssue],
    adwId
  );

  const response = await executeTemplate(request);
  if (!response.success) return [null, response.output];

  const branchName = response.output.trim();
  logger.info(`Generated branch name: ${branchName}`);
  return [branchName, null];
}

/** Create a git commit with a properly formatted message. */
export async function createCommit(
  agentName: string,
  issue: GitHubIssue,
  issueClass: IssueClassSlashCommand,
  adwId: string,
  logger: Logger,
  workingDir: string
): Promise<[string | null, string | null]> {
  const issueType = issueClass.replace("/", "");
  const uniqueAgentName = `${agentName}_committer`;
  const minimalIssue = JSON.stringify({
    number: issue.number,
    title: issue.title,
    body: issue.body,
  });

  const request = AgentRequestFactory.createCommitRequest(
    agentName,
    issueType,
    minimalIssue,
    adwId,
    workingDir
  );

  const response = await executeTemplate(request);
  if (!response.success) return [null, response.output];

  const commitMessage = response.output.trim();
  logger.info(`Created commit message: ${commitMessage}`);
  return [commitMessage, null];
}

/** Create a pull request for the implemented changes. */
export async function createPullRequest(
  branchName: string,
  issue: GitHubIssue | null,
  state: ADWState,
  logger: Logger,
  workingDir?: string
): Promise<[string | null, string | null]> {
  const planFile = (state.get("plan_file") as string) ?? "No plan file (test run)";
  const adwId = state.get("adw_id") as string;

  let issueJson: string;
  if (!issue) {
    issueJson = "{}";
  } else {
    issueJson = JSON.stringify({
      number: issue.number,
      title: issue.title,
      body: issue.body,
    });
  }

  const request = AgentRequestFactory.createPullRequestRequest(
    branchName,
    issueJson,
    planFile,
    adwId,
    workingDir
  );

  const response = await executeTemplate(request);
  if (!response.success) return [null, response.output];

  const prUrl = response.output.trim();
  logger.info(`Created pull request: ${prUrl}`);
  return [prUrl, null];
}

/** Find or error if no plan exists for issue. */
export function ensurePlanExists(state: ADWState, issueNumber: string): string {
  const planFile = state.get("plan_file") as string | undefined;
  if (planFile) return planFile;

  const plans = existsSync("temp/specs")
    ? readdirSync("temp/specs")
        .filter((f) => f.includes(issueNumber) && f.endsWith(".md"))
        .map((f) => join("temp", "specs", f))
    : [];
  if (plans.length > 0) return plans[0];

  throw new Error(
    `No plan found for issue ${issueNumber}. Run plan workflow first.`
  );
}

/** Get ADW ID or create a new one and initialize state. */
export async function ensureAdwId(
  issueNumber: string,
  adwId?: string,
  logger?: Logger,
  logDir?: string
): Promise<string> {
  if (adwId) {
    const state = ADWState.load(adwId, logger, logDir);
    if (state) {
      logger?.info(`Found existing ADW state for ID: ${adwId}`);
      return adwId;
    }
    const newState = new ADWState(adwId, logDir);
    newState.update({ adw_id: adwId, issue_number: issueNumber });
    await newState.save("ensure_adw_id");
    logger?.info(`Created new ADW state for provided ID: ${adwId}`);
    return adwId;
  }

  const newAdwId = makeAdwId();
  const state = new ADWState(newAdwId, logDir);
  state.update({ adw_id: newAdwId, issue_number: issueNumber });
  await state.save("ensure_adw_id");
  logger?.info(`Created new ADW ID and state: ${newAdwId}`);
  return newAdwId;
}

/** Find an existing branch for the given issue number. */
export async function findExistingBranchForIssue(
  issueNumber: string,
  adwId?: string,
  cwd?: string
): Promise<string | null> {
  const { stdout, exitCode } = await exec(["git", "branch", "-a"], { cwd });
  if (exitCode !== 0) return null;

  const branches = stdout.split("\n");
  for (let branch of branches) {
    branch = branch.trim().replace("* ", "").replace("remotes/origin/", "");
    if (branch.includes(`-issue-${issueNumber}-`)) {
      if (adwId && branch.includes(`-adw-${adwId}-`)) return branch;
      if (!adwId) return branch;
    }
  }

  return null;
}

/** Find plan file for the given issue number and optional adw_id. */
export function findPlanForIssue(
  issueNumber: string,
  adwId?: string
): string | null {
  const buildsDir = join(getProjectRoot(), "temp", "builds");
  if (!existsSync(buildsDir)) return null;

  try {
    for (const entry of readdirSync(buildsDir)) {
      // Match by adwId suffix or issue number prefix
      if (adwId && !entry.endsWith(`_${adwId}`)) continue;
      if (!adwId && !entry.startsWith(`${issueNumber}_`)) continue;

      // Check under steps/ first (new layout), then fallback to flat (legacy)
      const stepsPath = join(buildsDir, entry, "steps", AGENT_PLANNER, "plan.md");
      if (existsSync(stepsPath)) return stepsPath;
      const planPath = join(buildsDir, entry, AGENT_PLANNER, "plan.md");
      if (existsSync(planPath)) return planPath;
    }
  } catch {
    // ignore
  }

  return null;
}

/** Create or find a branch for the given issue. */
export async function createOrFindBranch(
  issueNumber: string,
  issue: GitHubIssue,
  state: ADWState,
  logger: Logger,
  cwd?: string
): Promise<[string, string | null]> {
  // 1. Check state
  const branchName = state.get("branch_name") as string | undefined;
  if (branchName) {
    logger.info(`Found branch in state: ${branchName}`);
    const { getCurrentBranch } = await import("./git-ops");
    const current = await getCurrentBranch(cwd);
    if (current !== branchName) {
      let result = await exec(["git", "checkout", branchName], { cwd });
      if (result.exitCode !== 0) {
        result = await exec(
          ["git", "checkout", "-b", branchName, `origin/${branchName}`],
          { cwd }
        );
        if (result.exitCode !== 0)
          return ["", `Failed to checkout branch: ${result.stderr}`];
      }
    }
    return [branchName, null];
  }

  // 2. Look for existing branch
  const adwId = state.get("adw_id") as string;
  const existing = await findExistingBranchForIssue(issueNumber, adwId, cwd);
  if (existing) {
    logger.info(`Found existing branch: ${existing}`);
    const result = await exec(["git", "checkout", existing], { cwd });
    if (result.exitCode !== 0)
      return ["", `Failed to checkout branch: ${result.stderr}`];
    state.update({ branch_name: existing });
    return [existing, null];
  }

  // 3. Classify and create new branch
  logger.info("No existing branch found, creating new one");

  const [issueCommand, classifyError] = await classifyIssue(issue, adwId, logger);
  if (classifyError || !issueCommand) return ["", `Failed to classify issue: ${classifyError}`];
  state.update({ issue_class: issueCommand });

  const [newBranch, branchError] = await generateBranchName(issue, issueCommand, adwId, logger);
  if (branchError || !newBranch) return ["", `Failed to generate branch name: ${branchError}`];

  const { createBranch } = await import("./git-ops");
  const [success, createError] = await createBranch(newBranch, cwd);
  if (!success) return ["", `Failed to create branch: ${createError}`];

  state.update({ branch_name: newBranch });
  logger.info(`Created and checked out new branch: ${newBranch}`);
  return [newBranch, null];
}

/** Find the spec file from state or by examining git diff. */
export async function findSpecFile(
  state: ADWState,
  logger: Logger
): Promise<string | null> {
  const worktreePath = state.get("worktree_path") as string | undefined;

  let specFile = state.get("plan_file") as string | undefined;
  if (specFile) {
    if (worktreePath && !specFile.startsWith("/")) {
      specFile = join(worktreePath, specFile);
    }
    if (existsSync(specFile)) {
      logger.info(`Using spec file from state: ${specFile}`);
      return specFile;
    }
  }

  // Try git diff
  logger.info("Looking for spec file in git diff");
  const { stdout, exitCode } = await exec(
    ["git", "diff", "origin/main", "--name-only"],
    { cwd: worktreePath }
  );

  if (exitCode === 0) {
    const files = stdout.split("\n");
    const specFiles = files.filter(
      (f) => f.startsWith("temp/specs/") && f.endsWith(".md")
    );
    if (specFiles.length > 0) {
      let found = specFiles[0];
      if (worktreePath) found = join(worktreePath, found);
      logger.info(`Found spec file: ${found}`);
      return found;
    }
  }

  // Try branch name pattern
  const branchName = state.get("branch_name") as string | undefined;
  if (branchName) {
    const match = branchName.match(/issue-(\d+)/);
    if (match) {
      const issueNum = match[1];
      const adwId = state.get("adw_id") as string;
      const searchDir = worktreePath ?? process.cwd();
      const specsDir = join(searchDir, "temp", "specs");
      const found = existsSync(specsDir)
        ? readdirSync(specsDir)
            .filter(
              (f) =>
                f.startsWith(`issue-${issueNum}-adw-${adwId}`) &&
                f.endsWith(".md")
            )
            .map((f) => join(specsDir, f))
        : [];
      if (found.length > 0) {
        logger.info(`Found spec file by pattern: ${found[0]}`);
        return found[0];
      }
    }
  }

  logger.warn("No spec file found");
  return null;
}

/** Create error response tuple. */
function createErrorResponse(output: string): [null, AgentPromptResponse] {
  return [
    null,
    {
      output,
      success: false,
      retry_code: "none",
    },
  ];
}

/** Validate patch file path format. */
function isValidPatchPath(path: string): boolean {
  return path.includes("temp/specs/patch/") && path.endsWith(".md");
}

/** Build arguments for patch request. */
function buildPatchArgs(
  adwId: string,
  reviewChangeRequest: string,
  specPath: string | undefined,
  agentNamePlanner: string,
  issueScreenshots?: string
): string[] {
  const args = [adwId, reviewChangeRequest];
  args.push(specPath ?? "");
  args.push(agentNamePlanner);
  if (issueScreenshots) args.push(issueScreenshots);
  return args;
}

/** Create a patch plan and implement it. */
export async function createAndImplementPatch(
  adwId: string,
  reviewChangeRequest: string,
  logger: Logger,
  agentNamePlanner: string,
  agentNameImplementor: string,
  specPath?: string,
  issueScreenshots?: string,
  workingDir?: string
): Promise<[string | null, AgentPromptResponse]> {
  const args = buildPatchArgs(adwId, reviewChangeRequest, specPath, agentNamePlanner, issueScreenshots);

  const request = AgentRequestFactory.createPatchRequest(
    agentNamePlanner,
    args,
    adwId,
    workingDir
  );

  const response = await executeTemplate(request);

  if (!response.success) {
    logger.error(`Error creating patch plan: ${response.output}`);
    return createErrorResponse(`Failed to create patch plan: ${response.output}`);
  }

  const patchFilePath = response.output.trim();

  if (!isValidPatchPath(patchFilePath)) {
    logger.error(`Invalid patch plan path returned: ${patchFilePath}`);
    return createErrorResponse(`Invalid patch plan path: ${patchFilePath}`);
  }

  logger.info(`Created patch plan: ${patchFilePath}`);

  const implementResponse = await implementPlan(
    patchFilePath,
    adwId,
    logger,
    agentNameImplementor,
    workingDir
  );

  return [patchFilePath, implementResponse];
}
