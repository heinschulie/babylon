/**
 * Generic step runner — executes a PipelineDefinition against a typed context.
 *
 * Handles: context threading, skipWhen, model resolution, timeouts,
 * postconditions, per-step commits, and onFail routing.
 */

import type { PipelineDefinition, PipelineContext, StepDefinition } from "./pipeline";
import { PipelineContextSchema, BASE_CONTEXT_KEYS } from "./pipeline";
import type { Logger, StepSummary } from "./logger";
import type { StepUsage, QueryResult } from "./agent-sdk";
import type { WorkflowModels } from "./utils";
import { openStep } from "./step-recorder";
import { getHeadSha, commitChanges } from "./git-ops";
import { parseReviewResult } from "./review-utils";
import { createDefaultStepUsage } from "./utils";
import { makeIssueComment } from "./github";

/** Extended QueryResult with produces map for generic context threading. */
export interface StepExecutorResult extends QueryResult {
  /** Key-value pairs to merge into the pipeline context. */
  produces?: Record<string, unknown>;
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RunPipelineOptions {
  logger: Logger & { logDir: string; nextStep: (name: string, issueNumber?: number) => string };
  workingDir: string;
  models: WorkflowModels;
  /** Function to execute a step command — injected for testability. */
  executeStep: StepExecutor;
  /** Function to post step progress comments. */
  commentStep?: (msg: string) => Promise<void>;
  /** Base branch for diff operations. */
  baseBranch?: string;
  /** ADW ID for commit messages and learning. */
  adwId?: string;
}

/** Injected step executor — called for each non-skipped step. */
export type StepExecutor = (
  step: StepDefinition,
  context: PipelineContext,
  opts: StepExecutorOpts,
) => Promise<StepExecutorResult>;

export interface StepExecutorOpts {
  model: string;
  cwd: string;
  logger: Logger;
  logDir: string;
  stepName: string;
  timeout: number;
  /** Pre-step HEAD SHA — available for executors that need it (e.g. preTddSha). */
  preSha: string;
}

export interface StepResultEntry {
  name: string;
  ok: boolean;
  skipped: boolean;
  usage: StepUsage;
  error?: string;
}

export interface PipelineResult {
  ok: boolean;
  context: PipelineContext;
  stepResults: StepResultEntry[];
  /** True if pipeline stopped because a step with onFail=skip-issue failed. */
  skipped: boolean;
}

// ─── Model resolution ──────────────────────────────────────────────────────────

const MODEL_ALIASES: Record<string, (models: WorkflowModels) => string> = {
  research: (m) => m.research,
  default: (m) => m.default,
  review: (m) => m.review,
  opus: (m) => m.opus ?? m.default,
};

export function resolveModel(alias: string, models: WorkflowModels): string {
  const resolver = MODEL_ALIASES[alias];
  return resolver ? resolver(models) : alias;
}

// ─── skipWhen evaluation ───────────────────────────────────────────────────────

export function shouldSkip(step: StepDefinition, context: PipelineContext): boolean {
  if (!step.skipWhen) return false;
  const shape = PipelineContextSchema.shape;
  for (const [key, values] of Object.entries(step.skipWhen)) {
    if (!(key in shape)) continue;
    const ctxValue = context[key as keyof PipelineContext];
    if (typeof ctxValue === "string" && values.includes(ctxValue)) return true;
  }
  return false;
}

// ─── Postcondition checks ──────────────────────────────────────────────────────

/** Check a single postcondition. */
async function checkSinglePostcondition(
  postcondition: string,
  preSha: string,
  cwd: string,
  stepResult: QueryResult,
): Promise<{ ok: boolean; error?: string }> {
  if (postcondition === "head-must-advance") {
    const postSha = await getHeadSha(cwd);
    if (postSha === preSha) {
      return { ok: false, error: "Postcondition failed: HEAD did not advance" };
    }
    return { ok: true };
  }

  if (postcondition === "result-must-parse") {
    const parsed = parseReviewResult(stepResult.result);
    const validVerdicts = ["PASS", "PASS_WITH_ISSUES", "FAIL"];
    if (parsed.verdict && validVerdicts.includes(parsed.verdict)) {
      return { ok: true };
    }
    if (parsed.success || parsed.review_issues.length > 0) {
      return { ok: true };
    }
    return { ok: false, error: "Postcondition failed: review verdict could not be parsed" };
  }

  if (postcondition === "code-must-compile") {
    try {
      const proc = Bun.spawn(["bun", "run", "check"], { cwd, stdout: "pipe", stderr: "pipe" });
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        return { ok: false, error: `Postcondition failed: code-must-compile — ${stderr.slice(0, 500)}` };
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `Postcondition failed: code-must-compile — ${e}` };
    }
  }

  if (postcondition === "page-must-load") {
    try {
      const { readFileSync } = await import("fs");
      const { join } = await import("path");
      const envPath = join(cwd, ".env.local");
      const envContent = readFileSync(envPath, "utf-8");
      const tunnelMatch = envContent.match(/^DEV_TUNNEL_URL=(.+)$/m);
      if (!tunnelMatch) return { ok: true }; // graceful skip if not configured
      const tunnelUrl = tunnelMatch[1].trim();
      const response = await fetch(`${tunnelUrl}/test`, { signal: AbortSignal.timeout(10_000) });
      if (response.status !== 200) {
        return { ok: false, error: `Postcondition failed: page-must-load — status ${response.status}` };
      }
      return { ok: true };
    } catch (e) {
      const msg = String(e);
      if (msg.includes("ENOENT") || msg.includes("no such file")) return { ok: true }; // no .env.local → skip
      return { ok: false, error: `Postcondition failed: page-must-load — ${msg.slice(0, 300)}` };
    }
  }

