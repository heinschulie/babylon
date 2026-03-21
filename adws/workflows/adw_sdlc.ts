/**
 * ADW SDLC Workflow — complete Software Development Life Cycle.
 *
 * Five sequential steps: plan, build, test, review, document.
 * Uses @anthropic-ai/claude-agent-sdk for streaming agent execution.
 *
 * Usage: bun run adws/workflows/adw_sdlc.ts --adw-id <id>
 */

import { parseArgs } from "util";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import {
  runPlanStep,
  runBuildStep,
  runTestStep,
  runReviewStep,
  runDocumentStep,
  formatUsage,
  sumUsage,
  type StepUsage,
} from "../src/agent-sdk";
import { createLogger, taggedLogger, writeWorkflowStatus } from "../src/logger";
import { postReviewToIssue } from "../src/github";
import { parseReviewResult, extractReviewVerdict } from "../src/utils";

const STEP_PLAN = "plan";
const STEP_BUILD = "build";
const STEP_TEST = "test";
const STEP_REVIEW = "review";
const STEP_DOCUMENT = "document";
const TOTAL_STEPS = 5;

/** Stub: fetch ADW record. In production this would hit a database. */
async function getAdw(
  adwId: string
): Promise<Record<string, unknown> | null> {
  const prompt = process.env.ADW_PROMPT;
  const workingDir = process.env.ADW_WORKING_DIR ?? process.cwd();
  const model = process.env.ADW_MODEL ?? "claude-sonnet-4-20250514";
  const reviewModel = process.env.ADW_REVIEW_MODEL ?? model;
  const testModel = process.env.ADW_TEST_MODEL ?? "claude-haiku-4-5-20251001";

  if (!prompt) {
    console.error(
      "No ADW_PROMPT env var set. Set it or provide a database backend."
    );
    return null;
  }

  return {
    adw_id: adwId,
    orchestrator_agent_id: "stub-orchestrator",
    input_data: {
      prompt,
      working_dir: workingDir,
      model,
      review_model: reviewModel,
      test_model: testModel,
    },
  };
}

