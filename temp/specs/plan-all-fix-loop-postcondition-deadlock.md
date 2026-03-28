# Plan: Fix loop runner postcondition deadlock

## Metadata

adw_id: `all`
prompt: `Write all recommended fixes for the loop runner postcondition deadlock bug`
conversation_id: `session-2026-03-28-ralph-postcondition-deadlock`
task_type: fix
complexity: medium

## Task Description

The ralph loop runner enters an infinite retry cycle when a step has both `commitAfter: true` and `postcondition: "head-must-advance"`. The postcondition check runs **before** `commitAfter`, so when the TDD agent edits files but doesn't internally commit, the postcondition fails, which sets `result.success = false`, which prevents `commitAfter` from firing. The issue stays open and gets re-selected indefinitely.

Observed: issue #67 was retried 8+ times across ~25 minutes, burning ~$2.80 in API costs with zero progress.

## Objective

Eliminate the deadlock so that:
1. Steps with `commitAfter: true` can pass `head-must-advance` via their own commit mechanism
2. Issues that repeatedly fail are excluded after a configurable retry limit
3. The loop terminates deterministically when no forward progress is possible

## Problem Statement

Three compounding bugs:

1. **Chicken-and-egg ordering** (`step-runner.ts:200-218`): Postcondition fires at line 200, `commitAfter` fires at line 209. Postcondition sets `result.success = false`, so the commit guard `if (step.commitAfter && result.success)` is never true.

2. **No per-issue retry limit** (`loop-runner.ts:114-236`): `skippedIssues` is an append-only array. The loop never checks "have I already skipped this issue N times?" before re-selecting it.

3. **Skipped issues not excluded from selection** (`loop-runner.ts:136`): `filterUnblockedIssues` only considers `closedNumbers`. A skipped issue remains open and unblocked, so it's immediately re-eligible.

## Solution Approach

Three independent, layered fixes — each addresses one bug, and together they make the system robust against both this specific failure and future variants.

## Relevant Files

- `adws/src/step-runner.ts` — Postcondition check and commitAfter ordering (Fix 1)
- `adws/src/loop-runner.ts` — Iteration loop, issue selection, skip tracking (Fixes 2 & 3)
- `adws/tests/step-runner.test.ts` — Existing postcondition and commitAfter tests
- `adws/tests/loop-runner.test.ts` — Existing loop iteration and skip tests

## Implementation Phases

### Phase 1: Fix the ordering bug (root cause)

Reorder `step-runner.ts` so `commitAfter` runs before postcondition check. This is the minimal fix that would have prevented the original incident.

### Phase 2: Add per-issue retry limit (safety net)

Track skip counts per issue in the loop runner. After N failures on the same issue, mark it exhausted and exclude from future selection.

### Phase 3: Tests for all three fixes

Add targeted tests that reproduce each bug and verify the fix.

## Step by Step Tasks

### 1. Reorder commitAfter before postcondition in step-runner.ts

In `adws/src/step-runner.ts`, swap the order of the postcondition block (lines 199-206) and the commitAfter block (lines 208-218). The new flow:

```
execute step
  → commitAfter (if step.commitAfter && result.success, stage+commit)
  → postcondition check (now sees the commit that commitAfter made)
  → onFail routing
```

Specifically:
- Move lines 208-218 (commitAfter block) to directly after the executor `try/catch` (before the postcondition block)
- The postcondition block stays structurally the same, it just runs after commitAfter now
- The commitAfter guard remains `result.success` (pre-postcondition success from the executor)

### 2. Add per-issue skip tracking + exhaustion to loop-runner.ts

- Add a `skipCounts: Map<number, number>` initialized before the main loop
- Add a `const MAX_SKIP_PER_ISSUE = 2` constant (or add to LoopConfig)
- After each skip (both `skipped` and halted paths), increment the count for that issue
- Before issue selection, filter out issues whose skip count has reached the max
- Log when an issue is exhausted: `logger.warn(#N exhausted after N retries)`

Changes to `loop-runner.ts`:
- Add `skipCounts` map at line ~80 alongside `completedIssues` and `skippedIssues`
- After `filterUnblockedIssues` (line 136), filter `unblocked` to exclude exhausted issues
- In the skip/halt handlers (lines 227-235), increment skip count

### 3. Add tests for the ordering fix (step-runner.test.ts)

