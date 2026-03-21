/**
 * ADW Build Workflow — single-step: build from an existing plan.
 *
 * Uses @anthropic-ai/claude-agent-sdk for streaming agent execution.
 *
 * Usage: bun run adws/workflows/adw_build.ts --adw-id <id>
 *
 * Env vars:
 *   ADW_PROMPT       — path to the plan file (required)
 *   ADW_WORKING_DIR  — working directory (default: cwd)
 *   ADW_MODEL        — model for build step (default: claude-sonnet-4-20250514)
 */

import { parseArgs } from "util";
import { runBuildStep, formatUsage, sumUsage, type StepUsage } from "../src/agent-sdk";
import { createLogger, taggedLogger, writeWorkflowStatus } from "../src/logger";
import {
  createStepBanner,
  createDefaultStepUsage,
  createCommentStep,
  createFinalStatusComment,
  getAdwEnv,
  fmtDuration,
} from "../src/utils";

const STEP_BUILD = "build";
const TOTAL_STEPS = 1;


async function runWorkflow(adwId: string, issueNumber?: string): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "build");

  logger.info(`Starting ADW Build Workflow — ADW ID: ${adwId}`);

  const { prompt: planPath, workingDir, models } = getAdwEnv();

  // Create comment functions
  const commentStep = createCommentStep(issueNumber);
  const commentFinalStatus = createFinalStatusComment(issueNumber);

  if (!planPath) {
    logger.error("No plan path found in ADW_PROMPT");
    return false;
  }

  logger.info(`Plan: ${planPath}`);
  logger.info(`Working Dir: ${workingDir}`);
  logger.info(`Model: ${models.default}`);

  const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];

  try {
    // Step 1: Build
    logger.info(`\n${createStepBanner(STEP_BUILD, 1, TOTAL_STEPS)}`);

    const buildLog = taggedLogger(logger, STEP_BUILD, { logDir: logger.logDir, step: STEP_BUILD });
    const buildResult = await runBuildStep(planPath, {
      model: models.default,
      cwd: workingDir,
      logger: buildLog,
    });

    if (buildResult.usage) {
      buildLog.info(`Usage: ${formatUsage(buildResult.usage)}`);
    }

    const usage = buildResult.usage ?? createDefaultStepUsage();

    if (!buildResult.success) {
      buildLog.error(`Failed: ${buildResult.error}`);
      buildLog.finalize(false, buildResult.usage);
      allStepUsages.push({ step: STEP_BUILD, ok: false, usage });

      await commentStep(`Step 1/${TOTAL_STEPS} BUILD failed ❌ (${fmtDuration(usage.duration_ms)})`);
      const totals = allStepUsages.length > 0 ? sumUsage(allStepUsages.map((s) => s.usage)) : createDefaultStepUsage();

      writeWorkflowStatus(logger.logDir, {
        workflow: "build",
        adwId,
        ok: false,
        startTime,
        totals,
      });

      await commentFinalStatus({ workflow: "build", adwId, ok: false, startTime, steps: allStepUsages, totals });
      return false;
    }
    buildLog.finalize(true, buildResult.usage);
    allStepUsages.push({ step: STEP_BUILD, ok: true, usage });

    await commentStep(`Step 1/${TOTAL_STEPS} BUILD completed ✅ (${fmtDuration(usage.duration_ms)})`);

    const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));

    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  WORKFLOW COMPLETE — ${Math.round((Date.now() - startTime) / 1000)}s`);
    logger.info(`  Plan file: ${planPath}`);
    logger.info(`\n  USAGE PER STEP:`);
    for (const { step, usage } of allStepUsages) {
      logger.info(`    [${step}] ${formatUsage(usage)}`);
    }
    logger.info(`\n  TOTAL: ${formatUsage(totalUsage)}`);
    logger.info(`${"═".repeat(60)}`);

    writeWorkflowStatus(logger.logDir, {
      workflow: "build",
      adwId,
      ok: true,
      startTime,
      totals: totalUsage,
    });

    await commentFinalStatus({ workflow: "build", adwId, ok: true, startTime, steps: allStepUsages, totals: totalUsage });

    return true;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);

    const totals = allStepUsages.length > 0 ? sumUsage(allStepUsages.map((s) => s.usage)) : createDefaultStepUsage();

    writeWorkflowStatus(logger.logDir, {
      workflow: "build",
      adwId,
      ok: false,
      startTime,
      totals,
    });

    await commentStep(`Workflow exception ❌: ${String(e).slice(0, 200)}`);
    await commentFinalStatus({ workflow: "build", adwId, ok: false, startTime, steps: allStepUsages, totals });

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
    console.error("Usage: bun run adw_build.ts --adw-id <id> [--issue <number>]");
    process.exit(1);
  }

  const success = await runWorkflow(adwId, values["issue"]);
  process.exit(success ? 0 : 1);
}
