import { describe, it, expect } from "bun:test";
import { extractScreenshots, type ReviewResult } from "../src/review-utils";

describe("extractScreenshots", () => {
  it("returns skipped when no screenshots present", () => {
    const result: ReviewResult = { success: true, review_issues: [] };
    const { visual_validation, screenshots } = extractScreenshots(result);
    expect(visual_validation).toBe("skipped");
    expect(screenshots).toEqual([]);
  });

  it("collects screenshots from top-level array", () => {
    const result: ReviewResult = {
      success: true,
      review_issues: [],
      screenshots: ["/tmp/builds/steps/review/01_full_page.png"],
    };
    const { visual_validation, screenshots } = extractScreenshots(result, "https://dev.schulie.com");
    expect(visual_validation).toBe("passed");
    expect(screenshots).toHaveLength(1);
    expect(screenshots[0]).toEqual({
      name: "01_full_page",
      url: "https://dev.schulie.com",
      path: "/tmp/builds/steps/review/01_full_page.png",
    });
  });

  it("collects screenshots from review issues", () => {
    const result: ReviewResult = {
      success: true,
      review_issues: [
        {
          review_issue_number: 1,
          screenshot_path: "/tmp/issue_1.png",
          issue_description: "Minor alignment",
          issue_resolution: "Adjust padding",
          issue_severity: "tech_debt",
        },
      ],
    };
    const { visual_validation, screenshots } = extractScreenshots(result);
    expect(visual_validation).toBe("passed");
    expect(screenshots).toHaveLength(1);
    expect(screenshots[0].name).toBe("issue_1");
  });

  it("returns failed when a blocker has a screenshot", () => {
    const result: ReviewResult = {
      success: false,
      review_issues: [
        {
          review_issue_number: 1,
          screenshot_path: "/tmp/broken.png",
          issue_description: "Page is blank",
          issue_resolution: "Fix render",
          issue_severity: "blocker",
        },
      ],
    };
    const { visual_validation, screenshots } = extractScreenshots(result);
    expect(visual_validation).toBe("failed");
    expect(screenshots).toHaveLength(1);
  });

  it("returns passed when blocker has no screenshot", () => {
    const result: ReviewResult = {
      success: false,
      review_issues: [
        {
          review_issue_number: 1,
          screenshot_path: "",
          issue_description: "Logic error",
          issue_resolution: "Fix logic",
          issue_severity: "blocker",
        },
      ],
    };
    const { visual_validation, screenshots } = extractScreenshots(result);
    expect(visual_validation).toBe("skipped");
    expect(screenshots).toEqual([]);
  });

  it("merges top-level and per-issue screenshots", () => {
    const result: ReviewResult = {
      success: true,
      review_issues: [
        {
          review_issue_number: 1,
          screenshot_path: "/tmp/issue_1.png",
          issue_description: "Minor",
          issue_resolution: "Fix",
          issue_severity: "skippable",
        },
      ],
      screenshots: ["/tmp/overview.png"],
    };
    const { screenshots } = extractScreenshots(result);
    expect(screenshots).toHaveLength(2);
  });
});
