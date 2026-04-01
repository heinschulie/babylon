/**
 * Utilities for the verify pipeline step.
 *
 * Extracts [Frontend] behaviors from issue bodies, filters to visually-verifiable
 * ones, and builds bowser-qa checklist prompts.
 */

/** Visual keywords that indicate a behavior can be verified by looking at the page. */
const VISUAL_KEYWORDS = [
  "renders", "displays", "shows", "appears", "visible",
  "expanded", "collapsed", "hidden", "styled", "layout",
  "color", "size", "position", "animation", "hover",
  "highlighted", "selected", "disabled", "enabled",
];

/** Wiring keywords that indicate a behavior is not visually verifiable. */
const WIRING_KEYWORDS = ["calls", "mutation", "wiring", "fires", "triggers query", "invokes"];

/**
 * Extract [Frontend] behaviors from the issue body's "Behaviors to Test" section.
 * Matches numbered lines containing [Frontend].
 */
export function extractFrontendBehaviors(issueBody: string): string[] {
  if (!issueBody) return [];

  // Find the "Behaviors to Test" section (case-insensitive)
  const sectionMatch = issueBody.match(
    /#+\s*Behaviors?\s*to\s*Test\s*\n([\s\S]*?)(?=\n#+\s|\n---|\n\*\*\*|$)/i,
  );
  if (!sectionMatch) return [];

  const section = sectionMatch[1];
  const behaviors: string[] = [];

  // Match numbered lines containing [Frontend]
  const lines = section.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    // Match: "1. [Frontend] ..." or "- [Frontend] ..." or "1) [Frontend] ..."
    if (/^(\d+[\.\)]\s*|-\s*)\[Frontend\]/i.test(trimmed)) {
      // Extract the behavior text after the [Frontend] tag
      const behaviorMatch = trimmed.match(/\[Frontend\]\s*(.+)/i);
      if (behaviorMatch) {
        behaviors.push(behaviorMatch[1].trim());
      }
    }
  }

  return behaviors;
}

/**
 * Filter behaviors to only visually-verifiable ones.
 * Keeps behaviors containing visual keywords, excludes pure wiring behaviors.
 */
export function filterVisualBehaviors(behaviors: string[]): string[] {
  return behaviors.filter((b) => {
    const lower = b.toLowerCase();
    const hasVisual = VISUAL_KEYWORDS.some((kw) => lower.includes(kw));
    const isWiring = WIRING_KEYWORDS.some((kw) => lower.includes(kw));
    // Keep if it has visual keywords, or if it doesn't match wiring keywords
    // (default to including ambiguous behaviors)
    if (isWiring && !hasVisual) return false;
    return true;
  });
}

/**
 * Build a bowser-qa checklist prompt from filtered behaviors.
 */
export function buildVerifyPrompt(
  behaviors: string[],
  pageUrl: string,
  screenshotDir: string,
): string {
  const checklist = behaviors.map((b) => `- [ ] ${b}`).join("\n");

  return `Navigate to ${pageUrl}.
For each behavior below, verify it visually. Screenshot each check.
Save screenshots to ${screenshotDir}.

Checklist:
${checklist}

Report pass/fail per behavior.`;
}
