import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import {
  runTimekeeper,
  spawnTimekeeper,
  type TimekeeperConfig,
  type JsonlEntry,
  type KillFilePayload,
} from "../src/timekeeper-agent";

// Mock the agent-sdk and utils modules
vi.mock("../src/agent-sdk", () => ({
  quickPrompt: vi.fn().mockResolvedValue({ content: "HEALTHY" }),
}));

vi.mock("../src/utils", () => ({
  getWorkflowModels: vi.fn().mockReturnValue({
    research: "claude-haiku-4-5-20251001",
  }),
}));

describe("timekeeper-agent", () => {
  const testDir = "/tmp/timekeeper-test";
  const logDir = join(testDir, "log");
  const issueNumber = 42;
  const adwId = "test-adw";

  beforeEach(() => {
    // Clean up and create test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
    mkdirSync(logDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  /** Poll for a kill file to appear, used by tests that expect a kill. */
  async function waitForKillFile(stepDir: string, timeoutMs: number): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (existsSync(join(stepDir, ".kill"))) return;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Kill file not created within ${timeoutMs}ms`);
  }

  function createStepDir(stepName: string): string {
    const stepDir = join(logDir, `${issueNumber}_01_${stepName}`);
    mkdirSync(stepDir, { recursive: true });
    return stepDir;
  }

  function writeJsonlEntries(stepDir: string, entries: JsonlEntry[]): void {
    const jsonlPath = join(stepDir, "raw_output.jsonl");
    const content = entries.map(entry => JSON.stringify(entry)).join("\n");
    writeFileSync(jsonlPath, content);
  }

  function readKillFile(stepDir: string): KillFilePayload | null {
    const killFilePath = join(stepDir, ".kill");
    if (!existsSync(killFilePath)) return null;

    try {
      const content = JSON.parse(require("fs").readFileSync(killFilePath, "utf-8"));
      return content as KillFilePayload;
    } catch {
      return null;
    }
  }

  test("detects healthy step with new tool calls", async () => {
    const stepDir = createStepDir("tdd");

    // Write initial JSONL entries
    writeJsonlEntries(stepDir, [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "test.txt" } }]
        }
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Edit", input: { file_path: "test.txt" } }]
        }
      },
    ]);

    const config: TimekeeperConfig = {
      logDir,
      adwId,
      issueNumber,
      initialDelayMs: 100,
      checkIntervalMs: 500,
      stallingGraceMs: 1000,
    };

    const { promise, terminate } = spawnTimekeeper(config);

    // Let it run for a short time
    await new Promise(resolve => setTimeout(resolve, 200));

    // Should not create kill file for healthy step
    expect(readKillFile(stepDir)).toBeNull();

    terminate();
    await promise;
  });

  test("detects obvious looping behavior and kills step", async () => {
    const stepDir = createStepDir("review");

    // Write JSONL entries with obvious looping pattern (same tool, same args)
    writeJsonlEntries(stepDir, [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "firecrawl_scrape", input: { url: "http://test.com" } }]
        }
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "firecrawl_scrape", input: { url: "http://test.com" } }]
        }
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "firecrawl_scrape", input: { url: "http://test.com" } }]
        }
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "firecrawl_scrape", input: { url: "http://test.com" } }]
        }
      },
    ]);

    const config: TimekeeperConfig = {
      logDir,
      adwId,
      issueNumber,
      initialDelayMs: 100,
      checkIntervalMs: 300,
      stallingGraceMs: 1000,
    };

    const { promise, terminate } = spawnTimekeeper(config);

    // Poll for kill file then terminate (timekeeper continues monitoring after kills)
    await waitForKillFile(stepDir, 4000);
    terminate();
    await promise;

    const killFile = readKillFile(stepDir);
    expect(killFile).toBeTruthy();
    expect(killFile?.reason).toBe("looping");
    expect(killFile?.description).toContain("firecrawl_scrape");
  });

  test("detects stalling and kills step after grace period", async () => {
    const stepDir = createStepDir("tdd");

    // Write initial JSONL entries (no new activity will be added)
    writeJsonlEntries(stepDir, [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "test.txt" } }]
        }
      },
    ]);

    const config: TimekeeperConfig = {
      logDir,
      adwId,
      issueNumber,
      initialDelayMs: 100,
      checkIntervalMs: 200,
      stallingGraceMs: 400, // Short grace period for test
    };

    const { promise, terminate } = spawnTimekeeper(config);

    // Poll for kill file then terminate (timekeeper continues monitoring after kills)
    await waitForKillFile(stepDir, 4000);
    terminate();
    await promise;

    const killFile = readKillFile(stepDir);
    expect(killFile).toBeTruthy();
    expect(killFile?.reason).toBe("stalling");
    expect(killFile?.description).toContain("No JSONL activity");
  });

  test("handles throttled state gracefully", async () => {
    const stepDir = createStepDir("consult");

    // Write JSONL entries with rate limit event
    writeJsonlEntries(stepDir, [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "test.txt" } }]
        }
      },
      { type: "rate_limit", rate_limit_event: true },
    ]);

    const config: TimekeeperConfig = {
      logDir,
      adwId,
      issueNumber,
      initialDelayMs: 100,
      checkIntervalMs: 300,
      stallingGraceMs: 500,
    };

    const { promise, terminate } = spawnTimekeeper(config);

    // Let it run for a bit
    await new Promise(resolve => setTimeout(resolve, 400));

    // Should not kill during throttling
    expect(readKillFile(stepDir)).toBeNull();

    terminate();
    await promise;
  });

  test("switches monitoring between steps", async () => {
    const step1Dir = createStepDir("consult");
    const step2Dir = createStepDir("tdd");

    // Write JSONL for first step
    writeJsonlEntries(step1Dir, [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "test.txt" } }]
        }
      },
    ]);

    // Mark first step as completed
    writeFileSync(join(step1Dir, "status.json"), JSON.stringify({ completed: true }));

    const config: TimekeeperConfig = {
      logDir,
      adwId,
      issueNumber,
      initialDelayMs: 100,
      checkIntervalMs: 200,
    };

    const { promise, terminate } = spawnTimekeeper(config);

    await new Promise(resolve => setTimeout(resolve, 150));

    // Create second step with activity
    writeJsonlEntries(step2Dir, [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Write", input: { file_path: "test.txt", content: "hello" } }]
        }
      },
    ]);

    await new Promise(resolve => setTimeout(resolve, 250));

    // Should be monitoring the second step now
    expect(readKillFile(step1Dir)).toBeNull();
    expect(readKillFile(step2Dir)).toBeNull();

    terminate();
    await promise;
  });

  test("ignores completed steps", async () => {
    const stepDir = createStepDir("review");

    // Write JSONL with looping pattern
    writeJsonlEntries(stepDir, [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "same_tool", input: { arg: "same" } }]
        }
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "same_tool", input: { arg: "same" } }]
        }
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "same_tool", input: { arg: "same" } }]
        }
      },
    ]);

    // Mark step as completed
    writeFileSync(join(stepDir, "status.json"), JSON.stringify({ completed: true }));

    const config: TimekeeperConfig = {
      logDir,
      adwId,
      issueNumber,
      initialDelayMs: 100,
      checkIntervalMs: 200,
    };

    const { promise, terminate } = spawnTimekeeper(config);

    await new Promise(resolve => setTimeout(resolve, 300));

    // Should not kill completed steps even if they show looping pattern
    expect(readKillFile(stepDir)).toBeNull();

    terminate();
    await promise;
  });

  test("false positive regression: 4x Read on different files must NOT kill", async () => {
    const stepDir = createStepDir("research");

    // Write JSONL entries with 4x Read on different files (should not be killed)
    writeJsonlEntries(stepDir, [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "file1.txt" } }]
        }
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "file2.txt" } }]
        }
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "file3.txt" } }]
        }
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Read", input: { file_path: "file4.txt" } }]
        }
      },
    ]);

    const config: TimekeeperConfig = {
      logDir,
      adwId,
      issueNumber,
      initialDelayMs: 100,
      checkIntervalMs: 300,
      stallingGraceMs: 1000,
    };

    const { promise, terminate } = spawnTimekeeper(config);

    // Let it run for a short time - should not kill
    await new Promise(resolve => setTimeout(resolve, 400));

    expect(readKillFile(stepDir)).toBeNull();

    terminate();
    await promise;
  });

  test("handles ambiguous looping with haiku classification", async () => {
    const stepDir = createStepDir("ambiguous");

    // Write JSONL entries with same tool name but different args (ambiguous case)
    // Since haiku mock returns "HEALTHY" by default, this should NOT kill
    writeJsonlEntries(stepDir, [
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Bash", input: { command: "npm test" } }]
        }
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Bash", input: { command: "npm run build" } }]
        }
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Bash", input: { command: "npm run check" } }]
        }
      },
      {
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name: "Bash", input: { command: "npm run lint" } }]
        }
      },
    ]);

    const config: TimekeeperConfig = {
      logDir,
      adwId,
      issueNumber,
      initialDelayMs: 100,
      checkIntervalMs: 300,
      stallingGraceMs: 1000,
    };

    const { promise, terminate } = spawnTimekeeper(config);

    // Let it run for a short time - haiku returns "HEALTHY" so should not kill
    await new Promise(resolve => setTimeout(resolve, 500));

    const killFile = readKillFile(stepDir);
    expect(killFile).toBeNull(); // Should not kill because haiku returns HEALTHY

    terminate();
    await promise;
  });
});