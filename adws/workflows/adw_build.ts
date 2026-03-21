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

const STEP_BUILD = "build";
const TOTAL_STEPS = 1;

/** Stub: fetch ADW record. In production this would hit a database. */
async function getAdw(
  adwId: string
): Promise<Record<string, unknown> | null> {
  const prompt = process.env.ADW_PROMPT;
  const workingDir = process.env.ADW_WORKING_DIR ?? process.cwd();
  const model = process.env.ADW_MODEL ?? "claude-sonnet-4-20250514";

  if (!prompt) {
    console.error(
      "No ADW_PROMPT env var set. Set it to the path of the plan file to build."
    );
    return null;
  }

  return {
    adw_id: adwId,
    orchestrator_agent_id: "stub-orchestrator",
    input_data: { prompt, working_dir: workingDir, model },
  };
}

async function runWorkflow(adwId: string): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "build");

  logger.info(`Starting ADW Build Workflow — ADW ID: ${adwId}`);

  // Fetch ADW record (stubbed)
  const adw = await getAdw(adwId);
  if (!adw) {
    logger.error(`ADW not found: ${adwId}`);
    return false;
  }

  const inputData = adw.input_data as Record<string, string>;
  const planPath = inputData.prompt;
  const workingDir = inputData.working_dir;
  const model = inputData.model;

  if (!planPath) {
    logger.error("No plan path found in ADW_PROMPT");
    return false;
  }
  if (!workingDir) {
    logger.error("No working_dir found in ADW input_data");
    return false;
  }

  logger.info(`Plan: ${planPath}`);
  logger.info(`Working Dir: ${workingDir}`);
  logger.info(`Model: ${model}`);

  const allStepUsages: { step: string; usage: StepUsage }[] = [];

  try {
    // Step 1: Build
    logger.info(`\n${"═".repeat(60)}\n  STEP 1/${TOTAL_STEPS}: ${STEP_BUILD.toUpperCase()}\n${"═".repeat(60)}`);

    const buildLog = taggedLogger(logger, STEP_BUILD, { logDir: logger.logDir, step: STEP_BUILD });
    const buildResult = await runBuildStep(planPath, {
      model,
      cwd: workingDir,
      logger: buildLog,
    });

    if (buildResult.usage) {
      allStepUsages.push({ step: STEP_BUILD, usage: buildResult.usage });
      buildLog.info(`Usage: ${formatUsage(buildResult.usage)}`);
    }

    if (!buildResult.success) {
      buildLog.error(`Failed: ${buildResult.error}`);
      buildLog.finalize(false, buildResult.usage);

      const totals = allStepUsages.length > 0
        ? sumUsage(allStepUsages.map((s) => s.usage))
        : { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, total_cost_usd: 0, duration_ms: 0, num_turns: 0 };

      writeWorkflowStatus(logger.logDir, {
        workflow: "build",
        adwId,
        ok: false,
        startTime,
        totals,
      });

      return false;
    }
    buildLog.finalize(true, buildResult.usage);

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

    return true;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);

    const totals = allStepUsages.length > 0
      ? sumUsage(allStepUsages.map((s) => s.usage))
      : { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, total_cost_usd: 0, duration_ms: 0, num_turns: 0 };

    writeWorkflowStatus(logger.logDir, {
      workflow: "build",
      adwId,
      ok: false,
      startTime,
      totals,
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
    console.error("Usage: bun run adw_build.ts --adw-id <id>");
    process.exit(1);
  }

  const success = await runWorkflow(adwId);
  process.exit(success ? 0 : 1);
}
