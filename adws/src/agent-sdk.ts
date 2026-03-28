/**
 * Agent SDK wrapper for plan-build workflow.
 *
 * Uses @anthropic-ai/claude-agent-sdk for streaming agent execution.
 */

import { join } from "path";
import { appendFileSync, mkdirSync, writeFileSync } from "fs";
import type { Logger, StepSummary } from "./logger";
import { taggedLogger, type TaggedLogger } from "./logger";
import { createStepBanner, createDefaultStepUsage, fmtDuration } from "./utils";
import { openStep } from "./step-recorder";
import { STEP_COMMANDS, type StepCommand } from "./step-commands";

export interface StepUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_cost_usd: number;
  duration_ms: number;
  num_turns: number;
}

export interface QueryResult {
  success: boolean;
  error?: string;
  session_id?: string;
  result?: string;
  usage?: StepUsage;
  summary?: StepSummary;
}

interface RunStepOptions {
  model?: string;
  cwd?: string;
  logger?: Logger;
  logDir?: string;
  stepName?: string;
  timeout?: number;
}

/** Summarize a BetaMessage content array into a compact log line. */
function summarizeContent(content: any[]): string {
  if (!Array.isArray(content)) return String(content).slice(0, 200);
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text") {
      parts.push(block.text.slice(0, 150));
    } else if (block.type === "tool_use") {
      const input = JSON.stringify(block.input ?? {}).slice(0, 100);
      parts.push(`[tool:${block.name}] ${input}`);
    } else if (block.type === "tool_result") {
      parts.push(`[tool_result:${block.tool_use_id?.slice(-8) ?? "?"}]`);
    } else if (block.type === "thinking") {
      parts.push(`[thinking ${(block.thinking ?? "").length}ch]`);
    }
  }
  return parts.join(" | ").slice(0, 300);
}