Add test: **"commitAfter + head-must-advance — commit happens, postcondition passes"**
- Mock `getHeadSha` to return same SHA for pre-step and postcondition-pre-commit calls
- Mock `commitChanges` to succeed (simulating that files were staged+committed)
- Mock `getHeadSha` post-commit to return a new SHA
- Step config: `{ commitAfter: true, postcondition: "head-must-advance" }`
- Assert: `result.ok === true`, `commitChanges` was called

Add test: **"commitAfter + head-must-advance — no file changes, postcondition still fails"**
- Mock `getHeadSha` to return same SHA throughout (no changes at all)
- Step config: `{ commitAfter: true, postcondition: "head-must-advance" }`
- Assert: `result.ok === false`, error contains "HEAD did not advance"
- This verifies we didn't accidentally make the postcondition always pass

### 4. Add tests for per-issue exhaustion (loop-runner.test.ts)

Add test: **"issue exhausted after MAX_SKIP_PER_ISSUE retries — excluded from selection"**
- Mock `fetchSubIssues` to always return one open issue
- Mock `runPipeline` to always return `{ ok: false, skipped: true }`
- Set `maxIterations: 5`
- Assert: `runPipeline` called exactly `MAX_SKIP_PER_ISSUE` times (2), not 5
- Assert: loop terminates because no unblocked+non-exhausted issues remain

Add test: **"exhausted issue doesn't block other issues"**
- Mock 2 open issues: #10 (will be skipped) and #11 (will succeed)
- Mock `runPipeline` to fail for #10, succeed for #11
- Assert: #10 gets retried up to MAX_SKIP_PER_ISSUE times, then excluded
- Assert: #11 still gets selected and completed

### 5. Validate

- Run `npx vitest run` from `adws/` — all tests pass
- Verify no regressions in existing postcondition tests (lines 246-301 of step-runner.test.ts)
- Verify existing loop-runner tests still pass (especially "max iterations reached" test)

## Testing Strategy

All fixes are testable with existing mock infrastructure:

**Fix 1 (ordering):** The `getHeadSha` mock in step-runner.test.ts already supports call-count-based return values. Need to simulate: same SHA before step → same SHA at commitAfter check (triggers commit of dirty files) → different SHA after commit → postcondition passes.

**Fix 2+3 (exhaustion):** The loop-runner tests already mock `runPipeline` return values and `fetchSubIssues`. Add a test where the same issue is returned on every `fetchSubIssues` call but `runPipeline` always returns skipped. Assert the pipeline is called exactly `MAX_SKIP_PER_ISSUE` times.

Edge cases to cover:
- Step with `commitAfter: false` + `postcondition: head-must-advance` — unchanged behavior (step itself must commit)
- Step with `commitAfter: true` + `postcondition: null` — unchanged behavior (no postcondition check)
- Issue exhausted on first attempt vs. second attempt
- Mix of exhausted and completable issues in same loop

## Acceptance Criteria

- [ ] `commitAfter` runs before postcondition check in step-runner.ts
- [ ] Per-issue skip count tracked; issues excluded after MAX_SKIP_PER_ISSUE (default 2) retries
- [ ] New step-runner tests cover the `commitAfter + head-must-advance` interaction
- [ ] New loop-runner tests cover issue exhaustion and mixed exhausted/completable scenarios
- [ ] All existing tests pass without modification
- [ ] No changes to pipeline.ts, ralph-pipeline.ts, or ralph-executor.ts

## Validation Commands

- `cd adws && npx vitest run` — Run all adws tests
- `cd adws && npx vitest run tests/step-runner.test.ts` — Step runner tests only
- `cd adws && npx vitest run tests/loop-runner.test.ts` — Loop runner tests only

## Notes

- The `commitAfter` reorder is safe because `commitChanges` in git-ops.ts already handles the "nothing to commit" case (returns early if no changes)
- MAX_SKIP_PER_ISSUE = 2 is conservative. If a step fails twice on the same issue with the same error, a third attempt is almost certainly wasted tokens
- The `getHeadSha` mock in step-runner.test.ts uses a call-count pattern — the new tests need to carefully manage the count to simulate pre-step, post-commit, and postcondition-check calls in the right order
- Future enhancement (not in scope): add a `noChangesNeeded` flag to `StepExecutorResult` so the TDD executor can explicitly signal "already complete" — but the ordering fix + exhaustion limit make this unnecessary for now
