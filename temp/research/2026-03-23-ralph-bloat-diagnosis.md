---
date: 2026-03-23T20:00:00+02:00
researcher: Claude
git_commit: 29e23b3
branch: hein/feature/issue-31-create-test-route
repository: babylon
topic: 'Why does the Ralph TDD loop spawn so many agents and take 20min for a trivial PRD?'
tags: [research, ralph, adw, performance, agent-bloat]
status: complete
last_updated: 2026-03-23
last_updated_by: Claude
---

# Research: Ralph Agent Bloat Diagnosis

## Research Question

Issue #36 is a trivial PRD (fix a broken image, add caption, update test assertions — 2 sub-issues). The Ralph loop took ~25 minutes, ran 6 SDK sessions with 382+ assistant turns total, cost ~$3.07, and the refactor steps made heavy changes to `adws/src/` files that have nothing to do with the `/test` route. Why?

## Summary

Two root causes, both in the `/refactor` command design:

1. **Refactor has no scope boundary** — it diffs against `origin/main` and considers ALL changed files on the branch as refactoring candidates, not just files touched by the current sub-issue's TDD step.
2. **Refactor runs once per sub-issue** — with the same unbounded scope each time, so it re-reads and re-refactors the same `adws/src/` files on every iteration.

A secondary contributor is the review step, which spins up dev servers and Firecrawl browsers for visual review of what is essentially a static markup change — but the refactor is the dominant cost.

## Detailed Findings

### Problem 1: Refactor Scope Is Branch-Wide, Not Issue-Scoped

The `/refactor` command (`refactor.md:11-12`) explicitly instructs:

```
### 1. Discover Changed Files
- Run `git diff --stat origin/main` to identify files changed on this branch
```

This means the refactor agent sees **every file changed on the entire branch** vs main — including all the `adws/src/` files that were already modified before the ralph run started. The branch `hein/feature/issue-31-create-test-route` had extensive pre-existing changes:

- `adws/src/agent-sdk.ts`, `adws/src/agent.ts`, `adws/src/github.ts`, `adws/src/logger.ts`, `adws/src/state.ts`, `adws/src/utils.ts`, `adws/src/workflow-ops.ts` — all modified
- Plus all the workflow files, triggers, etc.

**The refactor agent correctly followed its instructions** — it just has no concept of "only refactor what the TDD step just touched."

#### Evidence from execution.log

**Refactor #37** (line 155): First thing it does is `git diff --stat origin/main`, sees all `adws/src/` files, then proceeds to:
- Read ALL test files (`agents.test.ts`, `health-check.test.ts`, `model-selection.test.ts`, `parse-blockers.test.ts`, `webhook.test.ts`) — none related to the `/test` route
- Load TDD reference docs (`deep-modules.md`, `interface-design.md`, `refactoring.md`)
- Run `bun test adws/tests/` repeatedly
- Extract `JsonlProcessor` class from `agent.ts`
- Extract `CommandExecutor` class from `agent.ts`
- Refactor `workflow-ops.ts` agent request factory
- Refactor `utils.ts` JSON parser class
- Refactor `github.ts` review comment builder

Result: **43 turns, $0.95, 374 seconds** — for a sub-issue that only touched `+page.svelte`.

**Refactor #38** (line 500): Does the exact same `git diff --stat origin/main` again, sees even more changes now (including refactor #37's output), and:
- Reads `agent-sdk.ts`, `agent.ts`, `utils.ts`, `agents.test.ts` again
- Loads TDD reference docs again
- Creates NEW files: `step-commands.ts`, `jsonl-processor.ts`, `command-executor.ts`
- Rewrites imports across `review-utils.ts`, `workflow-ops.ts`, `agent.ts`
- Runs tests 6+ times

Result: **49 turns, $1.00, 617 seconds** — again, for a sub-issue about test assertions on a Svelte page.

### Problem 2: Refactor Runs Per-Issue, Not Per-Workflow

