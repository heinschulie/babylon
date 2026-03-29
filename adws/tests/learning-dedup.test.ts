import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { recordLearning, parseLearningsFile } from "../src/learning-utils";

const TEST_DIR = join(dirname(new URL(import.meta.url).pathname), "..", ".test-dedup-tmp");
const LEARNINGS_DIR = join(TEST_DIR, "temp", "learnings");

function baseLearning(overrides: Record<string, unknown> = {}) {
  return {
    workflow: "adw_ralph" as const,
    run_id: "dedup-test",
    tags: ["convex", "schema"],
    context: "Testing dedup logic",
    expected: "No duplicate learnings",
    actual: "Duplicate learnings were written to file without dedup",
    confidence: "medium" as const,
    platform_context: { convex: "1.0.0" },
    ...overrides,
  };
}

describe("learning deduplication", () => {
  beforeEach(() => {
    mkdirSync(LEARNINGS_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("writes a new learning when no duplicates exist", () => {
    const id = recordLearning(TEST_DIR, baseLearning());
    expect(id).toBe("learn-1");

    const entries = parseLearningsFile(join(LEARNINGS_DIR, "dedup-test.md"));
    expect(entries).toHaveLength(1);
    // occurrences: 1 is not written to file (only > 1 is persisted)
    expect(entries[0].occurrences).toBeUndefined();
  });

  it("deduplicates identical learnings — single entry with occurrences: 2", () => {
    recordLearning(TEST_DIR, baseLearning());
    const id2 = recordLearning(TEST_DIR, baseLearning());

    const entries = parseLearningsFile(join(LEARNINGS_DIR, "dedup-test.md"));
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe("learn-1");
    expect(id2).toBe("learn-1"); // returns existing ID
    expect(parseInt(String(entries[0].occurrences), 10)).toBe(2);
  });

  it("deduplicates similar learnings (same tags, overlapping actual)", () => {
    recordLearning(TEST_DIR, baseLearning());
    recordLearning(TEST_DIR, baseLearning({
      actual: "Duplicate learnings were written to file without dedup — extra detail",
    }));

    const entries = parseLearningsFile(join(LEARNINGS_DIR, "dedup-test.md"));
    expect(entries).toHaveLength(1);
    expect(parseInt(String(entries[0].occurrences), 10)).toBe(2);
  });

  it("keeps different learnings (different tags)", () => {
    recordLearning(TEST_DIR, baseLearning());
    recordLearning(TEST_DIR, baseLearning({
      tags: ["frontend", "svelte"],
      actual: "Completely different learning about frontend",
    }));

    const entries = parseLearningsFile(join(LEARNINGS_DIR, "dedup-test.md"));
    expect(entries).toHaveLength(2);
  });

  it("takes higher confidence on dedup", () => {
    recordLearning(TEST_DIR, baseLearning({ confidence: "low" }));
    recordLearning(TEST_DIR, baseLearning({ confidence: "high" }));

    const entries = parseLearningsFile(join(LEARNINGS_DIR, "dedup-test.md"));
    expect(entries).toHaveLength(1);
    expect(entries[0].confidence).toBe("high");
  });

  it("includes traceability fields in round-trip", () => {
    recordLearning(TEST_DIR, baseLearning({
      source_step: "74_review",
      issue_number: 74,
    }));

    const entries = parseLearningsFile(join(LEARNINGS_DIR, "dedup-test.md"));
    expect(entries).toHaveLength(1);
    expect(entries[0].source_step).toBe("74_review");
    // issue_number is parsed as string from simple YAML parser
    expect(String(entries[0].issue_number)).toBe("74");
  });
});
