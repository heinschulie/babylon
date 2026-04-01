import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkPostcondition } from "../src/step-runner";
import type { QueryResult } from "../src/agent-sdk";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

let mockHeadSha = "aaa111";

vi.mock("../src/git-ops", () => ({
  getHeadSha: vi.fn(async () => mockHeadSha),
  commitChanges: vi.fn(async () => [true, null]),
  diffFileList: vi.fn(async () => []),
}));

vi.mock("../src/step-recorder", () => ({
  openStep: vi.fn(async () => ({
    log: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn(), finalize: vi.fn() },
    close: vi.fn(async () => {}),
  })),
}));

vi.mock("../src/review-utils", () => ({
  parseReviewResult: vi.fn((text: string | undefined) => {
    if (text === "VALID_REVIEW") return { success: true, verdict: "PASS", review_issues: [] };
    return { success: false, review_issues: [] };
  }),
}));

const baseResult: QueryResult = { success: true, result: "" };
const preSha = "aaa111";
const cwd = "/tmp/test";

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("checkPostcondition", () => {
  describe("null postcondition", () => {
    it("returns ok for null", async () => {
      expect(await checkPostcondition(null, preSha, cwd, baseResult)).toEqual({ ok: true });
    });
  });

  describe("head-must-advance", () => {
    it("fails when SHA unchanged", async () => {
      mockHeadSha = "aaa111";
      const result = await checkPostcondition("head-must-advance", "aaa111", cwd, baseResult);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("HEAD did not advance");
    });

    it("passes when SHA changed", async () => {
      mockHeadSha = "bbb222";
      const result = await checkPostcondition("head-must-advance", "aaa111", cwd, baseResult);
      expect(result.ok).toBe(true);
    });
  });

  describe("result-must-parse", () => {
    it("passes for valid review", async () => {
      const result = await checkPostcondition("result-must-parse", preSha, cwd, { success: true, result: "VALID_REVIEW" });
      expect(result.ok).toBe(true);
    });

    it("fails for unparseable review", async () => {
      const result = await checkPostcondition("result-must-parse", preSha, cwd, { success: true, result: "garbage" });
      expect(result.ok).toBe(false);
    });
  });

  describe("code-must-compile", () => {
    let originalSpawn: any;

    beforeEach(() => {
      // Ensure Bun object exists for mocking
      if (!(globalThis as any).Bun) {
        (globalThis as any).Bun = {};
      }
      originalSpawn = (globalThis as any).Bun.spawn;
    });

    afterEach(() => {
      if (originalSpawn) {
        (globalThis as any).Bun.spawn = originalSpawn;
      } else {
        delete (globalThis as any).Bun.spawn;
      }
    });

    it("passes when bun run check exits 0", async () => {
      (globalThis as any).Bun.spawn = vi.fn(() => ({
        exited: Promise.resolve(0),
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
      }));
      const result = await checkPostcondition("code-must-compile", preSha, cwd, baseResult);
      expect(result.ok).toBe(true);
    });

    it("fails when bun run check exits non-zero", async () => {
      const errorStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("Type error: missing import"));
          controller.close();
        },
      });
      (globalThis as any).Bun.spawn = vi.fn(() => ({
        exited: Promise.resolve(1),
        stdout: new ReadableStream(),
        stderr: errorStream,
      }));
      const result = await checkPostcondition("code-must-compile", preSha, cwd, baseResult);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("code-must-compile");
    });
  });

  describe("page-must-load", () => {
    it("skips gracefully when .env.local missing", async () => {
      // Default cwd won't have .env.local at /tmp/test
      const result = await checkPostcondition("page-must-load", preSha, "/tmp/nonexistent", baseResult);
      expect(result.ok).toBe(true);
    });
  });

  describe("page-must-render", () => {
    let originalSpawn: any;

    beforeEach(() => {
      if (!(globalThis as any).Bun) {
        (globalThis as any).Bun = {};
      }
      originalSpawn = (globalThis as any).Bun.spawn;
    });

    afterEach(() => {
      if (originalSpawn) {
        (globalThis as any).Bun.spawn = originalSpawn;
      } else {
        delete (globalThis as any).Bun.spawn;
      }
    });

    it("skips gracefully when playwright-cli subprocess fails", async () => {
      // Simulate open failing (exit code 1) — should gracefully skip
      (globalThis as any).Bun.spawn = vi.fn(() => ({
        exited: Promise.resolve(1),
        stdout: new ReadableStream(),
        stderr: new ReadableStream(),
        kill: vi.fn(),
      }));
      const result = await checkPostcondition("page-must-render", preSha, cwd, baseResult);
      expect(result.ok).toBe(true);
    });

    it("skips gracefully when Bun.spawn throws (playwright-cli not installed)", async () => {
      (globalThis as any).Bun.spawn = vi.fn(() => {
        throw new Error("spawn ENOENT");
      });
      const result = await checkPostcondition("page-must-render", preSha, cwd, baseResult);
      expect(result.ok).toBe(true);
    });

    it("passes when page loads with non-empty DOM and no console errors", async () => {
      let callCount = 0;
      (globalThis as any).Bun.spawn = vi.fn(() => {
        callCount++;
        if (callCount === 1) {
          // which npx
          return { exited: Promise.resolve(0), stdout: new ReadableStream(), stderr: new ReadableStream() };
        }
        if (callCount === 2) {
          // open — success
          return { exited: Promise.resolve(0), stdout: new ReadableStream(), stderr: new ReadableStream(), kill: vi.fn() };
        }
        if (callCount === 3) {
          // snapshot — non-empty DOM
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('<div class="app"><h1>Welcome</h1><p>Content here</p></div>'));
              controller.close();
            },
          });
          return { exited: Promise.resolve(0), stdout: stream, stderr: new ReadableStream(), kill: vi.fn() };
        }
        if (callCount === 4) {
          // console — no errors
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("[info] Page loaded"));
              controller.close();
            },
          });
          return { exited: Promise.resolve(0), stdout: stream, stderr: new ReadableStream(), kill: vi.fn() };
        }
        // close
        return { exited: Promise.resolve(0), stdout: new ReadableStream(), stderr: new ReadableStream(), kill: vi.fn() };
      });
      const result = await checkPostcondition("page-must-render", preSha, cwd, baseResult);
      expect(result.ok).toBe(true);
    });

    it("fails when console has error entries", async () => {
      let callCount = 0;
      (globalThis as any).Bun.spawn = vi.fn(() => {
        callCount++;
        if (callCount <= 2) {
          // which + open
          return { exited: Promise.resolve(0), stdout: new ReadableStream(), stderr: new ReadableStream(), kill: vi.fn() };
        }
        if (callCount === 3) {
          // snapshot — non-empty
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('<div class="app"><h1>Page</h1><p>Some content</p></div>'));
              controller.close();
            },
          });
          return { exited: Promise.resolve(0), stdout: stream, stderr: new ReadableStream(), kill: vi.fn() };
        }
        if (callCount === 4) {
          // console — has errors
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("[error] Uncaught TypeError: Cannot read property 'x' of undefined"));
              controller.close();
            },
          });
          return { exited: Promise.resolve(0), stdout: stream, stderr: new ReadableStream(), kill: vi.fn() };
        }
        return { exited: Promise.resolve(0), stdout: new ReadableStream(), stderr: new ReadableStream(), kill: vi.fn() };
      });
      const result = await checkPostcondition("page-must-render", preSha, cwd, baseResult);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("console errors detected");
    });

    it("fails when DOM snapshot is empty", async () => {
      let callCount = 0;
      (globalThis as any).Bun.spawn = vi.fn(() => {
        callCount++;
        if (callCount <= 2) {
          // which + open
          return { exited: Promise.resolve(0), stdout: new ReadableStream(), stderr: new ReadableStream(), kill: vi.fn() };
        }
        if (callCount === 3) {
          // snapshot — empty
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(""));
              controller.close();
            },
          });
          return { exited: Promise.resolve(0), stdout: stream, stderr: new ReadableStream(), kill: vi.fn() };
        }
        return { exited: Promise.resolve(0), stdout: new ReadableStream(), stderr: new ReadableStream(), kill: vi.fn() };
      });
      const result = await checkPostcondition("page-must-render", preSha, cwd, baseResult);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("DOM snapshot is empty");
    });
  });

  describe("array postconditions", () => {
    it("passes when all postconditions pass", async () => {
      mockHeadSha = "bbb222";
      // Single postcondition that passes
      const result = await checkPostcondition(["head-must-advance"], "aaa111", cwd, baseResult);
      expect(result.ok).toBe(true);
    });

    it("short-circuits on first failure", async () => {
      mockHeadSha = "aaa111"; // head-must-advance will fail
      const result = await checkPostcondition(
        ["head-must-advance", "code-must-compile"],
        "aaa111",
        cwd,
        baseResult,
      );
      expect(result.ok).toBe(false);
      expect(result.error).toContain("HEAD did not advance");
    });

    it("handles empty array as passing", async () => {
      const result = await checkPostcondition([], preSha, cwd, baseResult);
      expect(result.ok).toBe(true);
    });
  });

  describe("unknown postcondition", () => {
    it("returns error for unknown type", async () => {
      const result = await checkPostcondition("nonexistent" as any, preSha, cwd, baseResult);
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Unknown postcondition");
    });
  });
});
