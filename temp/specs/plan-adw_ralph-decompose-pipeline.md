# Plan: Decompose adw_ralph into testable, observable pipeline architecture

## Metadata

adw_id: `adw_ralph`
prompt: `workflow`
conversation_id: `grill-me-2026-03-28-ralph-pipeline-decomposition`
task_type: refactor
complexity: complex

## Task Description

Refactor the monolithic `adw_ralph.ts` workflow (587 lines) into a decomposed architecture with four separated concerns: git lifecycle, step pipeline, consultation (as a step), and learning capture (absorbed into review). Replace the procedural loop body with a declarative, Zod-typed pipeline definition executed by a generic step runner. Eliminate the patch-retry loop. Add per-step timeouts and postconditions. Fix the `findFinalResult` pipe-EOF hang bug.

## Objective

When complete:
1. Ralph's per-issue pipeline is a declarative 4-step array: consult -> TDD -> refactor -> review
2. A generic step runner executes any pipeline definition with typed context, timeouts, postconditions, and per-step commits
3. A generic loop runner schedules pipeline execution across sub-issues
4. Git lifecycle (branch/push/PR/comments) is separated from step execution
5. All orchestration logic is unit-testable without spawning Claude subprocesses
6. The `findFinalResult` hang class is eliminated (break on result + per-step timeout)

## Problem Statement

`adw_ralph.ts` tangles multiple concerns into one 587-line function: git operations, step orchestration, expert consultation, and code review with learning capture. This makes the workflow untestable, unobservable, and fragile. Build 64 hung for hours because `findFinalResult` waited for pipe EOF after a background process held stdout open. The TDD step reported success without advancing HEAD, and nothing verified the postcondition. The patch-retry loop added complexity and masked failures instead of surfacing them.

## Solution Approach

Separate concerns into distinct, testable modules:

1. **Pipeline definition** — declarative step array with Zod-typed context, `produces`/`consumes` declarations, model maps, timeouts, postconditions, and `commitAfter` flags
2. **Step runner** — generic executor that validates the pipeline graph at construction, manages the typed context bag, enforces timeouts and postconditions, handles per-step commits, and delegates to Claude agent sessions
3. **Loop runner** — generic scheduler that fetches/filters/selects sub-issues and delegates to the step runner per issue, owns git lifecycle (branch, push, PR, comments)
4. **Review step redesign** — review produces verdict + structured learnings + user summary; replaces both the old review step and the separate learning capture

## Relevant Files

### Existing Files to Modify

- `adws/workflows/adw_ralph.ts` — current monolith to decompose (becomes thin loop runner invoking pipeline)
- `adws/src/agent-sdk.ts` — `findFinalResult` bug fix (break on result message); `consumeQuery` timeout support
- `adws/src/step-recorder.ts` — may need extensions for new postcondition/context tracking
- `adws/src/step-commands.ts` — STEP_COMMANDS registry (ensure consult, tdd, refactor-step, review entries exist)
- `adws/src/learning-utils.ts` — `recordLearning` still used by review step; interface stable

### Existing Files to Reuse (no changes expected)

- `adws/src/git-ops.ts` — branch, commit, push, diff operations
- `adws/src/logger.ts` — createLogger, taggedLogger, writeWorkflowStatus
- `adws/src/state.ts` — ADWState persistence
- `adws/src/utils.ts` — commentStep, finalStatusComment, fmtDuration, getAdwEnv
- `adws/src/github.ts` — fetchSubIssues, closeSubIssue, filterUnblockedIssues
- `adws/src/review-utils.ts` — parseReviewResult, extractScreenshots

### New Files

