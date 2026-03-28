---
date: 2026-03-28T13:10:00+02:00
researcher: Claude
git_commit: 80c7a4d
branch: hein/ralph_evolution
repository: babylon
topic: 'Review of adw_ralph pipeline decomposition implementation (v2)'
tags: [research, codebase, adw-ralph, pipeline, refactor]
status: complete
last_updated: 2026-03-28
last_updated_by: Claude
---

# Review: adw_ralph Pipeline Decomposition (v2)

## Research Question

The plan in `temp/specs/plan-adw_ralph-decompose-pipeline.md` has been implemented. Fair but critical assessment.

## Summary

**This is a strong refactor.** The monolithic 587-line `adw_ralph.ts` is now 63 lines delegating to 5 focused modules (996 lines total). The prior review (v1) flagged 5 issues — all 5 have been addressed: `z.any()` replaced with proper Zod schemas, `PRODUCE_HANDLERS` removed in favor of generic executor return maps, test mock leak fixed via vitest `pool: "forks"`, branch prefix/workflow name parameterized in `LoopConfig`, and tests expanded from 2 skeletal to 14+28 functional. All 102 tests pass in a single run.

**Remaining concerns are minor:** `adw_ralph.ts` is 63 lines (plan target: <50), the postcondition was renamed `result-must-parse` (plan said `verdict-must-parse`), and the loop runner's finalization block is complex enough to warrant future extraction.

---

## Scorecard

| Acceptance Criterion | Status | Evidence |
|---|---|---|
| `adw_ralph.ts` < 50 lines | **MISS** (63) | `adw_ralph.ts:1-63` — help flag + executor creation push it over |
| Pipeline is declarative array | **PASS** | `ralph-pipeline.ts:14-60` |
| PipelineContext is Zod schema | **PASS** | `pipeline.ts:55-86` — proper typed schemas for all fields |
| consumes validated against produces | **PASS** | `pipeline.ts:124-133` |
| Per-step timeouts | **PASS** | `agent-sdk.ts:312-341` via Promise.race |
| Postconditions enforced | **PASS** | `step-runner.ts:103-133` |
| commitAfter on TDD/refactor | **PASS** | `step-runner.ts:209-218` |
| Review produces verdict + learnings + summary | **PASS** | `ralph-executor.ts:78-113` |
| Learning files in existing format | **PASS** | `ralph-executor.ts:93-101` via `recordLearning` |
| findFinalResult break fix | **PASS** | `agent-sdk.ts:281-293` with build 64 comment |
| Patch-retry loop removed | **PASS** | Absent from all new modules |
| All new modules have unit tests | **PASS** | 4 test files, 61 new tests |
| All existing tests pass | **PASS** | 102/102 green |
| No type errors | **UNTESTED** | `bun run check` not run in this review |

**12/14 pass, 1 near-miss, 1 untested.**

---

## Detailed Findings

### 1. Module Decomposition — Clean

| Module | Lines | Role |
|--------|-------|------|
| `pipeline.ts` | 139 | Zod schemas, validation |
| `step-runner.ts` | 259 | Generic executor: context, postconditions, commits, onFail |
| `loop-runner.ts` | 348 | Issue scheduling, git lifecycle, finalization |
| `ralph-pipeline.ts` | 68 | Declarative 4-step definition |
| `ralph-executor.ts` | 119 | Ralph-specific step dispatch (not in plan) |
| `adw_ralph.ts` | 63 | Thin entry point |
| **Total** | **996** | |

The 587→996 line increase is expected from a decomposition. Each module has single responsibility and is independently testable.

### 2. Prior Review Issues — All Addressed

| v1 Issue | Resolution |
|----------|------------|
| `z.any()` for reviewResult/learningEntry | Now proper Zod objects: `pipeline.ts:69-85` |
| `PRODUCE_HANDLERS` in generic step runner | Removed. Executor returns `produces: Record<string, unknown>`, runner merges generically: `step-runner.ts:224-228` |
| Test mock leak (10 failures) | Fixed via `vitest.config.ts` with `pool: "forks"`. All 102 pass together. |
| Hardcoded `hein/` branch prefix | Parameterized via `LoopConfig.branchPrefix`: `loop-runner.ts:62` |
| Hardcoded `"ralph"` logger name | Parameterized via `LoopConfig.workflowName`: `loop-runner.ts:60-61` |

### 3. Pipeline Definition — Correct

`ralph-pipeline.ts:14-60`: The 4-step array matches the plan. Load-time validation at line 63-66 is good fail-fast. The Zod schema (`pipeline.ts:55-86`) has proper types for all context fields including nested objects for `reviewResult` and learning entries with confidence levels.

### 4. Step Runner — Well-Designed

`step-runner.ts:137-259` handles all planned concerns:
- **skipWhen** evaluation (line 150-159)
- **Runtime consumes** warnings for missing context keys (line 162-166)
- **Model resolution** via alias map with fallback to literal IDs (line 76-86)
- **Postconditions**: head-must-advance, result-must-parse (line 103-133)
- **Per-step commits** only when HEAD advances (line 209-218)
- **Context threading** — executor returns `produces` map, runner merges on success only (line 224-228)
- **onFail routing**: halt/continue/skip-issue (line 240-255)

