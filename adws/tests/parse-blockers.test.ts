import { describe, it, expect } from "vitest";
import { parseBlockers, filterUnblockedIssues, type SubIssue } from "../src/github";

describe("parseBlockers", () => {
  it("extracts single blocker", () => {
    const body = `## Dependencies\n\n- **Blocked by**: #42\n- **Blocks**: #55`;
    expect(parseBlockers(body)).toEqual([42]);
  });

  it("extracts multiple blockers", () => {
    const body = `## Dependencies\n\n- **Blocked by**: #12, #34\n- **Blocks**: #55`;
    expect(parseBlockers(body)).toEqual([12, 34]);
  });

  it("extracts blockers with 'and' separator", () => {
    const body = `## Dependencies\n\n- **Blocked by**: #12 and #34`;
    expect(parseBlockers(body)).toEqual([12, 34]);
  });

  it("returns empty for 'None'", () => {
    const body = `## Dependencies\n\n- **Blocked by**: None — can start immediately\n- **Blocks**: #55`;
    expect(parseBlockers(body)).toEqual([]);
  });

  it("returns empty for 'none' (case insensitive)", () => {
    const body = `## Dependencies\n\n- **Blocked by**: none`;
    expect(parseBlockers(body)).toEqual([]);
  });

  it("returns empty when Dependencies section is missing", () => {
    const body = `## Interface Specification\n\nSome API spec here.\n\n## Acceptance Criteria\n\n- [ ] Works`;
    expect(parseBlockers(body)).toEqual([]);
  });

  it("returns empty for empty string", () => {
    expect(parseBlockers("")).toEqual([]);
  });

  it("deduplicates repeated blocker numbers", () => {
    const body = `## Dependencies\n\n- **Blocked by**: #42, #42, #42`;
    expect(parseBlockers(body)).toEqual([42]);
  });

  it("ignores issue refs outside the Blocked by line", () => {
    const body = `## Parent PRD\n\n#99\n\n## Dependencies\n\n- **Blocked by**: #42\n- **Blocks**: #55`;
    expect(parseBlockers(body)).toEqual([42]);
  });
});

describe("filterUnblockedIssues", () => {
  const makeIssue = (number: number, blockedBy: string): SubIssue => ({
    number,
    title: `Issue ${number}`,
    body: `## Dependencies\n\n- **Blocked by**: ${blockedBy}\n- **Blocks**: None`,
    state: "open",
    labels: ["sub-issue"],
  });

  it("all unblocked when no dependencies", () => {
    const issues = [
      makeIssue(1, "None — can start immediately"),
      makeIssue(2, "None — can start immediately"),
    ];
    const { unblocked, blocked } = filterUnblockedIssues(issues, new Set());
    expect(unblocked).toHaveLength(2);
    expect(blocked.size).toBe(0);
  });

  it("filters out issue blocked by open sibling", () => {
    const issues = [
      makeIssue(1, "None — can start immediately"),
      makeIssue(2, "#1"),
    ];
    const { unblocked, blocked } = filterUnblockedIssues(issues, new Set());
    expect(unblocked).toHaveLength(1);
    expect(unblocked[0].number).toBe(1);
    expect(blocked.get(2)).toEqual([1]);
  });

  it("unblocks issue when blocker is in closedNumbers", () => {
    const issues = [
      makeIssue(2, "#1"),
      makeIssue(3, "None — can start immediately"),
    ];
    const { unblocked, blocked } = filterUnblockedIssues(issues, new Set([1]));
    expect(unblocked).toHaveLength(2);
    expect(blocked.size).toBe(0);
  });

  it("treats external blocker refs as resolved", () => {
    // #999 is not in the open set or closed set — external, assume resolved
    const issues = [makeIssue(1, "#999")];
    const { unblocked, blocked } = filterUnblockedIssues(issues, new Set());
    expect(unblocked).toHaveLength(1);
    expect(blocked.size).toBe(0);
  });

  it("blocks issue with multiple blockers when one is still open", () => {
    const issues = [
      makeIssue(1, "None — can start immediately"),
      makeIssue(2, "None — can start immediately"),
      makeIssue(3, "#1, #2"),
    ];
    // Only #1 is closed, #2 is still open
    const { unblocked, blocked } = filterUnblockedIssues(issues, new Set([1]));
    expect(unblocked.map(i => i.number).sort()).toEqual([1, 2]);
    expect(blocked.get(3)).toEqual([2]);
  });

  it("detects all-blocked state (circular deps)", () => {
    const issues = [
      makeIssue(1, "#2"),
      makeIssue(2, "#1"),
    ];
    const { unblocked, blocked } = filterUnblockedIssues(issues, new Set());
    expect(unblocked).toHaveLength(0);
    expect(blocked.size).toBe(2);
  });
});