- `adws/src/pipeline.ts` — `PipelineDefinition`, `StepDefinition`, `PipelineContext` Zod schemas; pipeline validation function
- `adws/src/step-runner.ts` — generic step runner: executes a pipeline definition against typed context with timeouts, postconditions, per-step commits
- `adws/src/loop-runner.ts` — generic loop runner: sub-issue scheduling, git lifecycle, delegates to step runner
- `adws/src/ralph-pipeline.ts` — Ralph-specific pipeline definition (the 4-step declarative array + context schema)
- `adws/tests/pipeline.test.ts` — pipeline validation tests (produces/consumes graph)
- `adws/tests/step-runner.test.ts` — step runner orchestration tests (halt/continue/skip, postconditions, timeouts, commits, context flow)
- `adws/tests/loop-runner.test.ts` — loop runner tests (issue scheduling, git lifecycle, finalization)
- `adws/tests/ralph-pipeline.test.ts` — Ralph pipeline definition tests (model resolution, context schema, step configuration)

## Implementation Phases

### Phase 1: Foundation — Schemas, Types, Pipeline Definition

Build the type system and declarative pipeline format. No behavioral changes yet.

- Zod schemas for `PipelineContext`, `StepDefinition`, `PipelineDefinition`
- Pipeline validation function (consumes/produces graph check)
- Ralph-specific pipeline definition (4-step array)
- Unit tests for all of the above

### Phase 2: Core — Step Runner + Bug Fixes

Build the generic step runner and fix the hang bug.

- `findFinalResult` break-on-result fix
- Per-step timeout mechanism in agent-sdk
- Generic step runner: context management, postconditions, per-step commits, onFail routing
- Unit tests with mocked step executors

### Phase 3: Integration — Loop Runner + Ralph Rewire

Build the loop runner and rewire `adw_ralph.ts` to use the new architecture.

- Generic loop runner: issue scheduling, git lifecycle, finalization
- Rewire `adw_ralph.ts` as thin entry point: parse args -> create loop runner with ralph pipeline -> run
- Integration tests for loop runner
- Manual end-to-end validation

## Step by Step Tasks

### 1. Define the Zod-typed PipelineContext schema

- Create `adws/src/pipeline.ts`
- Define `PipelineContext` Zod schema with base fields (issue, complexity, baseSha) and optional step outputs (expertAdvice, preTddSha, reviewResult, learningEntry)
- Export inferred TypeScript type from Zod schema
- Define `StepResult` schema (success, error, sha, summary)

### 2. Define the StepDefinition schema

- In `adws/src/pipeline.ts`, define `StepDefinition` Zod schema:
  - `name: z.string()`
  - `command: z.string().nullable()` (null for non-Claude steps)
  - `onFail: z.enum(["halt", "continue", "skip-issue"])`
  - `produces: z.array(z.string())` — keys of PipelineContext this step outputs
  - `consumes: z.array(z.string())` — keys of PipelineContext this step requires
  - `modelMap: z.record(z.enum(["trivial", "standard", "complex"]), z.string())`
  - `commitAfter: z.boolean()`
  - `timeout: z.number()` — milliseconds
  - `postcondition: z.enum(["head-must-advance", "verdict-must-parse"]).nullable()`
  - `skipWhen: z.record(z.string(), z.array(z.string())).optional()` — e.g. `{ complexity: ["trivial"] }`
- Define `PipelineDefinition` as `z.array(StepDefinitionSchema)`

### 3. Implement pipeline validation function

- In `adws/src/pipeline.ts`, implement `validatePipeline(definition: PipelineDefinition): { valid: boolean, errors: string[] }`
- Check: every `consumes` key has a matching `produces` from a prior step or is a base context field
- Check: no duplicate `produces` keys across steps (or explicit override policy)
- Check: postcondition string keys are recognized
- Check: all step names are unique

### 4. Write pipeline validation tests

- Create `adws/tests/pipeline.test.ts`
- Test: valid pipeline passes validation
- Test: missing produces for a consumes key → error
- Test: duplicate step names → error
- Test: unknown postcondition → error
- Test: base context fields (issue, complexity, baseSha) are always available for consumes
- Test: empty pipeline is valid

