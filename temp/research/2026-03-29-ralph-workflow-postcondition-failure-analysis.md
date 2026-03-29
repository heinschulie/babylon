---
date: 2026-03-29T00:00:00+02:00
researcher: Claude
git_commit: 204387a
branch: main
repository: babylon
topic: 'Why does the Ralph TDD workflow keep breaking — postcondition architecture analysis'
tags: [research, codebase, adws, ralph, tdd, postcondition, step-runner]
status: complete
last_updated: 2026-03-29
last_updated_by: Claude
---

# Research: Ralph TDD Workflow — Why Postconditions Break After TDD "Passes"

## Research Question

The Ralph workflow has been broken for days. The TDD step is supposed to produce code that compiles and runs. Why does a postcondition check fail *after* TDD has already reported success? Why isn't the TDD step kept in a retry loop until the app actually works?

## Summary

The root cause is an **architectural split between "TDD agent success" and "app actually works"**. The TDD step has two independent gatekeepers that don't talk to each other:

1. **The Claude agent** (via `/tdd` skill) — reports `success: true` when it finishes its conversation without error. This does NOT mean the app compiles or runs. It means the agent completed.
2. **Postconditions** (`code-must-compile`, `page-must-load`) — run AFTER the agent AND after the commit. These are external validators.

When postconditions fail, `onFail: "skip-issue"` fires, the issue gets skipped, the loop picks a new issue or retries (up to 2 attempts), and **the broken commit stays in the branch**. There is no rollback.

### The 3 specific problems:

**Problem 1: Agent "success" ≠ app works.** The SDK reports success based on `finalResult.subtype === "success"` (`agent-sdk.ts:335`). This just means the agent didn't crash. The `/tdd` skill instructs the agent to do red-green cycles, but there's no enforcement mechanism — the agent could write code that passes its own tests but fails `bun run check` (type errors in OTHER files, for instance).

**Problem 2: Commit happens BEFORE postcondition.** In `step-runner.ts:252-259`, the commit runs when `step.commitAfter && result.success`. Postconditions run at `step-runner.ts:262-268`, AFTER the commit. So a broken state gets committed before anyone checks if the app compiles. If the postcondition then fails, the broken commit is already in git history.

**Problem 3: No internal retry on postcondition failure.** When a postcondition fails, the step is marked failed and `onFail: "skip-issue"` skips the entire issue. The loop runner (`loop-runner.ts:254-258`) bumps a retry counter and may pick the issue again on the next iteration — but now the TDD agent starts from a codebase that already has a broken commit in it.

## Detailed Findings

### The Pipeline Definition

`adws/src/ralph-pipeline.ts:14-60`

```
consult → tdd → refactor → review
```

The TDD step definition:
- `onFail: "skip-issue"` — postcondition failure skips the issue
- `commitAfter: true` — commit BEFORE postcondition check
- `postcondition: ["head-must-advance", "code-must-compile", "page-must-load"]` — triple gate, checked sequentially, short-circuits on first failure

### Step Execution Flow (step-runner.ts:190-309)

For each step in the pipeline:

1. **Skip check** (line 203) — skipWhen evaluation
2. **Execute** (line 237) — calls the injected `executeStep` which runs the Claude agent
3. **Commit** (line 252-259) — `if (step.commitAfter && result.success)` → `git add -A && git commit`
4. **Postcondition** (line 262-268) — runs AFTER commit
5. **onFail routing** (line 290-305) — if postcondition failed, step.onFail determines what happens

The commit-before-postcondition ordering is by design (comment on line 252: "before postcondition so head-must-advance sees the commit"). The `head-must-advance` check NEEDS the commit to have happened. But this means `code-must-compile` and `page-must-load` are validating committed code, and if they fail, the damage is done.

### Postcondition Implementations (step-runner.ts:104-166)

- **`head-must-advance`** (line 110-115): Compares pre/post SHA. Needs the commit to have happened.
- **`code-must-compile`** (line 130-141): Runs `bun run check` — svelte-check type checking. This catches type errors across the entire project, not just the files the agent touched.
- **`page-must-load`** (line 143-163): Fetches `DEV_TUNNEL_URL/test` from `.env.local`. Gracefully skips if not configured (returns `ok: true`).

### The TDD Skill (.claude/skills/tdd/SKILL.md)

The skill instructs the agent to do vertical red-green slices. It does NOT instruct the agent to:
- Run `bun run check` before reporting success
- Verify the full app compiles
- Check for type errors outside the files it modified

The agent runs tests for the specific behavior it's implementing. Those tests pass. But `bun run check` (svelte-check) validates the ENTIRE codebase — including type relationships the agent's changes may have broken in other files.

### The Agent SDK Success Criteria (agent-sdk.ts:335)

```ts
success: finalResult.subtype === "success"
```

This is the Claude Agent SDK's own determination of whether the agent completed its task. It is NOT a compile check or test-run verification.

### Loop Retry Logic (loop-runner.ts:152-167, 254-266)

- `maxSkipPerIssue` defaults to 2
- When a postcondition fails → onFail="skip-issue" → issue gets skip-counted
- On next iteration, issue is retried if skip count < maxSkipPerIssue
- After 2 failures, issue is "exhausted" and permanently skipped
- **No rollback** of the broken commit before retry

### The TDD Executor (ralph-executor.ts:64-71)

```ts
case "tdd": {
  const tddBody = context.expertAdvice
    ? `${context.issue.body}\n\n## Expert Guidance\n${context.expertAdvice}`
    : context.issue.body;
  const tddResult = await runTddStep(tddBody, baseOpts);
  return { ...tddResult, produces: { preTddSha: preSha } };
}
```

Clean pass-through. No pre/post validation added at this layer.

## Code References

- `adws/src/ralph-pipeline.ts:27-36` — TDD step definition with postconditions
- `adws/src/step-runner.ts:252-268` — Commit-then-postcondition sequence (the core issue)
- `adws/src/step-runner.ts:104-166` — Postcondition implementations
- `adws/src/step-runner.ts:290-305` — onFail routing after postcondition failure
- `adws/src/agent-sdk.ts:335` — Agent "success" is just `subtype === "success"`
- `adws/src/ralph-executor.ts:64-71` — TDD executor (no extra validation)
- `adws/src/git-ops.ts:152-168` — `commitChanges()` — `git add -A && git commit`
- `adws/src/loop-runner.ts:152-167` — Retry/exhaustion logic
- `.claude/skills/tdd/SKILL.md` — TDD skill (no compile-check instruction)

## Architecture Documentation

### Current flow:
```
TDD Agent runs → reports "success" → git add -A && git commit → postcondition check → FAIL → skip issue → maybe retry (up to 2x)
```

### What the user expects:
```
TDD Agent runs → app must compile + run → only THEN commit → move to refactor
```

### Key gap:
The TDD agent's internal test-passing is disconnected from the project-wide compilation check. The agent can write code that passes its unit/integration tests but introduces type errors elsewhere. The postcondition catches this — but only after the broken code is already committed.

## Open Questions

1. Should the `/tdd` skill be amended to require the agent to run `bun run check` before reporting success?
2. Should postconditions run BEFORE the commit (with `head-must-advance` changed to check for uncommitted changes instead)?
3. Should postcondition failure trigger a `git reset --soft HEAD~1` to undo the broken commit before retry?
4. Should `onFail` for TDD be changed from `"skip-issue"` to a new policy like `"retry-step"` that loops within the step rather than re-entering the full pipeline?
5. Is `page-must-load` actually configured (does `.env.local` have `DEV_TUNNEL_URL`)?
