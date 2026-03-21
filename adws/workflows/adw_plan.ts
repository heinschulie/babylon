/**
 * ADW Plan Workflow — issue-driven planning pipeline.
 *
 * Steps:
 * 1. Fetch GitHub issue
 * 2. Classify issue type (/chore, /bug, /feature, /patch)
 * 3. Generate branch name + create branch
 * 4. Build implementation plan via /plan skill
 * 5. Commit plan
 * 6. Push + create/update PR
 *
 * Usage: bun run adws/workflows/adw_plan.ts --adw-id <id> --issue <number>
 */

import { parseArgs } from "util";
import { existsSync } from "fs";
import { runPlanStep, quickPrompt, formatUsage, sumUsage, type StepUsage } from "../src/agent-sdk";
import { createLogger, taggedLogger, writeWorkflowStatus } from "../src/logger";
import { fetchIssue, getRepoUrl, extractRepoPath } from "../src/github";
import { createBranch, commitChanges, finalizeGitOperations } from "../src/git-ops";
import { ADWState } from "../src/state";
import { ensureAdwId } from "../src/workflow-ops";
import {
  createStepBanner,
  extractPlanPath,
  createDefaultStepUsage,
  getAdwEnv,
  createCommentStep,
  createFinalStatusComment,
  fmtDuration,
} from "../src/utils";

const STEP_CLASSIFY = "classify";
const STEP_BRANCH = "branch";
const STEP_PLAN = "plan";
const STEP_COMMIT = "commit";
const TOTAL_STEPS = 4;


