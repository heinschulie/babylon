/**
 * ADW Patch Workflow — single-issue patch: fetch issue, create patch plan, build, commit, push+PR.
 *
 * Uses @anthropic-ai/claude-agent-sdk for streaming agent execution.
 *
 * Usage: bun run adws/workflows/adw_patch.ts --adw-id <id>
 *
 * Env vars:
 *   ADW_PROMPT        — patch change request (required unless issue body has 'adw_patch')
 *   ADW_WORKING_DIR   — working directory (default: cwd)
 *   ADW_MODEL         — model for plan+build steps (default: claude-sonnet-4-20250514)
 *   ADW_ISSUE_NUMBER  — GitHub issue number to patch against (optional)
 */

import { parseArgs } from "util";
import { join } from "path";
import { readdirSync, statSync } from "fs";
import {
  runPatchPlanStep,
  runBuildStep,
  formatUsage,
  sumUsage,
  type StepUsage,
} from "../src/agent-sdk";
import { createLogger, taggedLogger, writeWorkflowStatus } from "../src/logger";
import {
  makeIssueComment,
  findKeywordFromComment,
  getRepoUrl,
  extractRepoPath,
  fetchIssue,
} from "../src/github";
import {
  commitChanges,
  finalizeGitOperations,
} from "../src/git-ops";
import { formatIssueMessage } from "../src/workflow-ops";
import { ADWState } from "../src/state";
import {
  getAdwEnv,
  createStepBanner,
  createCommentStep,
  createFinalStatusComment,
  extractPlanPath,
  createDefaultStepUsage,
  fmtDuration,
} from "../src/utils";

const STEP_PATCH_PLAN = "patch_plan";
const STEP_PATCH_BUILD = "patch_build";
const STEP_COMMIT = "commit";
const STEP_FINALIZE = "finalize";
const TOTAL_STEPS = 4;

const AGENT_PATCH_PLANNER = "patch_planner";
const AGENT_PATCH_IMPLEMENTOR = "patch_implementor";


/**
 * Get patch content from issue comments/body containing 'adw_patch',
 * or fall back to ADW_PROMPT env var.
 */
async function getPatchContent(
  issueNumber: string | undefined,
  adwId: string,
  prompt: string | null,
  logger: ReturnType<typeof createLogger>,
  commentStep: (msg: string) => Promise<void>
): Promise<string | null> {
  // If we have an issue number, try to extract from issue
  if (issueNumber) {
    try {
      const repoUrl = await getRepoUrl();
      const repoPath = extractRepoPath(repoUrl);
      const issue = await fetchIssue(issueNumber, repoPath);

      // Check for latest comment containing 'adw_patch'
      const keywordComment = findKeywordFromComment("adw_patch", issue);
      if (keywordComment) {
        logger.info(`Found 'adw_patch' in comment, using comment body`);
        await commentStep(formatIssueMessage(adwId, AGENT_PATCH_PLANNER, `Creating patch plan from comment containing 'adw_patch'`));
        return keywordComment.body;
      }

      // Check issue body
      if (issue.body.includes("adw_patch")) {
        logger.info("Found 'adw_patch' in issue body, using issue title+body");
        await commentStep(formatIssueMessage(adwId, AGENT_PATCH_PLANNER, "Creating patch plan from issue containing 'adw_patch'"));
        return `Issue #${issue.number}: ${issue.title}\n\n${issue.body}`;
      }

      logger.warn("No 'adw_patch' keyword found in issue");
    } catch (e) {
      logger.error(`Failed to fetch issue #${issueNumber}: ${e}`);
    }
  }

  // Fall back to ADW_PROMPT
  if (prompt) {
    logger.info("Using ADW_PROMPT as patch content");
    return prompt;
  }

  logger.error("No patch content available (no ADW_PROMPT and no 'adw_patch' keyword in issue)");
  return null;
}