/** Extract a ## Step Summary block from agent output text. */
export function extractStepSummary(text: string): StepSummary | null {
  const match = text.match(/## Step Summary\s*\n([\s\S]*?)(?:\n##|\n```|$)/);
  if (!match) return null;
  const block = match[1];
  const get = (key: string) => {
    const m = block.match(new RegExp(`-\\s*${key}:\\s*(.+)`));
    return m?.[1]?.trim() ?? "";
  };
  const status = get("status");
  if (status !== "pass" && status !== "fail") return null;
  const vv = get("visual_validation");
  const visual_validation = vv === "passed" || vv === "failed" || vv === "skipped" ? vv : undefined;
  const expert_consulted = get("expert_consulted");
  const expert_advice_summary = get("expert_advice_summary");
  return {
    status,
    action: get("action"),
    decision: get("decision"),
    blockers: get("blockers"),
    files_changed: get("files_changed"),
    ...(visual_validation && { visual_validation }),
    ...(expert_consulted && { expert_consulted }),
    ...(expert_advice_summary && { expert_advice_summary }),
  };
}

/** Extract usage data from a result message. */
function extractUsage(result: any): StepUsage | undefined {
  if (!result) return undefined;

  const usage = result.usage;
  return {
    input_tokens: usage?.input_tokens ?? 0,
    output_tokens: usage?.output_tokens ?? 0,
    cache_read_tokens: usage?.cache_read_input_tokens ?? 0,
    cache_creation_tokens: usage?.cache_creation_input_tokens ?? 0,
    total_cost_usd: result.total_cost_usd ?? 0,
    duration_ms: result.duration_ms ?? 0,
    num_turns: result.num_turns ?? 0,
  };
}

/** Format usage data as a compact log line. */
export function formatUsage(usage: StepUsage): string {
  const tokens = usage.input_tokens + usage.output_tokens;
  const cost = usage.total_cost_usd.toFixed(4);
  const dur = (usage.duration_ms / 1000).toFixed(1);
  return `tokens=${tokens} (in=${usage.input_tokens} out=${usage.output_tokens} cache_read=${usage.cache_read_tokens} cache_create=${usage.cache_creation_tokens}) cost=$${cost} duration=${dur}s turns=${usage.num_turns}`;
}

/** Sum multiple StepUsage objects into an aggregate. */
export function sumUsage(usages: StepUsage[]): StepUsage {
  return usages.reduce(
    (acc, u) => ({
      input_tokens: acc.input_tokens + u.input_tokens,
      output_tokens: acc.output_tokens + u.output_tokens,
      cache_read_tokens: acc.cache_read_tokens + u.cache_read_tokens,
      cache_creation_tokens: acc.cache_creation_tokens + u.cache_creation_tokens,
      total_cost_usd: acc.total_cost_usd + u.total_cost_usd,
      duration_ms: acc.duration_ms + u.duration_ms,
      num_turns: acc.num_turns + u.num_turns,
    }),
    { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_creation_tokens: 0, total_cost_usd: 0, duration_ms: 0, num_turns: 0 },
  );
}

// ─── runStep abstraction ────────────────────────────────────────────────────

/** Options for the runStep() workflow step runner. */
export interface RunStepOpts {
  stepName: string;
  stepNumber: number;
  totalSteps: number;
  logger: Logger & { logDir: string };
  commentStep: (msg: string) => Promise<void>;
  allStepUsages: { step: string; ok: boolean; usage: StepUsage }[];
  /** What to do on failure: "halt" adds "Workflow halted." to comment, "continue" adds "(continuing)". Default: "halt". */
  onFail?: "halt" | "continue";
  /** Working directory for git operations (deterministic files_changed). */
  cwd?: string;
}

/** Result returned by runStep(). */
export interface RunStepResult {
  ok: boolean;
  usage: StepUsage;
  result?: string;
  error?: string;
}

/**
 * Run a single workflow step with standardized boilerplate:
 * banner logging, tagged logger, usage tracking, finalize, and comment posting.
 *
 * The executor receives a TaggedLogger and should return a QueryResult.
 */
export async function runStep(
  opts: RunStepOpts,
  executor: (stepLogger: TaggedLogger) => Promise<QueryResult>,
): Promise<RunStepResult> {
  const { stepName, stepNumber, totalSteps, logger, commentStep, allStepUsages, onFail = "halt", cwd } = opts;

  logger.info(`\n${createStepBanner(stepName, stepNumber, totalSteps)}`);
  const step = await openStep(logger.logDir, stepName, stepName, logger, { cwd });

  const result = await executor(step.log);
  const usage = result.usage ?? createDefaultStepUsage();
  allStepUsages.push({ step: stepName, ok: result.success, usage });
  step.log.info(`Usage: ${formatUsage(usage)}`);

  if (!result.success) {
    step.log.error(`Failed: ${result.error}`);
    await step.close(false, usage, result.summary);
    const suffix = onFail === "halt" ? "\nWorkflow halted." : " (continuing)";
    await commentStep(`Step ${stepNumber}/${totalSteps} ${stepName.toUpperCase()} failed ❌ (${fmtDuration(usage.duration_ms)})${suffix}`);
    return { ok: false, usage, result: result.result, error: result.error };
  }

  await step.close(true, usage, result.summary);
  await commentStep(`Step ${stepNumber}/${totalSteps} ${stepName.toUpperCase()} completed ✅ (${fmtDuration(usage.duration_ms)})`);
  logger.info(`${stepName} step completed (${stepNumber}/${totalSteps})`);

  return { ok: true, usage, result: result.result };
}

// ─── SDK factory ────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

/** Create a configured SDK query function with standard permissions. */
export async function createSDK(opts: { model?: string; cwd?: string } = {}) {
  const sdk = await import("@anthropic-ai/claude-agent-sdk");
  return {
    query: (prompt: string) =>
      sdk.query({
        prompt,
        options: {
          model: opts.model ?? DEFAULT_MODEL,
          cwd: opts.cwd,
          permissionMode: "bypassPermissions" as const,
          allowDangerouslySkipPermissions: true,
          settingSources: ["user", "project", "local"] as ("user" | "project" | "local")[],
        },
      }),
  };
}

// ─── SDK query consumption ──────────────────────────────────────────────────

/** Generic skill step runner — all specific run*Step() functions delegate here. */
export async function runSkillStep(
  prompt: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  const { logger, logDir, stepName } = options;

  // Save prompt and set up output capture if step dir provided
  let outputFile: string | undefined;
  if (logDir && stepName) {
    const stepDir = join(logDir, "steps", stepName);
    mkdirSync(stepDir, { recursive: true });
    writeFileSync(join(stepDir, "prompt.txt"), prompt);
    outputFile = join(stepDir, "raw_output.jsonl");
  }

  try {
    logger?.info(`Running skill step: ${prompt.slice(0, 100)}`);

    const sdk = await createSDK({ model: options.model, cwd: options.cwd });
    const query = sdk.query(prompt);

    return await consumeQuery(query, logger, outputFile, options.timeout);
  } catch (e) {
    logger?.error(`Skill step failed: ${e}`);
    return { success: false, error: String(e) };
  }
}

/** Log a single message from the stream. Only result messages go to parent (execution.log). */
function logStreamMessage(message: any, logger?: Logger): void {
  switch (message.type) {
    case "result":
      logger?.info(`[result] subtype=${message.subtype} result=${(message.result ?? "").slice(0, 1000)}${(message.result ?? "").length > 1000 ? "… [truncated]" : ""}`);
      break;
    case "assistant":
      // Assistant content stays in raw_output.jsonl only — not forwarded to execution.log
      break;
    default:
      // SDK debug noise stays in raw_output.jsonl only — not forwarded to execution.log
      break;
  }
}

/** Find the final result message and extract step summary from the stream. */
async function findFinalResult(
  query: AsyncGenerator<any, void>,
  logger?: Logger,
  outputFile?: string
): Promise<{ finalResult: any; summary: StepSummary | null }> {
  let finalResult: any = null;
  let summary: StepSummary | null = null;

  for await (const message of query) {
    logStreamMessage(message, logger);
    if (outputFile) {
      try { appendFileSync(outputFile, JSON.stringify(message) + "\n"); } catch { /* ignore */ }
    }
    if (message.type === "assistant" && !summary) {
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === "text" && block.text?.includes("## Step Summary")) {
            summary = extractStepSummary(block.text);
            break;
          }
        }
      }
    }
    if (message.type === "result") {
      finalResult = message;
      // Also check result text for summary
      if (!summary && finalResult.result) {
        summary = extractStepSummary(finalResult.result);
      }
      // Break immediately after capturing the result message.
      // The pipe may never close if the agent spawned background processes
      // (e.g. `npx convex dev --once`) that hold stdout open — waiting for
      // EOF caused multi-hour hangs in production (build 64).
      break;
    }
  }

  if (summary) {
    logger?.info(`[summary] status=${summary.status} action=${summary.action} decision=${summary.decision} blockers=${summary.blockers}`);
  }

  return { finalResult, summary };
}

