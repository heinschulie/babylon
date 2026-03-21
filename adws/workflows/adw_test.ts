/**
 * ADW Test Workflow — agentic test runner with resolution retries.
 *
 * Uses @anthropic-ai/claude-agent-sdk for streaming agent execution.
 *
 * Usage: bun run adws/workflows/adw_test.ts --adw-id <id> [--issue <number>] [--skip-e2e]
 *
 * Workflow:
 * 1. Resolve issue + branch (from state or create new)
 * 2. Run unit tests via /test skill
 * 3. On failure: attempt resolution via quickPrompt, re-run (up to MAX_RETRY)
 * 4. Optionally run E2E tests (skipped if unit tests fail or --skip-e2e)
 * 5. Commit results, push, create/update PR
 *
 * Environment:
 * - ADW_PROMPT: optional override prompt
 * - ADW_WORKING_DIR: working directory (default: cwd)
 * - ADW_MODEL: model for test/resolve steps (default: claude-sonnet-4-20250514)
 */

import { parseArgs } from "util";
import {
  runTestStep,
  quickPrompt,
  formatUsage,
  sumUsage,
  type StepUsage,
  type QueryResult,
} from "../src/agent-sdk";
import { createLogger, taggedLogger, writeWorkflowStatus } from "../src/logger";
import { makeAdwId, parseJson, exec, createStepBanner, createDefaultStepUsage, createCommentStep, createFinalStatusComment, getAdwEnv, fmtDuration } from "../src/utils";
import { ADWState } from "../src/state";
import {
  getRepoUrl,
  extractRepoPath,
  fetchIssue,
} from "../src/github";
import {
  createBranch,
  commitChanges,
  finalizeGitOperations,
} from "../src/git-ops";
import {
  classifyIssue,
  ensureAdwId,
} from "../src/workflow-ops";

// Constants
const WORKFLOW_NAME = "test";
const MAX_TEST_RETRY_ATTEMPTS = 4;

const STEP_TEST = "test";
const STEP_RESOLVE = "resolve";
const STEP_COMMIT = "commit";

interface TestResult {
  test_name: string;
  passed: boolean;
  error?: string;
}


/** Parse test result JSON from agent output. */
function parseTestResults(output: string): {
  results: TestResult[];
  passed: number;
  failed: number;
} {
  try {
    const results = parseJson<TestResult[]>(output);
    const passed = results.filter((r) => r.passed).length;
    const failed = results.length - passed;
    return { results, passed, failed };
  } catch {
    return { results: [], passed: 0, failed: 0 };
  }
}

/** Format test results for logging / issue comment. */
function formatTestResultsComment(
  results: TestResult[],
  passed: number,
  failed: number
): string {
  if (!results.length) return "No test results found";

  const lines: string[] = [];
  const failedTests = results.filter((r) => !r.passed);
  const passedTests = results.filter((r) => r.passed);

  if (failedTests.length) {
    lines.push("## Failed Tests");
    for (const t of failedTests) {
      lines.push(`- **${t.test_name}**`);
      if (t.error) lines.push(`  - Error: ${t.error.slice(0, 200)}`);
    }
  }

  if (passedTests.length) {
    lines.push("## Passed Tests");
    for (const t of passedTests) {
      lines.push(`- **${t.test_name}**`);
    }
  }

  lines.push(`\n**Total:** ${passed} passed, ${failed} failed`);
  return lines.join("\n");
}

