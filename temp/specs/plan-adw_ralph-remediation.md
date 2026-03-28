# Plan: Remediate Ralph pipeline decomposition review findings

## Metadata

adw_id: `adw_ralph`
prompt: `remediate the 5 issues from the pipeline decomposition review`
conversation_id: `hein/ralph_evolution-2026-03-28-review-to-plan`
task_type: refactor
complexity: medium

## Task Description

The pipeline decomposition review (`temp/research/2026-03-28-ralph-pipeline-decomposition-review.md`) identified 5 issues ranked by severity. This plan addresses all 5:

1. **Test mock leak** — 10 test failures when run as `bun test adws/tests/` due to `vi.mock` hoisting in bun's shared module state
2. **PRODUCE_HANDLERS in generic step runner** — Ralph-specific context-key handlers baked into `step-runner.ts`
3. **`z.any()` for reviewResult/learningEntry** — Undermines Zod runtime safety for 2 of 5 context fields
4. **Hardcoded `hein/` branch prefix and `"ralph"` logger** — Loop runner not truly generic
5. **`verdict-must-parse` fallback is permissive** — Passes on any parseable review, misleading postcondition name

## Objective

When complete:
1. `bun test adws/tests/` passes all tests (0 failures) when run as a suite
2. `step-runner.ts` has zero Ralph-specific knowledge — produces handled via executor return values
3. `PipelineContext` has proper Zod schemas for all fields (no `z.any()`)
4. `LoopConfig` accepts `branchPrefix` and `workflowName` — loop runner is truly generic
5. `verdict-must-parse` postcondition renamed to `result-must-parse`
6. All existing tests updated + passing

## Problem Statement

The decomposition delivered sound architecture but left 5 issues that reduce confidence and block true genericity. The test suite shows 10 failures when run together (mock leak), the "generic" step runner has Ralph-specific produce handlers, the Zod schema has `z.any()` holes, the loop runner hardcodes branch prefixes and workflow names, and a postcondition has a misleading name.

## Solution Approach

Three phases: (1) fix test isolation so suite runs green — unblocks validating everything else; (2) fix type safety + genericity — interrelated changes to step runner, pipeline context, executor, and loop config; (3) rename the postcondition — smallest change, done last.

## Relevant Files

### Existing Files to Modify

- `adws/src/step-runner.ts` — Remove `PRODUCE_HANDLERS`, accept produces from executor return; rename postcondition
- `adws/src/pipeline.ts` — Replace `z.any()` with proper schemas; rename postcondition enum value
- `adws/src/loop-runner.ts` — Add `branchPrefix` and `workflowName` to `LoopConfig`
- `adws/src/ralph-executor.ts` — Return produces map from executor
- `adws/src/ralph-pipeline.ts` — Update postcondition name
- `adws/workflows/adw_ralph.ts` — Pass `branchPrefix` and `workflowName` to loop config
- `adws/tests/step-runner.test.ts` — Update for new executor return shape + postcondition name
- `adws/tests/loop-runner.test.ts` — Fix mock isolation
- `adws/tests/ralph-pipeline.test.ts` — Update postcondition assertion

### New Files

- `adws/vitest.config.ts` — Vitest config with `pool: 'forks'` to isolate test files (if bun respects it)

## Implementation Phases

### Phase 1: Test Isolation Fix (Issue #1)

Fix mock leak so the full suite passes. Unblocks validating all other changes.

### Phase 2: Type Safety + Genericity (Issues #2, #3, #4)

Interrelated: making step runner generic requires changing executor return type, which requires proper context types. Loop runner genericity is independent but small.

### Phase 3: Postcondition Rename (Issue #5)

Smallest change — rename `verdict-must-parse` to `result-must-parse` everywhere.

## Step by Step Tasks

### 1. Fix test mock isolation

- Try creating `adws/vitest.config.ts` with `pool: 'forks'` so each test file runs in its own process
- If bun ignores vitest config (bun has its own test runner), alternative approaches:
  - Use `bun test --preload` to reset module state
  - Or restructure `loop-runner.test.ts` to use `vi.doMock` (non-hoisted) instead of `vi.mock`
  - Or add `// @vitest-environment` pragmas
- Validate: `bun test adws/tests/` should show 0 failures

### 2. Replace `z.any()` with proper Zod schemas

- In `adws/src/pipeline.ts`, replace:
  - `reviewResult: z.any().optional()` with a proper schema:
    ```typescript
    reviewResult: z.object({
      success: z.boolean(),
      verdict: z.enum(["PASS", "PASS_WITH_ISSUES", "FAIL"]).optional(),
      review_summary: z.string().optional(),
      review_issues: z.array(z.object({
        review_issue_number: z.number(),
        issue_description: z.string(),
        issue_severity: z.enum(["blocker", "tech_debt", "skippable"]),
      }).passthrough()).default([]),
    }).passthrough().optional()
    ```
  - `learningEntry: z.any().optional()` with:
    ```typescript
    learningEntry: z.array(z.object({
      tags: z.array(z.string()),
      context: z.string(),
      expected: z.string(),
      actual: z.string(),
      confidence: z.enum(["high", "medium", "low"]),
    })).optional()
    ```
- Use `.passthrough()` on review result to tolerate extra fields from the review command
- Update `PipelineContext` type — downstream consumers get real types

### 3. Make step runner produce-handling generic

