/**
 * ADW Plan-Build Workflow — two-step: plan then build.
 *
 * Uses @anthropic-ai/claude-agent-sdk for streaming agent execution.
 * DB logging and WS broadcasting are stubbed (console/file only).
 *
 * Usage: bun run adws/workflows/adw_plan_build.ts --adw-id <id>
 */

import { parseArgs } from "util";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import { runPlanStep, runBuildStep, formatUsage, sumUsage, type StepUsage } from "../src/agent-sdk";
import { createLogger, taggedLogger, writeWorkflowStatus } from "../src/logger";

const STEP_PLAN = "plan";
const STEP_BUILD = "build";
const TOTAL_STEPS = 2;

/** Stub: fetch ADW record. In production this would hit a database. */
async function getAdw(
  adwId: string
): Promise<Record<string, unknown> | null> {
  // Stub — read from CLI args or env instead
  const prompt = process.env.ADW_PROMPT;
  const workingDir = process.env.ADW_WORKING_DIR ?? process.cwd();
  const model = process.env.ADW_MODEL ?? "claude-sonnet-4-20250514";

  if (!prompt) {
    console.error(
      "No ADW_PROMPT env var set. Set it or provide a database backend."
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
  const logger = createLogger(adwId, "plan_build");

  logger.info(`Starting ADW Plan-Build Workflow — ADW ID: ${adwId}`);

  // Fetch ADW record (stubbed)
  const adw = await getAdw(adwId);
  if (!adw) {
    logger.error(`ADW not found: ${adwId}`);
    return false;
  }

  const inputData = adw.input_data as Record<string, string>;
  const prompt = inputData.prompt;
  const workingDir = inputData.working_dir;
  const model = inputData.model;

  if (!prompt) {
    logger.error("No prompt found in ADW input_data");
    return false;
  }
  if (!workingDir) {
    logger.error("No working_dir found in ADW input_data");
    return false;
  }

  logger.info(`Prompt: ${prompt.slice(0, 200)}...`);
  logger.info(`Working Dir: ${workingDir}`);
  logger.info(`Model: ${model}`);

  let completedSteps = 0;
  const allStepUsages: { step: string; usage: StepUsage }[] = [];

  try {
    // Step 1: Plan
    logger.info(`\n${"═".repeat(60)}\n  STEP 1/${TOTAL_STEPS}: ${STEP_PLAN.toUpperCase()}\n${"═".repeat(60)}`);
    const planLog = taggedLogger(logger, STEP_PLAN, { logDir: logger.logDir, step: STEP_PLAN });
    const planResult = await runPlanStep(prompt, {
      model,
      cwd: workingDir,
      logger: planLog,
      adwId,
    });

    if (planResult.usage) {
      allStepUsages.push({ step: STEP_PLAN, usage: planResult.usage });
      planLog.info(`Usage: ${formatUsage(planResult.usage)}`);
    }

    if (!planResult.success) {
      planLog.error(`Failed: ${planResult.error}`);
      planLog.finalize(false, planResult.usage);
      return false;
    }
    planLog.finalize(true, planResult.usage);

    completedSteps++;
    logger.info(`${STEP_PLAN} step completed (${completedSteps}/${TOTAL_STEPS})`);

    // Extract plan file path from the plan step result
    logger.info("Extracting plan file path...");
    let planPath: string | null = null;

    // The /plan skill returns just the file path as its final output
    if (planResult.result) {
      const resultText = planResult.result.trim();
      // Try to find an absolute path in the result
      const absMatch = resultText.match(/\/[^\s`"']+\.md/);
      if (absMatch) {
        planPath = absMatch[0];
        logger.info(`Extracted plan path from result: ${planPath}`);
      } else {
        // Try relative path (e.g. specs/plan-xxx.md)
        const relMatch = resultText.match(/(?:specs\/[^\s`"']+\.md)/);
        if (relMatch) {
          planPath = join(workingDir, relMatch[0]);
          logger.info(`Extracted relative plan path: ${planPath}`);
        }
      }
    }

    // Fallback: look for plan file matching adw_id in specs/
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

        // Prefer file matching adw_id pattern
        const adwMatch = mdFiles.find((f) => f.name.includes(adwId));
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

    if (!planPath) {
      logger.error("Could not extract plan file path");
      return false;
    }

    // Step 2: Build
    logger.info(`\n${"═".repeat(60)}\n  STEP 2/${TOTAL_STEPS}: ${STEP_BUILD.toUpperCase()}\n${"═".repeat(60)}`);
    logger.info(`Plan: ${planPath}`);

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
      return false;
    }
    buildLog.finalize(true, buildResult.usage);

    completedSteps++;
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
      workflow: "plan_build",
      adwId,
      ok: true,
      startTime,
      totals: totalUsage,
    });

    return true;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);
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
    console.error("Usage: bun run plan-build.ts --adw-id <id>");
    process.exit(1);
  }

  const success = await runWorkflow(adwId);
  process.exit(success ? 0 : 1);
}
