# Plan: Fix Ralph TDD Workflow — Move Validation Into Agent, Simplify Postconditions

## Metadata

adw_id: `Ralph`
prompt: `TDD`
conversation_id: `current`
task_type: fix
complexity: medium

## Task Description

The Ralph workflow's TDD step has been failing for days. The root cause: the TDD agent reports "success" (meaning the agent session completed), then the step-runner commits the code, and THEN postconditions (`code-must-compile`, `page-must-load`) run and fail. The broken commit stays in git, retries start from a broken state, and the issue eventually gets permanently skipped.

The fix: move compile/build/page-load validation INTO the `/tdd` skill so the agent self-validates before reporting success. Simplify the pipeline postconditions to only `head-must-advance`.

## Objective

After this change:
1. The TDD agent will not report success unless the app types-check, builds, Convex is synced (if changed), and affected pages return 200
2. The pipeline postcondition only checks that a commit was produced (`head-must-advance`)
3. The "postcondition fails after commit" problem is eliminated for compile/page-load failures

## Problem Statement

The step-runner commits code BEFORE running postconditions (`step-runner.ts:252`). When `code-must-compile` or `page-must-load` fail, the broken commit is already in git. The `onFail: "skip-issue"` policy skips the issue, and retries start from a codebase with the broken commit. The agent has no chance to self-correct because it's already exited.

## Solution Approach

Move the validation responsibility from postconditions (deterministic but too late) into the TDD skill instructions (earlier, agent can self-correct). The agent runs `bun run check`, `bun run build`, pushes Convex if needed, and checks affected page(s) return 200 — all BEFORE reporting success. If any check fails, the agent fixes the issue in-loop while it still has full context.

## Relevant Files

- `.claude/skills/tdd/SKILL.md` — TDD skill definition. Needs validation gate added to GREEN phase and checklist.
- `adws/src/ralph-pipeline.ts:14-60` — Pipeline definition. TDD step postcondition array must be reduced.
- `adws/tests/ralph-pipeline.test.ts:40-43` — Test asserting postcondition array. Must be updated.

## Implementation Phases

### Phase 1: Skill Update

Amend the `/tdd` skill to define GREEN as: tests pass + type-check + build + Convex push + page-load 200.

### Phase 2: Pipeline Update

Reduce TDD postconditions from `["head-must-advance", "code-must-compile", "page-must-load"]` to `["head-must-advance"]`.

### Phase 3: Test Update + Validation

Update the pipeline test assertion and run the test suite.

## Step by Step Tasks

### 1. Update `/tdd` skill — add validation gate to GREEN phase

In `.claude/skills/tdd/SKILL.md`:

- In **Section 2 (Tracer Bullet)** and **Section 3 (Incremental Loop)**, expand what "passes" means in the GREEN phase. GREEN is not just "tests pass" — it means:
  1. Tests pass
  2. `bun run check` passes (type correctness across all apps)
  3. `bun run build` passes (Vite bundling, SSR, imports)
  4. If any files under `convex/` were modified, run `npx convex dev --once` and confirm it succeeds (removes race condition with the Convex file watcher)
  5. Read `DEV_TUNNEL_URL` from `.env.local`, fetch affected page route(s), confirm HTTP 200

- Add these as items in the **Checklist Per Cycle** section:
  - `[ ] bun run check passes`
  - `[ ] bun run build passes`
  - `[ ] If convex/ files changed, npx convex dev --once succeeds`
  - `[ ] Affected page(s) return 200 via DEV_TUNNEL_URL`

- Add a clear instruction: "If any validation fails, fix the issue before proceeding to the next cycle. Do NOT report success until all validations pass."

### 2. Update Ralph pipeline postconditions

In `adws/src/ralph-pipeline.ts`:

- Change line 35 from:
  ```ts
  postcondition: ["head-must-advance", "code-must-compile", "page-must-load"],
  ```
  to:
  ```ts
  postcondition: ["head-must-advance"],
  ```

### 3. Update pipeline test

In `adws/tests/ralph-pipeline.test.ts`:

- Change the test at line 40-43 from:
  ```ts
  it("tdd has head-must-advance + code-must-compile + page-must-load postconditions", () => {
    const tdd = RALPH_PIPELINE.find(s => s.name === "tdd")!;
    expect(tdd.postcondition).toEqual(["head-must-advance", "code-must-compile", "page-must-load"]);
  });
  ```
  to:
  ```ts
  it("tdd has head-must-advance postcondition only", () => {
    const tdd = RALPH_PIPELINE.find(s => s.name === "tdd")!;
    expect(tdd.postcondition).toEqual(["head-must-advance"]);
  });
  ```

### 4. Validate

- Run `cd adws && bun test` to confirm all tests pass
- Manually review the skill file reads clearly and unambiguously

## Testing Strategy

- Run `bun test` in `adws/` — the ralph-pipeline test must pass with the updated assertion
- All other step-runner and postcondition tests should remain unaffected (they use their own test fixtures, not the Ralph pipeline definition)
- No new tests needed — the validation is now agent-behavioral, not code-enforced

## Acceptance Criteria

- `.claude/skills/tdd/SKILL.md` GREEN phase explicitly requires: tests pass, `bun run check`, `bun run build`, Convex push if needed, affected pages 200
- `ralph-pipeline.ts` TDD step postcondition is `["head-must-advance"]`
- `ralph-pipeline.test.ts` assertion updated and passing
- `bun test` in `adws/` passes with zero failures
- `code-must-compile` and `page-must-load` implementations left in `step-runner.ts` (available for future use)
- `PostconditionSchema` enum in `pipeline.ts` unchanged

## Validation Commands

- `cd adws && bun test` — Run full ADW test suite, confirm zero failures
- `cd adws && bun test ralph-pipeline` — Run pipeline-specific tests

## Notes

- The `code-must-compile` and `page-must-load` postcondition implementations in `step-runner.ts:130-163` are intentionally left in place. They're defined in the `PostconditionSchema` enum and could be reused by future pipelines.
- The `onFail: "skip-issue"` policy for TDD is unchanged. With validation moved into the agent, failures that reach the step-runner are degenerate cases (timeout, crash, no file changes) where retrying won't help.
- Risk accepted: the agent is an LLM and may not follow instructions. If it can't be trusted to run the checks, there's a bigger problem with the agent methodology.
- Risk accepted: 200 != page renders correctly. A SvelteKit error boundary could still return 200. Good enough for now.
- Risk accepted: agent must correctly identify affected route(s) from issue context.
