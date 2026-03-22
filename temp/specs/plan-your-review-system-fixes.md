# Plan: Review System Fixes

## Metadata
adw_id: `your`
prompt: `Fix review command/ADW issues: missing prepare_app ref, ignored review verdicts, duplicated parsing, inconsistent patterns`
task_type: refactor
complexity: medium

## Task Description
The `/review` command and its ADW workflow consumers have several issues:
1. `review.md` references a `prepare_app.md` that needs validation against actual repo setup
2. Compound workflows (`plan_build_review`, `plan_build_test_review`, `sdlc`) ignore the review verdict — always return `true` / `ok: true` even when blockers exist
3. Review result parsing logic is copy-pasted across 4 workflows instead of being shared
4. The `prepare_app.md` command references scripts (`reset_db.sh`, `start.sh`, `stop_apps.sh`) that don't exist in `scripts/`

## Objective
- Review verdict is respected in all compound workflows (exit code + status reflect blockers)
- Review parsing logic is extracted into a shared utility
- `prepare_app.md` references real scripts/commands or is updated to match the actual dev setup
- `review.md` Setup section aligns with `prepare_app.md`

## Problem Statement
Compound workflows that include a review step always report success regardless of review outcome. This means blocker issues found during review are logged but don't affect the workflow's exit code or status file — defeating the purpose of the review step. Additionally, identical review-parsing code is duplicated across 4 files, making maintenance error-prone.

The `prepare_app.md` command references `scripts/reset_db.sh`, `scripts/start.sh`, and `scripts/stop_apps.sh`, none of which exist. The actual dev commands are `bun run dev` (via justfile/package.json). This means Playwright-based UI review will fail at the Setup step.

## Solution Approach
1. Extract `parseReviewResult()` and `extractReviewVerdict()` into `adws/src/utils.ts` — this is the right home since `parseJson` already lives there and it's the shared utility module for all workflows.
2. Update compound workflows to import and use the shared functions, and use the verdict to set `ok` and the return value.
3. Fix `prepare_app.md` to use actual project commands (`bun run dev`, Convex backend via `npx convex dev`).
4. Ensure `review.md` Setup section is consistent with the updated `prepare_app.md`.

## Relevant Files

- **`adws/src/utils.ts`** — destination for extracted shared review parsing logic
- **`adws/workflows/adw_review.ts`** — has the canonical `parseReviewResult()` to extract from
- **`adws/workflows/adw_plan_build_review.ts`** — needs verdict-aware return + shared parsing
- **`adws/workflows/adw_plan_build_test_review.ts`** — same fixes
- **`adws/workflows/adw_sdlc.ts`** — same fixes (lines 265-284 duplicated parsing, line 345 hardcoded `return true`)
- **`.claude/commands/review.md`** — Setup section references `prepare_app.md`
- **`.claude/commands/prepare_app.md`** — references nonexistent scripts, needs rewrite
- **`justfile`** — reference for actual dev commands

## Implementation Phases

### Phase 1: Shared Utilities
Extract review parsing into `adws/src/utils.ts` so all workflows can import it.

### Phase 2: Workflow Fixes
Update all 4 compound workflows to use shared parsing and respect the verdict.

### Phase 3: Command Fixes
Fix `prepare_app.md` to match actual repo setup. Verify `review.md` is consistent.

## Step by Step Tasks

### 1. Extract review parsing into `adws/src/utils.ts`

- Add `ReviewIssue` and `ReviewResult` interfaces (move from `adw_review.ts`)
- Add `parseReviewResult(raw: string | undefined): ReviewResult` function (move from `adw_review.ts`)
- Add `extractReviewVerdict(result: ReviewResult): { ok: boolean; verdict: string }` helper that:
  - Returns `{ ok: true, verdict: "PASS" }` when `result.success === true`
  - Returns `{ ok: false, verdict: "FAIL" }` when there are blocker issues
  - Returns `{ ok: true, verdict: "PASS_WITH_ISSUES" }` when there are only skippable/tech_debt issues
- Export all of the above

### 2. Update `adw_review.ts` to import shared utilities

- Remove local `ReviewIssue`, `ReviewResult` interfaces — import from `../src/utils`
- Remove local `parseReviewResult` function — import from `../src/utils`
- Verify behavior is unchanged (it already uses the verdict correctly)