- In `adws/src/step-runner.ts`:
  - Extend the `StepExecutor` return type: add `produces?: Record<string, unknown>` to `QueryResult` (or define `StepExecutorResult`)
  - Remove the entire `PRODUCE_HANDLERS` block (lines 216-229)
  - Replace with generic merge: if executor returns `produces`, merge each key into context with type coercion:
    ```typescript
    if (result.success && result.produces) {
      for (const [key, value] of Object.entries(result.produces)) {
        (ctx as Record<string, unknown>)[key] = value;
      }
    }
    ```
  - Add `preSha` to `StepExecutorOpts` so the executor can use it for `preTddSha` produce
- Step runner now has zero knowledge of `expertAdvice`, `preTddSha`, `reviewResult`, `learningEntry`

### 4. Update ralph-executor to return produces map

- In `adws/src/ralph-executor.ts`, each case returns produces:
  - `consult` → `{ ...result, produces: { expertAdvice: result.summary?.expert_advice_summary ?? result.result ?? "" } }`
  - `tdd` → `{ ...result, produces: { preTddSha: opts.preSha } }` (use new `preSha` from opts)
  - `refactor` → `{ ...result, produces: {} }` (produces nothing)
  - `review` → `{ ...result, produces: { reviewResult: parsedResult, learningEntry: parsedResult.learnings } }`

### 5. Add branchPrefix and workflowName to LoopConfig

- In `adws/src/loop-runner.ts`:
  - Add to `LoopConfig`: `branchPrefix?: string` and `workflowName?: string`
  - Line 57: `createLogger(adwId, config.workflowName ?? "workflow", parentIssueNumber)`
  - Line 79: `` `${config.branchPrefix ?? "hein/feature"}/issue-${parentIssueNumber}` ``
  - Replace other hardcoded `"ralph"` strings in `writeWorkflowStatus` and `commentFinalStatus`
- In `adws/workflows/adw_ralph.ts`:
  - Pass `branchPrefix: "hein/feature"` and `workflowName: "ralph"` — behavior unchanged

### 6. Rename verdict-must-parse to result-must-parse

- `adws/src/pipeline.ts` — PostconditionSchema enum value
- `adws/src/step-runner.ts` — `checkPostcondition()` case
- `adws/src/ralph-pipeline.ts` — review step postcondition value
- `adws/tests/step-runner.test.ts` — all test references
- `adws/tests/ralph-pipeline.test.ts` — assertion string

### 7. Update all tests

- `step-runner.test.ts`:
  - Update executor mocks to return `{ ...result, produces: { ... } }` in context-threading tests
  - Update postcondition name references
  - Verify `PRODUCE_HANDLERS` removal doesn't break any assertions
- `loop-runner.test.ts`:
  - Verify new `LoopConfig` fields don't break existing mocks
  - Confirm mock isolation fix resolves the 10 failures
- `ralph-pipeline.test.ts`:
  - Update postcondition assertion from `verdict-must-parse` to `result-must-parse`

### 8. Validate

- `bun test adws/tests/` — all tests pass together (0 failures)
- `bun test adws/tests/pipeline.test.ts`
- `bun test adws/tests/step-runner.test.ts`
- `bun test adws/tests/loop-runner.test.ts`
- `bun test adws/tests/ralph-pipeline.test.ts`
- `bun test adws/tests/learning-integration.test.ts`
- `bun run check` — no type errors
- `grep "z.any" adws/src/pipeline.ts` — should return 0 matches
- `grep "PRODUCE_HANDLERS" adws/src/step-runner.ts` — should return 0 matches

## Testing Strategy

- All existing tests updated to match new interfaces
- No new test files needed
- Key assertions to verify:
  - Step runner produces context via executor `produces` return, not hardcoded handlers
  - `PipelineContext` rejects invalid `reviewResult` shapes at parse time
  - Loop runner uses configurable branch prefix and workflow name
  - `result-must-parse` postcondition name used consistently
  - Full suite runs with 0 failures

## Acceptance Criteria

- [ ] `bun test adws/tests/` — 0 failures when run as a suite
- [ ] `step-runner.ts` contains zero references to `expertAdvice`, `preTddSha`, `reviewResult`, or `learningEntry`
- [ ] `pipeline.ts` contains zero `z.any()` calls
- [ ] `LoopConfig` has `branchPrefix` and `workflowName` fields
- [ ] `loop-runner.ts` contains zero hardcoded `"hein/"` or `"ralph"` strings
- [ ] Postcondition renamed to `result-must-parse` everywhere
- [ ] `bun run check` passes
- [ ] All existing tests pass

## Validation Commands

- `bun test adws/tests/` — All ADW tests pass together
- `bun test adws/tests/pipeline.test.ts` — Pipeline validation
- `bun test adws/tests/step-runner.test.ts` — Step runner
- `bun test adws/tests/loop-runner.test.ts` — Loop runner
- `bun test adws/tests/ralph-pipeline.test.ts` — Ralph definition
- `bun test adws/tests/learning-integration.test.ts` — Learning roundtrip
- `bun run check` — TypeScript type checking

## Notes

- The `preTddSha` produce needs the pre-step SHA. Add `preSha` to `StepExecutorOpts` — step-runner already captures it at line 165 before calling the executor.
- The `z.any()` replacement schemas use `.passthrough()` to tolerate extra fields from the review command output — avoids breakage if review adds new fields.
- `branchPrefix` and `workflowName` defaults preserve current behavior — explicit values in `adw_ralph.ts` are better than relying on defaults.
- The generic produce merge uses `Record<string, unknown>` — proper per-pipeline typing via generics is a follow-up, not in scope.
- The test isolation fix may require experimentation — bun's test runner may not respect vitest.config.ts. Have fallback approaches ready.

## Unresolved Questions

- Should `result-must-parse` also reject `verdict === "FAIL"`, or stay as pure parseability check?
- Should generic produce merge validate against `PipelineContextSchema`, or just assign blindly?