### 5. Define the Ralph pipeline

- Create `adws/src/ralph-pipeline.ts`
- Define the 4-step Ralph pipeline as a `PipelineDefinition`:

```typescript
const RALPH_PIPELINE: PipelineDefinition = [
  {
    name: "consult",
    command: "/experts:consult",
    onFail: "continue",
    produces: ["expertAdvice"],
    consumes: ["issue"],
    modelMap: { trivial: "haiku", standard: "haiku", complex: "haiku" },
    commitAfter: false,
    timeout: 120_000,
    postcondition: null,
  },
  {
    name: "tdd",
    command: "/tdd",
    onFail: "skip-issue",
    produces: ["preTddSha"],
    consumes: ["issue", "expertAdvice"],
    modelMap: { trivial: "research", standard: "default", complex: "opus" },
    commitAfter: true,
    timeout: 600_000,
    postcondition: "head-must-advance",
  },
  {
    name: "refactor",
    command: "/refactor-step",
    onFail: "continue",
    produces: [],
    consumes: ["issue", "expertAdvice", "preTddSha"],
    modelMap: { trivial: "default", standard: "default", complex: "opus" },
    commitAfter: true,
    timeout: 300_000,
    postcondition: null,
    skipWhen: { complexity: ["trivial"] },
  },
  {
    name: "review",
    command: "/review",
    onFail: "skip-issue",
    produces: ["reviewResult", "learningEntry"],
    consumes: ["issue", "expertAdvice"],
    modelMap: { trivial: "default", standard: "default", complex: "opus" },
    commitAfter: false,
    timeout: 300_000,
    postcondition: "verdict-must-parse",
  },
]
```

- Export `RALPH_PIPELINE` and `RalphPipelineContext` type
- Validate pipeline at module load via `validatePipeline(RALPH_PIPELINE)` (throws on error)

### 6. Write Ralph pipeline definition tests

- Create `adws/tests/ralph-pipeline.test.ts`
- Test: RALPH_PIPELINE passes validation
- Test: model resolution per step per complexity
- Test: consult produces expertAdvice, tdd consumes it
- Test: review produces both reviewResult and learningEntry
- Test: only tdd and refactor have commitAfter: true
- Test: only tdd has head-must-advance, only review has verdict-must-parse
- Test: refactor skips when complexity is trivial

### 7. Fix findFinalResult pipe-EOF hang

- In `adws/src/agent-sdk.ts`, modify `findFinalResult()` to `break` after processing a `type: "result"` message
- Ensure the final result, usage, and summary are captured before the break
- Add a comment explaining why we break early (pipe may not close if agent spawned background processes)

### 8. Add per-step timeout to agent-sdk

- In `adws/src/agent-sdk.ts`, add a `timeout` option to `consumeQuery()` / the SDK query consumption path
- Implement via `AbortController` or `Promise.race` with a timer
- On timeout: kill the subprocess, return a failure QueryResult with `error: "Step timed out after {N}ms"`
- Ensure cleanup: subprocess killed, pipes closed

### 9. Implement the generic step runner

- Create `adws/src/step-runner.ts`
- Export `runPipeline(pipeline: PipelineDefinition, baseContext: PipelineContext, options: RunPipelineOptions): Promise<PipelineResult>`
- `RunPipelineOptions`: `{ logger, logDir, workingDir, models }`
- `PipelineResult`: `{ ok: boolean, context: PipelineContext, stepResults: StepResultEntry[], skipped: boolean }`
- For each step in the pipeline:
  1. Check `skipWhen` condition against context → skip if matched
  2. Extract `consumes` keys from context bag → pass to step
  3. Resolve model from `modelMap` + context.complexity
  4. Open step via `openStep()`
  5. Execute step (dispatch to `runSkillStep` or local function based on `command`)
  6. Enforce timeout
  7. Check postcondition:
     - `head-must-advance`: compare pre-step SHA to current HEAD
     - `verdict-must-parse`: validate review result structure
  8. If `commitAfter` and HEAD advanced: `commitChanges()`
  9. Merge `produces` into context bag (Zod-validated)
  10. On failure: apply `onFail` policy (halt, continue, skip-issue)
  11. Close step with status
