---
date: 2026-03-30T00:00:00+02:00
researcher: Claude
git_commit: 5809f12
branch: main
repository: babylon
topic: 'Core purpose of the review step in the adw_ralph loop'
tags: [research, codebase, ralph, review, adw, pipeline]
status: complete
last_updated: 2026-03-30
last_updated_by: Claude
---

# Research: Core Purpose of the Review Step in adw_ralph

## Research Question

In the adw_ralph loop — what is the core purpose of the "review" step?

## Summary

The review step is the **4th and final step** in Ralph's `consult → tdd → refactor → review` pipeline. Its core purpose is **spec-compliance validation**: it compares the implementation (git diff) against the original issue/spec to determine whether what was built actually matches what was requested. It produces a structured verdict (PASS / PASS_WITH_ISSUES / FAIL), captures learnings for institutional memory, and — on FAIL — auto-creates blocker sub-issues that feed back into the next Ralph iteration.

## Detailed Findings

### 1. Pipeline Position and Configuration

**File:** `adws/src/ralph-pipeline.ts:49-59`

The review step is declared as the terminal step:

```ts
{
  name: "review",
  command: "/review",
  onFail: "skip-issue",
  produces: ["reviewResult", "learningEntry"],
  consumes: ["issue", "expertAdvice"],
  modelMap: { trivial: "default", standard: "default", complex: "opus" },
  commitAfter: false,
  timeout: 300_000,       // 5 minutes
  postcondition: "result-must-parse",
}
```

Key design choices:
- **`commitAfter: false`** — review is read-only, never modifies code
- **`onFail: "skip-issue"`** — if review itself errors, the issue is skipped (not retried)
- **`postcondition: "result-must-parse"`** — the only hard requirement is that the output is valid JSON
- **`consumes: ["issue", "expertAdvice"]`** — uses both the original issue and expert consultation context for informed review

### 2. What the Review Skill Actually Does

**File:** `.claude/commands/review.md`

The `/review` command performs five activities:

1. **Spec resolution** (lines 14-18): Resolves the authoritative spec from inline text, a file path, or a GitHub issue number. Explicitly forbids inferring the spec from branch names or commits.

2. **Frontend detection** (lines 19-21): Classifies changes as frontend or backend-only by examining the diff. Frontend changes require visual validation via Firecrawl screenshots; backend changes get code-only review.

3. **Diff analysis** (line 24): Runs `git diff origin/main` to see all changes on the branch.

4. **Screenshot capture** (lines 26-43): For frontend work, captures 1-5 targeted screenshots of critical functionality paths. Screenshots are numbered and stored in the review image directory.

5. **Structured verdict** (lines 50-99): Returns a JSON object with:
   - `success` (boolean) — true if no blockers
   - `verdict` — PASS / PASS_WITH_ISSUES / FAIL
   - `review_summary` — standup-style summary
   - `learnings[]` — tagged observations (expected vs. actual)
   - `review_issues[]` — each with severity (blocker / tech_debt / skippable)
   - `screenshots[]` — absolute paths to visual evidence

### 3. Post-Review Automation (Executor)

**File:** `adws/src/ralph-executor.ts:87-186`

After the review agent returns its JSON, the executor performs three automated actions:

#### a. Learning Capture (lines 100-122)
Persists structured learnings to the project's knowledge base. Tags are inferred from changed files (`inferTagsFromFiles`) or taken from the review output. This builds institutional memory across runs — each learning records context, expected behavior, actual behavior, and confidence.

#### b. Sub-Issue Creation on FAIL (lines 124-162)
When the verdict is FAIL:
- Extracts blocker-severity issues from the review
- Creates up to **2 sub-issues** per review (capped to prevent issue sprawl)
- Each sub-issue includes: original issue reference, severity, description, and resolution guidance
- Sub-issues are labeled `auto-fix` and linked to the parent PRD
- These sub-issues become input for the **next Ralph iteration**, creating a self-correcting feedback loop

#### c. GitHub Comment (lines 164-176)
Posts the review result (with screenshots) as a comment on the GitHub issue via `postReviewToIssue`, providing visibility to human stakeholders.

### 4. The Feedback Loop

The review step's most architecturally significant role is **closing the feedback loop**:

```
PRD → sub-issues → [consult → tdd → refactor → review]
                                                   ↓
                                            FAIL? → new sub-issues → next iteration
                                            PASS? → PR created, issue closed
```

When review creates `auto-fix` sub-issues, the loop-runner (`adws/src/loop-runner.ts`) picks them up in subsequent iterations. This means Ralph is self-correcting: review failures generate targeted fix tickets that Ralph itself will attempt to resolve.

## Code References

- `adws/src/ralph-pipeline.ts:49-59` — Review step declaration in pipeline
- `.claude/commands/review.md:1-110` — Full review skill definition
- `adws/src/ralph-executor.ts:87-186` — Review execution, learning capture, sub-issue creation
- `adws/src/review-utils.ts` — Review result parsing and verdict extraction
- `adws/src/learning-utils.ts` — Learning persistence utilities
- `adws/src/step-commands.ts:21-28` — Review command argument builder
- `adws/src/agent-sdk.ts:398-405` — Review step SDK runner

## Architecture Documentation

### Design Pattern: Structured Agent Output → Automated Side-Effects

The review step exemplifies a pattern used throughout Ralph: an LLM agent produces structured JSON output, and deterministic TypeScript code performs side-effects based on that output. The agent never creates issues or posts comments directly — it returns data, and the executor acts on it. This separation keeps agent behavior predictable and testable.

### Severity Model

Three tiers with distinct pipeline consequences:
- **blocker** → triggers sub-issue creation, sets `success: false`, verdict FAIL
- **tech_debt** → recorded but non-blocking, verdict PASS_WITH_ISSUES
- **skippable** → documented only, verdict PASS_WITH_ISSUES

### Timeout Constraint

The 300s (5-minute) timeout is a known bottleneck (per `project_ralph_v4_results.md` memory). Frontend reviews with Firecrawl screenshots are most at risk of timing out.

## Open Questions

- None for the stated research question.