/** Run tests with automatic resolution and retry. */
async function runTestsWithResolution(
  adwId: string,
  workingDir: string,
  models: { research: string; default: string; review: string },
  issueNumber: string | undefined,
  logger: ReturnType<typeof createLogger>,
  allStepUsages: { step: string; ok: boolean; usage: StepUsage }[],
  commentStep: (msg: string) => Promise<void>
): Promise<{
  results: TestResult[];
  passed: number;
  failed: number;
  lastResult: QueryResult | null;
}> {
  let results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  let lastResult: QueryResult | null = null;

  for (let attempt = 1; attempt <= MAX_TEST_RETRY_ATTEMPTS; attempt++) {
    logger.info(`\n${createStepBanner(`TEST RUN ATTEMPT ${attempt}/${MAX_TEST_RETRY_ATTEMPTS}`)}`);

    // Run /test step
    const stepName = `${STEP_TEST}_attempt_${attempt}`;
    const tlog = taggedLogger(logger, stepName, {
      logDir: logger.logDir,
      step: STEP_TEST,
    });

    const testResult = await runTestStep({
      model: models.default,
      cwd: workingDir,
      logger: tlog,
    });

    lastResult = testResult;

    if (testResult.usage) {
      allStepUsages.push({ step: stepName, ok: testResult.success, usage: testResult.usage });
      tlog.info(`Usage: ${formatUsage(testResult.usage)}`);
    }

    if (!testResult.success) {
      tlog.error(`Test execution failed: ${testResult.error}`);
      tlog.finalize(false, testResult.usage);

      await commentStep(`TEST attempt ${attempt} failed ❌ — ${testResult.error}`);
      break;
    }
    tlog.finalize(true, testResult.usage);

    // Parse results
    const parsed = parseTestResults(testResult.result ?? "");
    results = parsed.results;
    passed = parsed.passed;
    failed = parsed.failed;

    logger.info(`Test results: ${passed} passed, ${failed} failed`);

    if (failed === 0) {
      logger.info("All tests passed");
      break;
    }

    if (attempt >= MAX_TEST_RETRY_ATTEMPTS) {
      logger.warn(`Reached max retry attempts (${MAX_TEST_RETRY_ATTEMPTS})`);
      break;
    }

    // Attempt resolution
    logger.info(
      `\n${"═".repeat(60)}\n  RESOLVING ${failed} FAILED TESTS (attempt ${attempt})\n${"═".repeat(60)}`
    );

    const failedTests = results.filter((r) => !r.passed);
    let resolvedCount = 0;

    for (let idx = 0; idx < failedTests.length; idx++) {
      const test = failedTests[idx];
      const resolveTag = `resolve_iter${attempt}_${idx}`;
      const rlog = taggedLogger(logger, resolveTag, {
        logDir: logger.logDir,
        step: STEP_RESOLVE,
      });

      rlog.info(`Resolving: ${test.test_name}`);

      const resolvePrompt = `A test named "${test.test_name}" failed with error: ${test.error ?? "unknown"}

Please investigate the test failure and fix the underlying code issue. Do NOT modify the test itself unless the test is clearly wrong. Focus on fixing the source code that the test is validating.

After fixing, briefly explain what you changed.`;

      const resolveResult = await quickPrompt(resolvePrompt, {
        model: models.default,
        cwd: workingDir,
        logger: rlog,
      });

      const ok = resolveResult.success;
      if (ok) resolvedCount++;
      rlog.info(ok ? `Resolved: ${test.test_name}` : `Failed to resolve: ${test.test_name}`);
      rlog.finalize(ok);
    }

    if (resolvedCount === 0) {
      logger.info("No tests resolved, stopping retries");
      break;
    }

    logger.info(`Resolved ${resolvedCount}/${failed} — re-running tests`);

    await commentStep(`Resolved ${resolvedCount}/${failed} tests, re-running (attempt ${attempt + 1}/${MAX_TEST_RETRY_ATTEMPTS})`);
  }

  return { results, passed, failed, lastResult };
}

