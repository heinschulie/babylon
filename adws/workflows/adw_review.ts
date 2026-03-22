/**
 * ADW Review Workflow — standalone review with resolution retry loop.
 *
 * Runs /review against a spec file, resolves blocker issues via /patch + /build,
 * then re-reviews up to MAX_REVIEW_RETRY_ATTEMPTS times.
 *
 * Usage: bun run adws/workflows/adw_review.ts --adw-id <id> [--spec-path <path>] [--skip-resolution]
 *
 * Env vars:
 *   ADW_PROMPT        — unused (review reads spec directly)
 *   ADW_WORKING_DIR   — cwd for agents (default: process.cwd())
 *   ADW_MODEL         — model for patch plan/build steps (default: claude-sonnet-4-20250514)
 *   ADW_REVIEW_MODEL  — model for review step (default: claude-sonnet-4-20250514)
 */

import { parseArgs } from "util";
import { readdirSync, statSync } from "fs";
import { join } from "path";
import {
  runReviewStep,
  runPatchPlanStep,
  runBuildStep,
  formatUsage,
  sumUsage,
  type StepUsage,
  type QueryResult,
} from "../src/agent-sdk";
import { createLogger, taggedLogger, writeWorkflowStatus } from "../src/logger";
import {
  parseReviewResult,
  extractReviewVerdict,
  type ReviewResult,
  createStepBanner,
  extractPlanPath,
  createDefaultStepUsage,
  createCommentStep,
  createFinalStatusComment,
  getAdwEnv,
  fmtDuration,
} from "../src/utils";
import { postReviewToIssue } from "../src/github";

const MAX_REVIEW_RETRY_ATTEMPTS = 3;

const STEP_REVIEW = "review";
const STEP_PATCH_PLAN = "patch-plan";
const STEP_PATCH_BUILD = "patch-build";


