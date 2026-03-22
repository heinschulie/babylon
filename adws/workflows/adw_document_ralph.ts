/**
 * ADW Document Ralph — generates documentation from a parent issue's sub-issues.
 *
 * Triggered by a "--document" keyword comment on the parent issue.
 * Fetches closed sub-issues, reads git diff on feature branch, invokes /document,
 * commits documentation, and pushes.
 *
 * Usage: bun run adws/workflows/adw_document_ralph.ts --adw-id <id> --issue <parent-issue-number>
 */

import { parseArgs } from "util";
import {
  runDocumentStep,
  sumUsage,
  type StepUsage,
} from "../src/agent-sdk";
import { createLogger, writeWorkflowStatus } from "../src/logger";
import {
  getAdwEnv,
  createDefaultStepUsage,
  createCommentStep,
  createFinalStatusComment,
  exec,
} from "../src/utils";
import { ADWState } from "../src/state";
import {
  fetchIssue,
  fetchSubIssues,
  findKeywordFromComment,
  getRepoUrl,
  extractRepoPath,
} from "../src/github";
import { commitChanges, pushBranch, getCurrentBranch } from "../src/git-ops";

async function runWorkflow(
  adwId: string,
  parentIssueNumber: number,
  issueNumberStr: string
): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "document-ralph");
  logger.info(`Starting ADW Document Ralph — ADW ID: ${adwId}, Issue: #${parentIssueNumber}`);

  const { workingDir, models } = getAdwEnv();
  const commentStep = createCommentStep(issueNumberStr);
  const commentFinalStatus = createFinalStatusComment(issueNumberStr);

  const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];

  try {
    // ─── Validate "--document" keyword comment ─────────────────────────
    const repoUrl = await getRepoUrl();
    const repoPath = extractRepoPath(repoUrl);
    const parentIssue = await fetchIssue(String(parentIssueNumber), repoPath);

    const keywordComment = findKeywordFromComment("--document", parentIssue);
    if (!keywordComment) {
      logger.error(`No "--document" keyword comment found on issue #${parentIssueNumber}`);
      return false;
    }
    logger.info(`Found "--document" keyword comment from ${keywordComment.createdAt}`);

    // ─── Fetch closed sub-issues ──────────────────────────────────────
    const closedSubIssues = await fetchSubIssues(parentIssueNumber, "closed");
    logger.info(`Found ${closedSubIssues.length} closed sub-issues`);

    if (closedSubIssues.length === 0) {
      logger.warn("No closed sub-issues found — nothing to document");
      await commentStep("No closed sub-issues found — skipping documentation");
      return true;
    }

    // ─── Determine feature branch ─────────────────────────────────────
    let state = ADWState.load(adwId, logger);
    const branchName = state?.get("branch_name") as string | undefined
      ?? await getCurrentBranch(workingDir);

    logger.info(`Feature branch: ${branchName}`);

    // ─── Build aggregated context ─────────────────────────────────────
    const subIssueSummaries = closedSubIssues.map(i =>
      `### #${i.number}: ${i.title}\n${i.body.slice(0, 500)}`
    ).join("\n\n");

    // Read git diff
    const { stdout: diffOutput } = await exec(
      ["git", "diff", "origin/main", "--stat"],
      { cwd: workingDir }
    );

    const aggregatedContext = [
      `# Parent PRD: ${parentIssue.title}`,
      "",
      parentIssue.body.slice(0, 2000),
      "",
      "# Completed Sub-Issues",
      "",
      subIssueSummaries,
      "",
      "# Changes (diff --stat)",
      "",
      diffOutput,
    ].join("\n");

    // Write context to temp file for /document
    const contextPath = `temp/specs/document-trigger-${adwId}.md`;
    await Bun.write(contextPath, aggregatedContext);
    logger.info(`Wrote aggregated context to ${contextPath}`);

    // ─── Run /document step ───────────────────────────────────────────
    await commentStep("Generating documentation from completed sub-issues...");

    const docResult = await runDocumentStep(adwId, {
      model: models.default,
      cwd: workingDir,
      logger,
      specPath: contextPath,
    });

    const docUsage = docResult.usage ?? createDefaultStepUsage();
    allStepUsages.push({ step: "document", ok: docResult.success, usage: docUsage });

    if (!docResult.success) {
      logger.error(`Document step failed: ${docResult.error}`);
      await commentStep("Documentation generation failed ❌");
    } else {
      logger.info("Documentation generated successfully");

      // Commit and push
      const [commitOk, commitErr] = await commitChanges(
        `docs: auto-generate documentation for issue #${parentIssueNumber}`,
        workingDir
      );
      if (!commitOk) {
        logger.error(`Failed to commit documentation: ${commitErr}`);
      } else {
        const [pushOk, pushErr] = await pushBranch(branchName, workingDir);
        if (pushOk) {
          logger.info(`Pushed documentation to ${branchName}`);
        } else {
          logger.error(`Failed to push: ${pushErr}`);
        }
      }

      await commentStep("Documentation generated and pushed ✅");
    }

    // ─── Finalization ─────────────────────────────────────────────────
    const totalUsage = allStepUsages.length > 0
      ? sumUsage(allStepUsages.map(s => s.usage))
      : createDefaultStepUsage();

    const ok = docResult.success;

    writeWorkflowStatus(logger.logDir, {
      workflow: "document-ralph",
      adwId,
      ok,
      startTime,
      totals: totalUsage,
    });

    await commentFinalStatus({
      workflow: "document-ralph",
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
      workflow: "document-ralph",
      adwId,
      ok: false,
      startTime,
      totals: totalUsage,
    });
    await commentStep(`Workflow exception: ${String(e).slice(0, 200)}`);
    await commentFinalStatus({
      workflow: "document-ralph",
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
      "help": { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values["help"]) {
    console.log("Usage: bun run adw_document_ralph.ts --adw-id <id> --issue <parent-issue-number>");
    process.exit(0);
  }

  const adwId = values["adw-id"];
  const issueStr = values["issue"];

  if (!adwId || !issueStr) {
    console.error("Usage: bun run adw_document_ralph.ts --adw-id <id> --issue <parent-issue-number>");
    process.exit(1);
  }

  const parentIssueNumber = parseInt(issueStr, 10);
  const success = await runWorkflow(adwId, parentIssueNumber, issueStr);
  process.exit(success ? 0 : 1);
}
