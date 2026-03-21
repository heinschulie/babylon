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

/**
 * Run a plan step via the agent SDK.
 * Executes `/plan <adwId> <prompt>`.
 */
export async function runPlanStep(
  prompt: string,
  options: RunStepOptions & { adwId?: string } = {}
): Promise<QueryResult> {
  const { logger } = options;

  try {
    logger?.info(`Running /plan step with model: ${options.model ?? "sonnet"}`);

    const adwId = options.adwId ?? "unknown";
    const sdk = await createSDK({ model: options.model, cwd: options.cwd });
    const query = sdk.query(`/plan ${adwId} ${prompt}`);

    return await consumeQuery(query, logger);
  } catch (e) {
    logger?.error(`Plan step failed: ${e}`);
    return { success: false, error: String(e) };
  }
}

/**
 * Run a build step via the agent SDK.
 * Executes `/build <planPath>`.
 */
export async function runBuildStep(
  planPath: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  const { logger } = options;

  try {
    logger?.info(`Running /build step with plan: ${planPath}`);

    const sdk = await createSDK({ model: options.model, cwd: options.cwd });
    const query = sdk.query(`/build ${planPath}`);

    return await consumeQuery(query, logger);
  } catch (e) {
    logger?.error(`Build step failed: ${e}`);
    return { success: false, error: String(e) };
  }
}

/**
 * Run a review step via the agent SDK.
 * Executes `/review <adwId> <specPath>`.
 */
export async function runReviewStep(
  adwId: string,
  specPath: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  const { logger } = options;

  try {
    logger?.info(`Running /review step with spec: ${specPath}`);

    const sdk = await createSDK({ model: options.model, cwd: options.cwd });
    const query = sdk.query(`/review ${adwId} ${specPath}`);

    return await consumeQuery(query, logger);
  } catch (e) {
    logger?.error(`Review step failed: ${e}`);
    return { success: false, error: String(e) };
  }
}

/**
 * Run a research-codebase step via the agent SDK.
 * Executes `/research-codebase <question>`.
 */
export async function runResearchCodebaseStep(
  question: string,
  options: RunStepOptions = {}
): Promise<QueryResult> {
  const { logger } = options;

  try {
    logger?.info(`Running /research-codebase step with question: ${question.slice(0, 100)}`);

    const sdk = await createSDK({ model: options.model, cwd: options.cwd });
    const query = sdk.query(`/research-codebase ${question}`);

    return await consumeQuery(query, logger);
  } catch (e) {
    logger?.error(`Research-codebase step failed: ${e}`);
    return { success: false, error: String(e) };
  }
}

/**
 * Run a produce-readme step via the agent SDK.
 * Executes `/produce-readme <sourcePaths> <outputPath> [mode]`.
 *
 * @param sourcePaths - comma-separated list of source file paths
 * @param outputPath - destination README path
 * @param mode - optional: "consolidated" for a single unified README
 */
export async function runProduceReadmeStep(
  sourcePaths: string,
  outputPath: string,
  options: RunStepOptions & { mode?: string } = {}
): Promise<QueryResult> {
  const { logger, mode } = options;

  try {
    const modeArg = mode ? ` ${mode}` : "";
    logger?.info(`Running /produce-readme step: ${sourcePaths} → ${outputPath}${modeArg ? ` (${mode})` : ""}`);

    const sdk = await createSDK({ model: options.model, cwd: options.cwd });
    const query = sdk.query(`/produce-readme ${sourcePaths} ${outputPath}${modeArg}`);

    return await consumeQuery(query, logger);
  } catch (e) {
    logger?.error(`Produce-readme step failed: ${e}`);
    return { success: false, error: String(e) };
  }
}

/**
 * Run an update-prime step via the agent SDK.
 * Executes `/update_prime` to regenerate the prime command from current READMEs.
 */
export async function runUpdatePrimeStep(
  options: RunStepOptions = {}
): Promise<QueryResult> {
  const { logger } = options;

  try {
    logger?.info(`Running /update_prime step`);

    const sdk = await createSDK({ model: options.model, cwd: options.cwd });
    const query = sdk.query(`/update_prime`);

    return await consumeQuery(query, logger);
  } catch (e) {
    logger?.error(`Update-prime step failed: ${e}`);
    return { success: false, error: String(e) };
  }
}

/**
 * Run a document step via the agent SDK.
 * Executes `/document <adwId> [specPath] [screenshotsDir]`.
 */
export async function runDocumentStep(
  adwId: string,
  options: RunStepOptions & { specPath?: string; screenshotsDir?: string } = {}
): Promise<QueryResult> {
  const { logger, specPath, screenshotsDir } = options;

  try {
    const args = [adwId];
    if (specPath) args.push(specPath);
    if (screenshotsDir) args.push(screenshotsDir);

    logger?.info(`Running /document step for ADW: ${adwId}`);

    const sdk = await createSDK({ model: options.model, cwd: options.cwd });
    const query = sdk.query(`/document ${args.join(" ")}`);

    return await consumeQuery(query, logger);
  } catch (e) {
    logger?.error(`Document step failed: ${e}`);
    return { success: false, error: String(e) };
  }
}

/**
 * Run a test step via the agent SDK.
 * Executes `/test` to run the project's validation test suite.
 */
export async function runTestStep(
  options: RunStepOptions = {}
): Promise<QueryResult> {
  const { logger } = options;

  try {
    logger?.info(`Running /test step with model: ${options.model ?? "sonnet"}`);

    const sdk = await createSDK({ model: options.model, cwd: options.cwd });
    const query = sdk.query(`/test`);

    return await consumeQuery(query, logger);
  } catch (e) {
    logger?.error(`Test step failed: ${e}`);
    return { success: false, error: String(e) };
  }
}

/**
 * Run a patch plan step via the agent SDK.
 * Executes `/patch <adwId> <changeRequest> [specPath] [agentName]`.
 *
 * Returns the path to the generated patch plan file in result.
 */
export async function runPatchPlanStep(
  adwId: string,
  changeRequest: string,
  options: RunStepOptions & { specPath?: string; agentName?: string } = {}
): Promise<QueryResult> {
  const { logger, specPath, agentName } = options;

  try {
    const args = [adwId, JSON.stringify(changeRequest)];
    if (specPath) args.push(specPath);
    if (agentName) args.push(agentName);

    logger?.info(`Running /patch step for ADW: ${adwId}`);

    const sdk = await createSDK({ model: options.model, cwd: options.cwd });
    const query = sdk.query(`/patch ${args.join(" ")}`);

    return await consumeQuery(query, logger);
  } catch (e) {
    logger?.error(`Patch plan step failed: ${e}`);
    return { success: false, error: String(e) };
  }
}

/**
 * Quick single-turn prompt for extracting info.
 */
export async function quickPrompt(
  prompt: string,
  options: RunStepOptions = {}
): Promise<string | null> {
  const { logger } = options;

  try {
    const sdk = await createSDK({ model: options.model, cwd: options.cwd });
    const query = sdk.query(prompt);

    const result = await consumeQuery(query, logger);
    return result.result ?? null;
  } catch (e) {
    logger?.error(`Quick prompt failed: ${e}`);
    return null;
  }
}