### 3. Update `adw_plan_build_review.ts`

- Import `parseReviewResult`, `extractReviewVerdict`, `ReviewResult` from `../src/utils`
- Remove the inline verdict extraction block (lines 216-234)
- Replace with: `const parsedReview = parseReviewResult(reviewResult.result)` then `const { ok: reviewOk, verdict } = extractReviewVerdict(parsedReview)`
- Change `writeWorkflowStatus` to use `ok: reviewOk` instead of `ok: true`
- Change `return true` to `return reviewOk`
- Keep the `postReviewToIssue` call using `parsedReview`

### 4. Update `adw_plan_build_test_review.ts`

- Same changes as step 3

### 5. Update `adw_sdlc.ts`

- Same changes as step 3 (the review step at lines 265-284)
- Note: document step is non-fatal and comes after review — keep that. But the workflow's final `ok` should reflect the review verdict.
- Change `ok: true` → `ok: reviewOk` in `writeWorkflowStatus`
- Change `return true` → `return reviewOk`

### 6. Fix `prepare_app.md`

- Remove references to nonexistent scripts (`reset_db.sh`, `start.sh`, `stop_apps.sh`)
- Replace with actual project commands:
  - Dev server: `bun run dev` (SvelteKit on port 5173)
  - Convex backend: `npx convex dev` (if not already running)
  - Or just `just dev` which runs both
- Keep the `.ports.env` awareness for worktree environments
- Note: This is a Convex-backed app with no local DB to reset — remove the DB reset step entirely. Convex is a hosted service.

### 7. Verify `review.md` Setup section consistency

- Confirm the `Execute .claude/commands/prepare_app.md` reference resolves correctly now
- Ensure the port/URL instructions match `prepare_app.md`

### 8. Validate

- Run `bun run check` to ensure no TypeScript errors across the monorepo
- Verify imports resolve: `cd adws && bun build --no-bundle src/utils.ts` (or similar)
- Grep for any remaining inline `parseReviewResult` or duplicated verdict extraction blocks

## Testing Strategy
- TypeScript compilation check (`bun run check`)
- Verify no remaining duplicated review parsing code via grep
- Dry-run: confirm `adw_review.ts` still parses the same JSON correctly with the shared function
- Spot-check that all 4 workflow files import from `../src/utils`

## Acceptance Criteria
- `ReviewIssue`, `ReviewResult`, `parseReviewResult`, `extractReviewVerdict` all live in `adws/src/utils.ts`
- Zero duplicated review parsing logic across workflow files
- All 4 compound workflows that include review (`plan_build_review`, `plan_build_test_review`, `sdlc`, `review`) use shared utilities
- `plan_build_review`, `plan_build_test_review`, and `sdlc` workflows return `false` and write `ok: false` when review finds blockers
- `prepare_app.md` references real commands that work in this repo
- `review.md` Setup section is consistent with `prepare_app.md`
- `bun run check` passes

## Validation Commands

- `bun run check` — TypeScript type checking across all packages
- `grep -rn "parseReviewResult" adws/` — should only appear in `src/utils.ts` (definition) and as imports
- `grep -rn "ok: true" adws/workflows/adw_plan_build_review.ts adws/workflows/adw_plan_build_test_review.ts adws/workflows/adw_sdlc.ts` — should be zero matches (replaced with `ok: reviewOk`)
- `grep -rn "return true" adws/workflows/adw_plan_build_review.ts adws/workflows/adw_plan_build_test_review.ts adws/workflows/adw_sdlc.ts` — should be zero matches

## Notes
- `adws/src/utils.ts` is the right place for shared logic because it already houses `parseJson` (which `parseReviewResult` depends on) and is the established utility module imported by all workflows.
- The `extractReviewVerdict` helper is intentionally separate from `parseReviewResult` to keep parsing and decision-making decoupled — workflows that want custom verdict logic can still use just the parser.
- `prepare_app.md` should be minimal — this repo uses Convex (hosted DB) so there's no local DB reset. The only setup is starting the SvelteKit dev server.

## Unresolved Questions
- Should compound workflows with review blockers still post the review to GitHub before returning false, or bail immediately? (Current plan: post then return false)
- Should `adw_sdlc.ts` skip the document step if review has blockers? (Current plan: no — document is independent, keep running it even if review found blockers, but final status reflects review verdict)