- Return aggregated result

### 10. Write step runner tests

- Create `adws/tests/step-runner.test.ts`
- Mock: git ops (getHeadSha, commitChanges, diffFileList)
- Mock: step executor (returns success/failure QueryResults)
- Test: successful pipeline — all steps execute in order, context accumulates correctly
- Test: onFail="continue" — step fails, next step still runs
- Test: onFail="skip-issue" — step fails, pipeline stops, returns skipped=true
- Test: onFail="halt" — step fails, pipeline stops, returns ok=false
- Test: postcondition head-must-advance — fails when HEAD unchanged
- Test: postcondition verdict-must-parse — fails when review output unparseable
- Test: commitAfter — commits when HEAD advanced, skips when HEAD unchanged
- Test: skipWhen — step skipped when condition matches, context unchanged
- Test: produces/consumes — context bag correctly threaded between steps
- Test: timeout — step killed after timeout, returns failure
- Test: model resolution — correct model selected per complexity

### 11. Implement the generic loop runner

- Create `adws/src/loop-runner.ts`
- Export `runLoop(config: LoopConfig): Promise<boolean>`
- `LoopConfig`: `{ pipeline, adwId, parentIssueNumber, maxIterations, issueNumberStr? }`
- Responsibilities:
  1. Initialize logger, state, commentStep
  2. Git: assertStableBranch, createBranch (or resume)
  3. For each iteration:
     a. fetchSubIssues, filterUnblockedIssues
     b. Select next issue (single = auto, multiple = quickPrompt)
     c. Extract complexity label
     d. Build base PipelineContext from issue metadata
     e. Call `runPipeline(pipeline, baseContext, options)`
     f. If pipeline.ok: closeSubIssue, track completed
     g. If pipeline.skipped: track skipped
  4. Finalize: pushBranch, create PR, writeWorkflowStatus, commentFinalStatus
  5. Checkout base branch

### 12. Write loop runner tests

- Create `adws/tests/loop-runner.test.ts`
- Mock: github (fetchSubIssues, closeSubIssue, filterUnblockedIssues)
- Mock: git-ops (createBranch, pushBranch, commitChanges, etc.)
- Mock: step runner (runPipeline returns configurable results)
- Mock: utils (commentStep, commentFinalStatus)
- Test: all issues completed → ok=true, PR created
- Test: some issues skipped → ok=false
- Test: all issues blocked → halts with comment
- Test: no issues remaining → completes immediately
- Test: max iterations reached → stops
- Test: git lifecycle sequence: branch → (per-issue pipeline) → push → PR → checkout base

### 13. Rewire adw_ralph.ts

- Replace the 587-line monolithic `runWorkflow` with:
  1. Parse args (unchanged)
  2. Import `RALPH_PIPELINE` from `ralph-pipeline.ts`
  3. Call `runLoop({ pipeline: RALPH_PIPELINE, adwId, parentIssueNumber, maxIterations, issueNumberStr })`
  4. Exit with result
- Target: `adw_ralph.ts` should be ~30-40 lines (arg parsing + delegation)

### 14. Update the review step command/prompt

- The `/review` command prompt needs to produce structured output that includes:
  - `verdict`: PASS | PASS_WITH_ISSUES | FAIL
  - `learnings`: array of structured learning entries (tags, context, expected, actual) — empty on PASS
  - `summary`: human-readable summary for GitHub comment
- This may require modifying the review skill/command in `.claude/commands/`
- The step runner's review postcondition (`verdict-must-parse`) validates this output shape

### 15. Validate end-to-end

