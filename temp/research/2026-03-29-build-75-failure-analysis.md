---
date: 2026-03-29T07:30:00+02:00
researcher: Claude
git_commit: 86fb557
branch: main
repository: babylon
topic: 'Why build 75_ralph_d23eafca fails on trivial poll close feature'
tags: [research, pipeline, postcondition, build-failure]
status: complete
last_updated: 2026-03-29
last_updated_by: Claude
---

# Research: Build 75 Failure Analysis

## Research Question

Why are these incredibly simple builds failing? The poll close/archive feature (#76, #77) is trivial — what's going wrong?

## Summary

**The builds aren't failing because of anything #76 does.** They fail because `main` has pre-existing compile errors from the #68 build that were merged without fixing. The new `code-must-compile` postcondition (added in the quality loop work) is doing exactly what it's supposed to — catching errors that the old pipeline missed. The irony: the quality loop improvements are working perfectly, but they're now blocking all future builds until the legacy errors are fixed.

## Root Cause

Two pre-existing type errors in `apps/web/src/routes/test/+page.svelte`:

1. **`useMutation` not exported from `convex-svelte`** (line 5) — `convex-svelte` doesn't export `useMutation`. This was introduced in commit `2b9e06f` (issue #70 TDD, build #68) and cascaded through #72-#74 reviews.

2. **`string` not assignable to `Id<"testPollTable">`** (line 101) — poll ID passed as raw string instead of typed Convex ID.

These errors exist on `main` right now. Running `bun run check` on a clean main checkout reproduces them immediately.

## Build Timeline

| Time | Event | Details |
|------|-------|---------|
| 04:53:53 | Iteration 1 starts | Selects #76 (only unblocked issue) |
| 04:55:19 | Consult passes | Expert guidance correct |
| 04:58:57 | TDD reports success | "all 19 tests passing" — but tests are Convex backend tests, not type checks |
| 04:59:02 | **code-must-compile FAILS** | `bun run check` catches `useMutation` error in `+page.svelte` |
| 04:59:02 | #76 skipped (attempt 1/2) | |
| 05:00:36 | Iteration 2 consult | Re-consults for #76 |
| 05:01:27 | TDD reports "already implemented" | Sees prior work, reports pass |
| 05:01:32 | **code-must-compile FAILS again** | Same pre-existing errors |
| 05:01:32 | #76 skipped (attempt 2/2) | Max retries exhausted |
| 05:01:33 | Iteration 3 | All unblocked issues exhausted |
| 05:01:38 | Pipeline exits | 0 issues completed, $1.07 spent |

## Why TDD Says "Pass" But Postcondition Says "Fail"

The TDD step runs Convex backend tests (`convex/testPollMutation.test.ts`) — these test database mutations in isolation via `convex-test`. They pass because the backend code is correct.

The `code-must-compile` postcondition runs `bun run check` which runs `turbo run check` → `svelte-check` across all apps. This catches TypeScript/Svelte type errors in `apps/web/` — a completely different layer that the backend tests don't touch.

The #76 issue is backend-only (schema + mutation). It doesn't touch `+page.svelte` at all. But the postcondition checks the entire project, not just the changed files.

## The Catch-22

1. Build #68 introduced `useMutation` errors in `+page.svelte` and merged them to main
2. The quality loop was added to prevent this from happening again
3. Now the quality loop blocks ALL future builds because main doesn't compile
4. The pipeline can't fix the pre-existing errors because #76 is a backend issue — it shouldn't be touching the frontend

## Code References

- `apps/web/src/routes/test/+page.svelte:5` — `useMutation` import (introduced by `2b9e06f`, issue #70)
- `apps/web/src/routes/test/+page.svelte:101` — `string` vs `Id<"testPollTable">` type mismatch
- `adws/src/step-runner.ts:130-141` — `code-must-compile` postcondition implementation
- `temp/builds/75_ralph_d23eafca/execution.log` — full build log

## Architecture Documentation

The `code-must-compile` postcondition runs a project-wide check (`bun run check` → `turbo run check`), not a scoped check on changed files only. This means any pre-existing compile error anywhere in the monorepo will block all pipeline builds, even if the current issue doesn't touch the broken files.

## Open Questions

1. Should the pipeline fix pre-existing errors before starting new work? (A "heal main" step?)
2. Should `code-must-compile` be scoped to only check files/packages touched by the current issue?
3. Should there be a "main health check" gate that runs before the pipeline starts, with a different remediation path?
