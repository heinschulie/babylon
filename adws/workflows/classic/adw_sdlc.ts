/**
 * ADW SDLC Workflow — complete Software Development Life Cycle.
 *
 * Five sequential steps: plan, build, test, review, document.
 * Uses @anthropic-ai/claude-agent-sdk for streaming agent execution.
 *
 * Usage: bun run adws/workflows/adw_sdlc.ts --adw-id <id>
 */

import { parseArgs } from "util";
import {
  runPlanStep,
  runBuildStep,
  runTestStep,
  runReviewStep,
  runDocumentStep,
  runStep,
  quickPrompt,
  formatUsage,
  sumUsage,
  type StepUsage,
} from "../../src/agent-sdk";
import { createLogger, writeWorkflowStatus } from "../../src/logger";
import { postReviewToIssue } from "../../src/github";
import {
  parseReviewResult,
  extractReviewVerdict,
} from "../../src/review-utils";
import { fetchAndClassifyIssue } from "../../src/issue-utils";
import {
  extractPlanPath,
  createDefaultStepUsage,
  createCommentStep,
  createFinalStatusComment,
  getAdwEnv,
} from "../../src/utils";

const WORKFLOW = "sdlc";
const TOTAL_STEPS = 5;

async function runWorkflow(adwId: string, issueNumber?: string): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, WORKFLOW);
  logger.info(`Starting ADW SDLC Workflow — ADW ID: ${adwId}`);

  const { prompt, workingDir, models } = getAdwEnv();
  const commentStep = createCommentStep(issueNumber);
  const commentFinalStatus = createFinalStatusComment(issueNumber);

  // Resolve plan prompt: issue-driven (type-specific) or ADW_PROMPT (generic)
  let resolvedPrompt = prompt;
  let useTypeSpecific = false;
  if (!prompt && issueNumber) {
    const classified = await fetchAndClassifyIssue(issueNumber, adwId, { model: models.research, cwd: workingDir });
    if (!classified.ok) { logger.error(classified.error); return false; }
    resolvedPrompt = classified.planPrompt;
    useTypeSpecific = true;
    logger.info(`Issue #${issueNumber} classified as ${classified.issueClass}`);
  }
  if (!resolvedPrompt) { logger.error("No ADW_PROMPT set and no --issue provided"); return false; }

  logger.info(`Prompt: ${resolvedPrompt.slice(0, 200)}...`);
  logger.info(`Working Dir: ${workingDir}`);
  logger.info(`Plan/Build Model: ${models.default}`);
  logger.info(`Research Model: ${models.research}`);
  logger.info(`Review Model: ${models.review}`);

  const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];
  const stepOpts = (stepName: string, stepNumber: number, onFail?: "halt" | "continue") => ({
    stepName, stepNumber, totalSteps: TOTAL_STEPS, logger, commentStep, allStepUsages, onFail,
  });

  const finalize = async (ok: boolean) => {
    const totals = allStepUsages.length > 0 ? sumUsage(allStepUsages.map((s) => s.usage)) : createDefaultStepUsage();
    writeWorkflowStatus(logger.logDir, { workflow: WORKFLOW, adwId, ok, startTime, totals });
    await commentFinalStatus({ workflow: WORKFLOW, adwId, ok, startTime, steps: allStepUsages, totals });
  };

  try {
    // Step 1: Plan (type-specific when issue-driven, generic otherwise)
    const plan = await runStep(stepOpts("plan", 1), (log) =>
      useTypeSpecific
        ? quickPrompt(resolvedPrompt!, { model: models.default, cwd: workingDir, logger: log })
        : runPlanStep(resolvedPrompt!, { model: models.default, cwd: workingDir, logger: log, adwId }));
    if (!plan.ok) { await finalize(false); return false; }

    const planPath = extractPlanPath(plan.result ?? "", workingDir, adwId);
    if (!planPath) {
      logger.error("Could not extract plan file path");
      await commentStep("Could not extract plan file path");
      await finalize(false);
      return false;
    }

    // Step 2: Build
    const build = await runStep(stepOpts("build", 2), (log) =>
      runBuildStep(planPath, { model: models.default, cwd: workingDir, logger: log }));
    if (!build.ok) { await finalize(false); return false; }

    // Step 3: Test (non-fatal)
    const test = await runStep(stepOpts("test", 3, "continue"), (log) =>
      runTestStep({ model: models.research, cwd: workingDir, logger: log }));
    if (!test.ok) logger.warn("Test step failed but continuing with review...");

    // Step 4: Review
    const review = await runStep(stepOpts("review", 4), (log) =>
      runReviewStep(adwId, planPath, { model: models.review, cwd: workingDir, logger: log }));
    if (!review.ok) { await finalize(false); return false; }

    // Parse review verdict and post to GitHub
    const parsedReview = parseReviewResult(review.result);
    const { ok: reviewOk, verdict } = extractReviewVerdict(parsedReview);
    await commentStep(`REVIEW verdict: ${verdict} ${reviewOk ? "✅" : "⚠️"}`);
    if (issueNumber) await postReviewToIssue(issueNumber, adwId, parsedReview, logger);

    // Step 5: Document (non-fatal)
    const doc = await runStep(stepOpts("document", 5, "continue"), (log) =>
      runDocumentStep(adwId, { model: models.default, cwd: workingDir, logger: log, specPath: planPath }));
    if (!doc.ok) logger.warn("Document step failed but workflow continues...");

    // Workflow summary
    const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));
    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  WORKFLOW COMPLETE — ${Math.round((Date.now() - startTime) / 1000)}s`);
    logger.info(`  Plan: ${planPath}`);
    logger.info(`  Review verdict: ${verdict}`);
    logger.info(`  USAGE PER STEP:`);
    for (const { step, usage } of allStepUsages) logger.info(`    [${step}] ${formatUsage(usage)}`);
    logger.info(`  TOTAL: ${formatUsage(totalUsage)}`);
    logger.info(`${"═".repeat(60)}`);

    await finalize(reviewOk);
    return reviewOk;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);
    await commentStep(`Workflow exception ❌: ${String(e).slice(0, 200)}`);
    await finalize(false);
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
  if (!adwId) {
    console.error("Usage: bun run adw_sdlc.ts --adw-id <id> [--issue <number>]");
    process.exit(1);
  }

  const success = await runWorkflow(adwId, values["issue"]);
  process.exit(success ? 0 : 1);
}