- Run `bun test adws/tests/` — all new + existing tests pass
- Run `bun run check` — no type errors
- Manual dry-run of Ralph on a test issue to validate real behavior
- Verify: structured status.json output matches expected schema
- Verify: learning files are written in existing format for `adw_learn` compatibility

## Testing Strategy

### Unit Tests (fast, deterministic, no Claude sessions)

**pipeline.test.ts** — Pipeline definition validation
- Valid/invalid produces-consumes graphs
- Base context field availability
- Duplicate names, unknown postconditions

**ralph-pipeline.test.ts** — Ralph-specific definition correctness
- Step order, model maps, onFail policies, postconditions
- skipWhen conditions
- Context flow (produces → consumes chain)

**step-runner.test.ts** — Generic step runner orchestration
- All onFail policies (halt, continue, skip-issue)
- Postcondition enforcement (head-must-advance, verdict-must-parse)
- Per-step commits (commitAfter + HEAD check)
- skipWhen evaluation
- Context bag threading (produces → consumes)
- Timeout enforcement
- Model resolution from modelMap + complexity

**loop-runner.test.ts** — Generic loop runner scheduling
- Issue fetching, filtering, selection
- Pipeline delegation per issue
- Git lifecycle sequence
- Finalization (push, PR, status, comments)
- Edge cases: all blocked, none remaining, max iterations

### Existing Tests (must stay green)

- `step-recorder.test.ts` — StepContext, openStep, close behavior
- `review-utils.test.ts` — parseReviewResult, extractScreenshots
- `parse-blockers.test.ts` — dependency parsing
- `model-selection.test.ts` — model routing

### Integration Tests (manual, uses Claude sessions)

- End-to-end Ralph run on a test issue
- Verify learning file written on failure
- Verify per-step commits on TDD and refactor
- Verify timeout kills a hung step

## Acceptance Criteria

- [ ] `adw_ralph.ts` is < 50 lines (arg parsing + delegation to loop runner)
- [ ] Pipeline definition is a declarative array in `ralph-pipeline.ts`, validated at load time
- [ ] PipelineContext is a Zod schema with compile-time + runtime safety
- [ ] Every `consumes` key is validated against prior `produces` at construction
- [ ] Step runner enforces per-step timeouts (configurable per step)
- [ ] Step runner checks postconditions (head-must-advance for TDD, verdict-must-parse for review)
- [ ] Step runner commits after TDD and refactor when HEAD advances
- [ ] Review step produces verdict + structured learnings + user summary
- [ ] Learning files are written in existing format (`adw_learn` compatibility)
- [ ] `findFinalResult` breaks on result message (no more pipe-EOF hangs)
- [ ] Patch-retry loop is removed
- [ ] All new modules have unit tests with mocked dependencies
- [ ] All existing tests pass (`bun test adws/tests/`)
- [ ] No type errors (`bun run check`)

## Validation Commands

- `bun test adws/tests/pipeline.test.ts` — Pipeline validation tests
- `bun test adws/tests/step-runner.test.ts` — Step runner orchestration tests
- `bun test adws/tests/loop-runner.test.ts` — Loop runner scheduling tests
- `bun test adws/tests/ralph-pipeline.test.ts` — Ralph pipeline definition tests
- `bun test adws/tests/` — All ADW tests (new + existing)
- `bun run check` — TypeScript type checking across all packages

## Notes

- `adw_learn.ts` is intentionally untouched — the learning file format is the contract
- `adw_sdlc` migration to the same step runner is a follow-up effort, not in scope
- The pipeline definition is serializable-ready (string keys, maps, no functions) but we are not building DB storage or dynamic composition now
- Model string values in `modelMap` (e.g., "research", "default", "opus") should resolve against `getWorkflowModels()` at runtime, not hardcoded model IDs
- The review step prompt changes (to produce structured learnings) may need iteration — design the output schema in the Zod context, then adapt the prompt to match
- Real-time visualization is designed for (structured events from every step) but not built in this effort