async function runWorkflow(adwId: string): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "patch");

  logger.info(`Starting ADW Patch Workflow — ADW ID: ${adwId}`);

  const { prompt, workingDir, models } = getAdwEnv();
  const issueNumber = process.env.ADW_ISSUE_NUMBER;

  // Create comment functions
  const commentStep = createCommentStep(issueNumber);
  const commentFinalStatus = createFinalStatusComment(issueNumber);

  logger.info(`Working Dir: ${workingDir}`);
  logger.info(`Model: ${models.default}`);
  if (issueNumber) logger.info(`Issue: #${issueNumber}`);
  if (prompt) logger.info(`Prompt: ${prompt.slice(0, 200)}...`);

  let completedSteps = 0;
  const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];

  try {
    // Get patch content
    const patchContent = await getPatchContent(issueNumber, adwId, prompt, logger, commentStep);
    if (!patchContent) {
      return false;
    }
    logger.info(`Patch content: ${patchContent.slice(0, 200)}...`);

    // ═══════════════════════════════════════════════════════════════
    // Step 1: Create Patch Plan
    // ═══════════════════════════════════════════════════════════════
    logger.info(`\n${createStepBanner(STEP_PATCH_PLAN, 1, TOTAL_STEPS)}`);

    const planLog = taggedLogger(logger, AGENT_PATCH_PLANNER, {
      logDir: logger.logDir,
      step: STEP_PATCH_PLAN,
    });

    const patchPlanResult = await runPatchPlanStep(adwId, patchContent, {
      model: models.default,
      cwd: workingDir,
      logger: planLog,
      agentName: AGENT_PATCH_PLANNER,
    });

    const planUsage = patchPlanResult.usage ?? createDefaultStepUsage();
    const planOk = patchPlanResult.success;
    allStepUsages.push({ step: STEP_PATCH_PLAN, ok: planOk, usage: planUsage });
    planLog.info(`Usage: ${formatUsage(planUsage)}`);

    if (!patchPlanResult.success) {
      planLog.error(`Failed: ${patchPlanResult.error}`);
      planLog.finalize(false, planUsage);
      await commentStep(formatIssueMessage(adwId, AGENT_PATCH_PLANNER, `Failed to create patch plan`));
      return false;
    }
    planLog.finalize(true, planUsage);
    completedSteps++;
    logger.info(`${STEP_PATCH_PLAN} step completed (${completedSteps}/${TOTAL_STEPS})`);

    // Extract patch plan file path using standardized utility
    const patchPlanPath = extractPlanPath(patchPlanResult.result ?? "", workingDir, adwId);
    if (!patchPlanPath) {
      logger.error("Could not extract patch plan file path");
      return false;
    }

    await commentStep(formatIssueMessage(adwId, AGENT_PATCH_PLANNER, `Patch plan created: ${patchPlanPath}`));

    // ═══════════════════════════════════════════════════════════════
    // Step 2: Implement Patch (Build)
    // ═══════════════════════════════════════════════════════════════
    logger.info(`\n${createStepBanner(STEP_PATCH_BUILD, 2, TOTAL_STEPS)}`);
    logger.info(`Patch plan: ${patchPlanPath}`);

    const buildLog = taggedLogger(logger, AGENT_PATCH_IMPLEMENTOR, {
      logDir: logger.logDir,
      step: STEP_PATCH_BUILD,
    });

    const buildResult = await runBuildStep(patchPlanPath, {
      model: models.default,
      cwd: workingDir,
      logger: buildLog,
    });

    const buildUsage = buildResult.usage ?? createDefaultStepUsage();
    const buildOk = buildResult.success;
    allStepUsages.push({ step: STEP_PATCH_BUILD, ok: buildOk, usage: buildUsage });
    buildLog.info(`Usage: ${formatUsage(buildUsage)}`);

    if (!buildResult.success) {
      buildLog.error(`Failed: ${buildResult.error}`);
      buildLog.finalize(false, buildUsage);
      await commentStep(formatIssueMessage(adwId, AGENT_PATCH_IMPLEMENTOR, `Error implementing patch`));
      return false;
    }
    buildLog.finalize(true, buildUsage);
    completedSteps++;
    logger.info(`${STEP_PATCH_BUILD} step completed (${completedSteps}/${TOTAL_STEPS})`);

    await commentStep(formatIssueMessage(adwId, AGENT_PATCH_IMPLEMENTOR, "Patch implemented"));

    // ═══════════════════════════════════════════════════════════════
    // Step 3: Commit
    // ═══════════════════════════════════════════════════════════════
    logger.info(`\n${createStepBanner(STEP_COMMIT, 3, TOTAL_STEPS)}`);

    const commitLog = taggedLogger(logger, "committer", {
      logDir: logger.logDir,
      step: STEP_COMMIT,
    });

    const commitMsg = `patch(${adwId}): implement patch from plan\n\nPatch plan: ${patchPlanPath}`;
    const [commitOk, commitErr] = await commitChanges(commitMsg, workingDir);
    if (!commitOk) {
      commitLog.error(`Failed to commit: ${commitErr}`);
      commitLog.finalize(false);
      await commentStep(formatIssueMessage(adwId, AGENT_PATCH_IMPLEMENTOR, `Error committing patch: ${commitErr}`));
      return false;
    }
    commitLog.info(`Committed: ${commitMsg.split("\n")[0]}`);
    commitLog.finalize(true);
    completedSteps++;
    logger.info(`${STEP_COMMIT} step completed (${completedSteps}/${TOTAL_STEPS})`);

    // ═══════════════════════════════════════════════════════════════
    // Step 4: Push + PR
    // ═══════════════════════════════════════════════════════════════
    logger.info(`\n${createStepBanner(STEP_FINALIZE, 4, TOTAL_STEPS)}`);

    const finalizeLog = taggedLogger(logger, "git_ops", {
      logDir: logger.logDir,
      step: STEP_FINALIZE,
    });

    // Build a minimal state for finalizeGitOperations
    const state = new ADWState(adwId);
    state.update({ adw_id: adwId, plan_file: patchPlanPath });
    if (issueNumber) state.update({ issue_number: issueNumber });

    // Try to detect current branch
    const { exec } = await import("../src/utils");
    const { stdout: branchName } = await exec(
      ["git", "rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: workingDir }
    );
    if (branchName && branchName !== "main") {
      state.update({ branch_name: branchName });
    }

    await finalizeGitOperations(state, finalizeLog, workingDir);
    finalizeLog.finalize(true);
    completedSteps++;

    // ═══════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════
    const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));

    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  WORKFLOW COMPLETE — ${fmtDuration(Date.now() - startTime)}`);
    logger.info(`  Patch plan: ${patchPlanPath}`);
    logger.info(`\n  USAGE PER STEP:`);
    for (const { step, usage } of allStepUsages) {
      logger.info(`    [${step}] ${formatUsage(usage)}`);
    }
    logger.info(`\n  TOTAL: ${formatUsage(totalUsage)}`);
    logger.info(`${"═".repeat(60)}`);

    writeWorkflowStatus(logger.logDir, {
      workflow: "patch",
      adwId,
      ok: true,
      startTime,
      totals: totalUsage,
    });

    // Post final status comment
    await commentFinalStatus({
      workflow: "patch",
      adwId,
      ok: true,
      startTime,
      steps: allStepUsages,
      totals: totalUsage,
    });

    return true;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);

    const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));
    writeWorkflowStatus(logger.logDir, {
      workflow: "patch",
      adwId,
      ok: false,
      startTime,
      totals: totalUsage,
    });

    // Post failure status comment
    await commentFinalStatus({
      workflow: "patch",
      adwId,
      ok: false,
      startTime,
      steps: allStepUsages,
      totals: totalUsage,
    });

    return false;
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "adw-id": { type: "string" },
    },
    strict: true,
  });

  const adwId = values["adw-id"];
  if (!adwId) {
    console.error("Usage: bun run adw_patch.ts --adw-id <id>");
    process.exit(1);
  }

  const success = await runWorkflow(adwId);
  process.exit(success ? 0 : 1);
}