  return { ok: false, error: `Unknown postcondition: ${postcondition}` };
}

/**
 * Check postcondition(s) — supports single string or array.
 * Arrays short-circuit on first failure.
 */
export async function checkPostcondition(
  postcondition: string | string[] | null,
  preSha: string,
  cwd: string,
  stepResult: QueryResult,
): Promise<{ ok: boolean; error?: string }> {
  if (!postcondition) return { ok: true };

  const conditions = Array.isArray(postcondition) ? postcondition : [postcondition];
  for (const pc of conditions) {
    const result = await checkSinglePostcondition(pc, preSha, cwd, stepResult);
    if (!result.ok) return result;
  }
  return { ok: true };
}

// ─── Pipeline runner ───────────────────────────────────────────────────────────

export async function runPipeline(
  pipeline: PipelineDefinition,
  baseContext: PipelineContext,
  options: RunPipelineOptions,
): Promise<PipelineResult> {
  const { logger, workingDir, models, executeStep, commentStep } = options;
  const ctx: PipelineContext = { ...baseContext };
  const stepResults: StepResultEntry[] = [];
  let pipelineOk = true;
  let skipped = false;

  for (const step of pipeline) {
    // ── skipWhen check ───────────────────────────────────────────────
    if (shouldSkip(step, ctx)) {
      logger.info(`Skipping step "${step.name}" (skipWhen matched)`);
      stepResults.push({
        name: step.name,
        ok: true,
        skipped: true,
        usage: createDefaultStepUsage(),
      });
      continue;
    }

    // ── Runtime consumes validation ─────────────────────────────────
    for (const key of step.consumes) {
      if (!(BASE_CONTEXT_KEYS as readonly string[]).includes(key) && ctx[key as keyof PipelineContext] === undefined) {
        logger.warn(`Step "${step.name}" consumes "${key}" but it is undefined in context`);
      }
    }

    // ── Resolve model ────────────────────────────────────────────────
    const modelAlias = step.modelMap[ctx.complexity] ?? step.modelMap.standard ?? "default";
    const model = resolveModel(modelAlias, models);

    // ── Capture pre-step SHA ─────────────────────────────────────────
    const preSha = await getHeadSha(workingDir);

    // ── Open step recorder ───────────────────────────────────────────
    const stepName = logger.nextStep(step.name, ctx.issue.number);
    const stepCtx = await openStep(logger.logDir, stepName, step.name, logger, { cwd: workingDir });

    logger.info(`\n--- ${step.name} step for #${ctx.issue.number} ---`);

    // ── Execute ──────────────────────────────────────────────────────
    let result: StepExecutorResult;
    try {
      result = await executeStep(step, ctx, {
        model,
        cwd: workingDir,
        logger: stepCtx.log,
        logDir: logger.logDir,
        stepName,
        timeout: step.timeout,
        preSha,
      });
    } catch (e) {
      const errorMessage = String(e);

      // Check if this was a kill file termination
      if (errorMessage.includes("killed by timekeeper")) {
        logger.warn(`Step "${step.name}" terminated by timekeeper: ${errorMessage}`);

        // Post GitHub comment about the termination
        try {
          const killReason = errorMessage.includes("looping") ? "looping behavior" : "stalling";
          await makeIssueComment(
            ctx.issue.number,
            `⚠️ Step \`${step.name}\` terminated by timekeeper due to ${killReason}.\n\n` +
            `**Reason:** ${errorMessage.replace(/^.*killed by timekeeper:\s*/, '')}\n\n` +
            `The step will be retried if the pipeline retry logic is enabled.`
          );
        } catch (commentError) {
          logger.warn(`Failed to post kill comment: ${commentError}`);
        }
      }

      result = { success: false, error: errorMessage };
    }

    const usage = result.usage ?? createDefaultStepUsage();

    // ── Per-step commit (before postcondition so head-must-advance sees the commit) ──
    if (step.commitAfter && result.success) {
      const commitMsg = `feat(#${ctx.issue.number}): ${step.name} — ${ctx.issue.title}`;
      const [commitOk, commitErr] = await commitChanges(commitMsg, workingDir);
      if (!commitOk && commitErr) {
        logger.warn(`Commit after ${step.name} failed: ${commitErr}`);
      }
    }

    // ── Check postcondition ──────────────────────────────────────────
    if (result.success && step.postcondition) {
      const pc = await checkPostcondition(step.postcondition, preSha, workingDir, result);
      if (!pc.ok) {
        logger.warn(`${step.name}: ${pc.error}`);
        result = { ...result, success: false, error: pc.error };
      }
    }

    // ── Close step recorder ──────────────────────────────────────────
    await stepCtx.close(result.success, usage, result.summary);

    // ── Merge produces into context ──────────────────────────────────
    if (result.success && result.produces) {
      for (const [key, value] of Object.entries(result.produces)) {
        (ctx as Record<string, unknown>)[key] = value;
      }
    }

    // ── Record step result ───────────────────────────────────────────
    stepResults.push({
      name: step.name,
      ok: result.success,
      skipped: false,
      usage,
      error: result.error,
    });

    // ── onFail routing ───────────────────────────────────────────────
    if (!result.success) {
      logger.error(`Step "${step.name}" failed: ${result.error}`);

      if (step.onFail === "skip-issue") {
        pipelineOk = false;
        skipped = true;
        break;
      }

      if (step.onFail === "halt") {
        pipelineOk = false;
        break;
      }

      // onFail === "continue" — keep going
    }
  }

  return { ok: pipelineOk, context: ctx, stepResults, skipped };
}
