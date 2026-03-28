import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runPipeline,
  resolveModel,
  shouldSkip,
  checkPostcondition,
  type StepExecutor,
  type RunPipelineOptions,
} from "../src/step-runner";
import type { PipelineDefinition, PipelineContext, StepDefinition } from "../src/pipeline";
import type { QueryResult } from "../src/agent-sdk";
import type { Logger, StepSummary } from "../src/logger";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

let mockHeadSha = "aaa111";
let headShaCallCount = 0;

vi.mock("../src/git-ops", () => ({
  getHeadSha: vi.fn(async () => {
    headShaCallCount++;
    return mockHeadSha;
  }),
  commitChanges: vi.fn(async () => [true, null] as [boolean, string | null]),
  diffFileList: vi.fn(async () => ["src/foo.ts"]),
}));

vi.mock("../src/step-recorder", () => ({
  openStep: vi.fn(async () => ({
    log: {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      finalize: vi.fn(),
    },
    close: vi.fn(async () => {}),
  })),
}));

// learning-utils no longer imported by step-runner (moved to ralph-executor)

vi.mock("../src/review-utils", () => ({
  parseReviewResult: vi.fn((text: string | undefined) => {
    if (text === "VALID_REVIEW") return { success: true, review_issues: [] };
    return { success: false, review_issues: [] };
  }),
  extractScreenshots: vi.fn(() => ({ visual_validation: "skipped", screenshots: [] })),
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────

function makeContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    issue: { number: 42, title: "Test issue", body: "Body", labels: ["complexity:standard"] },
    complexity: "standard",
    baseSha: "base000",
    ...overrides,
  };
}

function makeStep(overrides: Partial<StepDefinition> = {}): StepDefinition {
  return {
    name: "test-step",
    command: "/test",
    onFail: "halt",
    produces: [],
    consumes: [],
    modelMap: { trivial: "research", standard: "default", complex: "opus" },
    commitAfter: false,
    timeout: 60_000,
    postcondition: null,
    ...overrides,
  };
}

function makeOptions(executor: StepExecutor, overrides: Partial<RunPipelineOptions> = {}): RunPipelineOptions {
  return {
    logger: {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      logDir: "/tmp/test-logdir",
      nextStep: vi.fn((name: string, num?: number) => `${num ?? 0}_${name}`),
    } as any,
    workingDir: "/tmp/test-work",
    models: { research: "haiku", default: "sonnet", review: "sonnet" },
    executeStep: executor,
    ...overrides,
  };
}

function successResult(extras: Partial<QueryResult> = {}): QueryResult {
  return { success: true, result: "ok", usage: { input_tokens: 10, output_tokens: 5, cache_read_tokens: 0, cache_creation_tokens: 0, total_cost_usd: 0.001, duration_ms: 1000, num_turns: 1 }, ...extras };
}

function failResult(error = "step failed"): QueryResult {
  return { success: false, error };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveModel", () => {
  const models = { research: "haiku-model", default: "sonnet-model", review: "review-model" };

  it("resolves 'research' alias", () => {
    expect(resolveModel("research", models)).toBe("haiku-model");
  });

  it("resolves 'default' alias", () => {
    expect(resolveModel("default", models)).toBe("sonnet-model");
  });

  it("resolves 'opus' via WorkflowModels.opus field", () => {
    const modelsWithOpus = { ...models, opus: "claude-opus-4-20250514" };
    expect(resolveModel("opus", modelsWithOpus)).toBe("claude-opus-4-20250514");
  });

  it("resolves 'opus' to default when opus field missing", () => {
    expect(resolveModel("opus", models)).toBe("sonnet-model");
  });

  it("passes through unknown aliases as literal model IDs", () => {
    expect(resolveModel("claude-custom-model", models)).toBe("claude-custom-model");
  });
});

describe("shouldSkip", () => {
  it("returns false when no skipWhen", () => {
    expect(shouldSkip(makeStep(), makeContext())).toBe(false);
  });

  it("returns true when context matches skipWhen", () => {
    const step = makeStep({ skipWhen: { complexity: ["trivial"] } });
    expect(shouldSkip(step, makeContext({ complexity: "trivial" }))).toBe(true);
  });

  it("returns false when context does not match", () => {
    const step = makeStep({ skipWhen: { complexity: ["trivial"] } });
    expect(shouldSkip(step, makeContext({ complexity: "standard" }))).toBe(false);
  });
});

