/**
 * Learning integration tests.
 *
 * Validates that the review step's structured output is compatible
 * with the LearningEntry interface and recordLearning() file format.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import { recordLearning, parseLearningsFile, type LearningEntry } from "../src/learning-utils";
import type { ReviewLearning } from "../src/review-utils";

const TEST_DIR = join(import.meta.dirname ?? __dirname, "..", ".tmp-learning-test");

describe("learning integration", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    try { rmSync(TEST_DIR, { recursive: true }); } catch { /* ignore */ }
  });

  it("review structured learnings map to LearningEntry fields", () => {
    // Simulate what ralph-executor does: parse ReviewLearning → recordLearning
    const reviewLearning: ReviewLearning = {
      tags: ["convex", "auth"],
      context: "Implementing auth middleware",
      expected: "Session tokens stored securely",
      actual: "Tokens stored in plain text cookie",
      confidence: "high",
    };

    const id = recordLearning(TEST_DIR, {
      workflow: "adw_ralph",
      run_id: "pipeline-2026-03-28",
      tags: reviewLearning.tags,
      context: reviewLearning.context,
      expected: reviewLearning.expected,
      actual: reviewLearning.actual,
      confidence: reviewLearning.confidence,
    });

    expect(id).toBe("learn-1");

    // Verify the file was written and can be parsed back
    const filePath = join(TEST_DIR, "temp", "learnings", "pipeline-2026-03-28.md");
    expect(existsSync(filePath)).toBe(true);

    const entries = parseLearningsFile(filePath);
    expect(entries).toHaveLength(1);

    const entry = entries[0];
    expect(entry.id).toBe("learn-1");
    expect(entry.workflow).toBe("adw_ralph");
    expect(entry.tags).toEqual(["convex", "auth"]);
    expect(entry.context).toContain("auth middleware");
    expect(entry.expected).toContain("securely");
    expect(entry.actual).toContain("plain text");
    expect(entry.confidence).toBe("high");
  });

  it("recordLearning writes file in expected YAML format for adw_learn", () => {
    recordLearning(TEST_DIR, {
      workflow: "adw_ralph",
      run_id: "test-run",
      tags: ["frontend"],
      context: "Testing component render",
      expected: "Component renders correctly",
      actual: "Hydration mismatch",
      confidence: "medium",
    });

    const filePath = join(TEST_DIR, "temp", "learnings", "test-run.md");
    const content = readFileSync(filePath, "utf-8");

    // Verify YAML structure
    expect(content).toContain("# Runtime Learnings: test-run");
    expect(content).toContain("```yaml");
    expect(content).toContain("- id: learn-1");
    expect(content).toContain("  workflow: adw_ralph");
    expect(content).toContain("  tags: [frontend]");
    expect(content).toContain("  confidence: medium");
    expect(content).toContain("```");
  });

  it("multiple learnings from single review accumulate in same file", () => {
    const learnings: ReviewLearning[] = [
      { tags: ["convex"], context: "ctx1", expected: "exp1", actual: "act1", confidence: "high" },
      { tags: ["frontend"], context: "ctx2", expected: "exp2", actual: "act2", confidence: "low" },
    ];

    for (const l of learnings) {
      recordLearning(TEST_DIR, {
        workflow: "adw_ralph",
        run_id: "multi-run",
        tags: l.tags,
        context: l.context,
        expected: l.expected,
        actual: l.actual,
        confidence: l.confidence,
      });
    }

    const filePath = join(TEST_DIR, "temp", "learnings", "multi-run.md");
    const entries = parseLearningsFile(filePath);
    expect(entries).toHaveLength(2);
    expect(entries[0].id).toBe("learn-1");
    expect(entries[1].id).toBe("learn-2");
    expect(entries[0].tags).toEqual(["convex"]);
    expect(entries[1].tags).toEqual(["frontend"]);
  });
});
