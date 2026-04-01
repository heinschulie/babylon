import { describe, it, expect } from "vitest";
import {
  extractFrontendBehaviors,
  filterVisualBehaviors,
  buildVerifyPrompt,
} from "../src/verify-utils";

describe("extractFrontendBehaviors", () => {
  const issueBody = `
## Summary
Some feature description.

## Behaviors to Test
1. [Frontend] Renders the activity feed with recent items
2. [Frontend] Displays achievement badge when earned
3. [Backend] Creates notification record in database
4. [Frontend] Shows expanded details on click
5. [Backend] Fires mutation to update user progress

## Dependencies
None
`;

  it("extracts [Frontend] behaviors from Behaviors to Test section", () => {
    const result = extractFrontendBehaviors(issueBody);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe("Renders the activity feed with recent items");
    expect(result[1]).toBe("Displays achievement badge when earned");
    expect(result[2]).toBe("Shows expanded details on click");
  });

  it("ignores [Backend] behaviors", () => {
    const result = extractFrontendBehaviors(issueBody);
    expect(result.every((b) => !b.includes("database") && !b.includes("mutation"))).toBe(true);
  });

  it("returns empty array when no Behaviors section exists", () => {
    const noSection = "## Summary\nJust a description.\n## Done";
    expect(extractFrontendBehaviors(noSection)).toEqual([]);
  });

  it("returns empty array for empty input", () => {
    expect(extractFrontendBehaviors("")).toEqual([]);
  });

  it("handles dash-style list items", () => {
    const body = `## Behaviors to Test
- [Frontend] Renders a card component
- [Backend] Saves to DB
`;
    const result = extractFrontendBehaviors(body);
    expect(result).toEqual(["Renders a card component"]);
  });
});

describe("filterVisualBehaviors", () => {
  it("keeps behaviors with visual keywords", () => {
    const behaviors = [
      "Renders the activity feed",
      "Displays achievement badge",
      "Shows expanded details",
      "Button appears disabled",
    ];
    expect(filterVisualBehaviors(behaviors)).toEqual(behaviors);
  });

  it("excludes pure wiring behaviors", () => {
    const behaviors = [
      "Calls mutation to save data",
      "Fires onClick wiring event",
      "Triggers query on mount",
    ];
    expect(filterVisualBehaviors(behaviors)).toEqual([]);
  });

  it("keeps behaviors with both visual and wiring keywords", () => {
    const behaviors = ["Calls mutation and renders success message"];
    expect(filterVisualBehaviors(behaviors)).toEqual(behaviors);
  });

  it("keeps ambiguous behaviors (no visual or wiring keywords)", () => {
    const behaviors = ["Updates the counter value"];
    expect(filterVisualBehaviors(behaviors)).toEqual(behaviors);
  });
});

describe("buildVerifyPrompt", () => {
  it("formats correctly with URL and screenshot dir", () => {
    const behaviors = ["Renders feed items", "Shows badge"];
    const prompt = buildVerifyPrompt(behaviors, "http://localhost:5173", "/tmp/screenshots");

    expect(prompt).toContain("Navigate to http://localhost:5173");
    expect(prompt).toContain("Save screenshots to /tmp/screenshots");
    expect(prompt).toContain("- [ ] Renders feed items");
    expect(prompt).toContain("- [ ] Shows badge");
    expect(prompt).toContain("Report pass/fail per behavior");
  });

  it("includes all behaviors as checklist items", () => {
    const behaviors = ["A", "B", "C"];
    const prompt = buildVerifyPrompt(behaviors, "http://example.com", "/tmp/s");
    expect(prompt.match(/- \[ \]/g)?.length).toBe(3);
  });
});
