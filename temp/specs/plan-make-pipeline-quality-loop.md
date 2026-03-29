# Plan: Pipeline Quality Loop — TDD Postconditions + Review Sub-Issues + Observability

## Metadata

adw_id: `make`
prompt: `Implement pipeline quality improvements from grill-me findings`
conversation_id: `55fe7a3-grill-me-2026-03-28`
task_type: enhancement
complexity: complex

## Task Description

The ralph pipeline produces code that passes string-based TDD tests but fails at runtime. Reviews catch the failures but the pipeline closes issues regardless. The learning file accumulates duplicates without traceability. This plan addresses all three layers: test fidelity, feedback loop, and observability.

## Objective

After this plan is complete:
1. TDD step guarantees code compiles (`bun run check`) and renders (GET tunnel URL returns 200)
2. Review step creates scoped sub-issues on FAIL verdict, inheriting the original issue's dependency position
3. Learnings are deduplicated at write time and traceable to their source step
4. state.json provides a glanceable quality summary
5. Empty TDD summaries are flagged, consult filler is warned

## Problem Statement

Build 68_ralph_18c66a07 completed 6 issues with 0/6 reviews passing. The `useMutation` import error was introduced in #70 TDD, cascaded through #72-#74 reviews, and produced 4 duplicate learnings. The top-level status was "pass" despite every review failing. Root cause: TDD tests are `fs.readFileSync` + `toContain` (string matching, not compilation), and the pipeline has no feedback loop from review failures.

## Solution Approach

Three layers, dependency-ordered:

1. **TDD postconditions** — add `code-must-compile` and `page-must-load` postconditions to the TDD step. These use existing infrastructure (`bun run check`, `DEV_TUNNEL_URL` from `.env.local`).
2. **Review sub-issue creation** — when review verdict is FAIL, create GitHub sub-issues describing specific defects, link them as blockers for downstream issues, and close the original issue. The pipeline picks up sub-issues in subsequent iterations.
3. **Observability polish** — dedup learnings at write time, add traceability fields, enrich state.json with quality summary, warn on empty summaries and consult filler.

## Relevant Files

- `adws/src/pipeline.ts` — PostconditionSchema enum (add new postcondition types)
- `adws/src/step-runner.ts:103-133` — `checkPostcondition()` (add new postcondition checks)
- `adws/src/ralph-pipeline.ts` — RALPH_PIPELINE definition (update TDD postconditions)
- `adws/src/ralph-executor.ts:76-112` — review step executor (add sub-issue creation on FAIL)
- `adws/src/loop-runner.ts:234-252` — issue lifecycle (handle sub-issue dependency inheritance)
- `adws/src/learning-utils.ts:91-123` — `recordLearning()` (add dedup + traceability)
- `adws/src/review-utils.ts` — `ReviewLearning` interface (add source fields)
- `adws/src/logger.ts:227-267` — `writeWorkflowStatus()` (add quality summary)
- `adws/src/state.ts` — ADWState class (enrich state.json)
- `adws/src/schemas.ts` — ADWStateDataSchema (add new fields)
- `adws/src/github.ts:214-297` — `createSubIssue()` (already exists, reuse for review sub-issues)
- `adws/src/agent-sdk.ts:63-87` — `extractStepSummary()` (fix empty summary fallback)
- `.env.local` — DEV_TUNNEL_URL (`https://dev.schulie.com`)

### New Files

- `adws/tests/postcondition.test.ts` — tests for new postcondition types
- `adws/tests/learning-dedup.test.ts` — tests for dedup logic

## Implementation Phases

### Phase 1: TDD Postconditions (Foundation)

Add two new postcondition types that guarantee TDD output compiles and renders. These use existing infrastructure and require no new dependencies.

### Phase 2: Review Sub-Issue Creation (Core Loop)

Wire review FAIL verdicts to create scoped GitHub sub-issues that inherit the original issue's blocker position. This closes the feedback loop.

### Phase 3: Observability Polish (Quality of Life)

Dedup learnings, add traceability, enrich state.json, fix empty summaries, warn on consult filler. These are independent improvements.

## Step by Step Tasks

### 1. Add new postcondition types to pipeline schema

- In `adws/src/pipeline.ts:23`, extend `PostconditionSchema` enum to include `"code-must-compile"` and `"page-must-load"`
- The schema change is: `z.enum(["head-must-advance", "result-must-parse", "code-must-compile", "page-must-load"])`

### 2. Implement postcondition checks in step-runner

