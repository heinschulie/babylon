/**
 * Agent SDK wrapper for plan-build workflow.
 *
 * Uses @anthropic-ai/claude-agent-sdk for streaming agent execution.
 */

import type { Logger } from "./logger";
import { taggedLogger, type TaggedLogger } from "./logger";
import { createStepBanner, createDefaultStepUsage, fmtDuration } from "./utils";

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
}

interface RunStepOptions {
  model?: string;
  cwd?: string;
  logger?: Logger;
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
  const { stepName, stepNumber, totalSteps, logger, commentStep, allStepUsages, onFail = "halt" } = opts;

  logger.info(`\n${createStepBanner(stepName, stepNumber, totalSteps)}`);
  const stepLog = taggedLogger(logger, stepName, { logDir: logger.logDir, step: stepName });

  const result = await executor(stepLog);
  const usage = result.usage ?? createDefaultStepUsage();
  allStepUsages.push({ step: stepName, ok: result.success, usage });
  stepLog.info(`Usage: ${formatUsage(usage)}`);

  if (!result.success) {
    stepLog.error(`Failed: ${result.error}`);
    stepLog.finalize(false, usage);
    const suffix = onFail === "halt" ? "\nWorkflow halted." : " (continuing)";
    await commentStep(`Step ${stepNumber}/${totalSteps} ${stepName.toUpperCase()} failed ❌ (${fmtDuration(usage.duration_ms)})${suffix}`);
    return { ok: false, usage, result: result.result, error: result.error };
  }

  stepLog.finalize(true, usage);
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
  const { logger } = options;

  try {
    logger?.info(`Running skill step: ${prompt.slice(0, 100)}`);

    const sdk = await createSDK({ model: options.model, cwd: options.cwd });
    const query = sdk.query(prompt);

    return await consumeQuery(query, logger);
  } catch (e) {
    logger?.error(`Skill step failed: ${e}`);
    return { success: false, error: String(e) };
  }
}

/** Consume the async generator from sdk.query(), return the final result. */
async function consumeQuery(
  query: AsyncGenerator<any, void>,
  logger?: Logger
): Promise<QueryResult> {
  let finalResult: any = null;

  for await (const message of query) {
    switch (message.type) {
      case "result":
        finalResult = message;
        logger?.info(`[result] subtype=${message.subtype} result=${(message.result ?? "").slice(0, 500)}`);
        break;
      case "assistant":
        logger?.info(`[assistant] ${summarizeContent(message.message?.content ?? [])}`);
        break;
      default:
        logger?.debug(`[sdk] type=${message.type} subtype=${message.subtype ?? ""}`);
        break;
    }
  }

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
  };
}

/** Run a plan step — `/plan <adwId> <prompt>`. */
export function runPlanStep(
  prompt: string,
  options: RunStepOptions & { adwId?: string } = {}
): Promise<QueryResult> {
  return runSkillStep(`/plan ${options.adwId ?? "unknown"} ${prompt}`, options);
}

/** Run a build step — `/build <planPath>`. */
export function runBuildStep(
  planPath: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runSkillStep(`/build ${planPath}`, options);
}

/** Run a review step — `/review <adwId> <specPath>`. */
export function runReviewStep(
  adwId: string,
  specPath: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runSkillStep(`/review ${adwId} ${specPath}`, options);
}

/** Run a research-codebase step — `/research-codebase <question>`. */
export function runResearchCodebaseStep(
  question: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runSkillStep(`/research-codebase ${question}`, options);
}

/** Run a produce-readme step — `/produce-readme <sourcePaths> <outputPath> [mode]`. */
export function runProduceReadmeStep(
  sourcePaths: string,
  outputPath: string,
  options: RunStepOptions & { mode?: string } = {}
): Promise<QueryResult> {
  const modeArg = options.mode ? ` ${options.mode}` : "";
  return runSkillStep(`/produce-readme ${sourcePaths} ${outputPath}${modeArg}`, options);
}

/** Run an update-prime step — `/update_prime`. */
export function runUpdatePrimeStep(
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runSkillStep(`/update_prime`, options);
}

/** Run a document step — `/document <adwId> [specPath] [screenshotsDir]`. */
export function runDocumentStep(
  adwId: string,
  options: RunStepOptions & { specPath?: string; screenshotsDir?: string } = {}
): Promise<QueryResult> {
  const args = [adwId];
  if (options.specPath) args.push(options.specPath);
  if (options.screenshotsDir) args.push(options.screenshotsDir);
  return runSkillStep(`/document ${args.join(" ")}`, options);
}

/** Run a test step — `/test`. */
export function runTestStep(
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runSkillStep(`/test`, options);
}

/** Run a patch plan step — `/patch <adwId> <changeRequest> [specPath] [agentName]`. */
export function runPatchPlanStep(
  adwId: string,
  changeRequest: string,
  options: RunStepOptions & { specPath?: string; agentName?: string } = {}
): Promise<QueryResult> {
  const args = [adwId, JSON.stringify(changeRequest)];
  if (options.specPath) args.push(options.specPath);
  if (options.agentName) args.push(options.agentName);
  return runSkillStep(`/patch ${args.join(" ")}`, options);
}

/** Quick single-turn prompt for extracting info. */
export function quickPrompt(
  prompt: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  return runSkillStep(prompt, options);
}