describe("runPipeline", () => {
  beforeEach(() => {
    mockHeadSha = "aaa111";
    headShaCallCount = 0;
    vi.clearAllMocks();
  });

  it("runs all steps in order on success", async () => {
    const calls: string[] = [];
    const executor: StepExecutor = async (step) => {
      calls.push(step.name);
      return successResult();
    };

    const pipeline: PipelineDefinition = [
      makeStep({ name: "step-a", produces: ["expertAdvice"] }),
      makeStep({ name: "step-b" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(result.ok).toBe(true);
    expect(result.skipped).toBe(false);
    expect(calls).toEqual(["step-a", "step-b"]);
    expect(result.stepResults).toHaveLength(2);
    expect(result.stepResults.every(s => s.ok)).toBe(true);
  });

  it("onFail=continue — step fails, next step still runs", async () => {
    const calls: string[] = [];
    const executor: StepExecutor = async (step) => {
      calls.push(step.name);
      if (step.name === "step-a") return failResult();
      return successResult();
    };

    const pipeline: PipelineDefinition = [
      makeStep({ name: "step-a", onFail: "continue" }),
      makeStep({ name: "step-b" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(calls).toEqual(["step-a", "step-b"]);
    expect(result.ok).toBe(true); // pipeline continues past continue-step failure
  });

  it("onFail=skip-issue — pipeline stops with skipped=true", async () => {
    const calls: string[] = [];
    const executor: StepExecutor = async (step) => {
      calls.push(step.name);
      if (step.name === "step-a") return failResult();
      return successResult();
    };

    const pipeline: PipelineDefinition = [
      makeStep({ name: "step-a", onFail: "skip-issue" }),
      makeStep({ name: "step-b" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(calls).toEqual(["step-a"]);
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
  });

  it("onFail=halt — pipeline stops with ok=false", async () => {
    const calls: string[] = [];
    const executor: StepExecutor = async (step) => {
      calls.push(step.name);
      if (step.name === "step-a") return failResult();
      return successResult();
    };

    const pipeline: PipelineDefinition = [
      makeStep({ name: "step-a", onFail: "halt" }),
      makeStep({ name: "step-b" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(calls).toEqual(["step-a"]);
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(false);
  });

  it("skipWhen — step skipped when condition matches", async () => {
    const calls: string[] = [];
    const executor: StepExecutor = async (step) => {
      calls.push(step.name);
      return successResult();
    };

    const pipeline: PipelineDefinition = [
      makeStep({ name: "refactor", skipWhen: { complexity: ["trivial"] } }),
      makeStep({ name: "review" }),
    ];

    const result = await runPipeline(pipeline, makeContext({ complexity: "trivial" }), makeOptions(executor));
    expect(calls).toEqual(["review"]); // refactor skipped
    expect(result.stepResults[0].skipped).toBe(true);
    expect(result.stepResults[1].skipped).toBe(false);
  });

  it("postcondition head-must-advance — fails when HEAD unchanged", async () => {
    // mockHeadSha stays the same throughout
    const executor: StepExecutor = async () => successResult();

    const pipeline: PipelineDefinition = [
      makeStep({ name: "tdd", postcondition: "head-must-advance", onFail: "skip-issue" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(result.ok).toBe(false);
    expect(result.stepResults[0].ok).toBe(false);
    expect(result.stepResults[0].error).toContain("HEAD did not advance");
  });

  it("postcondition head-must-advance — passes when HEAD changes", async () => {
    let callNum = 0;
    const { getHeadSha } = await import("../src/git-ops");
    (getHeadSha as any).mockImplementation(async () => {
      callNum++;
      // First call = pre-step SHA, second call = postcondition check, third call = commit check
      return callNum <= 1 ? "pre-sha" : "post-sha";
    });

    const executor: StepExecutor = async () => successResult();

    const pipeline: PipelineDefinition = [
      makeStep({ name: "tdd", postcondition: "head-must-advance", commitAfter: true }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(result.ok).toBe(true);
    expect(result.stepResults[0].ok).toBe(true);
  });

  it("postcondition result-must-parse — fails when review unparseable", async () => {
    const executor: StepExecutor = async () => successResult({ result: "GARBAGE" });

    const pipeline: PipelineDefinition = [
      makeStep({ name: "review", postcondition: "result-must-parse", onFail: "skip-issue" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(result.ok).toBe(false);
    expect(result.stepResults[0].error).toContain("verdict could not be parsed");
  });

  it("postcondition result-must-parse — passes on valid review", async () => {
    const executor: StepExecutor = async () => successResult({ result: "VALID_REVIEW" });

    const pipeline: PipelineDefinition = [
      makeStep({ name: "review", postcondition: "result-must-parse" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(result.ok).toBe(true);
  });

  it("commitAfter — commits when HEAD advanced", async () => {
    let callNum = 0;
    const gitOps = await import("../src/git-ops");
    (gitOps.getHeadSha as any).mockImplementation(async () => {
      callNum++;
      return callNum <= 1 ? "pre-sha" : "post-sha";
    });

    const executor: StepExecutor = async () => successResult();

    const pipeline: PipelineDefinition = [
      makeStep({ name: "tdd", commitAfter: true }),
    ];

    await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(gitOps.commitChanges).toHaveBeenCalled();
  });

  it("commitAfter — skips commit when HEAD unchanged", async () => {
    // mockHeadSha stays the same
    mockHeadSha = "same-sha";
    const gitOps = await import("../src/git-ops");
    (gitOps.getHeadSha as any).mockImplementation(async () => "same-sha");

    const executor: StepExecutor = async () => successResult();

    const pipeline: PipelineDefinition = [
      makeStep({ name: "tdd", commitAfter: true }),
    ];

    await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(gitOps.commitChanges).not.toHaveBeenCalled();
  });

  it("context bag threads produces to later steps", async () => {
    let capturedContext: any = null;
    const executor: StepExecutor = async (step, context) => {
      if (step.name === "step-b") capturedContext = { ...context };
      if (step.name === "step-a") {
        return { ...successResult(), produces: { expertAdvice: "use pattern X" } };
      }
      return successResult();
    };

    const pipeline: PipelineDefinition = [
      makeStep({ name: "step-a", produces: ["expertAdvice"] }),
      makeStep({ name: "step-b", consumes: ["expertAdvice"] }),
    ];

    await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(capturedContext.expertAdvice).toBe("use pattern X");
  });

  it("model resolution uses correct model per complexity", async () => {
    let capturedModel = "";
    const executor: StepExecutor = async (_step, _ctx, opts) => {
      capturedModel = opts.model;
      return successResult();
    };

    const pipeline: PipelineDefinition = [
      makeStep({ name: "tdd", modelMap: { trivial: "research", standard: "default", complex: "opus" } }),
    ];

    await runPipeline(pipeline, makeContext({ complexity: "complex" }), makeOptions(executor, {
      models: { research: "haiku", default: "sonnet", review: "sonnet", opus: "claude-opus-4-20250514" },
    }));
    expect(capturedModel).toBe("claude-opus-4-20250514");
  });

  it("executor exception is caught and treated as failure", async () => {
    const executor: StepExecutor = async () => { throw new Error("boom"); };

    const pipeline: PipelineDefinition = [
      makeStep({ name: "broken", onFail: "halt" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(result.ok).toBe(false);
    expect(result.stepResults[0].ok).toBe(false);
    expect(result.stepResults[0].error).toContain("boom");
  });

  it("skip-issue does NOT call recordLearning (moved to ralph-executor)", async () => {
    const executor: StepExecutor = async () => failResult();

    const pipeline: PipelineDefinition = [
      makeStep({ name: "tdd", onFail: "skip-issue" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(result.ok).toBe(false);
    expect(result.skipped).toBe(true);
    // recordLearning is no longer imported by step-runner — if it were called, the module would fail to load
  });

  it("halt and skip-issue are symmetric — neither records learning directly", async () => {
    const haltExecutor: StepExecutor = async () => failResult("halt error");
    const skipExecutor: StepExecutor = async () => failResult("skip error");

    const haltPipeline: PipelineDefinition = [makeStep({ name: "step-a", onFail: "halt" })];
    const skipPipeline: PipelineDefinition = [makeStep({ name: "step-a", onFail: "skip-issue" })];

    const haltResult = await runPipeline(haltPipeline, makeContext(), makeOptions(haltExecutor));
    const skipResult = await runPipeline(skipPipeline, makeContext(), makeOptions(skipExecutor));

    // Both stop pipeline
    expect(haltResult.ok).toBe(false);
    expect(skipResult.ok).toBe(false);
    // Only skip-issue sets skipped=true
    expect(haltResult.skipped).toBe(false);
    expect(skipResult.skipped).toBe(true);
  });

  it("postcondition failure with onFail=continue — step fails postcondition, next step still runs", async () => {
    // HEAD doesn't advance, so postcondition fails
    const calls: string[] = [];
    const executor: StepExecutor = async (step) => {
      calls.push(step.name);
      return successResult();
    };

    const pipeline: PipelineDefinition = [
      makeStep({ name: "tdd", postcondition: "head-must-advance", onFail: "continue" }),
      makeStep({ name: "review" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(calls).toEqual(["tdd", "review"]);
    expect(result.stepResults[0].ok).toBe(false);
    expect(result.stepResults[0].error).toContain("HEAD did not advance");
    expect(result.stepResults[1].ok).toBe(true);
  });

  it("failed step does NOT merge produces into context", async () => {
    let capturedContext: any = null;
    const executor: StepExecutor = async (step, context) => {
      if (step.name === "step-b") capturedContext = { ...context };
      if (step.name === "step-a") return failResult();
      return successResult();
    };

    const pipeline: PipelineDefinition = [
      makeStep({ name: "step-a", produces: ["expertAdvice"], onFail: "continue" }),
      makeStep({ name: "step-b" }),
    ];

    await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(capturedContext.expertAdvice).toBeUndefined();
  });

  it("commit failure handling — commitChanges returns [false, error], pipeline continues", async () => {
    let callNum = 0;
    const gitOps = await import("../src/git-ops");
    (gitOps.getHeadSha as any).mockImplementation(async () => {
      callNum++;
      return callNum <= 1 ? "pre-sha" : "post-sha";
    });
    (gitOps.commitChanges as any).mockResolvedValue([false, "commit error"]);

    const calls: string[] = [];
    const executor: StepExecutor = async (step) => {
      calls.push(step.name);
      return successResult();
    };

    const pipeline: PipelineDefinition = [
      makeStep({ name: "tdd", commitAfter: true }),
      makeStep({ name: "review" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(calls).toEqual(["tdd", "review"]);
    // Pipeline continues despite commit failure
    expect(result.ok).toBe(true);
  });

  it("commitAfter + head-must-advance — commit happens, postcondition passes", async () => {
    let callNum = 0;
    const gitOps = await import("../src/git-ops");
    // Call 1: pre-step SHA capture → "pre-sha"
    // Call 2: commitAfter SHA check → "dirty-sha" (different, triggers commit)
    // Call 3: postcondition SHA check → "post-commit-sha" (different from pre-sha, passes)
    (gitOps.getHeadSha as any).mockImplementation(async () => {
      callNum++;
      if (callNum === 1) return "pre-sha";
      if (callNum === 2) return "dirty-sha";
      return "post-commit-sha";
    });

    const executor: StepExecutor = async () => successResult();

    const pipeline: PipelineDefinition = [
      makeStep({ name: "tdd", commitAfter: true, postcondition: "head-must-advance" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(result.ok).toBe(true);
    expect(result.stepResults[0].ok).toBe(true);
    expect(gitOps.commitChanges).toHaveBeenCalled();
  });

  it("commitAfter + head-must-advance — no file changes, postcondition still fails", async () => {
    const gitOps = await import("../src/git-ops");
    // All calls return same SHA — no changes at all
    (gitOps.getHeadSha as any).mockImplementation(async () => "same-sha");

    const executor: StepExecutor = async () => successResult();

    const pipeline: PipelineDefinition = [
      makeStep({ name: "tdd", commitAfter: true, postcondition: "head-must-advance", onFail: "skip-issue" }),
    ];

    const result = await runPipeline(pipeline, makeContext(), makeOptions(executor));
    expect(result.ok).toBe(false);
    expect(result.stepResults[0].ok).toBe(false);
    expect(result.stepResults[0].error).toContain("HEAD did not advance");
    expect(gitOps.commitChanges).not.toHaveBeenCalled();
  });

  it("runtime consumes validation warns when consumed key is undefined", async () => {
    const logger = {
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      logDir: "/tmp/test-logdir",
      nextStep: vi.fn((name: string, num?: number) => `${num ?? 0}_${name}`),
    } as any;

    const executor: StepExecutor = async () => successResult();

    const pipeline: PipelineDefinition = [
      makeStep({ name: "tdd", consumes: ["expertAdvice"] }),
    ];

    // expertAdvice is NOT in the base context
    await runPipeline(pipeline, makeContext(), makeOptions(executor, { logger }));
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('consumes "expertAdvice" but it is undefined'),
    );
  });
});
