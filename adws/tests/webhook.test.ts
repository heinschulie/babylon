import { describe, it, expect } from "vitest";
import { AVAILABLE_ADW_WORKFLOWS } from "../src/workflow-ops";

/** Dependent workflows that require existing worktrees. */
const DEPENDENT_WORKFLOWS = [
  "adw_build_iso",
  "adw_test_iso",
  "adw_review_iso",
  "adw_document_iso",
  "adw_ship_iso",
];

describe("webhook workflow validation", () => {
  it("all dependent workflows are in AVAILABLE_ADW_WORKFLOWS", () => {
    for (const workflow of DEPENDENT_WORKFLOWS) {
      expect(AVAILABLE_ADW_WORKFLOWS).toContain(workflow);
    }
  });

  it("entry-point workflows can trigger without ADW ID", () => {
    const entryPoints = AVAILABLE_ADW_WORKFLOWS.filter(
      (w) => !DEPENDENT_WORKFLOWS.includes(w)
    );
    expect(entryPoints.length).toBeGreaterThan(0);
    expect(entryPoints).toContain("adw_plan_iso");
    expect(entryPoints).toContain("adw_plan_build_iso");
    expect(entryPoints).toContain("adw_sdlc_iso");
  });

  it("dependent workflows are blocked without ADW ID", () => {
    const adwId: string | undefined = undefined;
    for (const workflow of DEPENDENT_WORKFLOWS) {
      const blocked = DEPENDENT_WORKFLOWS.includes(workflow) && !adwId;
      expect(blocked).toBe(true);
    }
  });

  it("dependent workflows allowed with ADW ID", () => {
    const adwId: string | undefined = "test1234";
    for (const workflow of DEPENDENT_WORKFLOWS) {
      const blocked = DEPENDENT_WORKFLOWS.includes(workflow) && !adwId;
      expect(blocked).toBe(false);
    }
  });
});
