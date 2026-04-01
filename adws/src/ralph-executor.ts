/**
 * Ralph-specific step executor.
 *
 * Bridges the generic pipeline StepDefinition to the existing
 * runSkillStep/command SDK functions. Each step name maps to
 * the appropriate SDK call with Ralph-specific argument formatting.
 */

import type { StepDefinition, PipelineContext } from "./pipeline";
import type { StepExecutor, StepExecutorOpts, StepExecutorResult } from "./step-runner";
import type { QueryResult } from "./agent-sdk";
import {
  runConsultStep,
  runTddStep,
  runRefactorStep,
  runReviewStep,
  runSkillStep,
} from "./agent-sdk";
import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { extractFrontendBehaviors, filterVisualBehaviors, buildVerifyPrompt } from "./verify-utils";
import { diffFileList } from "./git-ops";
import { recordLearning, inferTagsFromFiles } from "./learning-utils";
import { parseReviewResult } from "./review-utils";
import { createSubIssue, parseBlockers, postReviewToIssue } from "./github";

/**
 * Create a Ralph step executor bound to a specific ADW ID.
 * Returns a StepExecutor function that dispatches to the correct SDK call
 * based on the step name.
 */
export function createRalphExecutor(adwId: string): StepExecutor {
  return async (
    step: StepDefinition,
    context: PipelineContext,
    opts: StepExecutorOpts,
  ): Promise<StepExecutorResult> => {
    const { model, cwd, logger, logDir, stepName, timeout, preSha } = opts;
    const stepDir = join(logDir, "steps", stepName);
    const baseOpts = { model, cwd, logger, logDir, stepName, timeout, stepDir };

    switch (step.name) {
      case "consult": {
        // Expert consultation — ask about constraints for this issue
        let changedFilesStr: string | undefined;
        try {
          const branchFiles = await diffFileList(context.baseSha, "HEAD", cwd);
          if (branchFiles.length > 0) changedFilesStr = branchFiles.join(",");
        } catch { /* ignore */ }

        const consultResult = await runConsultStep(
          "Given this issue, what constraints, patterns, and invariants must the implementation follow?",
          { ...baseOpts, context: context.issue.body, changedFiles: changedFilesStr },
        );
        const expertAdvice = consultResult.summary?.expert_advice_summary ?? consultResult.result ?? "";

        // Warn on filler consult advice
        const substantiveKeywords = ["must", "should", "constraint", "pattern", "index", "validation"];
        if (expertAdvice.length < 100 || !substantiveKeywords.some(kw => expertAdvice.toLowerCase().includes(kw))) {
          logger.warn("[consult] Expert advice appears to be filler — TDD step may lack guardrails");
        }

        return {
          ...consultResult,
          produces: { expertAdvice },
        };
      }

      case "tdd": {
        // TDD step — include expert advice, prime context, and local URL
        let tddBody = context.issue.body;
        if (context.primeContext) {
          tddBody = `## Stack Context\n${context.primeContext}\n\n${tddBody}`;
        }
        if (context.expertAdvice) {
          tddBody = `${tddBody}\n\n## Expert Guidance\n${context.expertAdvice}`;
        }
        if (context.localUrl) {
          tddBody = `${tddBody}\n\n## Environment\nLocal dev server: ${context.localUrl}\nDo not read .env.local or .ports.env.`;
        }
        const tddResult = await runTddStep(tddBody, baseOpts);
        return { ...tddResult, produces: { preTddSha: preSha } };
      }

      case "refactor": {
        // Scoped refactor step — compute changed files and pass as arg
        const refactorSha = context.preTddSha ?? context.baseSha;
        let changedFiles: string | undefined;
        try {
          const files = await diffFileList(refactorSha, "HEAD", cwd);
          if (files.length > 0) changedFiles = files.join(", ");
        } catch { /* ignore */ }

        const refactorResult = await runRefactorStep(
          adwId,
          context.issue.number,
          context.issue.body,
          refactorSha,
          { ...baseOpts, changedFiles },
        );
        return { ...refactorResult, produces: {} };
      }

      case "review": {
        // Review step — code-analysis only (no visual validation)
        const reviewResult = await runReviewStep(adwId, "", {
          ...baseOpts,
          issueBody: `# #${context.issue.number}: ${context.issue.title}\n\n${context.issue.body}`,
        });

        const parsed = reviewResult.result ? parseReviewResult(reviewResult.result) : undefined;

        // Persist learnings from structured review output
        if (parsed?.learnings && parsed.learnings.length > 0) {
          try {
            const changedFiles = await diffFileList(context.baseSha, "HEAD", cwd).catch(() => [] as string[]);
            const fileTags = inferTagsFromFiles(cwd, changedFiles);

            const sourceStep = `${context.issue.number}_review`;
            for (const learning of parsed.learnings) {
              const tags = learning.tags.length > 0 ? learning.tags : (fileTags.length > 0 ? fileTags : ["unknown"]);
              recordLearning(cwd, {
                workflow: "adw_ralph",
                run_id: `pipeline-${new Date().toISOString().split("T")[0]}`,
                tags,
                context: learning.context,
                expected: learning.expected,
                actual: learning.actual,
                confidence: learning.confidence,
                source_step: sourceStep,
                issue_number: context.issue.number,
              });
            }
          } catch { /* learning capture is non-blocking */ }
        }

        // Create sub-issues for review FAIL verdicts with blockers
        const reviewSubIssues: number[] = [];

        // Handle PASS_WITH_ISSUES: save issues to build log folder
        if (parsed?.verdict === "PASS_WITH_ISSUES" && parsed.review_issues.length > 0) {
          try {
            const issuesLogPath = join(logDir, "pass_with_issues.json");
            const { writeFileSync } = await import("fs");
            writeFileSync(issuesLogPath, JSON.stringify({
              verdict: "PASS_WITH_ISSUES",
              issue_number: context.issue.number,
              review_issues: parsed.review_issues,
              timestamp: new Date().toISOString(),
            }, null, 2));
            logger.info(`Saved PASS_WITH_ISSUES details to ${issuesLogPath}`);
          } catch (e) {
            logger.warn(`Failed to save PASS_WITH_ISSUES log: ${e}`);
          }
        }

        if (parsed?.verdict === "FAIL") {
          const blockerIssues = parsed.review_issues.filter(i => i.issue_severity === "blocker");
          const toCreate = blockerIssues.slice(0, 2); // cap at 2 sub-issues per review
          const originalBlockers = parseBlockers(context.issue.body);
          const blockerLine = originalBlockers.length > 0
            ? `- **Blocked by**: ${originalBlockers.map(b => `#${b}`).join(", ")}`
            : `- **Blocked by**: None`;

          for (const blocker of toCreate) {
            try {
              const subTitle = `Fix: ${context.issue.title} — ${blocker.issue_description.slice(0, 80)}`;
              const subBody = [
                `## Review Defect`,
                ``,
                `**Original issue**: #${context.issue.number}`,
                `**Severity**: ${blocker.issue_severity}`,
                ``,
                `### Description`,
                blocker.issue_description,
                ``,
                `### Resolution`,
                blocker.issue_resolution,
                ``,
                `## Dependencies`,
                blockerLine,
              ].join("\n");
              const sub = await createSubIssue(
                context.parentIssueNumber ?? context.issue.number,
                subTitle, subBody, ["auto-fix"]
              );
              reviewSubIssues.push(sub.number);
              logger.info(`Created review sub-issue #${sub.number}: ${subTitle}`);
            } catch (e) {
              logger.warn(`Failed to create review sub-issue: ${e}`);
            }
          }
        }

        // Post review comment with screenshots to GitHub
        if (parsed) {
          try {
            await postReviewToIssue(
              String(context.issue.number),
              adwId,
              parsed,
              logger,
            );
          } catch (e) {
            logger.warn(`Failed to post review comment: ${e}`);
          }
        }

        return {
          ...reviewResult,
          produces: {
            reviewResult: parsed ?? reviewResult.result,
            learningEntry: parsed?.learnings ?? [],
            ...(reviewSubIssues.length > 0 && { reviewSubIssues }),
          },
        };
      }

      case "verify": {
        const behaviors = extractFrontendBehaviors(context.issue.body);
        const visual = filterVisualBehaviors(behaviors);

        if (visual.length === 0) {
          logger.info("No visually-verifiable frontend behaviors — skipping verify");
          return { success: true, produces: { verifyResult: { skipped: true, reason: "no visual behaviors" } } };
        }

        const screenshotDir = join(stepDir, "screenshots");
        mkdirSync(screenshotDir, { recursive: true });

        const prompt = buildVerifyPrompt(visual, context.localUrl ?? "http://localhost:5173", screenshotDir);

        const verifyResult = await runSkillStep(prompt, {
          ...baseOpts,
          model: "claude-opus-4-20250514",
        });

        const passed = verifyResult.success && !verifyResult.result?.includes("❌ FAILURE");

        if (!passed && verifyResult.result) {
          try {
            const issuesLogPath = join(logDir, "pass_with_issues.json");
            writeFileSync(issuesLogPath, JSON.stringify({
              verdict: "VERIFY_FAILED",
              issue_number: context.issue.number,
              visual_failures: verifyResult.result,
              screenshot_dir: screenshotDir,
              timestamp: new Date().toISOString(),
            }, null, 2));
          } catch { /* non-blocking */ }
        }

        return {
          ...verifyResult,
          success: passed,
          produces: {
            verifyResult: {
              passed,
              behaviors_checked: visual.length,
              screenshot_dir: screenshotDir,
              report: verifyResult.result,
            },
          },
        };
      }

      default:
        return { success: false, error: `Unknown step: ${step.name}` };
    }
  };
}