async function runWorkflow(adwId: string, issueNumber: string): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "plan");

  logger.info(`Starting ADW Plan Workflow — ADW ID: ${adwId}, Issue: #${issueNumber}`);

  const { workingDir, models } = getAdwEnv();

  // Create comment functions
  const commentStep = createCommentStep(issueNumber);
  const commentFinalStatus = createFinalStatusComment(issueNumber);

  // Ensure ADW state
  const resolvedAdwId = await ensureAdwId(issueNumber, adwId, logger);
  const state = ADWState.load(resolvedAdwId, logger) ?? new ADWState(resolvedAdwId);
  if (!state.get("adw_id")) {
    state.update({ adw_id: resolvedAdwId, issue_number: issueNumber });
  }

  // Fetch repo info
  let repoPath: string;
  try {
    const repoUrl = await getRepoUrl();
    repoPath = extractRepoPath(repoUrl);
  } catch (e) {
    logger.error(`Failed to get repo URL: ${e}`);
    return false;
  }

  // Fetch issue
  logger.info(`Fetching issue #${issueNumber}...`);
  let issue;
  try {
    issue = await fetchIssue(issueNumber, repoPath);
  } catch (e) {
    logger.error(`Failed to fetch issue: ${e}`);
    return false;
  }

  logger.info(`Issue: ${issue.title}`);
  await commentStep("Starting planning phase");

  let completedSteps = 0;
  const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];

  try {
    // Step 1: Classify issue
    logger.info(`\n${createStepBanner(STEP_CLASSIFY, 1, TOTAL_STEPS)}`);
    const classifyLog = taggedLogger(logger, STEP_CLASSIFY, { logDir: logger.logDir, step: STEP_CLASSIFY });

    const minimalIssue = JSON.stringify({
      number: issue.number,
      title: issue.title,
      body: issue.body,
    });

    const classifyResult = await quickPrompt(
      `/classify_issue ${minimalIssue}`,
      { model: models.research, cwd: workingDir, logger: classifyLog }
    );

    if (!classifyResult.success || !classifyResult.result) {
      classifyLog.error(`Failed to classify issue: ${classifyResult.error ?? "no result"}`);
      classifyLog.finalize(false);
      return false;
    }

    const commandMatch = classifyResult.result.match(/\/chore|\/bug|\/feature|\/patch|0/);
    if (!commandMatch || commandMatch[0] === "0") {
      classifyLog.error(`Invalid classification: ${classifyResult.result}`);
      classifyLog.finalize(false);
      await commentStep(`Error classifying issue: ${classifyResult.result}`);
      return false;
    }

    const issueCommand = commandMatch[0];
    state.update({ issue_class: issueCommand as any });
    await state.save("adw_plan");
    classifyLog.info(`Issue classified as: ${issueCommand}`);
    classifyLog.finalize(true);
    completedSteps++;

    await commentStep(`Step 1/${TOTAL_STEPS} CLASSIFY completed ✅ — ${issueCommand}`);

    // Step 2: Generate branch name + create branch
    logger.info(`\n${createStepBanner(STEP_BRANCH, 2, TOTAL_STEPS)}`);
    const branchLog = taggedLogger(logger, STEP_BRANCH, { logDir: logger.logDir, step: STEP_BRANCH });

    const issueType = issueCommand.replace("/", "");
    const branchPrompt = `Generate a git branch name for this issue. The format must be: hein/${issueType}/issue-${issue.number}-{short-description}. Use lowercase, hyphens only, max 5 words in description. Respond with ONLY the branch name, nothing else.\n\nIssue: ${issue.title}`;

    const branchResult = await quickPrompt(branchPrompt, {
      model: models.research,
      cwd: workingDir,
      logger: branchLog,
    });

    if (!branchResult.success || !branchResult.result) {
      branchLog.error(`Failed to generate branch name: ${branchResult.error ?? "no result"}`);
      branchLog.finalize(false);
      return false;
    }

    const branchName = branchResult.result.trim().replace(/[`"']/g, "");
    branchLog.info(`Generated branch name: ${branchName}`);

    const [branchSuccess, branchError] = await createBranch(branchName, workingDir);
    if (!branchSuccess) {
      branchLog.error(`Failed to create branch: ${branchError}`);
      branchLog.finalize(false);
      await commentStep(`Step 2/${TOTAL_STEPS} BRANCH failed ❌ — ${branchError}`);
      return false;
    }

    state.update({ branch_name: branchName });
    await state.save("adw_plan");
    branchLog.info(`Working on branch: ${branchName}`);
    branchLog.finalize(true);
    completedSteps++;

    await commentStep(`Step 2/${TOTAL_STEPS} BRANCH completed ✅ — ${branchName}`);

    // Step 3: Build implementation plan
    logger.info(`\n${createStepBanner(STEP_PLAN, 3, TOTAL_STEPS)}`);
    const planLog = taggedLogger(logger, STEP_PLAN, { logDir: logger.logDir, step: STEP_PLAN });

    await commentStep(`Step 3/${TOTAL_STEPS} PLAN started...`);

    const planPrompt = `Issue #${issue.number}: ${issue.title}\n\n${issue.body ?? ""}`;
    const planResult = await runPlanStep(planPrompt, {
      model: models.default,
      cwd: workingDir,
      logger: planLog,
      adwId: resolvedAdwId,
    });

    const planUsage = planResult.usage ?? createDefaultStepUsage();
    const planOk = planResult.success;
    allStepUsages.push({ step: STEP_PLAN, ok: planOk, usage: planUsage });
    planLog.info(`Usage: ${formatUsage(planUsage)}`);

    if (!planResult.success) {
      planLog.error(`Failed: ${planResult.error ?? planResult.result ?? "unknown"}`);
      planLog.finalize(false, planUsage);
      await commentStep(`Step 3/${TOTAL_STEPS} PLAN failed ❌ (${fmtDuration(planUsage.duration_ms)})`);
      return false;
    }
    planLog.finalize(true, planUsage);
    completedSteps++;

    // Extract plan file path
    const planPath = extractPlanPath(planResult.result ?? "", workingDir, resolvedAdwId);
    if (planPath) {
      logger.info(`Found plan file: ${planPath}`);
    }

    if (!planPath || !existsSync(planPath)) {
      logger.error(`Plan file not found: ${planPath ?? "none"}`);
      return false;
    }

    state.update({ plan_file: planPath });
    await state.save("adw_plan");
    logger.info(`Plan file created: ${planPath}`);

    await commentStep(`Step 3/${TOTAL_STEPS} PLAN completed ✅ (${fmtDuration(planUsage.duration_ms)})`);

    // Step 4: Commit plan
    logger.info(`\n${createStepBanner(STEP_COMMIT, 4, TOTAL_STEPS)}`);
    const commitLog = taggedLogger(logger, STEP_COMMIT, { logDir: logger.logDir, step: STEP_COMMIT });

    const commitMsg = `${issueType}(plan): add implementation plan for #${issue.number}\n\nADW: ${resolvedAdwId}`;
    const [commitSuccess, commitError] = await commitChanges(commitMsg, workingDir);

    if (!commitSuccess) {
      commitLog.error(`Failed to commit: ${commitError}`);
      commitLog.finalize(false);
      return false;
    }

    commitLog.info(`Committed plan: ${commitMsg.split("\n")[0]}`);
    commitLog.finalize(true);
    completedSteps++;

    await commentStep(`Step 4/${TOTAL_STEPS} COMMIT completed ✅`);

    // Finalize git operations (push + PR)
    logger.info("Finalizing git operations...");
    await finalizeGitOperations(state, logger, workingDir);

    // Save final state
    await state.save("adw_plan");

    // Summary
    const totalUsage = allStepUsages.length > 0
      ? sumUsage(allStepUsages.map((s) => s.usage))
      : createDefaultStepUsage();

    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  WORKFLOW COMPLETE — ${fmtDuration(Date.now() - startTime)}`);
    logger.info(`  Issue: #${issueNumber} — ${issue.title}`);
    logger.info(`  Branch: ${branchName}`);
    logger.info(`  Plan: ${planPath}`);
    logger.info(`\n  USAGE PER STEP:`);
    for (const { step, usage } of allStepUsages) {
      logger.info(`    [${step}] ${formatUsage(usage)}`);
    }
    logger.info(`\n  TOTAL: ${formatUsage(totalUsage)}`);
    logger.info(`${"═".repeat(60)}`);

    writeWorkflowStatus(logger.logDir, {
      workflow: "plan",
      adwId: resolvedAdwId,
      ok: true,
      startTime,
      totals: totalUsage,
    });

    // Post final status comment
    await commentFinalStatus({
      workflow: "plan",
      adwId: resolvedAdwId,
      ok: true,
      startTime,
      steps: allStepUsages,
      totals: totalUsage,
    });

    return true;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);

    const totalUsage =
      allStepUsages.length > 0
        ? sumUsage(allStepUsages.map((s) => s.usage))
        : createDefaultStepUsage();
    writeWorkflowStatus(logger.logDir, {
      workflow: "plan",
      adwId: resolvedAdwId,
      ok: false,
      startTime,
      totals: totalUsage,
    });
    await commentStep(`Workflow exception: ${String(e).slice(0, 200)}`);
    await commentFinalStatus({
      workflow: "plan",
      adwId: resolvedAdwId,
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
      "issue": { type: "string" },
    },
    strict: true,
  });

  const adwId = values["adw-id"];
  const issueNumber = values["issue"];

  if (!adwId || !issueNumber) {
    console.error("Usage: bun run adw_plan.ts --adw-id <id> --issue <number>");
    process.exit(1);
  }

  const success = await runWorkflow(adwId, issueNumber);
  process.exit(success ? 0 : 1);
}
