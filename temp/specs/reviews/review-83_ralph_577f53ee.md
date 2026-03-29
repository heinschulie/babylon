# Build Review: 83_ralph_577f53ee — Poll Tagging, Emoji Streaks & Activity Feed

**Overall Score: C-**

**Build**: `577f53ee` | **Parent Issue**: #83 | **Duration**: 16m 47s | **Cost**: $2.95
**Result**: 0 issues completed, 4 attempts skipped, branch left with 29 type errors

## Context

Parent issue #83 decomposes into 6 sub-issues. Prior builds already completed #84 (tags+display), #86 (streaks), #87 (activity feed). This build targeted the two remaining open issues:

- **#89** (trivial): Replace `<span>` tag chips with shadcn Badge + remove duplicate `formatRelativeTime`
- **#85** (standard): Poll tag filtering + tag cloud UI

## Successes

- **Consult steps worked well** — all 4 consult runs passed, providing accurate expert guidance on Badge patterns, Svelte 5 reactivity, and Convex query conventions
- **Agent identified correct fixes** — TDD agents correctly identified what to change (Badge imports, formatRelativeTime dedup, tag filtering state) in all 4 attempts
- **Prior build foundation is solid** — #84, #86, #87 commits added real working backend code: `convex/testPollTags.ts`, `convex/testActivityFeed.ts`, `convex/testEmojiMutation.ts` with 332+312+179 test lines
- **Issue selection logic worked** — selector correctly prioritized #89 first (trivial), then fell back to #85

## Failures

- **All 4 TDD steps failed `code-must-compile` postcondition** — agent reported "pass" but `bun run check` found type errors every time
- **Svelte 5 reactivity pattern violation** — agent used `$derived(() => {})` instead of `$derived.by(() => {})` in `+page.svelte`, causing "not callable" errors on `moodCounts()`, `filteredEmojis()`, `moodSummary()`
- **Badge barrel export collision** — `packages/ui/src/index.ts` re-export of Badge created ambiguous module exports (Root, Content, etc. already exported from button/card/dialog)
- **Convex query type mismatch** — `FunctionReference` type error in conditional query usage (skip pattern)
- **Agent self-assessed as "pass" in 3/4 runs** — TDD agent did not run `bun run check` before reporting success, confirming the exact failure mode described in the plan we just fixed
- **$2.95 burned for zero progress** — entire budget wasted on attempts that each introduced the same class of errors
- **Broken commits accumulated on branch** — 4 commits with type errors now pollute `hein/feature/issue-83`

## Gaps

- [ ] **#89 unresolved**: Badge import still uses broken barrel export pattern. Need explicit re-export in `packages/ui/src/index.ts` to avoid ambiguity with button/card/dialog Root exports
- [ ] **#89 unresolved**: `formatRelativeTime` dedup not landed cleanly — changes reverted by postcondition failure
- [ ] **#85 unresolved**: Tag filtering UI not functional — `$derived` vs `$derived.by` pattern error persists across attempts
- [ ] **#85 unresolved**: Tag cloud section committed but type-broken — conditional Convex query (`listPolls` vs `listPollsByTag`) has `FunctionReference` type mismatch
- [ ] **Branch health**: 29 svelte-check errors + 25 warnings on `hein/feature/issue-83` — branch cannot be merged
- [ ] **No self-correction**: Agent never ran `bun run check` during TDD loop — the validation gate we just added to SKILL.md would have caught this

## Per-Section Scores

| Section | Score | Notes |
|---------|-------|-------|
| Issue Selection | A | Correct prioritization, clean fallback logic |
| Expert Consultation | A | All 4 consult steps passed with accurate, specific guidance |
| #89 TDD (attempt 1) | C- | Correct intent, wrong Badge export pattern, no type-check |
| #89 TDD (attempt 2) | C- | Same failure mode repeated — no learning between attempts |
| #85 TDD (attempt 1) | C | More ambitious work (50 turns, $1.28), but same `$derived` error |
| #85 TDD (attempt 2) | C | Self-reported "pass" with correct summary, but 29 type errors |
| Postcondition System | A | Correctly caught every broken commit — did its job |
| Overall Pipeline Health | C- | $2.95 spent, 0 issues closed, branch left broken |

## Root Cause Analysis

The build perfectly demonstrates the failure mode documented in `temp/research/2026-03-29-ralph-workflow-postcondition-failure-analysis.md`:

1. Agent completes work and reports "pass"
2. Step-runner commits the code
3. Postcondition (`code-must-compile`) runs and fails
4. Broken commit stays in git
5. `onFail: "skip-issue"` skips after 2 attempts
6. Agent never had a chance to self-correct because it had already exited

The fix we just applied (moving validation into the TDD skill + reducing postconditions to `head-must-advance`) directly addresses this. Had the updated SKILL.md been in effect, the agent would have been instructed to run `bun run check` and `bun run build` before reporting success, catching the `$derived.by` and Badge export issues in-loop.

## Recommendations

1. **Re-run #89 and #85** with the updated TDD skill (validation gate now in SKILL.md)
2. **Revert broken commits** on `hein/feature/issue-83` before re-attempting — the 4 latest commits have type errors
3. **Add `$derived.by` pattern** to frontend expert knowledge — this is a recurring Svelte 5 gotcha
4. **Fix Badge barrel export** in `packages/ui/src/index.ts` — needs explicit named re-exports to avoid collision with button/card/dialog
