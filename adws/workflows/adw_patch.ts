/**
 * ADW Patch Workflow — single-issue patch: fetch issue, create patch plan, build, commit, push+PR.
 *
 * Uses @anthropic-ai/claude-agent-sdk for streaming agent execution.
 *
 * Usage: bun run adws/workflows/adw_patch.ts --adw-id <id>
 *
 * Env vars:
 *   ADW_PROMPT        — patch change request (required unless issue body has 'adw_patch')
 *   ADW_WORKING_DIR   — working directory (default: cwd)
 *   ADW_MODEL         — model for plan+build steps (default: claude-sonnet-4-20250514)
 *   ADW_ISSUE_NUMBER  — GitHub issue number to patch against (optional)
 */

import { parseArgs } from "util";
import { join } from "path";
import { readdirSync, statSync } from "fs";
import {
  runPatchPlanStep,
  runBuildStep,
  formatUsage,
  sumUsage,
  type StepUsage,
} from "../src/agent-sdk";
import { createLogger, taggedLogger, writeWorkflowStatus } from "../src/logger";
import {
  makeIssueComment,
  findKeywordFromComment,
  getRepoUrl,
  extractRepoPath,
  fetchIssue,
} from "../src/github";
import {
  commitChanges,
  finalizeGitOperations,
} from "../src/git-ops";
import { formatIssueMessage } from "../src/workflow-ops";
import { ADWState } from "../src/state";

const STEP_PATCH_PLAN = "patch_plan";
const STEP_PATCH_BUILD = "patch_build";
const STEP_COMMIT = "commit";
const STEP_FINALIZE = "finalize";
const TOTAL_STEPS = 4;

const AGENT_PATCH_PLANNER = "patch_planner";
const AGENT_PATCH_IMPLEMENTOR = "patch_implementor";

/** Stub: fetch ADW record from env vars. */
async function getAdw(
  adwId: string
): Promise<Record<string, unknown> | null> {
  const prompt = process.env.ADW_PROMPT;
  const workingDir = process.env.ADW_WORKING_DIR ?? process.cwd();
  const model = process.env.ADW_MODEL ?? "claude-sonnet-4-20250514";
  const issueNumber = process.env.ADW_ISSUE_NUMBER;

  return {
    adw_id: adwId,
    orchestrator_agent_id: "stub-orchestrator",
    input_data: { prompt, working_dir: workingDir, model, issue_number: issueNumber },
  };
}

/**
 * Get patch content from issue comments/body containing 'adw_patch',
 * or fall back to ADW_PROMPT env var.
 */
async function getPatchContent(
  issueNumber: string | undefined,
  adwId: string,
  prompt: string | undefined,
  logger: ReturnType<typeof createLogger>
): Promise<string | null> {
  // If we have an issue number, try to extract from issue
  if (issueNumber) {
    try {
      const repoUrl = await getRepoUrl();
      const repoPath = extractRepoPath(repoUrl);
      const issue = await fetchIssue(issueNumber, repoPath);

      // Check for latest comment containing 'adw_patch'
      const keywordComment = findKeywordFromComment("adw_patch", issue);
      if (keywordComment) {
        logger.info(`Found 'adw_patch' in comment, using comment body`);
        await makeIssueComment(
          issueNumber,
          formatIssueMessage(adwId, AGENT_PATCH_PLANNER, `Creating patch plan from comment containing 'adw_patch'`)
        );
        return keywordComment.body;
      }

      // Check issue body
      if (issue.body.includes("adw_patch")) {
        logger.info("Found 'adw_patch' in issue body, using issue title+body");
        await makeIssueComment(
          issueNumber,
          formatIssueMessage(adwId, AGENT_PATCH_PLANNER, "Creating patch plan from issue containing 'adw_patch'")
        );
        return `Issue #${issue.number}: ${issue.title}\n\n${issue.body}`;
      }

      logger.warn("No 'adw_patch' keyword found in issue");
    } catch (e) {
      logger.error(`Failed to fetch issue #${issueNumber}: ${e}`);
    }
  }

  // Fall back to ADW_PROMPT
  if (prompt) {
    logger.info("Using ADW_PROMPT as patch content");
    return prompt;
  }

  logger.error("No patch content available (no ADW_PROMPT and no 'adw_patch' keyword in issue)");
  return null;
}

