/**
 * ADW Ralph Workflow — automated TDD loop over parent issue's sub-issues.
 *
 * For each open sub-issue: TDD → Refactor → Review (with patch retry).
 * Closes sub-issues on success, skips on failure, repeats until none remain.
 *
 * Usage: bun run adws/workflows/adw_ralph.ts --adw-id <id> --issue <parent-issue-number> [--max-iterations <n>]
 */

// Catch stray unhandled rejections (e.g. agent-spawned background processes
// like `npx convex dev --once` hitting transient network errors) so they
// don't crash the workflow.
process.on("unhandledRejection", (reason) => {
  console.error(`[ralph] unhandled rejection (non-fatal): ${reason}`);
});

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
  filterUnblockedIssues,
} from "../src/github";
import { createBranch, pushBranch, getCurrentBranch, getHeadSha, diffFileCount, commitChanges, checkoutBranch, assertStableBranch } from "../src/git-ops";
import { openStep } from "../src/step-recorder";
import { parseReviewResult, extractScreenshots } from "../src/review-utils";

const DEFAULT_MAX_ITERATIONS = 20;
const MAX_PATCH_ATTEMPTS = 2;

async function runWorkflow(
  adwId: string,
  parentIssueNumber: number,
  maxIterations: number,
  issueNumberStr?: string
): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "ralph", parentIssueNumber);
  logger.info(`Starting ADW Ralph Workflow — ADW ID: ${adwId}, Parent Issue: #${parentIssueNumber}`);

  const { workingDir, models } = getAdwEnv();
  const commentStep = createCommentStep(issueNumberStr);
  const commentFinalStatus = createFinalStatusComment(issueNumberStr);

  // Load or create state (logger.logDir is the build directory)
  let state = ADWState.load(adwId, logger, logger.logDir);
  if (!state) {
    state = new ADWState(adwId, logger.logDir);
    state.update({ issue_number: String(parentIssueNumber) });
    await state.save("init");
  }

  const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];
  const completedIssues: number[] = [];
  const skippedIssues: number[] = [];

  try {
    // ─── Stable branch guard with crash recovery ─────────────────────
    const currentBranch = await getCurrentBranch(workingDir);
    const targetBranch = `hein/feature/issue-${parentIssueNumber}`;
    let baseBranch: string;

    if (currentBranch === targetBranch) {
      // Already on our target branch from a prior crashed run — resume
      logger.info(`Already on target branch ${targetBranch} — resuming`);
      baseBranch = (state.get("base_branch") as string | undefined) ?? "main";
    } else {
      // Normal guard: reject if on any other feature branch
      try {
        await assertStableBranch(workingDir);
      } catch (e) {
        logger.error(String(e));
        return false;
      }
      baseBranch = currentBranch;
    }

    // ─── Record base branch + create deterministic feature branch ────
    state.update({ base_branch: baseBranch });

    const branchName = targetBranch;
    const [branchOk, branchErr] = await createBranch(branchName, workingDir);
    if (!branchOk) {
      logger.error(`Failed to create branch ${branchName}: ${branchErr}`);
      return false;
    }
    logger.info(`On branch: ${branchName}`);
    state.update({ branch_name: branchName });
    await state.save("branch-created");

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

      // ─── Deterministic dependency filtering ─────────────────────────
      const closedIssues = await fetchSubIssues(parentIssueNumber, "closed");
      const closedNumbers = new Set([
        ...closedIssues.map(i => i.number),
        ...completedIssues,
      ]);
      const { unblocked, blocked } = filterUnblockedIssues(openIssues, closedNumbers);

      if (blocked.size > 0) {
        const details = [...blocked.entries()]
          .map(([num, blockers]) => `#${num} ← [${blockers.map(b => `#${b}`).join(", ")}]`)
          .join("; ");
        logger.info(`Blocked issues: ${details}`);
      }

      if (unblocked.length === 0) {
        const details = [...blocked.entries()]
          .map(([num, blockers]) => `#${num} blocked by ${blockers.map(b => `#${b}`).join(", ")}`)
          .join("; ");
        logger.error(`All ${openIssues.length} open issues are blocked: ${details}`);
        await commentStep(`Iteration ${iteration}: All issues blocked — halting. ${details}`);
        break;
      }

      // ─── Select from unblocked candidates ───────────────────────────
      let selectedIssue;
      if (unblocked.length === 1) {
        selectedIssue = unblocked[0];
        logger.info(`Single unblocked issue — selecting #${selectedIssue.number} directly`);
      } else {
        const issueListSummary = unblocked.map(i =>
          `#${i.number}: ${i.title} [labels: ${i.labels.join(", ")}]`
        ).join("\n");

        const selectStepName = logger.nextStep("select");
        const selectStep = await openStep(logger.logDir, selectStepName, "select", logger, { cwd: workingDir });
        const selectResult = await quickPrompt(
          `Given these unblocked sub-issues, select the highest priority to work on next. Output ONLY the issue number (digits only).\n\n${issueListSummary}`,
          { model: models.default, cwd: workingDir, logger: selectStep.log, logDir: logger.logDir, stepName: selectStepName }
        );
        if (selectResult.usage) {
          allStepUsages.push({ step: `select-${iteration}`, ok: selectResult.success, usage: selectResult.usage });
        }
        await selectStep.close(selectResult.success, selectResult.usage, selectResult.summary);

        if (!selectResult.success || !selectResult.result) {
          logger.error(`Failed to select issue: ${selectResult.error}`);
          await commentStep(`Iteration ${iteration}: Failed to select next issue ❌`);
          continue;
        }

        const selectedNumber = parseInt(selectResult.result.trim().replace(/\D/g, ""), 10);
        selectedIssue = unblocked.find(i => i.number === selectedNumber) ?? unblocked[0];
      }

      logger.info(`Selected issue #${selectedIssue.number}: ${selectedIssue.title}`);

      // ─── Complexity routing ─────────────────────────────────────────
      const complexity = selectedIssue.labels.find(l => l.startsWith("complexity:"))?.split(":")[1] ?? "standard";
      const skipRefactor = complexity === "trivial";
      const issueModel = complexity === "complex" ? "claude-opus-4-20250514" : complexity === "trivial" ? models.research : models.default;
      logger.info(`Issue #${selectedIssue.number} complexity: ${complexity} — model: ${issueModel}, refactor: ${skipRefactor ? "skip" : "run"}`);

      await commentStep(`Iteration ${iteration}: Working on #${selectedIssue.number} — ${selectedIssue.title} [${complexity}]`);

      // ─── TDD step ─────────────────────────────────────────────────
      const preTddSha = await getHeadSha(workingDir);
      logger.info(`\n--- TDD step for #${selectedIssue.number} (pre-TDD sha: ${preTddSha.slice(0, 8)}) ---`);
      const tddStepName = logger.nextStep("tdd", selectedIssue.number);
      const tddStep = await openStep(logger.logDir, tddStepName, "tdd", logger, { cwd: workingDir });
      const tddResult = await runTddStep(selectedIssue.body, {
        model: issueModel,
        cwd: workingDir,
        logger: tddStep.log,
        logDir: logger.logDir,
        stepName: tddStepName,
      });
      if (tddResult.usage) {
        allStepUsages.push({ step: `tdd-${selectedIssue.number}`, ok: tddResult.success, usage: tddResult.usage });
      }
      await tddStep.close(tddResult.success, tddResult.usage, tddResult.summary);

      if (!tddResult.success) {
        logger.error(`TDD failed for #${selectedIssue.number}: ${tddResult.error}`);
        await commentStep(`Iteration ${iteration}: TDD failed for #${selectedIssue.number} ❌ — skipping`);
        skippedIssues.push(selectedIssue.number);
        continue;
      }
      logger.info(`TDD completed for #${selectedIssue.number}`);

      // ─── Refactor step (skipped for trivial issues) ────────────────
      if (!skipRefactor) {
        logger.info(`\n--- Refactor step for #${selectedIssue.number} ---`);
        const preRefactorSha = await getHeadSha(workingDir);
        const tddFileCount = await diffFileCount(preTddSha, preRefactorSha, workingDir);
        const refactorStepName = logger.nextStep("refactor", selectedIssue.number);
        const refactorStep = await openStep(logger.logDir, refactorStepName, "refactor", logger, { cwd: workingDir });
        const refactorResult = await runRefactorStep(adwId, selectedIssue.number, selectedIssue.body, preTddSha, {
          model: issueModel,
          cwd: workingDir,
          logger: refactorStep.log,
          logDir: logger.logDir,
          stepName: refactorStepName,
        });
        if (refactorResult.usage) {
          allStepUsages.push({ step: `refactor-${selectedIssue.number}`, ok: refactorResult.success, usage: refactorResult.usage });
        }
        await refactorStep.close(refactorResult.success, refactorResult.usage, refactorResult.summary);

        if (!refactorResult.success) {
          logger.warn(`Refactor failed for #${selectedIssue.number} (non-fatal): ${refactorResult.error}`);
        } else {
          logger.info(`Refactor completed for #${selectedIssue.number}`);

          // ─── Guardrail: check refactor scope ────────────────────────
          const refactorFileCount = await diffFileCount(preRefactorSha, "HEAD", workingDir);
          const threshold = Math.max(tddFileCount * 3, 3);
          if (refactorFileCount > threshold) {
            const msg = `⚠️ Refactor scope alarm for #${selectedIssue.number}: refactor touched ${refactorFileCount} files vs TDD's ${tddFileCount} (threshold: ${threshold})`;
            logger.warn(msg);
            await commentStep(`Iteration ${iteration}: ${msg}`);
          }
        }
      } else {
        logger.info(`Skipping refactor for #${selectedIssue.number} (trivial complexity)`);
      }

      // ─── Review step ──────────────────────────────────────────────
      logger.info(`\n--- Review step for #${selectedIssue.number} ---`);
      let reviewPassed = false;

      const reviewStepName = logger.nextStep("review", selectedIssue.number);
      const reviewStep = await openStep(logger.logDir, reviewStepName, "review", logger, { cwd: workingDir });
      const reviewImageDir = `${logger.logDir}/steps/${reviewStepName}/review_img`;
      const reviewModel = complexity === "complex" ? "claude-opus-4-20250514" : models.review;
      const reviewResult = await runReviewStep(adwId, "", {
        model: reviewModel,
        cwd: workingDir,
        logger: reviewStep.log,
        issueBody: `# #${selectedIssue.number}: ${selectedIssue.title}\n\n${selectedIssue.body}`,
        reviewImageDir,
        logDir: logger.logDir,
        stepName: reviewStepName,
      });
      if (reviewResult.usage) {
        allStepUsages.push({ step: `review-${selectedIssue.number}`, ok: reviewResult.success, usage: reviewResult.usage });
      }

      // Extract screenshots + visual_validation from review output
      const parsedReview = parseReviewResult(reviewResult.result);
      const tunnelUrl = process.env.DEV_TUNNEL_URL;
      const { visual_validation, screenshots } = extractScreenshots(parsedReview, tunnelUrl);

      await reviewStep.close(reviewResult.success, reviewResult.usage, reviewResult.summary, {
        visual_validation,
        screenshots,
      });

      if (reviewResult.success) {
        reviewPassed = parsedReview.success;
      }

      // Patch retry loop if review has blockers
      if (!reviewPassed) {
        logger.info(`Review found issues for #${selectedIssue.number} — entering patch loop`);

        for (let patchAttempt = 1; patchAttempt <= MAX_PATCH_ATTEMPTS; patchAttempt++) {
          logger.info(`\n--- Patch attempt ${patchAttempt}/${MAX_PATCH_ATTEMPTS} for #${selectedIssue.number} ---`);

          const changeRequest = `Fix review blockers for issue #${selectedIssue.number}: ${selectedIssue.title}. Review output: ${(reviewResult.result ?? "").slice(0, 500)}`;

          const patchStepName = logger.nextStep(`patch_${patchAttempt}`, selectedIssue.number);
          const patchStep = await openStep(logger.logDir, patchStepName, "patch", logger, { cwd: workingDir });
          const patchResult = await runPatchPlanStep(adwId, changeRequest, {
            model: issueModel,
            cwd: workingDir,
            logger: patchStep.log,
            logDir: logger.logDir,
            stepName: patchStepName,
          });
          if (patchResult.usage) {
            allStepUsages.push({ step: `patch-${selectedIssue.number}-${patchAttempt}`, ok: patchResult.success, usage: patchResult.usage });
          }
          await patchStep.close(patchResult.success, patchResult.usage, patchResult.summary);

          if (!patchResult.success) {
            logger.warn(`Patch plan failed for #${selectedIssue.number} attempt ${patchAttempt}`);
            continue;
          }

          // Build the patch
          const buildStepName = logger.nextStep(`build_${patchAttempt}`, selectedIssue.number);
          const buildStep = await openStep(logger.logDir, buildStepName, "build", logger, { cwd: workingDir });
          const buildResult = await runBuildStep(patchResult.result ?? "", {
            model: issueModel,
            cwd: workingDir,
            logger: buildStep.log,
            logDir: logger.logDir,
            stepName: buildStepName,
          });
          if (buildResult.usage) {
            allStepUsages.push({ step: `build-${selectedIssue.number}-${patchAttempt}`, ok: buildResult.success, usage: buildResult.usage });
          }
          await buildStep.close(buildResult.success, buildResult.usage, buildResult.summary);

          if (buildResult.success) {
            reviewPassed = true;
            break;
          }
        }
      }

      if (reviewPassed) {
        // Commit changes for this sub-issue
        const commitMsg = `feat(#${selectedIssue.number}): ${selectedIssue.title}`;
        const [commitOk, commitErr] = await commitChanges(commitMsg, workingDir);
        if (!commitOk) {
          logger.warn(`Commit failed for #${selectedIssue.number} (may already be committed): ${commitErr}`);
        } else {
          const postSha = await getHeadSha(workingDir);
          logger.info(`Committed #${selectedIssue.number} — sha: ${postSha.slice(0, 8)}`);
        }

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
    const finalBranchName = state.get("branch_name") as string | undefined;

    // Push feature branch and create PR
    const baseBranchName = state.get("base_branch") as string | undefined;
    if (finalBranchName) {
      const [pushOk, pushErr] = await pushBranch(finalBranchName, workingDir);
      if (pushOk) {
        logger.info(`Pushed branch: ${finalBranchName}`);

        // Create PR targeting base branch
        const prBase = baseBranchName ?? "main";
        const prTitle = `feat(#${parentIssueNumber}): ${completedIssues.map(n => `#${n}`).join(", ")} completed`;
        const prBody = [
          `## Summary`,
          ``,
          `Ralph workflow \`${adwId}\` completed ${completedIssues.length} sub-issue(s) for #${parentIssueNumber}.`,
          ``,
          `**Completed:** ${completedIssues.map(n => `#${n}`).join(", ") || "none"}`,
          `**Skipped:** ${skippedIssues.map(n => `#${n}`).join(", ") || "none"}`,
          ``,
          `ADW ID: \`${adwId}\``,
        ].join("\n");

        try {
          const { stdout: prUrl, exitCode: prExit } = await import("../src/utils").then(u =>
            u.exec(["gh", "pr", "create", "--base", prBase, "--head", finalBranchName, "--title", prTitle, "--body", prBody], { cwd: workingDir })
          );
          if (prExit === 0) {
            logger.info(`Created PR: ${prUrl.trim()}`);
          } else {
            logger.warn(`PR creation returned non-zero (may already exist): ${prUrl}`);
          }
        } catch (e) {
          logger.error(`Failed to create PR: ${e}`);
        }
      } else {
        logger.error(`Failed to push: ${pushErr}`);
      }

      // Checkout back to base branch
      if (baseBranchName) {
        const [checkoutOk, checkoutErr] = await checkoutBranch(baseBranchName, workingDir);
        if (checkoutOk) {
          logger.info(`Checked out back to base branch: ${baseBranchName}`);
        } else {
          logger.warn(`Failed to checkout base branch: ${checkoutErr}`);
        }
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
