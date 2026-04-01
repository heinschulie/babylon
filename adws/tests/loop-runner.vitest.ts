/**
 * Loop runner functional tests.
 *
 * Heavy mock coverage of all loop-runner dependencies.
 *
 * IMPORTANT — test runner notes:
 * - Run via `npx vitest run tests/loop-runner.vitest.ts` from adws/
 * - This file is named .vitest.ts (not .test.ts) to exclude it from `bun test adws/tests/`
 * - bun's test runner shares module state across files, so vi.mock()
 *   calls here would leak into other tests — causing "Export not found" errors
 * - vitest with pool: 'forks' (see adws/vitest.config.ts) isolates
 *   each file in its own process, which prevents the leak
 * - vi.importActual() does NOT work in bun (undefined). Don't try it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PipelineDefinition } from "../src/pipeline";
import type { StepExecutor, PipelineResult } from "../src/step-runner";

// ─── Mock state ───────────────────────────────────────────────────────────────

const mockFetchSubIssues = vi.fn();
const mockCloseSubIssue = vi.fn(async () => {});
const mockFilterUnblockedIssues = vi.fn();
const mockCreateBranch = vi.fn(async () => [true, null] as [boolean, string | null]);
const mockPushBranch = vi.fn(async () => [true, null] as [boolean, string | null]);
const mockGetCurrentBranch = vi.fn(async () => "main");
const mockGetHeadSha = vi.fn(async () => "sha000");
const mockCheckoutBranch = vi.fn(async () => [true, null] as [boolean, string | null]);
const mockAssertStableBranch = vi.fn(async () => {});
const mockRunPipeline = vi.fn();
const mockQuickPrompt = vi.fn(async () => ({ success: true, result: "42" }));
const mockWriteWorkflowStatus = vi.fn();
const mockStateLoad = vi.fn(() => null);
const mockStateUpdate = vi.fn();
const mockStateSave = vi.fn(async () => {});
const mockStateGet = vi.fn((key: string) => {
  if (key === "branch_name") return "feature/issue-100";
  if (key === "base_branch") return "main";
  return undefined;
});

// ─── Module mocks ─────────────────────────────────────────────────────────────
// vitest pool: 'forks' (see adws/vitest.config.ts) isolates each test file
// in its own process, so these mocks don't leak to other test files.

vi.mock("../src/github", () => ({
  fetchSubIssues: (...args: any[]) => mockFetchSubIssues(...args),
  closeSubIssue: (...args: any[]) => mockCloseSubIssue(...args),
  filterUnblockedIssues: (...args: any[]) => mockFilterUnblockedIssues(...args),
  makeIssueComment: vi.fn(async () => {}),
}));

vi.mock("../src/git-ops", () => ({
  createBranch: (...args: any[]) => mockCreateBranch(...args),
  pushBranch: (...args: any[]) => mockPushBranch(...args),
  getCurrentBranch: (...args: any[]) => mockGetCurrentBranch(...args),
  getHeadSha: (...args: any[]) => mockGetHeadSha(...args),
  checkoutBranch: (...args: any[]) => mockCheckoutBranch(...args),
  assertStableBranch: (...args: any[]) => mockAssertStableBranch(...args),
  commitChanges: vi.fn(async () => [true, null]),
  diffFileList: vi.fn(async () => []),
}));

vi.mock("../src/step-runner", () => ({
  runPipeline: (...args: any[]) => mockRunPipeline(...args),
}));

vi.mock("../src/logger", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(),
    logDir: "/tmp/test-logs",
    nextStep: vi.fn((name: string) => `0_${name}`),
    finalize: vi.fn(),
  })),
  writeWorkflowStatus: (...args: any[]) => mockWriteWorkflowStatus(...args),
}));

vi.mock("../src/utils", () => ({
  createCommentStep: vi.fn(() => vi.fn(async () => {})),
  createFinalStatusComment: vi.fn(() => vi.fn(async () => {})),
  createDefaultStepUsage: vi.fn(() => ({
    input_tokens: 0, output_tokens: 0, cache_read_tokens: 0,
    cache_creation_tokens: 0, total_cost_usd: 0, duration_ms: 0, num_turns: 0,
  })),
  getAdwEnv: vi.fn(() => ({
    prompt: null, workingDir: "/tmp/test-work",
    models: { research: "haiku", default: "sonnet", review: "sonnet", opus: "opus" },
  })),
  fmtDuration: vi.fn((ms: number) => `${Math.round(ms / 1000)}s`),
  exec: vi.fn(async () => ({ stdout: "https://github.com/test/pr/1", stderr: "", exitCode: 0 })),
}));

vi.mock("../src/agent-sdk", () => ({
  sumUsage: vi.fn(() => ({
    input_tokens: 100, output_tokens: 50, cache_read_tokens: 0,
    cache_creation_tokens: 0, total_cost_usd: 0.01, duration_ms: 5000, num_turns: 3,
  })),
  quickPrompt: (...args: any[]) => mockQuickPrompt(...args),
}));

vi.mock("../src/state", () => ({
  ADWState: Object.assign(
    class {
      adwId: string;
      constructor(id: string) { this.adwId = id; }
      update = (...args: any[]) => mockStateUpdate(...args);
      save = (...args: any[]) => mockStateSave(...args);
      get = (...args: any[]) => mockStateGet(...args);
    },
    { load: (...args: any[]) => mockStateLoad(...args) },
  ),
}));

vi.mock("../src/step-recorder", () => ({
  openStep: vi.fn(async () => ({
    log: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(), finalize: vi.fn() },
    close: vi.fn(async () => {}),
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSubIssue(num: number, title = `Issue ${num}`, labels: string[] = ["complexity:standard"], body = "body") {
  return { number: num, title, body, labels };
}

function makePipelineResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    ok: true,
    context: { issue: { number: 42, title: "t", body: "b", labels: [] }, complexity: "standard", baseSha: "sha" },
    stepResults: [{ name: "tdd", ok: true, skipped: false, usage: { input_tokens: 10, output_tokens: 5, cache_read_tokens: 0, cache_creation_tokens: 0, total_cost_usd: 0.001, duration_ms: 1000, num_turns: 1 } }],
    skipped: false,
    ...overrides,
  };
}

const simplePipeline: PipelineDefinition = [];
const noopExecutor: StepExecutor = async () => ({ success: true });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("runLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentBranch.mockResolvedValue("main");
    mockCreateBranch.mockResolvedValue([true, null]);
    mockPushBranch.mockResolvedValue([true, null]);
    mockCheckoutBranch.mockResolvedValue([true, null]);
    mockGetHeadSha.mockResolvedValue("sha000");
    mockAssertStableBranch.mockResolvedValue(undefined);
    mockStateLoad.mockReturnValue(null);
    mockCloseSubIssue.mockResolvedValue(undefined);
  });

  it("module exports runLoop function", async () => {
    const { runLoop } = await import("../src/loop-runner");
    expect(typeof runLoop).toBe("function");
  });

  it("all issues completed → returns true, each issue closed", async () => {
    const issues = [makeSubIssue(10), makeSubIssue(11)];
    let fetchCall = 0;
    mockFetchSubIssues.mockImplementation(async (_parent: number, state: string) => {
      if (state === "closed") return [];
      fetchCall++;
      if (fetchCall === 1) return [issues[0]];
      if (fetchCall === 2) return [issues[1]];
      return [];
    });
    mockFilterUnblockedIssues.mockImplementation((open: any[]) => ({
      unblocked: open, blocked: new Map(),
    }));
    mockRunPipeline.mockResolvedValue(makePipelineResult());

    const { runLoop } = await import("../src/loop-runner");
    const result = await runLoop({
      pipeline: simplePipeline, adwId: "test1",
      parentIssueNumber: 100, maxIterations: 5, executeStep: noopExecutor,
    });

    expect(result).toBe(true);
    expect(mockCloseSubIssue).toHaveBeenCalledTimes(2);
  });

  it("some issues skipped → returns false, PR still created", async () => {
    let fetchCall = 0;
    mockFetchSubIssues.mockImplementation(async (_p: number, state: string) => {
      if (state === "closed") return [];
      fetchCall++;
      if (fetchCall <= 2) return [makeSubIssue(10)];
      return [];
    });
    mockFilterUnblockedIssues.mockImplementation((open: any[]) => ({
      unblocked: open, blocked: new Map(),
    }));
    mockRunPipeline.mockResolvedValue(makePipelineResult({ ok: false, skipped: true }));

    const { runLoop } = await import("../src/loop-runner");
    const result = await runLoop({
      pipeline: simplePipeline, adwId: "test2",
      parentIssueNumber: 100, maxIterations: 1, executeStep: noopExecutor,
    });

    expect(result).toBe(false);
    expect(mockPushBranch).toHaveBeenCalled();
  });

  it("all issues blocked → halts, returns false", async () => {
    mockFetchSubIssues.mockImplementation(async (_p: number, state: string) => {
      if (state === "closed") return [];
      return [makeSubIssue(10)];
    });
    mockFilterUnblockedIssues.mockReturnValue({
      unblocked: [], blocked: new Map([[10, [99]]]),
    });

    const { runLoop } = await import("../src/loop-runner");
    const result = await runLoop({
      pipeline: simplePipeline, adwId: "test3",
      parentIssueNumber: 100, maxIterations: 5, executeStep: noopExecutor,
    });

    expect(result).toBe(false);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  it("no open sub-issues → completes immediately", async () => {
    mockFetchSubIssues.mockResolvedValue([]);

    const { runLoop } = await import("../src/loop-runner");
    const result = await runLoop({
      pipeline: simplePipeline, adwId: "test4",
      parentIssueNumber: 100, maxIterations: 5, executeStep: noopExecutor,
    });

    expect(result).toBe(false);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  it("max iterations reached → stops after N iterations", async () => {
    mockFetchSubIssues.mockImplementation(async (_p: number, state: string) => {
      if (state === "closed") return [];
      return [makeSubIssue(10)];
    });
    mockFilterUnblockedIssues.mockImplementation((open: any[]) => ({
      unblocked: open, blocked: new Map(),
    }));
    mockRunPipeline.mockResolvedValue(makePipelineResult({ ok: false, skipped: true }));

    const { runLoop } = await import("../src/loop-runner");
    await runLoop({
      pipeline: simplePipeline, adwId: "test5",
      parentIssueNumber: 100, maxIterations: 3, executeStep: noopExecutor,
      maxSkipPerIssue: 10, // high limit so exhaustion doesn't interfere
    });

    expect(mockRunPipeline).toHaveBeenCalledTimes(3);
  });

  it("git lifecycle: branch created → push → checkout base", async () => {
    mockFetchSubIssues.mockResolvedValue([]);

    const { runLoop } = await import("../src/loop-runner");
    await runLoop({
      pipeline: simplePipeline, adwId: "test6",
      parentIssueNumber: 100, maxIterations: 5, executeStep: noopExecutor,
    });

    expect(mockCreateBranch).toHaveBeenCalledWith("feature/issue-100", "/tmp/test-work");
    expect(mockPushBranch).toHaveBeenCalled();
    expect(mockCheckoutBranch).toHaveBeenCalledWith("main", "/tmp/test-work");
  });

  it("crash recovery: already on target branch → skips assertStableBranch", async () => {
    mockGetCurrentBranch.mockResolvedValue("feature/issue-100");
    mockStateLoad.mockReturnValue({
      adwId: "test7", update: mockStateUpdate, save: mockStateSave,
      get: (key: string) => key === "base_branch" ? "main" : key === "branch_name" ? "feature/issue-100" : undefined,
    });
    mockFetchSubIssues.mockResolvedValue([]);

    const { runLoop } = await import("../src/loop-runner");
    await runLoop({
      pipeline: simplePipeline, adwId: "test7",
      parentIssueNumber: 100, maxIterations: 5, executeStep: noopExecutor,
    });

    expect(mockAssertStableBranch).not.toHaveBeenCalled();
  });

  it("single unblocked → auto-select, no quickPrompt", async () => {
    let fetchCall = 0;
    mockFetchSubIssues.mockImplementation(async (_p: number, state: string) => {
      if (state === "closed") return [];
      fetchCall++;
      if (fetchCall === 1) return [makeSubIssue(42)];
      return [];
    });
    mockFilterUnblockedIssues.mockImplementation((open: any[]) => ({
      unblocked: open, blocked: new Map(),
    }));
    mockRunPipeline.mockResolvedValue(makePipelineResult());

    const { runLoop } = await import("../src/loop-runner");
    await runLoop({
      pipeline: simplePipeline, adwId: "test8",
      parentIssueNumber: 100, maxIterations: 5, executeStep: noopExecutor,
    });

    expect(mockQuickPrompt).not.toHaveBeenCalled();
  });

  it("multiple unblocked → quickPrompt called for selection", async () => {
    let fetchCall = 0;
    mockFetchSubIssues.mockImplementation(async (_p: number, state: string) => {
      if (state === "closed") return [];
      fetchCall++;
      if (fetchCall === 1) return [makeSubIssue(10), makeSubIssue(11)];
      return [];
    });
    mockFilterUnblockedIssues.mockImplementation((open: any[]) => ({
      unblocked: open, blocked: new Map(),
    }));
    mockQuickPrompt.mockResolvedValue({ success: true, result: "10" });
    mockRunPipeline.mockResolvedValue(makePipelineResult());

    const { runLoop } = await import("../src/loop-runner");
    await runLoop({
      pipeline: simplePipeline, adwId: "test9",
      parentIssueNumber: 100, maxIterations: 5, executeStep: noopExecutor,
    });

    expect(mockQuickPrompt).toHaveBeenCalled();
  });

  it("pipeline halts → issue tracked as skipped, loop continues", async () => {
    let fetchCall = 0;
    mockFetchSubIssues.mockImplementation(async (_p: number, state: string) => {
      if (state === "closed") return [];
      fetchCall++;
      if (fetchCall === 1) return [makeSubIssue(10)];
      if (fetchCall === 3) return [makeSubIssue(11)];
      return [];
    });
    mockFilterUnblockedIssues.mockImplementation((open: any[]) => ({
      unblocked: open, blocked: new Map(),
    }));
    let pipelineCall = 0;
    mockRunPipeline.mockImplementation(async () => {
      pipelineCall++;
      if (pipelineCall === 1) return makePipelineResult({ ok: false, skipped: false });
      return makePipelineResult();
    });

    const { runLoop } = await import("../src/loop-runner");
    await runLoop({
      pipeline: simplePipeline, adwId: "test10",
      parentIssueNumber: 100, maxIterations: 5, executeStep: noopExecutor,
    });

    expect(mockRunPipeline).toHaveBeenCalled();
  });

  it("branch creation failure → returns false immediately", async () => {
    mockCreateBranch.mockResolvedValue([false, "branch exists"]);

    const { runLoop } = await import("../src/loop-runner");
    const result = await runLoop({
      pipeline: simplePipeline, adwId: "test11",
      parentIssueNumber: 100, maxIterations: 5, executeStep: noopExecutor,
    });

    expect(result).toBe(false);
    expect(mockRunPipeline).not.toHaveBeenCalled();
  });

  it("push failure → continues to finalization", async () => {
    mockFetchSubIssues.mockResolvedValue([]);
    mockPushBranch.mockResolvedValue([false, "push rejected"]);

    const { runLoop } = await import("../src/loop-runner");
    const result = await runLoop({
      pipeline: simplePipeline, adwId: "test12",
      parentIssueNumber: 100, maxIterations: 5, executeStep: noopExecutor,
    });

    expect(typeof result).toBe("boolean");
    expect(mockPushBranch).toHaveBeenCalled();
  });

  it("issue exhausted after maxSkipPerIssue retries — excluded from selection", async () => {
    // Same issue always returned as open
    mockFetchSubIssues.mockImplementation(async (_p: number, state: string) => {
      if (state === "closed") return [];
      return [makeSubIssue(10)];
    });
    mockFilterUnblockedIssues.mockImplementation((open: any[]) => ({
      unblocked: open, blocked: new Map(),
    }));
    mockRunPipeline.mockResolvedValue(makePipelineResult({ ok: false, skipped: true }));

    const { runLoop } = await import("../src/loop-runner");
    const result = await runLoop({
      pipeline: simplePipeline, adwId: "test-exhaust1",
      parentIssueNumber: 100, maxIterations: 5, executeStep: noopExecutor,
      maxSkipPerIssue: 2,
    });

    // Should only be called 2 times (maxSkipPerIssue), not 5 (maxIterations)
    expect(mockRunPipeline).toHaveBeenCalledTimes(2);
    expect(result).toBe(false);
  });

  it("exhausted issue doesn't block other issues", async () => {
    let fetchCall = 0;
    mockFetchSubIssues.mockImplementation(async (_p: number, state: string) => {
      if (state === "closed") return [];
      fetchCall++;
      // First 2 calls: both issues open. After #10 exhausted, #11 still available.
      // After #11 completes, no open issues.
      if (fetchCall <= 3) return [makeSubIssue(10), makeSubIssue(11)];
      return [];
    });
    mockFilterUnblockedIssues.mockImplementation((open: any[]) => ({
      unblocked: open, blocked: new Map(),
    }));

    let pipelineCall = 0;
    mockRunPipeline.mockImplementation(async (_pipeline: any, baseCtx: any) => {
      pipelineCall++;
      if (baseCtx.issue.number === 10) {
        return makePipelineResult({ ok: false, skipped: true });
      }
      return makePipelineResult();
    });

    const { runLoop } = await import("../src/loop-runner");
    await runLoop({
      pipeline: simplePipeline, adwId: "test-exhaust2",
      parentIssueNumber: 100, maxIterations: 10, executeStep: noopExecutor,
      maxSkipPerIssue: 2,
    });

    // #10 tried 2x (exhausted), #11 tried 1x (succeeded)
    expect(mockRunPipeline).toHaveBeenCalledTimes(3);
    // #11 was closed
    expect(mockCloseSubIssue).toHaveBeenCalledWith(11, expect.any(String));
  });

  it("exception in loop body → caught, status written, returns false", async () => {
    mockFetchSubIssues.mockRejectedValue(new Error("network error"));

    const { runLoop } = await import("../src/loop-runner");
    const result = await runLoop({
      pipeline: simplePipeline, adwId: "test13",
      parentIssueNumber: 100, maxIterations: 5, executeStep: noopExecutor,
    });

    expect(result).toBe(false);
    expect(mockWriteWorkflowStatus).toHaveBeenCalled();
  });
});
