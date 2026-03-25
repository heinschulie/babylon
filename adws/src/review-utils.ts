import type { StepUsage } from "./agent-sdk";
import type { Screenshot } from "./logger";
import { JsonParser } from "./utils";

// ─── Review result types & parsing ──────────────────────────────────────────

/** Review issue from the /review skill JSON output. */
export interface ReviewIssue {
  review_issue_number: number;
  screenshot_path: string;
  issue_description: string;
  issue_resolution: string;
  issue_severity: "blocker" | "tech_debt" | "skippable";
}

/** Parsed review result from /review skill. */
export interface ReviewResult {
  success: boolean;
  review_summary?: string;
  review_issues: ReviewIssue[];
  screenshots?: string[];
}

/**
 * Parse review result JSON from the /review skill output.
 * Returns a safe default with a blocker issue on empty or unparseable input.
 */
export function parseReviewResult(raw: string | undefined): ReviewResult {
  if (!raw) {
    return {
      success: false,
      review_issues: [
        {
          review_issue_number: 1,
          screenshot_path: "",
          issue_description: "Review returned no output",
          issue_resolution: "Re-run review",
          issue_severity: "blocker",
        },
      ],
    };
  }

  try {
    return JsonParser.parse<ReviewResult>(raw);
  } catch (e) {
    return {
      success: false,
      review_issues: [
        {
          review_issue_number: 1,
          screenshot_path: "",
          issue_description: `Failed to parse review result: ${e}`,
          issue_resolution: "Fix review output format",
          issue_severity: "blocker",
        },
      ],
    };
  }
}

/**
 * Extract a verdict from a parsed review result.
 * - PASS: no issues or only skippable/tech_debt issues
 * - FAIL: at least one blocker issue
 * - PASS_WITH_ISSUES: success but has non-blocker issues
 */
export function extractReviewVerdict(result: ReviewResult): { ok: boolean; verdict: string } {
  const blockerCount = result.review_issues.filter(
    (i) => i.issue_severity === "blocker"
  ).length;

  if (result.success && blockerCount === 0) {
    const hasIssues = result.review_issues.length > 0;
    return { ok: true, verdict: hasIssues ? "PASS_WITH_ISSUES" : "PASS" };
  }

  if (blockerCount > 0) {
    return { ok: false, verdict: "FAIL" };
  }

  // success is false but no blockers — trust the issue list over the flag
  return { ok: true, verdict: "PASS_WITH_ISSUES" };
}

/**
 * Extract screenshot artifacts and visual_validation status from a review result.
 * Screenshots are built from the review_issues screenshot_path fields and the
 * top-level screenshots array. visual_validation is derived from whether
 * screenshots were attempted and whether any failed.
 */
export function extractScreenshots(
  result: ReviewResult,
  screenshotUrl?: string,
): { visual_validation: "passed" | "failed" | "skipped"; screenshots: Screenshot[] } {
  const screenshots: Screenshot[] = [];

  // Collect from top-level screenshots array
  if (result.screenshots?.length) {
    for (const path of result.screenshots) {
      const name = path.split("/").pop()?.replace(/\.\w+$/, "") ?? "screenshot";
      screenshots.push({ name, url: screenshotUrl ?? "", path });
    }
  }

  // Collect from individual review issues
  for (const issue of result.review_issues) {
    if (issue.screenshot_path) {
      screenshots.push({
        name: `issue_${issue.review_issue_number}`,
        url: screenshotUrl ?? "",
        path: issue.screenshot_path,
      });
    }
  }

  // No screenshots at all → skipped (backend-only or no visual validation attempted)
  if (screenshots.length === 0) {
    return { visual_validation: "skipped", screenshots: [] };
  }

  // Has screenshots — check if any blocker issues reference them (visual failure)
  const hasVisualBlocker = result.review_issues.some(
    (i) => i.issue_severity === "blocker" && i.screenshot_path,
  );

  return {
    visual_validation: hasVisualBlocker ? "failed" : "passed",
    screenshots,
  };
}