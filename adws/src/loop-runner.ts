/**
 * Generic loop runner — schedules pipeline execution across sub-issues.
 *
 * Owns: sub-issue fetching, filtering, selection, git lifecycle
 * (branch/push/PR/comments), and finalization. Delegates per-issue
 * execution to the step runner.
 */

import type { PipelineDefinition, PipelineContext } from "./pipeline";
import type { StepUsage } from "./agent-sdk";
import type { WorkflowModels } from "./utils";
import type { Logger } from "./logger";
import type { StepExecutor } from "./step-runner";
import { runPipeline } from "./step-runner";
import { createLogger, writeWorkflowStatus } from "./logger";
import { runHealthCheck } from "./health-check";
import {
  createCommentStep,
  createFinalStatusComment,
  createDefaultStepUsage,
  getAdwEnv,
  fmtDuration,
} from "./utils";
import { sumUsage, quickPrompt } from "./agent-sdk";
import { ADWState } from "./state";
import {
  fetchSubIssues,
  closeSubIssue,
  makeIssueComment,
  filterUnblockedIssues,
} from "./github";
import {
  createBranch,
  pushBranch,
  getCurrentBranch,
  getHeadSha,
  checkoutBranch,
  assertStableBranch,
} from "./git-ops";
import { openStep } from "./step-recorder";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface LoopConfig {
  pipeline: PipelineDefinition;
  adwId: string;
  parentIssueNumber: number;
  maxIterations: number;
  issueNumberStr?: string;
  /** Injected step executor for the pipeline. */
  executeStep: StepExecutor;
  /** Branch prefix for feature branches (e.g. "hein/feature"). */
  branchPrefix?: string;
  /** Workflow name for logging and status (e.g. "ralph"). */
  workflowName?: string;
  /** Max retries per issue before exhaustion (default 2). */
  maxSkipPerIssue?: number;
}

// ─── Loop runner ───────────────────────────────────────────────────────────────

