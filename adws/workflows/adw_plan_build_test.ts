/**
 * ADW Plan-Build-Test Workflow — three-step: plan, build, then test.
 *
 * Uses @anthropic-ai/claude-agent-sdk for streaming agent execution.
 *
 * Usage: bun run adws/workflows/adw_plan_build_test.ts --adw-id <id>
 */

import { parseArgs } from "util";
import { runPlanStep, runBuildStep, runTestStep, runStep, formatUsage, sumUsage, type StepUsage } from "../src/agent-sdk";
import { createLogger, writeWorkflowStatus } from "../src/logger";
import {
  extractPlanPath,
  createDefaultStepUsage,
  createCommentStep,
  createFinalStatusComment,
  getAdwEnv,
} from "../src/utils";

const WORKFLOW = "plan_build_test";
const TOTAL_STEPS = 3;

async function runWorkflow(adwId: string, issueNumber?: string): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, WORKFLOW);
  logger.info(`Starting ADW Plan-Build-Test Workflow — ADW ID: ${adwId}`);

  const { prompt, workingDir, models } = getAdwEnv();
  const commentStep = createCommentStep(issueNumber);
  const commentFinalStatus = createFinalStatusComment(issueNumber);

  if (!prompt) { logger.error("No ADW_PROMPT set"); return false; }

  logger.info(`Prompt: ${prompt.slice(0, 200)}...`);
  logger.info(`Working Dir: ${workingDir}`);
  logger.info(`Models — plan/build: ${models.default}, test: ${models.review}`);

  const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];
  const stepOpts = (stepName: string, stepNumber: number) => ({
    stepName, stepNumber, totalSteps: TOTAL_STEPS, logger, commentStep, allStepUsages,
  });

  const finalize = async (ok: boolean) => {
    const totals = allStepUsages.length > 0 ? sumUsage(allStepUsages.map((s) => s.usage)) : createDefaultStepUsage();
    writeWorkflowStatus(logger.logDir, { workflow: WORKFLOW, adwId, ok, startTime, totals });
    await commentFinalStatus({ workflow: WORKFLOW, adwId, ok, startTime, steps: allStepUsages, totals });
  };

  try {
    // Step 1: Plan
    const plan = await runStep(stepOpts("plan", 1), (log) =>
      runPlanStep(prompt, { model: models.default, cwd: workingDir, logger: log, adwId }));
    if (!plan.ok) { await finalize(false); return false; }

    const planPath = extractPlanPath(plan.result ?? "", workingDir, adwId);
    if (!planPath) { logger.error("Could not extract plan file path"); return false; }
    logger.info(`Found plan file: ${planPath}`);

    // Step 2: Build
    const build = await runStep(stepOpts("build", 2), (log) =>
      runBuildStep(planPath, { model: models.default, cwd: workingDir, logger: log }));
    if (!build.ok) { await finalize(false); return false; }

    // Step 3: Test
    const test = await runStep(stepOpts("test", 3), (log) =>
      runTestStep({ model: models.review, cwd: workingDir, logger: log }));
    if (!test.ok) { await finalize(false); return false; }

    // Workflow summary
    const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));
    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  WORKFLOW COMPLETE — ${Math.round((Date.now() - startTime) / 1000)}s`);
    logger.info(`  Plan file: ${planPath}`);
    logger.info(`  USAGE PER STEP:`);
    for (const { step, usage } of allStepUsages) logger.info(`    [${step}] ${formatUsage(usage)}`);
    logger.info(`  TOTAL: ${formatUsage(totalUsage)}`);
    logger.info(`${"═".repeat(60)}`);

    await finalize(true);
    return true;
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
    console.error("Usage: bun run adw_plan_build_test.ts --adw-id <id> [--issue <number>]");
    process.exit(1);
  }

  const success = await runWorkflow(adwId, values["issue"]);
  process.exit(success ? 0 : 1);
}
