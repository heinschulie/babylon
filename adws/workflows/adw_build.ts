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
import { runBuildStep, runStep, formatUsage, sumUsage, type StepUsage } from "../src/agent-sdk";
import { createLogger, writeWorkflowStatus } from "../src/logger";
import {
  createCommentStep,
  createFinalStatusComment,
  getAdwEnv,
} from "../src/utils";

const STEP_BUILD = "build";
const TOTAL_STEPS = 1;


async function runWorkflow(adwId: string, issueNumber?: string): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "build");

  logger.info(`Starting ADW Build Workflow — ADW ID: ${adwId}`);

  const { prompt: planPath, workingDir, models } = getAdwEnv();

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
    const { ok } = await runStep(
      { stepName: STEP_BUILD, stepNumber: 1, totalSteps: TOTAL_STEPS, logger, commentStep, allStepUsages },
      (stepLogger) => runBuildStep(planPath, { model: models.default, cwd: workingDir, logger: stepLogger }),
    );

    const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));

    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  WORKFLOW ${ok ? "COMPLETE" : "FAILED"} — ${Math.round((Date.now() - startTime) / 1000)}s`);
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
      ok,
      startTime,
      totals: totalUsage,
    });

    await commentFinalStatus({ workflow: "build", adwId, ok, startTime, steps: allStepUsages, totals: totalUsage });

    return ok;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);

    const totals = allStepUsages.length > 0 ? sumUsage(allStepUsages.map((s) => s.usage)) : { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, total_cost_usd: 0, duration_ms: 0, num_turns: 0 };

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
