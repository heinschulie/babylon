import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { openStep } from "../src/step-recorder";
import { mkdirSync, existsSync, readFileSync, readdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { Logger } from "../src/logger";

// Mock git-ops to avoid real git calls
vi.mock("../src/git-ops", () => ({
  getHeadSha: vi.fn().mockResolvedValue("aaaa1111"),
  diffFileList: vi.fn().mockResolvedValue(["src/foo.ts", "src/bar.ts"]),
}));

function makeParentLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  };
}

describe("StepRecorder", () => {
  let logDir: string;
  let parent: Logger;

  beforeEach(() => {
    logDir = join(tmpdir(), `step-recorder-test-${Date.now()}`);
    mkdirSync(logDir, { recursive: true });
    parent = makeParentLogger();
  });

  afterEach(() => {
    try {
      rmSync(logDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  });

  it("openStep creates the step directory", async () => {
    const step = await openStep(logDir, "01_tdd", "tdd", parent);
    const stepDir = join(logDir, "steps", "01_tdd");
    expect(existsSync(stepDir)).toBe(true);
    // Clean up
    await step.close(true);
  });

  it("close(true) writes status.json with pass status", async () => {
    const step = await openStep(logDir, "02_build", "build", parent);

    const usage = {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_tokens: 10,
      cache_creation_tokens: 5,
      total_cost_usd: 0.01,
      duration_ms: 5000,
      num_turns: 3,
    };

    const summary = {
      status: "pass" as const,
      action: "built the thing",
      decision: "used approach A",
      blockers: "none",
      files_changed: "agent-reported.ts",
    };

    await step.close(true, usage, summary);

    const statusFile = join(logDir, "steps", "02_build", "status.json");
    expect(existsSync(statusFile)).toBe(true);

    const status = JSON.parse(readFileSync(statusFile, "utf-8"));
    expect(status.build).toBeDefined();
    expect(status.build.status).toBe("pass");
    expect(status.build.usage).toEqual(usage);
    // files_changed should be overwritten by git diff result
    expect(status.build.summary.files_changed).toBe("src/foo.ts, src/bar.ts");
  });

  it("close(false) renames .log to .error.log", async () => {
    const step = await openStep(logDir, "03_review", "review", parent);
    step.log.info("some log message");

    await step.close(false);

    const stepDir = join(logDir, "steps", "03_review");
    const files = readdirSync(stepDir);
    expect(files.some(f => f.endsWith(".error.log"))).toBe(true);
    expect(files.some(f => f === "review.log")).toBe(false);
  });

  it("files_changed from summary is overwritten by git diff", async () => {
    const step = await openStep(logDir, "04_test", "test", parent);

    const summary = {
      status: "pass" as const,
      action: "ran tests",
      decision: "used vitest",
      blockers: "none",
      files_changed: "wrong-file.ts",
    };

    await step.close(true, undefined, summary);

    const statusFile = join(logDir, "steps", "04_test", "status.json");
    const status = JSON.parse(readFileSync(statusFile, "utf-8"));
    expect(status.test.summary.files_changed).toBe("src/foo.ts, src/bar.ts");
  });

  it("close creates minimal summary when no summary provided but files changed", async () => {
    const step = await openStep(logDir, "05_patch", "patch", parent);

    await step.close(true);

    const statusFile = join(logDir, "steps", "05_patch", "status.json");
    const status = JSON.parse(readFileSync(statusFile, "utf-8"));
    // With files changed but no summary, a minimal summary should be created
    expect(status.patch.summary.files_changed).toBe("src/foo.ts, src/bar.ts");
  });

  it("tagged logger forwards to parent", async () => {
    const step = await openStep(logDir, "06_log", "logtest", parent);
    step.log.info("hello");
    expect(parent.info).toHaveBeenCalledWith(expect.stringContaining("hello"));
    await step.close(true);
  });
});