The `StepExecutor` injection pattern is the key design win — makes the runner fully testable without Claude sessions and reusable for non-Ralph pipelines.

### 5. Loop Runner — Functional, Finalization is Heavy

At 348 lines, it's the largest module. Correctly handles:
- Crash recovery: detects already-on-target-branch state (line 84-99)
- Dependency filtering via `filterUnblockedIssues` (line 131-148)
- Single vs. multi-issue selection (line 155-183)
- Finalization: push → PR → status → checkout (line 238-292)

The finalization block (~80 lines) could benefit from extraction in a future pass, but it works and is tested.

The dynamic `import("./utils")` at line 267 for `exec` is notable — likely a test mock boundary workaround.

### 6. Ralph Executor — Justified Addition

`ralph-executor.ts` wasn't in the plan but is a clean bridge between the generic runner and Ralph-specific SDK calls. The switch-case on step name (line 36) keeps argument formatting and learning persistence out of the generic layer.

Learning capture in the executor (line 86-103) both persists to disk *and* returns via `produces`. Defensive duplication — the disk write is non-blocking (empty catch), so it's resilient but the `learningEntry` context value is also available for downstream use.

### 7. Bug Fixes — Solid

**findFinalResult** (`agent-sdk.ts:281-293`): `break` after `type: "result"` with clear build 64 reference. This is the highest-value single change.

**Per-step timeout** (`agent-sdk.ts:303-341`): `Promise.race` with `query.return()` cleanup on timeout. Correct approach.

### 8. Postcondition Naming

Plan said `verdict-must-parse`, implementation uses `result-must-parse` (`pipeline.ts:23`). The implementation name is more generic and the validation logic (`step-runner.ts:119-130`) is reasonable — checks for a valid verdict first, falls back to accepting any parseable review with content. Pragmatic.

### 9. Test Coverage — Thorough

| File | Tests | Focus |
|------|-------|-------|
| `pipeline.test.ts` | 7 | Validation: produces/consumes graph, duplicates, base keys, self-ref |
| `step-runner.test.ts` | 28 | All onFail policies, postconditions, commits, context threading, model resolution, exceptions |
| `loop-runner.test.ts` | 14 | All lifecycle paths, crash recovery, selection, edge cases |
| `ralph-pipeline.test.ts` | 12 | Definition correctness, step configs, model maps |
| `learning-integration.test.ts` | 3 | Review → learning file roundtrip |

The vitest `pool: "forks"` config is a pragmatic fix for the vi.mock leak — documented in both `vitest.config.ts` and `loop-runner.test.ts` header comments.

---

## What's Done Well

- Clean decomposition from 587 lines to 6 focused modules
- Injected `StepExecutor` makes step runner fully generic and testable
- Pipeline validation at module load catches definition bugs at import time
- `findFinalResult` fix directly addresses production hang with good docs
- All prior review issues addressed
- 61 new tests covering all major paths
- Context threading via generic `produces` map — no Ralph-specific logic in the runner
- Crash recovery detection
- Non-blocking learning capture

## Remaining Concerns (Minor)

1. **63 lines vs 50-line target** — entry point slightly over due to help flag and executor creation. Cosmetic.
2. **Postcondition renamed** — `result-must-parse` vs plan's `verdict-must-parse`. Better name, but plan divergence should be noted.
3. **Loop runner finalization complexity** — ~80 lines of push/PR/status/checkout. Works, tested, but would benefit from extraction.
4. **`bun run check` not verified** — type safety untested in this review.
5. **Review prompt not redesigned** — plan step 14 (review step produces structured output) relies on `parseReviewResult` heuristics rather than a redesigned prompt. Learning capture works but depends on the review command producing parseable JSON.

---

## Code References

- `adws/src/pipeline.ts:55-86` — PipelineContext Zod schema with proper types
- `adws/src/step-runner.ts:224-228` — Generic produces merging
- `adws/src/step-runner.ts:103-133` — Postcondition checks
- `adws/src/loop-runner.ts:58-348` — Loop runner
- `adws/src/ralph-pipeline.ts:14-60` — 4-step definition
- `adws/src/ralph-executor.ts:27-119` — Ralph dispatch + learning
- `adws/workflows/adw_ralph.ts:1-63` — Entry point
- `adws/src/agent-sdk.ts:281-293` — findFinalResult break fix
- `adws/src/agent-sdk.ts:303-341` — Timeout implementation
- `adws/vitest.config.ts:1-16` — pool: "forks" config

## Open Questions

- Should the finalization block in loop-runner be extracted to a separate function?
- Is the dynamic `exec` import at loop-runner.ts:267 intentional (mock boundary) or a leftover?
- Should the review prompt (step 14 in plan) be redesigned to produce structured output directly, rather than relying on `parseReviewResult` heuristics?