async function runWorkflow(
  adwId: string,
  issueNumber?: string,
  skipE2e = false
): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, WORKFLOW_NAME);
  const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];
  let ok = false;

  logger.info(`Starting ADW Test Workflow — ADW ID: ${adwId}`);
  if (issueNumber) logger.info(`Issue: #${issueNumber}`);
  if (skipE2e) logger.info("E2E tests will be skipped");

  try {
    const { workingDir, models } = getAdwEnv();

    // Create comment functions
    const commentStep = createCommentStep(issueNumber);
    const commentFinalStatus = createFinalStatusComment(issueNumber);

    logger.info(`Working Dir: ${workingDir}`);
    logger.info(`Model: ${models.default}`);

    // Ensure state exists
    let state = ADWState.load(adwId, logger);
    if (!state) {
      state = new ADWState(adwId);
      if (issueNumber) state.update({ issue_number: issueNumber });
      await state.save(WORKFLOW_NAME);
    }

    // Handle branch
    let branchName = state.get("branch_name") as string | undefined;
    if (branchName) {
      const result = await exec(["git", "checkout", branchName], { cwd: workingDir });
      if (result.exitCode !== 0) {
        logger.error(`Failed to checkout branch ${branchName}: ${result.stderr}`);
        return false;
      }
      logger.info(`Checked out existing branch: ${branchName}`);
    } else if (issueNumber) {
      branchName = `test-issue-${issueNumber}-adw-${adwId}`;
      const [success, error] = await createBranch(branchName, workingDir);
      if (!success) {
        logger.error(`Error creating branch: ${error}`);
        return false;
      }
      state.update({ branch_name: branchName });
      await state.save(WORKFLOW_NAME);
      logger.info(`Created test branch: ${branchName}`);
    }

    // Notify issue
    await commentStep("Starting test suite");

    // Run tests with resolution
    logger.info(`\n${createStepBanner("UNIT TESTS")}`);

    const { results, passed, failed, lastResult } = await runTestsWithResolution(
      adwId,
      workingDir,
      models,
      issueNumber,
      logger,
      allStepUsages,
      commentStep
    );

    // Post final test results to issue
    const comment = formatTestResultsComment(results, passed, failed);
    await commentStep(`Final test results:\n${comment}`);

    logger.info(`Final test results: ${passed} passed, ${failed} failed`);

    // E2E tests (skipped — commands don't exist yet)
    if (failed > 0) {
      logger.warn("Skipping E2E tests due to unit test failures");
    } else if (skipE2e) {
      logger.info("Skipping E2E tests (--skip-e2e flag)");
    } else {
      logger.info("E2E test commands not available — skipping");
    }

    // Commit results
    logger.info(`\n${createStepBanner("COMMIT & PUSH")}`);

    const commitLog = taggedLogger(logger, STEP_COMMIT, {
      logDir: logger.logDir,
      step: STEP_COMMIT,
    });

    const commitMsg = failed > 0
      ? `test: ${failed} failures remaining after resolution attempts`
      : `test: all ${passed} tests passing`;

    const [commitOk, commitError] = await commitChanges(commitMsg, workingDir);
    if (!commitOk && commitError) {
      commitLog.error(`Commit failed: ${commitError}`);
    } else {
      commitLog.info(`Committed: ${commitMsg}`);
    }
    commitLog.finalize(commitOk);

    // Finalize git (push + PR)
    await finalizeGitOperations(state, logger, workingDir);
    await state.save(WORKFLOW_NAME);

    // Output state for chaining
    state.toStdout();

    ok = failed === 0;

    // Final summary
    const totalUsage = allStepUsages.length > 0
      ? sumUsage(allStepUsages.map((s) => s.usage))
      : createDefaultStepUsage();

    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  WORKFLOW ${ok ? "COMPLETE" : "FAILED"} — ${fmtDuration(Date.now() - startTime)}`);
    logger.info(`  Tests: ${passed} passed, ${failed} failed`);
    logger.info(`\n  USAGE PER STEP:`);
    for (const { step, usage } of allStepUsages) {
      logger.info(`    [${step}] ${formatUsage(usage)}`);
    }
    logger.info(`\n  TOTAL: ${formatUsage(totalUsage)}`);
    logger.info(`${"═".repeat(60)}`);

    writeWorkflowStatus(logger.logDir, {
      workflow: WORKFLOW_NAME,
      adwId,
      ok,
      startTime,
      totals: totalUsage,
    });

    // Post final status to issue
    await commentFinalStatus({ workflow: WORKFLOW_NAME, adwId, ok, startTime, steps: allStepUsages, totals: totalUsage });

    return ok;
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
      issue: { type: "string" },
      "skip-e2e": { type: "boolean", default: false },
    },
    strict: true,
  });

  const adwId = values["adw-id"] ?? makeAdwId();
  const issue = values["issue"];
  const skipE2e = values["skip-e2e"] ?? false;

  if (!values["adw-id"]) {
    console.log(`Generated ADW ID: ${adwId}`);
  }

  const success = await runWorkflow(adwId, issue, skipE2e);
  process.exit(success ? 0 : 1);
}