/** Find spec file — either from CLI arg or most recent in temp/specs/. */
function findSpecFile(specPathArg: string | undefined, workingDir: string): string | null {
  if (specPathArg) return specPathArg;

  // Fallback: most recent .md in temp/specs/
  const specsDir = join(workingDir, "temp", "specs");
  try {
    const mdFiles = readdirSync(specsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({
        name: f,
        path: join(specsDir, f),
        mtime: statSync(join(specsDir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);

    if (mdFiles.length > 0) return mdFiles[0].path;
  } catch {
    // specs dir may not exist
  }
  return null;
}

async function runWorkflow(
  adwId: string,
  specPathArg: string | undefined,
  skipResolution: boolean,
  issueNumber?: string
): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "review");

  logger.info(`Starting ADW Review Workflow — ADW ID: ${adwId}`);
  if (skipResolution) logger.info("Resolution loop disabled (--skip-resolution)");

  const { workingDir, models } = getAdwEnv();

  // Create comment functions
  const commentStep = createCommentStep(issueNumber);
  const commentFinalStatus = createFinalStatusComment(issueNumber);

  // Find spec file
  const specPath = findSpecFile(specPathArg, workingDir);
  if (!specPath) {
    logger.error("Could not find spec file. Provide --spec-path or place specs in temp/specs/");
    return false;
  }

  logger.info(`Working Dir: ${workingDir}`);
  logger.info(`Spec: ${specPath}`);
  logger.info(`Review Model: ${models.review}`);
  logger.info(`Patch Model: ${models.default}`);

  const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];
  const maxAttempts = skipResolution ? 1 : MAX_REVIEW_RETRY_ATTEMPTS;

  let reviewResult: ReviewResult = { success: false, review_issues: [] };
  let ok = false;

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // =====================================================================
      // Review step
      // =====================================================================
      const reviewStepName = `${STEP_REVIEW}-${attempt}`;
      logger.info(`\n${createStepBanner(`REVIEW ATTEMPT ${attempt}/${maxAttempts}`)}`);

      const reviewLog = taggedLogger(logger, "reviewer", {
        logDir: logger.logDir,
        step: reviewStepName,
      });

      const reviewQueryResult = await runReviewStep(adwId, specPath, {
        model: models.review,
        cwd: workingDir,
        logger: reviewLog,
      });

      if (reviewQueryResult.usage) {
        allStepUsages.push({ step: reviewStepName, ok: reviewQueryResult.success, usage: reviewQueryResult.usage });
        reviewLog.info(`Usage: ${formatUsage(reviewQueryResult.usage)}`);
      }

      if (!reviewQueryResult.success) {
        reviewLog.error(`Review agent failed: ${reviewQueryResult.error}`);
        reviewLog.finalize(false, reviewQueryResult.usage);
        // Treat agent failure as a blocker review result
        reviewResult = {
          success: false,
          review_issues: [
            {
              review_issue_number: 1,
              screenshot_path: "",
              issue_description: `Review execution failed: ${reviewQueryResult.error ?? "unknown"}`,
              issue_resolution: "Fix review execution error",
              issue_severity: "blocker",
            },
          ],
        };
      } else {
        reviewLog.finalize(true, reviewQueryResult.usage);
        reviewResult = parseReviewResult(reviewQueryResult.result);
      }

      // Evaluate verdict using shared utility
      const { ok: passed, verdict } = extractReviewVerdict(reviewResult);

      if (reviewResult.review_summary) {
        logger.info(`Summary: ${reviewResult.review_summary}`);
      }

      if (passed) {
        logger.info(`Review passed — ${verdict}`);
        ok = true;
        break;
      }

      // Review failed — collect blockers for resolution
      const blockers = reviewResult.review_issues.filter(
        (i) => i.issue_severity === "blocker"
      );

      logger.warn(
        `Review found ${reviewResult.review_issues.length} issues (${blockers.length} blockers)`
      );

      // If last attempt or skip-resolution — stop without resolving
      if (attempt === maxAttempts || skipResolution) {
        if (skipResolution) {
          logger.info(`Skipping resolution for ${blockers.length} blocker issues`);
        } else {
          logger.warn(
            `Reached max retry attempts (${maxAttempts}) with ${blockers.length} blockers remaining`
          );
        }
        break;
      }

      logger.info(`\n${createStepBanner(`RESOLVING ${blockers.length} BLOCKER(S) (attempt ${attempt})`)}`);

      let resolvedCount = 0;

      for (let idx = 0; idx < blockers.length; idx++) {
        const issue = blockers[idx];
        logger.info(
          `\n--- Resolving blocker ${idx + 1}/${blockers.length}: #${issue.review_issue_number} ---`
        );
        logger.info(`Description: ${issue.issue_description}`);
        logger.info(`Suggested fix: ${issue.issue_resolution}`);

        // Patch plan
        const patchPlanStepName = `${STEP_PATCH_PLAN}-${attempt}-${issue.review_issue_number}`;
        const plannerTag = `patch-planner-${attempt}-${issue.review_issue_number}`;
        const plannerLog = taggedLogger(logger, plannerTag, {
          logDir: logger.logDir,
          step: patchPlanStepName,
        });

        const changeRequest = `${issue.issue_description}\n\nSuggested resolution: ${issue.issue_resolution}`;

        const patchResult = await runPatchPlanStep(adwId, changeRequest, {
          model: models.default,
          cwd: workingDir,
          logger: plannerLog,
          specPath,
          agentName: plannerTag,
        });

        if (patchResult.usage) {
          allStepUsages.push({ step: patchPlanStepName, ok: patchResult.success, usage: patchResult.usage });
          plannerLog.info(`Usage: ${formatUsage(patchResult.usage)}`);
        }

        if (!patchResult.success || !patchResult.result) {
          plannerLog.error(`Patch plan failed for issue #${issue.review_issue_number}`);
          plannerLog.finalize(false, patchResult.usage);
          continue;
        }
        plannerLog.finalize(true, patchResult.usage);

        // Extract patch plan path from result
        const patchPlanPath = patchResult.result
          ? extractPlanPath(patchResult.result, workingDir, adwId)
          : null;

        if (!patchPlanPath) {
          logger.error(`Could not extract patch plan path for issue #${issue.review_issue_number}`);
          continue;
        }

        logger.info(`Patch plan created: ${patchPlanPath}`);

        // Build (implement) the patch
        const patchBuildStepName = `${STEP_PATCH_BUILD}-${attempt}-${issue.review_issue_number}`;
        const builderTag = `patch-builder-${attempt}-${issue.review_issue_number}`;
        const builderLog = taggedLogger(logger, builderTag, {
          logDir: logger.logDir,
          step: patchBuildStepName,
        });

        const buildResult = await runBuildStep(patchPlanPath, {
          model: models.default,
          cwd: workingDir,
          logger: builderLog,
        });

        if (buildResult.usage) {
          allStepUsages.push({ step: patchBuildStepName, ok: buildResult.success, usage: buildResult.usage });
          builderLog.info(`Usage: ${formatUsage(buildResult.usage)}`);
        }

        if (!buildResult.success) {
          builderLog.error(`Patch build failed for issue #${issue.review_issue_number}`);
          builderLog.finalize(false, buildResult.usage);
          continue;
        }
        builderLog.finalize(true, buildResult.usage);

        resolvedCount++;
        logger.info(`Resolved issue #${issue.review_issue_number}`);
      }

      logger.info(
        `Resolution complete: ${resolvedCount}/${blockers.length} issues resolved`
      );

      if (resolvedCount === 0) {
        logger.error("No issues resolved — stopping retry loop");
        break;
      }

      logger.info(`Preparing re-review (attempt ${attempt + 1}/${maxAttempts})...`);
    }

    // ===================================================================
    // Summary
    // ===================================================================
    const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));
    const { verdict: finalVerdict } = extractReviewVerdict(reviewResult);

    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  WORKFLOW COMPLETE — ${Math.round((Date.now() - startTime) / 1000)}s`);
    logger.info(`  Spec: ${specPath}`);
    logger.info(`  Verdict: ${finalVerdict}`);
    if (reviewResult.review_summary) {
      logger.info(`  Summary: ${reviewResult.review_summary}`);
    }
    logger.info(`\n  USAGE PER STEP:`);
    for (const { step, usage } of allStepUsages) {
      logger.info(`    [${step}] ${formatUsage(usage)}`);
    }
    logger.info(`\n  TOTAL: ${formatUsage(totalUsage)}`);
    logger.info(`${"═".repeat(60)}`);

    // Post review results to GitHub issue
    if (issueNumber) {
      await postReviewToIssue(issueNumber, adwId, reviewResult, logger);
    }

    writeWorkflowStatus(logger.logDir, {
      workflow: "review",
      adwId,
      ok,
      startTime,
      totals: totalUsage,
    });

    // Post final status comment
    await commentFinalStatus({
      workflow: "review",
      adwId,
      ok,
      startTime,
      steps: allStepUsages,
      totals: totalUsage,
    });

    return ok;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);

    const totalUsage =
      allStepUsages.length > 0
        ? sumUsage(allStepUsages.map((s) => s.usage))
        : createDefaultStepUsage();
    writeWorkflowStatus(logger.logDir, {
      workflow: "review",
      adwId,
      ok: false,
      startTime,
      totals: totalUsage,
    });
    await commentStep(`Workflow exception: ${String(e).slice(0, 200)}`);
    await commentFinalStatus({
      workflow: "review",
      adwId,
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
      "spec-path": { type: "string" },
      "skip-resolution": { type: "boolean", default: false },
      "issue": { type: "string" },
    },
    strict: true,
  });

  const adwId = values["adw-id"];
  if (!adwId) {
    console.error("Usage: bun run adw_review.ts --adw-id <id> [--spec-path <path>] [--skip-resolution] [--issue <number>]");
    process.exit(1);
  }

  const success = await runWorkflow(adwId, values["spec-path"], values["skip-resolution"] ?? false, values["issue"]);
  process.exit(success ? 0 : 1);
}
