/**
 * ADW Plan-Build-Document Workflow — three-step: plan, build, document.
 *
 * Uses @anthropic-ai/claude-agent-sdk for streaming agent execution.
 * Documentation is generated without test results or review artifacts.
 *
 * Usage: bun run adws/workflows/adw_plan_build_document.ts --adw-id <id>
 */

import { parseArgs } from "util";
import { runPlanStep, runBuildStep, runDocumentStep, runStep, quickPrompt, formatUsage, sumUsage, type StepUsage } from "../src/agent-sdk";
import { createLogger, writeWorkflowStatus } from "../src/logger";
import {
  extractPlanPath,
  createDefaultStepUsage,
  createCommentStep,
  createFinalStatusComment,
  getAdwEnv,
  fetchAndClassifyIssue,
} from "../src/utils";

const WORKFLOW = "plan_build_document";
const TOTAL_STEPS = 3;

async function runWorkflow(adwId: string, issueNumber?: string): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, WORKFLOW);
  logger.info(`Starting ADW Plan-Build-Document Workflow — ADW ID: ${adwId}`);

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
  logger.info(`Models — plan/build/document: ${models.default}`);

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
    // Step 1: Plan (type-specific when issue-driven, generic otherwise)
    const plan = await runStep(stepOpts("plan", 1), (log) =>
      useTypeSpecific
        ? quickPrompt(resolvedPrompt!, { model: models.default, cwd: workingDir, logger: log })
        : runPlanStep(resolvedPrompt!, { model: models.default, cwd: workingDir, logger: log, adwId }));
    if (!plan.ok) { await finalize(false); return false; }

    const planPath = extractPlanPath(plan.result ?? "", workingDir, adwId);
    if (!planPath) { logger.error("Could not extract plan file path"); return false; }
    logger.info(`Found plan file: ${planPath}`);

    // Step 2: Build
    const build = await runStep(stepOpts("build", 2), (log) =>
      runBuildStep(planPath, { model: models.default, cwd: workingDir, logger: log }));
    if (!build.ok) { await finalize(false); return false; }

    // Step 3: Document
    const doc = await runStep(stepOpts("document", 3), (log) =>
      runDocumentStep(adwId, { model: models.default, cwd: workingDir, logger: log, specPath: planPath }));
    if (!doc.ok) { await finalize(false); return false; }

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
    console.error("Usage: bun run adw_plan_build_document.ts --adw-id <id> [--issue <number>]");
    process.exit(1);
  }

  const success = await runWorkflow(adwId, values["issue"]);
  process.exit(success ? 0 : 1);
}