async function runWorkflow(adwId: string): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "patch");

  logger.info(`Starting ADW Patch Workflow — ADW ID: ${adwId}`);

  // Fetch ADW record (stubbed)
  const adw = await getAdw(adwId);
  if (!adw) {
    logger.error(`ADW not found: ${adwId}`);
    return false;
  }

  const inputData = adw.input_data as Record<string, string | undefined>;
  const prompt = inputData.prompt;
  const workingDir = inputData.working_dir ?? process.cwd();
  const model = inputData.model ?? "claude-sonnet-4-20250514";
  const issueNumber = inputData.issue_number;

  logger.info(`Working Dir: ${workingDir}`);
  logger.info(`Model: ${model}`);
  if (issueNumber) logger.info(`Issue: #${issueNumber}`);
  if (prompt) logger.info(`Prompt: ${prompt.slice(0, 200)}...`);

  let completedSteps = 0;
  const allStepUsages: { step: string; usage: StepUsage }[] = [];

  try {
    // Get patch content
    const patchContent = await getPatchContent(issueNumber, adwId, prompt, logger);
    if (!patchContent) {
      return false;
    }
    logger.info(`Patch content: ${patchContent.slice(0, 200)}...`);

    // ═══════════════════════════════════════════════════════════════
    // Step 1: Create Patch Plan
    // ═══════════════════════════════════════════════════════════════
    logger.info(`\n${"═".repeat(60)}\n  STEP 1/${TOTAL_STEPS}: ${STEP_PATCH_PLAN.toUpperCase()}\n${"═".repeat(60)}`);

    const planLog = taggedLogger(logger, AGENT_PATCH_PLANNER, {
      logDir: logger.logDir,
      step: STEP_PATCH_PLAN,
    });

    const patchPlanResult = await runPatchPlanStep(adwId, patchContent, {
      model,
      cwd: workingDir,
      logger: planLog,
      agentName: AGENT_PATCH_PLANNER,
    });

    if (patchPlanResult.usage) {
      allStepUsages.push({ step: STEP_PATCH_PLAN, usage: patchPlanResult.usage });
      planLog.info(`Usage: ${formatUsage(patchPlanResult.usage)}`);
    }

    if (!patchPlanResult.success) {
      planLog.error(`Failed: ${patchPlanResult.error}`);
      planLog.finalize(false, patchPlanResult.usage);
      if (issueNumber) {
        await makeIssueComment(
          issueNumber,
          formatIssueMessage(adwId, AGENT_PATCH_PLANNER, `Failed to create patch plan`)
        );
      }
      return false;
    }
    planLog.finalize(true, patchPlanResult.usage);
    completedSteps++;
    logger.info(`${STEP_PATCH_PLAN} step completed (${completedSteps}/${TOTAL_STEPS})`);

    // Extract patch plan file path
    let patchPlanPath: string | null = null;
    if (patchPlanResult.result) {
      const resultText = patchPlanResult.result.trim();
      // Try absolute path
      const absMatch = resultText.match(/\/[^\s`"']+\.md/);
      if (absMatch) {
        patchPlanPath = absMatch[0];
        logger.info(`Extracted patch plan path: ${patchPlanPath}`);
      } else {
        // Try relative path (specs/patch/...)
        const relMatch = resultText.match(/(?:specs\/patch\/[^\s`"']+\.md)/);
        if (relMatch) {
          patchPlanPath = join(workingDir, relMatch[0]);
          logger.info(`Extracted relative patch plan path: ${patchPlanPath}`);
        }
      }
    }

    // Fallback: look in specs/patch/ for most recent file
    if (!patchPlanPath) {
      logger.warn("Attempting fallback patch plan path detection...");
      const patchDir = join(workingDir, "specs", "patch");
      try {
        const mdFiles = readdirSync(patchDir)
          .filter((f) => f.endsWith(".md"))
          .map((f) => ({
            name: f,
            path: join(patchDir, f),
            mtime: statSync(join(patchDir, f)).mtimeMs,
          }))
          .sort((a, b) => b.mtime - a.mtime);

        const adwMatch = mdFiles.find((f) => f.name.includes(adwId));
        if (adwMatch) {
          patchPlanPath = adwMatch.path;
          logger.info(`Found patch plan by ADW ID: ${patchPlanPath}`);
        } else if (mdFiles.length > 0) {
          patchPlanPath = mdFiles[0].path;
          logger.info(`Found most recent patch plan: ${patchPlanPath}`);
        }
      } catch {
        // specs/patch dir may not exist
      }
    }

    if (!patchPlanPath) {
      logger.error("Could not extract patch plan file path");
      return false;
    }

    if (issueNumber) {
      await makeIssueComment(
        issueNumber,
        formatIssueMessage(adwId, AGENT_PATCH_PLANNER, `Patch plan created: ${patchPlanPath}`)
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // Step 2: Implement Patch (Build)
    // ═══════════════════════════════════════════════════════════════
    logger.info(`\n${"═".repeat(60)}\n  STEP 2/${TOTAL_STEPS}: ${STEP_PATCH_BUILD.toUpperCase()}\n${"═".repeat(60)}`);
    logger.info(`Patch plan: ${patchPlanPath}`);

    const buildLog = taggedLogger(logger, AGENT_PATCH_IMPLEMENTOR, {
      logDir: logger.logDir,
      step: STEP_PATCH_BUILD,
    });

    const buildResult = await runBuildStep(patchPlanPath, {
      model,
      cwd: workingDir,
      logger: buildLog,
    });

    if (buildResult.usage) {
      allStepUsages.push({ step: STEP_PATCH_BUILD, usage: buildResult.usage });
      buildLog.info(`Usage: ${formatUsage(buildResult.usage)}`);
    }

    if (!buildResult.success) {
      buildLog.error(`Failed: ${buildResult.error}`);
      buildLog.finalize(false, buildResult.usage);
      if (issueNumber) {
        await makeIssueComment(
          issueNumber,
          formatIssueMessage(adwId, AGENT_PATCH_IMPLEMENTOR, `Error implementing patch`)
        );
      }
      return false;
    }
    buildLog.finalize(true, buildResult.usage);
    completedSteps++;
    logger.info(`${STEP_PATCH_BUILD} step completed (${completedSteps}/${TOTAL_STEPS})`);

    if (issueNumber) {
      await makeIssueComment(
        issueNumber,
        formatIssueMessage(adwId, AGENT_PATCH_IMPLEMENTOR, "Patch implemented")
      );
    }

    // ═══════════════════════════════════════════════════════════════
    // Step 3: Commit
    // ═══════════════════════════════════════════════════════════════
    logger.info(`\n${"═".repeat(60)}\n  STEP 3/${TOTAL_STEPS}: ${STEP_COMMIT.toUpperCase()}\n${"═".repeat(60)}`);

    const commitLog = taggedLogger(logger, "committer", {
      logDir: logger.logDir,
      step: STEP_COMMIT,
    });

    const commitMsg = `patch(${adwId}): implement patch from plan\n\nPatch plan: ${patchPlanPath}`;
    const [commitOk, commitErr] = await commitChanges(commitMsg, workingDir);
    if (!commitOk) {
      commitLog.error(`Failed to commit: ${commitErr}`);
      commitLog.finalize(false);
      if (issueNumber) {
        await makeIssueComment(
          issueNumber,
          formatIssueMessage(adwId, AGENT_PATCH_IMPLEMENTOR, `Error committing patch: ${commitErr}`)
        );
      }
      return false;
    }
    commitLog.info(`Committed: ${commitMsg.split("\n")[0]}`);
    commitLog.finalize(true);
    completedSteps++;
    logger.info(`${STEP_COMMIT} step completed (${completedSteps}/${TOTAL_STEPS})`);

    // ═══════════════════════════════════════════════════════════════
    // Step 4: Push + PR
    // ═══════════════════════════════════════════════════════════════
    logger.info(`\n${"═".repeat(60)}\n  STEP 4/${TOTAL_STEPS}: ${STEP_FINALIZE.toUpperCase()}\n${"═".repeat(60)}`);

    const finalizeLog = taggedLogger(logger, "git_ops", {
      logDir: logger.logDir,
      step: STEP_FINALIZE,
    });

    // Build a minimal state for finalizeGitOperations
    const state = new ADWState(adwId);
    state.update({ adw_id: adwId, plan_file: patchPlanPath });
    if (issueNumber) state.update({ issue_number: issueNumber });

    // Try to detect current branch
    const { exec } = await import("../src/utils");
    const { stdout: branchName } = await exec(
      ["git", "rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: workingDir }
    );
    if (branchName && branchName !== "main") {
      state.update({ branch_name: branchName });
    }

    await finalizeGitOperations(state, finalizeLog, workingDir);
    finalizeLog.finalize(true);
    completedSteps++;

    // ═══════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════
    const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));

    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  WORKFLOW COMPLETE — ${Math.round((Date.now() - startTime) / 1000)}s`);
    logger.info(`  Patch plan: ${patchPlanPath}`);
    logger.info(`\n  USAGE PER STEP:`);
    for (const { step, usage } of allStepUsages) {
      logger.info(`    [${step}] ${formatUsage(usage)}`);
    }
    logger.info(`\n  TOTAL: ${formatUsage(totalUsage)}`);
    logger.info(`${"═".repeat(60)}`);

    writeWorkflowStatus(logger.logDir, {
      workflow: "patch",
      adwId,
      ok: true,
      startTime,
      totals: totalUsage,
    });

    if (issueNumber) {
      await makeIssueComment(
        issueNumber,
        formatIssueMessage(adwId, "ops", "Patch workflow completed")
      );
    }

    return true;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);

    const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));
    writeWorkflowStatus(logger.logDir, {
      workflow: "patch",
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
    },
    strict: true,
  });

  const adwId = values["adw-id"];
  if (!adwId) {
    console.error("Usage: bun run adw_patch.ts --adw-id <id>");
    process.exit(1);
  }

  const success = await runWorkflow(adwId);
  process.exit(success ? 0 : 1);
}