- In `adws/src/step-runner.ts`, add cases to `checkPostcondition()` (after line 133):
- `"code-must-compile"`: run `bun run check` in `cwd`, return `{ ok: false, error: stderr }` if exit code != 0
- `"page-must-load"`: read `DEV_TUNNEL_URL` from `.env.local`, GET `{DEV_TUNNEL_URL}/test`, return `{ ok: false, error: "page returned {status}" }` if status != 200. Use a 10s timeout. If `DEV_TUNNEL_URL` is not set, skip with `{ ok: true }` (graceful degradation for environments without tunnel)

### 3. Update TDD step definition in ralph-pipeline

- In `adws/src/ralph-pipeline.ts`, change TDD step's `postcondition` from `"head-must-advance"` to an array approach OR chain postconditions
- Since the schema currently supports a single postcondition (nullable string), two options:
  - **Option A**: Change schema to `z.union([PostconditionSchema, z.array(PostconditionSchema)]).nullable()` and update `checkPostcondition` to iterate
  - **Option B**: Create a composite postcondition `"tdd-frontend-gate"` that runs all three checks internally
- **Recommended: Option A** — it's general-purpose and any future step can use multiple postconditions
- TDD step becomes: `postcondition: ["head-must-advance", "code-must-compile", "page-must-load"]`

### 4. Write tests for new postconditions

- Create `adws/tests/postcondition.test.ts`
- Test `code-must-compile`: mock `Bun.spawn` for `bun run check`, assert pass/fail
- Test `page-must-load`: mock fetch for tunnel URL, assert 200 = pass, 500 = fail, missing URL = skip
- Test postcondition array iteration: assert all must pass, first failure short-circuits

### 5. Add review sub-issue creation on FAIL

- In `adws/src/ralph-executor.ts`, after the review step's learning capture (line ~104):
  - If `parsed.verdict === "FAIL"` and `parsed.review_issues` has blocker entries:
    - Build sub-issue body from review_issues: title = `Fix: {original_issue_title} — {first_blocker_description}`, body = structured markdown with blockers list, original issue ref, and the review's diagnostic output
    - Call `createSubIssue(context.issue.number, title, body, ["auto-fix", `complexity:${context.complexity}`])`
    - Add `"**Blocked by**: #{original_issue_number}"` blocker line matching the original issue's blockers (parsed from original issue body via `parseBlockers`)
    - Store created sub-issue numbers in `produces` as `reviewSubIssues: number[]`
  - Max 2 sub-issues per review failure (cap to prevent runaway creation)

### 6. Handle sub-issue dependency inheritance in loop-runner

- In `adws/src/loop-runner.ts`, after pipeline execution (line ~234):
  - If `pipelineResult.context.reviewSubIssues` exists and is non-empty:
    - The original issue's downstream dependents now depend on the sub-issues instead
    - Since blockers are parsed from issue bodies (`parseBlockers`), the sub-issue body already contains the right `**Blocked by**` line from step 5
    - Close the original issue with a comment linking to the created sub-issues: `"Resolved with known issues. Fix sub-issues: #X, #Y"`
    - Track in `completedIssues` so dependency filtering treats it as closed

### 7. Add learning deduplication at write time

