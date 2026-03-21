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
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { runPlanStep, quickPrompt, formatUsage, sumUsage, type StepUsage } from "../src/agent-sdk";
import { createLogger, taggedLogger, writeWorkflowStatus } from "../src/logger";
import { fetchIssue, makeIssueComment, getRepoUrl, extractRepoPath } from "../src/github";
import { createBranch, commitChanges, finalizeGitOperations } from "../src/git-ops";
import { ADWState } from "../src/state";
import { ensureAdwId, formatIssueMessage } from "../src/workflow-ops";

const STEP_CLASSIFY = "classify";
const STEP_BRANCH = "branch";
const STEP_PLAN = "plan";
const STEP_COMMIT = "commit";
const TOTAL_STEPS = 4;

const AGENT_PLANNER = "sdlc_planner";

async function runWorkflow(adwId: string, issueNumber: string): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "plan");

  logger.info(`Starting ADW Plan Workflow — ADW ID: ${adwId}, Issue: #${issueNumber}`);

  // Per-phase model selection
  const classifyModel = process.env.ADW_RESEARCH_MODEL ?? "claude-haiku-4-5-20251001";
  const planModel = process.env.ADW_MODEL ?? "claude-sonnet-4-20250514";
  const workingDir = process.env.ADW_WORKING_DIR ?? process.cwd();

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
  await makeIssueComment(
    issueNumber,
    formatIssueMessage(resolvedAdwId, "ops", "Starting planning phase")
  ).catch(() => {});

  let completedSteps = 0;
  const allStepUsages: { step: string; usage: StepUsage }[] = [];

  try {
    // Step 1: Classify issue
    logger.info(`\n${"═".repeat(60)}\n  STEP 1/${TOTAL_STEPS}: ${STEP_CLASSIFY.toUpperCase()}\n${"═".repeat(60)}`);
    const classifyLog = taggedLogger(logger, STEP_CLASSIFY, { logDir: logger.logDir, step: STEP_CLASSIFY });

    const minimalIssue = JSON.stringify({
      number: issue.number,
      title: issue.title,
      body: issue.body,
    });

    const classifyResult = await quickPrompt(
      `/classify_issue ${minimalIssue}`,
      { model: classifyModel, cwd: workingDir, logger: classifyLog }
    );

    if (!classifyResult) {
      classifyLog.error("Failed to classify issue");
      classifyLog.finalize(false);
      return false;
    }

    const commandMatch = classifyResult.match(/\/chore|\/bug|\/feature|\/patch|0/);
    if (!commandMatch || commandMatch[0] === "0") {
      classifyLog.error(`Invalid classification: ${classifyResult}`);
      classifyLog.finalize(false);
      await makeIssueComment(
        issueNumber,
        formatIssueMessage(resolvedAdwId, "ops", `Error classifying issue: ${classifyResult}`)
      ).catch(() => {});
      return false;
    }

    const issueCommand = commandMatch[0];
    state.update({ issue_class: issueCommand as any });
    await state.save("adw_plan");
    classifyLog.info(`Issue classified as: ${issueCommand}`);
    classifyLog.finalize(true);
    completedSteps++;

    await makeIssueComment(
      issueNumber,
      formatIssueMessage(resolvedAdwId, "ops", `Issue classified as: ${issueCommand}`)
    ).catch(() => {});

    // Step 2: Generate branch name + create branch
    logger.info(`\n${"═".repeat(60)}\n  STEP 2/${TOTAL_STEPS}: ${STEP_BRANCH.toUpperCase()}\n${"═".repeat(60)}`);
    const branchLog = taggedLogger(logger, STEP_BRANCH, { logDir: logger.logDir, step: STEP_BRANCH });

    const issueType = issueCommand.replace("/", "");
    const branchPrompt = `Generate a git branch name for this issue. The format must be: hein/${issueType}/issue-${issue.number}-{short-description}. Use lowercase, hyphens only, max 5 words in description. Respond with ONLY the branch name, nothing else.\n\nIssue: ${issue.title}`;

    const branchResult = await quickPrompt(branchPrompt, {
      model: classifyModel,
      cwd: workingDir,
      logger: branchLog,
    });

    if (!branchResult) {
      branchLog.error("Failed to generate branch name");
      branchLog.finalize(false);
      return false;
    }

    const branchName = branchResult.trim().replace(/[`"']/g, "");
    branchLog.info(`Generated branch name: ${branchName}`);

    const [branchSuccess, branchError] = await createBranch(branchName, workingDir);
    if (!branchSuccess) {
      branchLog.error(`Failed to create branch: ${branchError}`);
      branchLog.finalize(false);
      await makeIssueComment(
        issueNumber,
        formatIssueMessage(resolvedAdwId, "ops", `Error creating branch: ${branchError}`)
      ).catch(() => {});
      return false;
    }

    state.update({ branch_name: branchName });
    await state.save("adw_plan");
    branchLog.info(`Working on branch: ${branchName}`);
    branchLog.finalize(true);
    completedSteps++;

    await makeIssueComment(
      issueNumber,
      formatIssueMessage(resolvedAdwId, "ops", `Working on branch: ${branchName}`)
    ).catch(() => {});

    // Step 3: Build implementation plan
    logger.info(`\n${"═".repeat(60)}\n  STEP 3/${TOTAL_STEPS}: ${STEP_PLAN.toUpperCase()}\n${"═".repeat(60)}`);
    const planLog = taggedLogger(logger, STEP_PLAN, { logDir: logger.logDir, step: STEP_PLAN });

    await makeIssueComment(
      issueNumber,
      formatIssueMessage(resolvedAdwId, AGENT_PLANNER, "Building implementation plan")
    ).catch(() => {});

    const planPrompt = `Issue #${issue.number}: ${issue.title}\n\n${issue.body ?? ""}`;
    const planResult = await runPlanStep(planPrompt, {
      model: planModel,
      cwd: workingDir,
      logger: planLog,
      adwId: resolvedAdwId,
    });

    if (planResult.usage) {
      allStepUsages.push({ step: STEP_PLAN, usage: planResult.usage });
      planLog.info(`Usage: ${formatUsage(planResult.usage)}`);
    }

    if (!planResult.success) {
      planLog.error(`Failed: ${planResult.error ?? planResult.result ?? "unknown"}`);
      planLog.finalize(false, planResult.usage);
      await makeIssueComment(
        issueNumber,
        formatIssueMessage(resolvedAdwId, AGENT_PLANNER, `Error building plan: ${planResult.error ?? "unknown"}`)
      ).catch(() => {});
      return false;
    }
    planLog.finalize(true, planResult.usage);
    completedSteps++;

    // Extract plan file path
    let planPath: string | null = null;
    if (planResult.result) {
      const resultText = planResult.result.trim();
      const absMatch = resultText.match(/\/[^\s`"']+\.md/);
      if (absMatch) {
        planPath = absMatch[0];
        logger.info(`Extracted plan path from result: ${planPath}`);
      } else {
        const relMatch = resultText.match(/(?:specs\/[^\s`"']+\.md)/);
        if (relMatch) {
          planPath = join(workingDir, relMatch[0]);
          logger.info(`Extracted relative plan path: ${planPath}`);
        }
      }
    }

    // Fallback: look in specs/
    if (!planPath) {
      logger.warn("Attempting fallback plan path detection...");
      const specsDir = join(workingDir, "specs");
      try {
        const mdFiles = readdirSync(specsDir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => ({
            name: f,
            path: join(specsDir, f),
            mtime: statSync(join(specsDir, f)).mtimeMs,
          }))
          .sort((a, b) => b.mtime - a.mtime);

        const adwMatch = mdFiles.find((f) => f.name.includes(resolvedAdwId));
        if (adwMatch) {
          planPath = adwMatch.path;
          logger.info(`Found plan file by ADW ID: ${planPath}`);
        } else if (mdFiles.length > 0) {
          planPath = mdFiles[0].path;
          logger.info(`Found most recent plan file: ${planPath}`);
        }
      } catch {
        // specs dir may not exist
      }
    }

    if (!planPath || !existsSync(planPath)) {
      logger.error(`Plan file not found: ${planPath ?? "none"}`);
      return false;
    }

    state.update({ plan_file: planPath });
    await state.save("adw_plan");
    logger.info(`Plan file created: ${planPath}`);

    await makeIssueComment(
      issueNumber,
      formatIssueMessage(resolvedAdwId, AGENT_PLANNER, "Implementation plan created")
    ).catch(() => {});

    // Step 4: Commit plan
    logger.info(`\n${"═".repeat(60)}\n  STEP 4/${TOTAL_STEPS}: ${STEP_COMMIT.toUpperCase()}\n${"═".repeat(60)}`);
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

    await makeIssueComment(
      issueNumber,
      formatIssueMessage(resolvedAdwId, AGENT_PLANNER, "Plan committed")
    ).catch(() => {});

    // Finalize git operations (push + PR)
    logger.info("Finalizing git operations...");
    await finalizeGitOperations(state, logger, workingDir);

    // Save final state
    await state.save("adw_plan");

    // Summary
    const totalUsage = allStepUsages.length > 0
      ? sumUsage(allStepUsages.map((s) => s.usage))
      : { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, total_cost_usd: 0, duration_ms: 0, num_turns: 0 };

    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  WORKFLOW COMPLETE — ${Math.round((Date.now() - startTime) / 1000)}s`);
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

    await makeIssueComment(
      issueNumber,
      formatIssueMessage(resolvedAdwId, "ops", "Planning phase completed")
    ).catch(() => {});

    return true;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);

    const totalUsage = allStepUsages.length > 0
      ? sumUsage(allStepUsages.map((s) => s.usage))
      : { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, total_cost_usd: 0, duration_ms: 0, num_turns: 0 };

    writeWorkflowStatus(logger.logDir, {
      workflow: "plan",
      adwId: resolvedAdwId,
      ok: false,
      startTime,
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