async function runWorkflow(adwId: string, issueNumber?: string): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "sdlc");

  logger.info(`Starting ADW SDLC Workflow — ADW ID: ${adwId}`);

  const adw = await getAdw(adwId);
  if (!adw) {
    logger.error(`ADW not found: ${adwId}`);
    return false;
  }

  const inputData = adw.input_data as Record<string, string>;
  const prompt = inputData.prompt;
  const workingDir = inputData.working_dir;
  const model = inputData.model;
  const reviewModel = inputData.review_model;
  const testModel = inputData.test_model;

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
  logger.info(`Plan/Build Model: ${model}`);
  logger.info(`Test Model: ${testModel}`);
  logger.info(`Review Model: ${reviewModel}`);

  let completedSteps = 0;
  const allStepUsages: { step: string; usage: StepUsage }[] = [];

  try {
    // =========================================================================
    // Step 1: Plan
    // =========================================================================
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

    // =========================================================================
    // Step 2: Build
    // =========================================================================
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
    logger.info(`${STEP_BUILD} step completed (${completedSteps}/${TOTAL_STEPS})`);

    // =========================================================================
    // Step 3: Test
    // =========================================================================
    logger.info(`\n${"═".repeat(60)}\n  STEP 3/${TOTAL_STEPS}: ${STEP_TEST.toUpperCase()}\n${"═".repeat(60)}`);

    const testLog = taggedLogger(logger, STEP_TEST, { logDir: logger.logDir, step: STEP_TEST });
    const testResult = await runTestStep({
      model: testModel,
      cwd: workingDir,
      logger: testLog,
    });

    if (testResult.usage) {
      allStepUsages.push({ step: STEP_TEST, usage: testResult.usage });
      testLog.info(`Usage: ${formatUsage(testResult.usage)}`);
    }

    if (!testResult.success) {
      testLog.error(`Failed: ${testResult.error}`);
      testLog.finalize(false, testResult.usage);
      // Test failure is non-fatal — log but continue
      logger.warn("Test step failed but continuing with review...");
    } else {
      testLog.finalize(true, testResult.usage);
    }

    completedSteps++;
    logger.info(`${STEP_TEST} step completed (${completedSteps}/${TOTAL_STEPS})`);

    // =========================================================================
    // Step 4: Review
    // =========================================================================
    logger.info(`\n${"═".repeat(60)}\n  STEP 4/${TOTAL_STEPS}: ${STEP_REVIEW.toUpperCase()}\n${"═".repeat(60)}`);
    logger.info(`Reviewing against spec: ${planPath}`);

    const reviewLog = taggedLogger(logger, STEP_REVIEW, { logDir: logger.logDir, step: STEP_REVIEW });
    const reviewResult = await runReviewStep(adwId, planPath, {
      model: reviewModel,
      cwd: workingDir,
      logger: reviewLog,
    });

    if (reviewResult.usage) {
      allStepUsages.push({ step: STEP_REVIEW, usage: reviewResult.usage });
      reviewLog.info(`Usage: ${formatUsage(reviewResult.usage)}`);
    }

    if (!reviewResult.success) {
      reviewLog.error(`Failed: ${reviewResult.error}`);
      reviewLog.finalize(false, reviewResult.usage);
      return false;
    }
    reviewLog.finalize(true, reviewResult.usage);

    completedSteps++;
    logger.info(`${STEP_REVIEW} step completed (${completedSteps}/${TOTAL_STEPS})`);

    // Parse review result and extract verdict
    const parsedReview = parseReviewResult(reviewResult.result);
    const { ok: reviewOk, verdict } = extractReviewVerdict(parsedReview);

    // Post review results to GitHub issue
    if (issueNumber) {
      await postReviewToIssue(issueNumber, adwId, parsedReview, logger);
    }

    // =========================================================================
    // Step 5: Document
    // =========================================================================
    logger.info(`\n${"═".repeat(60)}\n  STEP 5/${TOTAL_STEPS}: ${STEP_DOCUMENT.toUpperCase()}\n${"═".repeat(60)}`);

    const docLog = taggedLogger(logger, STEP_DOCUMENT, { logDir: logger.logDir, step: STEP_DOCUMENT });
    const docResult = await runDocumentStep(adwId, {
      model,
      cwd: workingDir,
      logger: docLog,
      specPath: planPath,
    });

    if (docResult.usage) {
      allStepUsages.push({ step: STEP_DOCUMENT, usage: docResult.usage });
      docLog.info(`Usage: ${formatUsage(docResult.usage)}`);
    }

    if (!docResult.success) {
      docLog.error(`Failed: ${docResult.error}`);
      docLog.finalize(false, docResult.usage);
      // Document failure is non-fatal
      logger.warn("Document step failed but workflow continues...");
    } else {
      docLog.finalize(true, docResult.usage);
    }

    completedSteps++;

    // =========================================================================
    // Summary
    // =========================================================================
    const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));

    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  WORKFLOW COMPLETE — ${Math.round((Date.now() - startTime) / 1000)}s`);
    logger.info(`  Plan: ${planPath}`);
    logger.info(`  Review verdict: ${verdict}`);
    logger.info(`\n  USAGE PER STEP:`);
    for (const { step, usage } of allStepUsages) {
      logger.info(`    [${step}] ${formatUsage(usage)}`);
    }
    logger.info(`\n  TOTAL: ${formatUsage(totalUsage)}`);
    logger.info(`${"═".repeat(60)}`);

    writeWorkflowStatus(logger.logDir, {
      workflow: "sdlc",
      adwId,
      ok: reviewOk,
      startTime,
      totals: totalUsage,
    });

    return reviewOk;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);

    const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));
    writeWorkflowStatus(logger.logDir, {
      workflow: "sdlc",
      adwId,
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
  if (!adwId) {
    console.error("Usage: bun run adw_sdlc.ts --adw-id <id> [--issue <number>]");
    process.exit(1);
  }

  const success = await runWorkflow(adwId, values["issue"]);
  process.exit(success ? 0 : 1);
}
