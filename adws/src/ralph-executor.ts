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
} from "./agent-sdk";
import { diffFileList } from "./git-ops";
import { recordLearning, inferTagsFromFiles } from "./learning-utils";
import { parseReviewResult } from "./review-utils";

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
    const baseOpts = { model, cwd, logger, logDir, stepName, timeout };

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
        return {
          ...consultResult,
          produces: { expertAdvice: consultResult.summary?.expert_advice_summary ?? consultResult.result ?? "" },
        };
      }

      case "tdd": {
        // TDD step — include expert advice if available
        const tddBody = context.expertAdvice
          ? `${context.issue.body}\n\n## Expert Guidance\n${context.expertAdvice}`
          : context.issue.body;
        const tddResult = await runTddStep(tddBody, baseOpts);
        return { ...tddResult, produces: { preTddSha: preSha } };
      }

      case "refactor": {
        // Scoped refactor step
        const refactorResult = await runRefactorStep(
          adwId,
          context.issue.number,
          context.issue.body,
          context.preTddSha ?? context.baseSha,
          baseOpts,
        );
        return { ...refactorResult, produces: {} };
      }

      case "review": {
        // Review step — capture structured learnings from output
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
              });
            }
          } catch { /* learning capture is non-blocking */ }
        }

        return {
          ...reviewResult,
          produces: {
            reviewResult: parsed ?? reviewResult.result,
            learningEntry: parsed?.learnings ?? [],
          },
        };
      }

      default:
        return { success: false, error: `Unknown step: ${step.name}` };
    }
  };
}