In `adw_ralph.ts:194-211`, the refactor step runs inside the per-issue loop:

```typescript
// For each sub-issue: TDD → Refactor → Review
const refactorResult = await runRefactorStep(adwId, { ... });
```

With 2 sub-issues, the refactor runs twice. Each time it's a fresh SDK session with no context about what the previous refactor already did — so it re-discovers, re-reads, and potentially re-refactors the same files.

### Problem 3: Refactor Gets No Context About What To Refactor

The refactor command receives only the `adwId`:

```typescript
// step-commands.ts:73-75
refactor: {
  command: "/refactor",
  buildArgs: (adwId: string) => [adwId],
},
```

The prompt sent is literally `/refactor 43432d74` — there is **zero information** about:
- Which sub-issue was just completed
- Which files the TDD step touched
- What the scope of work is

### Problem 4: Review Step Overhead

Both review steps (`03_review_37` and `06_review_38`) try to:
1. Start a SvelteKit dev server (`nohup bun run dev --port 5173`)
2. Create a Firecrawl browser session
3. Screenshot localhost (which fails because Firecrawl can't access localhost)
4. Fall back to code-only review

This adds ~2-3 minutes of wasted time per review. The review command also searches for the ADW ID as a commit hash (`git show 43432d74`) and spec file (`temp/specs/*43432d74*`), finding neither — so it wastes turns figuring out what it's supposed to review.

### Turn/Cost Breakdown

| Step | Turns | Cost | Duration | Notes |
|------|-------|------|----------|-------|
| 01_tdd_37 | 20 | $0.31 | 124s | Reasonable — 4 red-green cycles |
| 02_refactor_37 | 43 | $0.95 | 374s | Refactored adws/src/ — NOT test route |
| 03_review_37 | 24 | $0.64 | 157s | Dev server + Firecrawl failure + code review |
| 04_tdd_38 | 10 | $0.17 | 97s | Reasonable — small change |
| 05_refactor_38 | 49 | $1.00 | 617s | Re-refactored same adws/src/ files |
| 06_review_38 | 50+ | ??? | ???+ | Still running at log cutoff |
| **TOTAL** | **196+** | **$3.07+** | **~25min** | |

The two refactor steps account for **$1.95 / 92 turns / ~16 minutes** — 63% of cost and 64% of time — doing work completely unrelated to the PRD.

## Code References

- `adws/workflows/adw_ralph.ts:194-211` — Refactor step invoked per-issue inside loop
- `adws/src/step-commands.ts:73-75` — Refactor command passes only adwId, no scope
- `.claude/commands/refactor.md:11-12` — "Run `git diff --stat origin/main`" scopes to entire branch
- `.claude/commands/refactor.md:34-39` — Refactoring candidates include SOLID, deep modules, duplication — maximalist scope
- `adws/src/agent-sdk.ts:373-378` — `runRefactorStep` delegates to `runConfigurableStep`
- `temp/builds/36_ralph_43432d74/execution.log:155` — Refactor #37 starts with branch-wide diff
- `temp/builds/36_ralph_43432d74/execution.log:500` — Refactor #38 repeats branch-wide diff

## Architecture Documentation

The Ralph workflow follows a fixed per-issue pipeline: **TDD → Refactor → Review**. Each step is a fresh Claude SDK session invoked via slash command. Sessions are stateless — no context carries between them except what's on disk (git state, files).

The `/refactor` command is designed for standalone use where "all files on the branch" is a reasonable scope. When embedded in an automated loop processing tiny sub-issues, this assumption breaks catastrophically.

## Open Questions

- Should refactor be scoped to files touched by the preceding TDD step? (e.g., pass changed file list)
- Should refactor run once at end of workflow instead of per-issue?
- Should refactor be optional / skippable for trivial changes?
- Should the review step skip dev-server/screenshot for non-visual changes?
- The 06_review_38 step has no result in its JSONL — did it timeout or get killed?
