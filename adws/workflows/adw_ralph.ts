/**
 * ADW Ralph Workflow — automated TDD loop over parent issue's sub-issues.
 *
 * For each open sub-issue: TDD → Refactor → Review (with patch retry).
 * Closes sub-issues on success, skips on failure, repeats until none remain.
 *
 * Usage: bun run adws/workflows/adw_ralph.ts --adw-id <id> --issue <parent-issue-number> [--max-iterations <n>]
 */

import { parseArgs } from "util";
import {
  runTddStep,
  runRefactorStep,
  runReviewStep,
  runPatchPlanStep,
  runBuildStep,
  quickPrompt,
  sumUsage,
  type StepUsage,
} from "../src/agent-sdk";
import { createLogger, writeWorkflowStatus } from "../src/logger";
import {
  createCommentStep,
  createFinalStatusComment,
  createDefaultStepUsage,
  getAdwEnv,
  fmtDuration,
} from "../src/utils";
import { ADWState } from "../src/state";
import {
  fetchSubIssues,
  closeSubIssue,
} from "../src/github";
import { createBranch, pushBranch, getCurrentBranch } from "../src/git-ops";

const DEFAULT_MAX_ITERATIONS = 20;
const MAX_PATCH_ATTEMPTS = 2;

async function runWorkflow(
  adwId: string,
  parentIssueNumber: number,
  maxIterations: number,
  issueNumberStr?: string
): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "ralph");
  logger.info(`Starting ADW Ralph Workflow — ADW ID: ${adwId}, Parent Issue: #${parentIssueNumber}`);

  const { workingDir, models } = getAdwEnv();
  const commentStep = createCommentStep(issueNumberStr);
  const commentFinalStatus = createFinalStatusComment(issueNumberStr);

  // Load or create state
  let state = ADWState.load(adwId, logger);
  if (!state) {
    state = new ADWState(adwId);
    state.update({ issue_number: String(parentIssueNumber) });
    await state.save("init");
  }

  const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];
  const completedIssues: number[] = [];
  const skippedIssues: number[] = [];

  try {
    // ─── Branch creation ──────────────────────────────────────────────
    const existingBranch = await getCurrentBranch(workingDir);
    const isOnFeatureBranch = existingBranch.startsWith("hein/feature/issue-");

    if (isOnFeatureBranch) {
      logger.info(`Already on feature branch: ${existingBranch}`);
      state.update({ branch_name: existingBranch });
    } else {
      // Generate short description from parent issue
      const descResult = await quickPrompt(
        `Output ONLY a 2-4 word kebab-case description for a branch name based on this issue number: ${parentIssueNumber}. No explanation, just the kebab-case words.`,
        { model: models.default, cwd: workingDir, logger }
      );
      const shortDesc = descResult.success && descResult.result
        ? descResult.result.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40)
        : "feature";
      if (descResult.usage) {
        allStepUsages.push({ step: "branch-name", ok: descResult.success, usage: descResult.usage });
      }

      const branchName = `hein/feature/issue-${parentIssueNumber}-${shortDesc}`;
      const [branchOk, branchErr] = await createBranch(branchName, workingDir);
      if (!branchOk) {
        logger.error(`Failed to create branch ${branchName}: ${branchErr}`);
        return false;
      }
      logger.info(`Created branch: ${branchName}`);
      state.update({ branch_name: branchName });
      await state.save("branch-created");
    }

    // ─── Main iteration loop ──────────────────────────────────────────
    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      logger.info(`\n${"═".repeat(60)}`);
      logger.info(`  ITERATION ${iteration}/${maxIterations}`);
      logger.info(`${"═".repeat(60)}`);

      // Fetch open sub-issues
      const openIssues = await fetchSubIssues(parentIssueNumber, "open");
      if (openIssues.length === 0) {
        logger.info("No open sub-issues remain — COMPLETE");
        await commentStep("All sub-issues completed ✅");
        break;
      }

      logger.info(`Open sub-issues: ${openIssues.map(i => `#${i.number}`).join(", ")}`);

      // Select highest-priority unblocked issue
      const issueListSummary = openIssues.map(i =>
        `#${i.number}: ${i.title} [labels: ${i.labels.join(", ")}]`
      ).join("\n");

      const selectResult = await quickPrompt(
        `Given these open sub-issues for a parent issue, select the one that should be worked on next. Consider dependency readiness (issues that block others should be done first) and priority. Output ONLY the issue number (digits only).\n\n${issueListSummary}`,
        { model: models.default, cwd: workingDir, logger }
      );
      if (selectResult.usage) {
        allStepUsages.push({ step: `select-${iteration}`, ok: selectResult.success, usage: selectResult.usage });
      }

      if (!selectResult.success || !selectResult.result) {
        logger.error(`Failed to select issue: ${selectResult.error}`);
        await commentStep(`Iteration ${iteration}: Failed to select next issue ❌`);
        continue;
      }

      const selectedNumber = parseInt(selectResult.result.trim().replace(/\D/g, ""), 10);
      const selectedIssue = openIssues.find(i => i.number === selectedNumber) ?? openIssues[0];

      logger.info(`Selected issue #${selectedIssue.number}: ${selectedIssue.title}`);
      await commentStep(`Iteration ${iteration}: Working on #${selectedIssue.number} — ${selectedIssue.title}`);

      // ─── TDD step ─────────────────────────────────────────────────
      logger.info(`\n--- TDD step for #${selectedIssue.number} ---`);
      const tddResult = await runTddStep(selectedIssue.body, {
        model: models.default,
        cwd: workingDir,
        logger,
      });
      if (tddResult.usage) {
        allStepUsages.push({ step: `tdd-${selectedIssue.number}`, ok: tddResult.success, usage: tddResult.usage });
      }

      if (!tddResult.success) {
        logger.error(`TDD failed for #${selectedIssue.number}: ${tddResult.error}`);
        await commentStep(`Iteration ${iteration}: TDD failed for #${selectedIssue.number} ❌ — skipping`);
        skippedIssues.push(selectedIssue.number);
        continue;
      }
      logger.info(`TDD completed for #${selectedIssue.number}`);

      // ─── Refactor step ────────────────────────────────────────────
      logger.info(`\n--- Refactor step for #${selectedIssue.number} ---`);
      const refactorResult = await runRefactorStep(adwId, {
        model: models.default,
        cwd: workingDir,
        logger,
      });
      if (refactorResult.usage) {
        allStepUsages.push({ step: `refactor-${selectedIssue.number}`, ok: refactorResult.success, usage: refactorResult.usage });
      }

      if (!refactorResult.success) {
        logger.warn(`Refactor failed for #${selectedIssue.number} (non-fatal): ${refactorResult.error}`);
      } else {
        logger.info(`Refactor completed for #${selectedIssue.number}`);
      }

      // ─── Review step ──────────────────────────────────────────────
      logger.info(`\n--- Review step for #${selectedIssue.number} ---`);
      let reviewPassed = false;

      const reviewResult = await runReviewStep(adwId, "", {
        model: models.review,
        cwd: workingDir,
        logger,
        issueNumber: selectedIssue.number,
      });
      if (reviewResult.usage) {
        allStepUsages.push({ step: `review-${selectedIssue.number}`, ok: reviewResult.success, usage: reviewResult.usage });
      }

      if (reviewResult.success) {
        // Check if review output indicates pass (result contains success: true)
        try {
          const parsed = JSON.parse(reviewResult.result ?? "{}");
          reviewPassed = parsed.success === true;
        } catch {
          reviewPassed = reviewResult.success;
        }
      }

      // Patch retry loop if review has blockers
      if (!reviewPassed) {
        logger.info(`Review found issues for #${selectedIssue.number} — entering patch loop`);

        for (let patchAttempt = 1; patchAttempt <= MAX_PATCH_ATTEMPTS; patchAttempt++) {
          logger.info(`\n--- Patch attempt ${patchAttempt}/${MAX_PATCH_ATTEMPTS} for #${selectedIssue.number} ---`);

          const changeRequest = `Fix review blockers for issue #${selectedIssue.number}: ${selectedIssue.title}. Review output: ${(reviewResult.result ?? "").slice(0, 500)}`;

          const patchResult = await runPatchPlanStep(adwId, changeRequest, {
            model: models.default,
            cwd: workingDir,
            logger,
          });
          if (patchResult.usage) {
            allStepUsages.push({ step: `patch-${selectedIssue.number}-${patchAttempt}`, ok: patchResult.success, usage: patchResult.usage });
          }

          if (!patchResult.success) {
            logger.warn(`Patch plan failed for #${selectedIssue.number} attempt ${patchAttempt}`);
            continue;
          }

          // Build the patch
          const buildResult = await runBuildStep(patchResult.result ?? "", {
            model: models.default,
            cwd: workingDir,
            logger,
          });
          if (buildResult.usage) {
            allStepUsages.push({ step: `build-${selectedIssue.number}-${patchAttempt}`, ok: buildResult.success, usage: buildResult.usage });
          }

          if (buildResult.success) {
            reviewPassed = true;
            break;
          }
        }
      }

      if (reviewPassed) {
        // Close the sub-issue
        await closeSubIssue(selectedIssue.number, `Resolved by Ralph workflow (ADW: ${adwId})`);
        logger.info(`Closed #${selectedIssue.number} ✅`);
        await commentStep(`Iteration ${iteration}: #${selectedIssue.number} completed and closed ✅`);
        completedIssues.push(selectedIssue.number);
      } else {
        logger.warn(`#${selectedIssue.number} still has blockers after ${MAX_PATCH_ATTEMPTS} patch attempts — skipping`);
        await commentStep(`Iteration ${iteration}: #${selectedIssue.number} skipped after failed patches ❌`);
        skippedIssues.push(selectedIssue.number);
      }
    }

    // ─── Finalization ───────────────────────────────────────────────
    const totalUsage = allStepUsages.length > 0
      ? sumUsage(allStepUsages.map(s => s.usage))
      : createDefaultStepUsage();
    const duration = fmtDuration(Date.now() - startTime);
    const branchName = state.get("branch_name") as string | undefined;

    // Push feature branch
    if (branchName) {
      const [pushOk, pushErr] = await pushBranch(branchName, workingDir);
      if (pushOk) {
        logger.info(`Pushed branch: ${branchName}`);
      } else {
        logger.error(`Failed to push: ${pushErr}`);
      }
    }

    const ok = completedIssues.length > 0 && skippedIssues.length === 0;

    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  RALPH COMPLETE — ${duration}`);
    logger.info(`  Issues completed: ${completedIssues.length} (${completedIssues.map(n => `#${n}`).join(", ") || "none"})`);
    logger.info(`  Issues skipped: ${skippedIssues.length} (${skippedIssues.map(n => `#${n}`).join(", ") || "none"})`);
    logger.info(`  Total steps: ${allStepUsages.length}`);
    logger.info(`  Total cost: $${totalUsage.total_cost_usd.toFixed(4)}`);
    logger.info(`${"═".repeat(60)}`);

    writeWorkflowStatus(logger.logDir, {
      workflow: "ralph",
      adwId,
      ok,
      startTime,
      totals: totalUsage,
    });

    await commentFinalStatus({
      workflow: "ralph",
      adwId,
      ok,
      startTime,
      steps: allStepUsages,
      totals: totalUsage,
    });

    return ok;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);

    const totalUsage = allStepUsages.length > 0
      ? sumUsage(allStepUsages.map(s => s.usage))
      : createDefaultStepUsage();

    writeWorkflowStatus(logger.logDir, {
      workflow: "ralph",
      adwId,
      ok: false,
      startTime,
      totals: totalUsage,
    });
    await commentStep(`Workflow exception: ${String(e).slice(0, 200)}`);
    await commentFinalStatus({
      workflow: "ralph",
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
      "issue": { type: "string" },
      "max-iterations": { type: "string" },
      "help": { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values["help"]) {
    console.log("Usage: bun run adw_ralph.ts --adw-id <id> --issue <parent-issue-number> [--max-iterations <n>]");
    process.exit(0);
  }

  const adwId = values["adw-id"];
  const issueStr = values["issue"];

  if (!adwId || !issueStr) {
    console.error("Usage: bun run adw_ralph.ts --adw-id <id> --issue <parent-issue-number> [--max-iterations <n>]");
    process.exit(1);
  }

  const parentIssueNumber = parseInt(issueStr, 10);
  const maxIterations = values["max-iterations"]
    ? parseInt(values["max-iterations"], 10)
    : DEFAULT_MAX_ITERATIONS;

  const success = await runWorkflow(adwId, parentIssueNumber, maxIterations, issueStr);
  process.exit(success ? 0 : 1);
}