export async function runLoop(config: LoopConfig): Promise<boolean> {
  const { pipeline, adwId, parentIssueNumber, maxIterations, issueNumberStr, executeStep } = config;
  const workflowName = config.workflowName ?? "workflow";
  const branchPrefix = config.branchPrefix ?? "feature";
  const maxSkipPerIssue = config.maxSkipPerIssue ?? 2;
  const startTime = Date.now();
  const logger = createLogger(adwId, workflowName, parentIssueNumber);
  logger.info(`Starting loop runner — ADW ID: ${adwId}, Parent Issue: #${parentIssueNumber}`);

  const { workingDir, models } = getAdwEnv();

  // ─── Rival process guard ──────────────────────────────────────────
  {
    const { exec } = await import("./utils");
    const myPid = process.pid;
    const { stdout } = await exec(
      ["sh", "-c", `ps aux | grep "adw_ralph.*--issue ${parentIssueNumber}" | grep -v grep | awk '{print $2}'`],
      { cwd: workingDir },
    );
    const rivalPids = stdout.trim().split("\n")
      .map(s => parseInt(s, 10))
      .filter(pid => !isNaN(pid) && pid !== myPid);
    if (rivalPids.length > 0) {
      logger.error(`Rival ralph process(es) detected for issue #${parentIssueNumber}: PIDs ${rivalPids.join(", ")}. Aborting to avoid conflicts.`);
      return false;
    }
  }

  const commentStep = createCommentStep(issueNumberStr);
  const commentFinalStatus = createFinalStatusComment(issueNumberStr);

  // Load or create state
  let state = ADWState.load(adwId, logger, logger.logDir);
  if (!state) {
    state = new ADWState(adwId, logger.logDir);
    state.update({ issue_number: String(parentIssueNumber) });
    await state.save("init");
  }

  const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];
  const completedIssues: number[] = [];
  const skippedIssues: number[] = [];
  const skipCounts = new Map<number, number>();
  const issueReviewStatuses: { number: number; review_status: string; sub_issues_created?: number[] }[] = [];

  try {
    // ─── Stable branch guard with crash recovery ─────────────────────
    const currentBranch = await getCurrentBranch(workingDir);
    const targetBranch = `${branchPrefix}/issue-${parentIssueNumber}`;
    let baseBranch: string;

    if (currentBranch === targetBranch) {
      logger.info(`Already on target branch ${targetBranch} — resuming`);
      baseBranch = (state.get("base_branch") as string | undefined) ?? "main";
    } else {
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

    // ─── Health check — fail fast if branch doesn't compile ──────────
    const health = await runHealthCheck(workingDir, logger);
    if (!health.ok) {
      logger.error(`Health check failed — branch is broken before any work started:`);
      for (const f of health.failures) {
        logger.error(f);
      }
      await commentStep(`Health check failed on branch ${branchName} — aborting. Fix the base branch first.`);
      return false;
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

      // Exclude exhausted issues (retried too many times)
      const available = unblocked.filter(i => (skipCounts.get(i.number) ?? 0) < maxSkipPerIssue);

      if (available.length === 0 && unblocked.length > 0) {
        const exhausted = unblocked.filter(i => (skipCounts.get(i.number) ?? 0) >= maxSkipPerIssue);
        logger.warn(`All unblocked issues exhausted: ${exhausted.map(i => `#${i.number} (${skipCounts.get(i.number)} retries)`).join(", ")}`);
        break;
      }

      if (available.length === 0) {
        const details = [...blocked.entries()]
          .map(([num, blockers]) => `#${num} blocked by ${blockers.map(b => `#${b}`).join(", ")}`)
          .join("; ");
        logger.error(`All ${openIssues.length} open issues are blocked: ${details}`);
        await commentStep(`Iteration ${iteration}: All issues blocked — halting. ${details}`);
        break;
      }

      // ─── Select from available (non-exhausted) candidates ────────────
      let selectedIssue;
      if (available.length === 1) {
        selectedIssue = available[0];
        logger.info(`Single available issue — selecting #${selectedIssue.number} directly`);
      } else {
        const issueListSummary = available.map(i =>
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
        selectedIssue = available.find(i => i.number === selectedNumber) ?? available[0];
      }

      logger.info(`Selected issue #${selectedIssue.number}: ${selectedIssue.title}`);

      // ─── Complexity routing ─────────────────────────────────────────
      const complexity = (selectedIssue.labels.find(l => l.startsWith("complexity:"))?.split(":")[1] ?? "standard") as "trivial" | "standard" | "complex";

      await commentStep(`Iteration ${iteration}: Working on #${selectedIssue.number} — ${selectedIssue.title} [${complexity}]`);

      // ─── Build base context for pipeline ────────────────────────────
      const baseSha = await getHeadSha(workingDir);
      const baseContext: PipelineContext = {
        issue: {
          number: selectedIssue.number,
          title: selectedIssue.title,
          body: selectedIssue.body,
          labels: selectedIssue.labels,
        },
        complexity,
        baseSha,
      };

      // ─── Execute pipeline ───────────────────────────────────────────
      const pipelineResult = await runPipeline(pipeline, baseContext, {
        logger,
        workingDir,
        models,
        executeStep,
        commentStep,
        baseBranch,
        adwId,
      });

      // Collect step usages
      for (const sr of pipelineResult.stepResults) {
        allStepUsages.push({ step: `${sr.name}-${selectedIssue.number}`, ok: sr.ok, usage: sr.usage });
      }

      // Handle review sub-issues: close original with link to fix sub-issues
      const reviewSubIssues = pipelineResult.context.reviewSubIssues;
      const reviewCtx = pipelineResult.context.reviewResult;
      const reviewVerdict = typeof reviewCtx === "object" && reviewCtx && "verdict" in reviewCtx
        ? String((reviewCtx as { verdict?: string }).verdict)
        : undefined;

      if (reviewSubIssues && reviewSubIssues.length > 0) {
        const subLinks = reviewSubIssues.map(n => `#${n}`).join(", ");
        await makeIssueComment(
          selectedIssue.number,
          `Resolved with known issues. Fix sub-issues: ${subLinks}`,
        );
        await closeSubIssue(selectedIssue.number, `Closing — fix sub-issues created: ${subLinks}`);
        logger.info(`Closed #${selectedIssue.number} with review sub-issues: ${subLinks}`);
        await commentStep(`Iteration ${iteration}: #${selectedIssue.number} closed with fix sub-issues ${subLinks}`);
        completedIssues.push(selectedIssue.number);
      } else if (reviewVerdict === "FAIL") {
        // Review FAIL but sub-issue creation failed — re-queue for retry
        const count = (skipCounts.get(selectedIssue.number) ?? 0) + 1;
        skipCounts.set(selectedIssue.number, count);
        logger.warn(`#${selectedIssue.number} review FAIL but no sub-issues created — re-queuing (attempt ${count}/${maxSkipPerIssue})`);
        await makeIssueComment(selectedIssue.number, `Review verdict: FAIL — re-queuing for retry (attempt ${count}/${maxSkipPerIssue})`);
        await commentStep(`Iteration ${iteration}: #${selectedIssue.number} review FAIL, re-queued ⚠️`);
        skippedIssues.push(selectedIssue.number);
      } else if (pipelineResult.ok) {
        // Close the sub-issue
        await closeSubIssue(selectedIssue.number, `Resolved by Ralph workflow (ADW: ${adwId})`);
        logger.info(`Closed #${selectedIssue.number} ✅`);
        await commentStep(`Iteration ${iteration}: #${selectedIssue.number} completed and closed ✅`);
        completedIssues.push(selectedIssue.number);
      } else if (pipelineResult.skipped) {
        const count = (skipCounts.get(selectedIssue.number) ?? 0) + 1;
        skipCounts.set(selectedIssue.number, count);
        logger.warn(`#${selectedIssue.number} skipped by pipeline (attempt ${count}/${maxSkipPerIssue})`);
        await commentStep(`Iteration ${iteration}: #${selectedIssue.number} skipped ❌`);
        skippedIssues.push(selectedIssue.number);
      } else {
        const count = (skipCounts.get(selectedIssue.number) ?? 0) + 1;
        skipCounts.set(selectedIssue.number, count);
        logger.error(`Pipeline halted for #${selectedIssue.number} (attempt ${count}/${maxSkipPerIssue})`);
        await commentStep(`Iteration ${iteration}: #${selectedIssue.number} halted ❌`);
        skippedIssues.push(selectedIssue.number);
      }

      // Track review status for quality summary
      const verdict = reviewVerdict ?? "unknown";
      issueReviewStatuses.push({
        number: selectedIssue.number,
        review_status: verdict,
        ...(reviewSubIssues && reviewSubIssues.length > 0 && { sub_issues_created: reviewSubIssues }),
      });
    }

    // ─── Enrich state with quality summary ──────────────────────────
    {
      const passed = issueReviewStatuses.filter(i => i.review_status === "PASS" || i.review_status === "PASS_WITH_ISSUES").length;
      const failed = issueReviewStatuses.filter(i => i.review_status === "FAIL").length;
      const defects = issueReviewStatuses
        .filter(i => i.sub_issues_created && i.sub_issues_created.length > 0)
        .flatMap(i => i.sub_issues_created!.map(n => `#${n}`));

      state.update({
        issues_processed: issueReviewStatuses,
        quality_summary: { total: issueReviewStatuses.length, passed, failed, defects },
        learning_file: `temp/learnings/pipeline-${new Date().toISOString().split("T")[0]}.md`,
      } as any);
      await state.save("quality-summary");
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

        const prBase = baseBranchName ?? "main";
        const prTitle = `feat(#${parentIssueNumber}): ${completedIssues.map(n => `#${n}`).join(", ")} completed`;
        const prBody = [
          `## Summary`,
          ``,
          `${workflowName} workflow \`${adwId}\` completed ${completedIssues.length} sub-issue(s) for #${parentIssueNumber}.`,
          ``,
          `**Completed:** ${completedIssues.map(n => `#${n}`).join(", ") || "none"}`,
          `**Skipped:** ${skippedIssues.map(n => `#${n}`).join(", ") || "none"}`,
          ``,
          `ADW ID: \`${adwId}\``,
        ].join("\n");

        try {
          const { exec } = await import("./utils");
          const { stdout: prUrl, exitCode: prExit } = await exec(
            ["gh", "pr", "create", "--base", prBase, "--head", finalBranchName, "--title", prTitle, "--body", prBody],
            { cwd: workingDir }
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
    logger.info(`  ${workflowName.toUpperCase()} COMPLETE — ${duration}`);
    logger.info(`  Issues completed: ${completedIssues.length} (${completedIssues.map(n => `#${n}`).join(", ") || "none"})`);
    logger.info(`  Issues skipped: ${skippedIssues.length} (${skippedIssues.map(n => `#${n}`).join(", ") || "none"})`);
    logger.info(`  Total steps: ${allStepUsages.length}`);
    logger.info(`  Total cost: $${totalUsage.total_cost_usd.toFixed(4)}`);
    logger.info(`${"═".repeat(60)}`);

    writeWorkflowStatus(logger.logDir, {
      workflow: workflowName,
      adwId,
      ok,
      startTime,
      totals: totalUsage,
    });

    await commentFinalStatus({
      workflow: workflowName,
      adwId,
      ok,
      startTime,
      steps: allStepUsages,
      totals: totalUsage,
    });

    return ok;
  } catch (e) {
    logger.error(`Loop runner exception: ${e}`);

    const totalUsage = allStepUsages.length > 0
      ? sumUsage(allStepUsages.map(s => s.usage))
      : createDefaultStepUsage();

    writeWorkflowStatus(logger.logDir, {
      workflow: workflowName,
      adwId,
      ok: false,
      startTime,
      totals: totalUsage,
    });
    await commentStep(`Workflow exception: ${String(e).slice(0, 200)}`);
    await commentFinalStatus({
      workflow: workflowName,
      adwId,
      ok: false,
      startTime,
      steps: allStepUsages,
      totals: totalUsage,
    });

    return false;
  } finally {
    // ─── Expert Learning — always runs, even on crash ─────────────
    try {
      logger.info(`\n--- Running expert learning pass ---`);
      const { exec } = await import("./utils");
      const learnResult = await exec(
        ["bun", "run", "adws/workflows/adw_learn.ts", "--adw-id", adwId, "--issue", String(parentIssueNumber)],
        { cwd: workingDir },
      );
      if (learnResult.exitCode === 0) {
        logger.info(`Expert learning pass completed successfully`);
      } else {
        logger.warn(`Expert learning pass exited with code ${learnResult.exitCode}: ${learnResult.stderr.slice(0, 300)}`);
      }
    } catch (e) {
      logger.warn(`Expert learning pass failed: ${e}`);
    }
  }
}