- In `adws/src/learning-utils.ts`, modify `recordLearning()`:
  - Before appending, call `parseLearningsFile(filePath)` to get existing entries
  - Check for semantic overlap: same `tags` set (order-independent) AND Levenshtein similarity > 0.7 on `actual` field (or simpler: check if existing `actual` contains the new `actual`'s first 50 chars, or vice versa)
  - If match found: update existing entry's `confidence` to the higher value, add an `occurrences` field (default 1, increment on match), update `date` to latest
  - If no match: append as normal
- Add `occurrences` field to `LearningEntry` interface (optional, defaults to 1)

### 8. Add learning traceability fields

- In `adws/src/review-utils.ts`, add `source_step?: string` and `issue_number?: number` to `ReviewLearning` interface
- In `adws/src/learning-utils.ts`, add `source_step?: string` and `issue_number?: number` to `LearningEntry` interface
- In `adws/src/ralph-executor.ts` review step (line ~86-104), pass `source_step` (e.g., `"74_26_review"`) and `issue_number` from context when calling `recordLearning()`
- Update `formatLearningYaml()` to include the new fields

### 9. Fix empty TDD summary extraction

- In `adws/src/agent-sdk.ts:63-87`, `extractStepSummary()`:
  - After extraction, if `action` or `decision` is empty string, log a warning
  - Do NOT invent content — but set a flag in the summary: `action: "[summary not extracted]"` so status.json is never silently empty
  - This makes the gap visible in status.json without hiding it

### 10. Enrich state.json with quality summary

- In `adws/src/schemas.ts`, extend `ADWStateDataSchema` with optional fields:
  - `issues_processed?: { number: number; review_status: string; sub_issues_created?: number[] }[]`
  - `quality_summary?: { total: number; passed: number; failed: number; defects: string[] }`
  - `learning_file?: string`
- In `adws/src/state.ts`, add these to `CORE_FIELDS` set
- In `adws/src/loop-runner.ts`, before final `state.save()`:
  - Build `issues_processed` from `completedIssues` + `skippedIssues` arrays with their review verdicts
  - Build `quality_summary` by counting review pass/fail from step results
  - Set `learning_file` to `temp/learnings/{run_id}.md`

### 11. Enrich status.json with quality summary

- In `adws/src/logger.ts:227-267`, `writeWorkflowStatus()`:
  - After aggregating steps, scan for review steps and count verdicts
  - Add to `WorkflowStatus`:
    - `quality: { issues_reviewed: number, passed: number, failed: number, sub_issues_created: number }`
  - Change top-level `status` derivation: if any review verdict is FAIL, status is `"pass_with_issues"` (not `"pass"`)

### 12. Add consult filler warning

- In `adws/src/ralph-executor.ts` consult step (line ~37-52):
  - After getting `consultResult`, check if `expertAdvice` is substantive
  - Heuristic: if `expertAdvice.length < 100` or doesn't contain any of ["must", "should", "constraint", "pattern", "index", "validation"], log a warning: `"[consult] Expert advice appears to be filler — TDD step may lack guardrails"`
  - This is warn-only, not blocking (consult already has `onFail: "continue"`)

### 13. Write dedup tests

- Create `adws/tests/learning-dedup.test.ts`
- Test: two identical learnings → single entry with `occurrences: 2`
- Test: similar learnings (same tags, overlapping actual) → deduplicated
- Test: different learnings (different tags) → both kept
- Test: traceability fields round-trip through write/parse

### 14. Validate all changes

- Run `bun test` across adws/ to verify all existing + new tests pass
- Run `bun run check` to verify TypeScript compilation
- Manual smoke test: verify postcondition schema validates, learning dedup works on existing file

## Testing Strategy

- **Unit tests** for new postcondition types (mock shell execution and fetch)
- **Unit tests** for learning dedup (write/parse round-trip)
- **Integration test** for review sub-issue creation (mock GitHub API calls)
- **Existing test suite** must remain green — no breaking changes to pipeline types

## Acceptance Criteria

1. `PostconditionSchema` includes `"code-must-compile"` and `"page-must-load"`
2. TDD step in `RALPH_PIPELINE` uses all three postconditions
3. `checkPostcondition` handles arrays and all new types
4. Review FAIL verdict triggers `createSubIssue` with proper blocker lines
5. Loop runner closes original issue and links sub-issues
6. `recordLearning` deduplicates entries with same tags + similar actual
7. Learning entries include `source_step` and `issue_number` fields
8. `state.json` includes `issues_processed` and `quality_summary` after pipeline run
9. `status.json` includes `quality` summary and uses `"pass_with_issues"` when reviews fail
10. Empty TDD summaries show `"[summary not extracted]"` instead of blank
11. Consult step logs warning when advice is filler
12. All existing tests pass, all new tests pass

## Validation Commands

- `cd adws && bun test` — run all workflow tests
- `bun run check` — svelte-check type validation across all apps
- `cd adws && bun test postcondition` — run postcondition-specific tests
- `cd adws && bun test learning-dedup` — run dedup-specific tests

## Notes

- `DEV_TUNNEL_URL` is `https://dev.schulie.com` from `.env.local`. The page-must-load postcondition should read this at runtime, not hardcode it.
- The postcondition array change to the schema is the most invasive type change — it touches `StepDefinition`, `checkPostcondition`, and all validation code. Start here.
- `createSubIssue` in `github.ts` already handles GitHub sub-issue linking via GraphQL `addSubIssue` mutation — no new GitHub API code needed.
- The review sub-issue body must include a `**Blocked by**: #N` line matching the original issue's blockers for `parseBlockers()` + `filterUnblockedIssues()` to work correctly.
- Max 2 sub-issues per review prevents runaway creation. Pipeline max iterations (20) provides an outer bound.
- Learning dedup uses substring matching rather than Levenshtein to keep it lightweight — `recordLearning` is designed not to slow down the pipeline.