/** Consume the async generator from sdk.query(), return the final result. */
async function consumeQuery(
  query: AsyncGenerator<any, void>,
  logger?: Logger,
  outputFile?: string,
  timeout?: number
): Promise<QueryResult> {
  let resultPromise = findFinalResult(query, logger, outputFile);

  // Enforce per-step timeout if specified
  if (timeout && timeout > 0) {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Step timed out after ${timeout}ms`)), timeout);
    });
    try {
      const { finalResult, summary } = await Promise.race([resultPromise, timeoutPromise]);

      if (!finalResult) {
        return { success: false };
      }

      const usage = extractUsage(finalResult);
      if (usage) {
        logger?.info(`[usage] ${formatUsage(usage)}`);
      }

      return {
        success: finalResult.subtype === "success",
        session_id: finalResult.session_id,
        result: finalResult.result,
        usage,
        summary: summary ?? undefined,
      };
    } catch (e) {
      logger?.error(`Timeout: ${e}`);
      // Try to close the generator to free resources
      try { await query.return(undefined as any); } catch { /* ignore */ }
      return { success: false, error: String(e) };
    }
  }

  const { finalResult, summary } = await resultPromise;

  if (!finalResult) {
    return { success: false };
  }

  const usage = extractUsage(finalResult);
  if (usage) {
    logger?.info(`[usage] ${formatUsage(usage)}`);
  }

  return {
    success: finalResult.subtype === "success",
    session_id: finalResult.session_id,
    result: finalResult.result,
    usage,
    summary: summary ?? undefined,
  };
}


/** Generic step runner using command configuration. */
function runConfigurableStep(stepKey: string, args: any[], options: RunStepOptions = {}): Promise<QueryResult> {
  const config = STEP_COMMANDS[stepKey];
  if (!config) {
    throw new Error(`Unknown step command: ${stepKey}`);
  }

  const commandArgs = config.buildArgs(...args);
  const prompt = `${config.command} ${commandArgs.join(" ")}`;
  return runSkillStep(prompt, options);
}

/** Run a plan step — `/plan <adwId> <prompt>`. */
export function runPlanStep(
  prompt: string,
  options: RunStepOptions & { adwId?: string } = {}
): Promise<QueryResult> {
  return runConfigurableStep("plan", [prompt, options.adwId], options);
}

/** Run a build step — `/build <planPath>`. */
export function runBuildStep(
  planPath: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runConfigurableStep("build", [planPath], options);
}

/** Run a review step — `/review <adwId> <specOrIssueBody> [agentName] [reviewImageDir]`. */
export function runReviewStep(
  adwId: string,
  specPath: string,
  options: RunStepOptions & { issueBody?: string; agentName?: string; reviewImageDir?: string } = {}
): Promise<QueryResult> {
  return runConfigurableStep("review", [adwId, specPath, options.issueBody, options.agentName, options.reviewImageDir], options);
}

/** Run a research-codebase step — `/research-codebase <question>`. */
export function runResearchCodebaseStep(
  question: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runConfigurableStep("researchCodebase", [question], options);
}

/** Run a produce-readme step — `/produce-readme <sourcePaths> <outputPath> [mode]`. */
export function runProduceReadmeStep(
  sourcePaths: string,
  outputPath: string,
  options: RunStepOptions & { mode?: string } = {}
): Promise<QueryResult> {
  return runConfigurableStep("produceReadme", [sourcePaths, outputPath, options.mode], options);
}

/** Run an update-prime step — `/update_prime`. */
export function runUpdatePrimeStep(
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runConfigurableStep("updatePrime", [], options);
}

/** Run a document step — `/document <adwId> [specPath] [screenshotsDir]`. */
export function runDocumentStep(
  adwId: string,
  options: RunStepOptions & { specPath?: string; screenshotsDir?: string } = {}
): Promise<QueryResult> {
  return runConfigurableStep("document", [adwId, options.specPath, options.screenshotsDir], options);
}

/** Run a test step — `/test`. */
export function runTestStep(
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runConfigurableStep("test", [], options);
}

/** Run a patch plan step — `/patch <adwId> <changeRequest> [specPath] [agentName]`. */
export function runPatchPlanStep(
  adwId: string,
  changeRequest: string,
  options: RunStepOptions & { specPath?: string; agentName?: string } = {}
): Promise<QueryResult> {
  return runConfigurableStep("patchPlan", [adwId, changeRequest, options.specPath, options.agentName], options);
}

/** Run a classify-issue step — `/classify_issue <issueJson>`. */
export function runClassifyStep(
  issueJson: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runConfigurableStep("classify", [issueJson], options);
}

/** Run a TDD step — `/tdd` with issue body as context. */
export function runTddStep(
  issueBody: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runConfigurableStep("tdd", [issueBody], options);
}

/** Run a branch-wide refactor sweep — `/refactor <adwId>`. */
export function runRefactorSweep(
  adwId: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runConfigurableStep("refactorSweep", [adwId], options);
}

/** Run a scoped refactor step — `/refactor-step` for red-green-refactor loop. */
export function runRefactorStep(
  adwId: string,
  issueNumber: number,
  issueBody: string,
  preTddSha: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runConfigurableStep("refactorStep", [adwId, issueNumber, issueBody, preTddSha], options);
}

/** Run a self-improve step — `/experts:database:self-improve <checkGitDiff> [focusArea]`. */
export function runSelfImproveStep(
  checkGitDiff: string,
  options: RunStepOptions & { focusArea?: string } = {}
): Promise<QueryResult> {
  return runConfigurableStep("selfImprove", [checkGitDiff, options.focusArea], options);
}

/** Run an expert consultation step — `/experts:consult <question> [context] [changedFiles]`. */
export function runConsultStep(
  question: string,
  options: RunStepOptions & { context?: string; changedFiles?: string } = {}
): Promise<QueryResult> {
  return runConfigurableStep("consult", [question, options.context, options.changedFiles], options);
}

/** Quick single-turn prompt for extracting info. */
export function quickPrompt(
  prompt: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runSkillStep(prompt, options);
}
