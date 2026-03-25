# Plan: Extract StepRecorder + Cloudflare Tunnel Migration

## Metadata

adw_id: `use`
prompt: `Build from grill-me decision table: extract StepRecorder primitive, fix ralph structured output, deterministic files_changed, consistent select step naming, migrate ngrok → Cloudflare Tunnel`
task_type: refactor
complexity: complex

## Task Description

Ralph produces clean execution.log but zero structured step-level data (status.json, .log files) because it bypasses `runStep()` and calls SDK functions directly. The UI build inspection system needs machine-parseable step data. Additionally, `files_changed` in summaries is agent-self-reported (unreliable), and select steps use inconsistent naming.

## Objective

1. Every ralph step produces a status.json with usage, timing, and summary
2. `files_changed` is determined by `git diff`, not agent inference
3. Select steps are recorded with the same naming convention as all other steps
4. `writeWorkflowStatus()` aggregates all steps (no empty `steps: {}`)
5. Classic workflows continue working unchanged
6. ~~Cloudflare Tunnel replaces ngrok~~ (completed — see plan-the-ngrok-to-cloudflare-tunnels.md)

## Problem Statement

`runStep()` bundles two concerns: **orchestration** (banners, step numbering, comments, halt-on-fail) and **recording** (status.json, .log files, timing, usage). Ralph can't use the orchestration because it has dynamic iteration logic, but it needs the recording. There's no way to get one without the other.

## Solution Approach

Extract a `StepRecorder` primitive from the recording logic currently buried inside `taggedLogger()` + `writeAgentStatus()`. This becomes the single source of truth for structured step output. Both `runStep()` (classic) and ralph use it. The recorder also captures a pre-step git SHA at open time and computes `files_changed` via `git diff` at close time — removing this from the inference layer entirely.

```
┌────────────────────────────────────────────────┐
│            WORKFLOW LAYER                       │
│   (ralph, classic, future workflows)            │
│   Owns: orchestration, iteration, comments      │
│                                                  │
│   Classic → runStep()    Ralph → direct SDK      │
│        │                       │                 │
│        ▼                       ▼                 │
│  ┌──────────────────────────────────────────┐   │
│  │          STEP RECORDER                    │   │
│  │                                           │   │
│  │  const step = openStep(logDir, stepName)  │   │
│  │  step.log.info("...")  ← tagged .log file │   │
│  │  step.close(ok, usage, summary)           │   │
│  │       ├─ git diff → files_changed         │   │
│  │       ├─ writes status.json               │   │
│  │       └─ renames .log → .error.log        │   │
│  └──────────────────────────────────────────┘   │
│        │                       │                 │
│        ▼                       ▼                 │
│  ┌──────────────────────────────────────────┐   │
│  │            SDK LAYER                      │   │
│  │  query(), stream → raw_output.jsonl       │   │
│  │  summary extraction from output           │   │
│  └──────────────────────────────────────────┘   │
└────────────────────────────────────────────────┘
```

## Relevant Files

- `adws/src/logger.ts` — extraction source: `taggedLogger()`, `writeAgentStatus()`, `writeWorkflowStatus()`, type definitions
- `adws/src/agent-sdk.ts` — `runStep()` must be refactored to use StepRecorder internally; step runner functions (`runTddStep`, etc.)
- `adws/workflows/adw_ralph.ts` — primary consumer: needs `openStep()`/`step.close()` calls around each SDK invocation
- `adws/workflows/classic/adw_plan_build_test.ts` — representative classic workflow to verify no regression
- `adws/src/git-ops.ts` — `getHeadSha()` and `diffFileCount()` already exist; add `diffFileList()` for `files_changed`
- `adws/src/utils.ts` — `createDefaultStepUsage()`, `fmtDuration()`, helpers
- `adws/src/step-commands.ts` — step command registry (no changes expected)
- `adws/tests/agents.test.ts` — existing test patterns
- `.env.example` — document `DEV_TUNNEL_URL`
- `.env.local` — update tunnel URL to Cloudflare

### New Files

- `adws/src/step-recorder.ts` — the new StepRecorder primitive
- `adws/tests/step-recorder.test.ts` — unit tests for StepRecorder

## Implementation Phases

### Phase 1: Foundation — StepRecorder primitive

Extract recording logic into a standalone module. Pure functions + simple state. No workflow changes yet.

### Phase 2: Integration — Wire into runStep() and ralph

Refactor `runStep()` to use StepRecorder internally (no behavior change for classic workflows). Then wire ralph to use StepRecorder directly around each SDK call.

### Phase 3: Deterministic files_changed + select step consistency

Add `git diff` based `files_changed` to `step.close()`. Fix select step naming to match `{issueNumber}_{counter}_{name}` convention.

### Phase 4: ~~Cloudflare Tunnel migration~~ (completed)

Migrated to Cloudflare Tunnel — see `temp/specs/plan-the-ngrok-to-cloudflare-tunnels.md`.

## Step by Step Tasks

### 1. Add `diffFileList()` to git-ops.ts

- Add function that returns `string[]` of changed file paths between two SHAs (similar to existing `diffFileCount()` but returns names)
- Signature: `diffFileList(fromSha: string, toRef?: string, cwd?: string): Promise<string[]>`
- Reuse the `exec(["git", "diff", "--name-only", ...])` pattern already in `diffFileCount()`

### 2. Create `adws/src/step-recorder.ts`

- Define `StepRecorder` interface:
  ```typescript
  interface StepContext {
    log: TaggedLogger;        // tagged logger that writes to .log file
    close(ok: boolean, usage?: StepUsage, summary?: StepSummary): Promise<void>;
  }
  ```
- Implement `openStep(logDir: string, stepName: string, parent: Logger, opts?: { cwd?: string }): StepContext`
  - Captures `startTime = Date.now()`
  - Captures `preSha = await getHeadSha(opts.cwd)` for later diff
  - Creates step directory: `{logDir}/steps/{stepName}/`
  - Creates a `TaggedLogger` (reuse existing `taggedLogger()` from logger.ts, or inline the logic)
  - Returns `StepContext` with `log` and `close()`
- Implement `close()`:
  - Computes `files_changed` via `diffFileList(preSha, "HEAD", cwd)`
  - If `summary` provided, overwrites `summary.files_changed` with the deterministic list
  - If no `summary` provided but files changed, creates a minimal summary with just `files_changed`
  - Calls `writeAgentStatus()` (extract from logger.ts and re-export, or import)
  - Calls `handleLogFileRename()` on failure
- Export `writeAgentStatus()` and `handleLogFileRename()` from logger.ts so step-recorder can use them (or move them to step-recorder.ts and have logger.ts import from it)

### 3. Write unit tests for StepRecorder

- File: `adws/tests/step-recorder.test.ts`
- Test `openStep()` creates the step directory
- Test `close(true, usage, summary)` writes status.json with correct structure
- Test `close(false, ...)` renames .log → .error.log
- Test `files_changed` is populated from git diff (mock `exec` or use a temp git repo)
- Test that `files_changed` from summary is overwritten by git diff result
- Run with: `bun test adws/tests/step-recorder.test.ts`

### 4. Refactor `runStep()` in agent-sdk.ts to use StepRecorder

- Replace the inline `taggedLogger()` + `finalize()` calls with `openStep()` / `step.close()`
- Before:
  ```typescript
  const stepLog = taggedLogger(logger, stepName, { logDir: logger.logDir, step: stepName });
  const result = await executor(stepLog);
  stepLog.finalize(ok, usage, summary);
  ```
- After:
  ```typescript
  const step = await openStep(logger.logDir, stepName, logger, { cwd });
  const result = await executor(step.log);
  await step.close(ok, usage, summary);
  ```
- `step.log` is the TaggedLogger — executor callback signature unchanged
- Classic workflows see no API change (RunStepOpts and RunStepResult unchanged)
- Add optional `cwd` to `RunStepOpts` so `openStep` can capture the git SHA

### 5. Wire ralph to use StepRecorder

- Import `openStep` in `adw_ralph.ts`
- For each step (select, tdd, refactor, review, patch, build):
  ```typescript
  const step = await openStep(logger.logDir, tddStepName, logger, { cwd: workingDir });
  const tddResult = await runTddStep(selectedIssue.body, { ... });
  await step.close(tddResult.success, tddResult.usage, tddResult.summary);
  ```
- Remove manual `preTddSha` tracking — StepRecorder handles it internally
- `allStepUsages.push(...)` stays as-is (it feeds the GitHub comment, separate concern)

### 6. Fix select step naming

- Current: `logger.nextStep(\`select_${iteration}\`)` → produces `01_select_1` (no issue number)
- Change to: `logger.nextStep("select", selectedIssue?.number)` or use a consistent pattern
- Problem: at select time, the issue isn't selected yet. Two options:
  - (a) Name it `00_select` (utility step, no issue number) but still record it with StepRecorder
  - (b) Name it `{iteration}_{counter}_select` using iteration as the grouping key
- Recommendation: (a) — select is a utility step. The key fix is that it gets a status.json via StepRecorder, not that it has an issue number. Wrap the `quickPrompt()` call with `openStep()`/`step.close()`.

### 7. Verify `writeWorkflowStatus()` aggregates correctly

- `writeWorkflowStatus()` already reads `steps/*/status.json` and merges — no code change needed
- Verify by running ralph and checking that `status.json` top-level `steps` object is populated
- The `steps: {}` empty object problem resolves itself once step-level status.json files exist

### 8. Run existing tests

- `bun test adws/tests/` — all existing tests must pass
- `bun test adws/tests/step-recorder.test.ts` — new tests must pass
- Verify no regressions in classic workflow behavior

### 9. ~~Cloudflare Tunnel setup~~ (completed)

Migrated to Cloudflare Tunnel — see `temp/specs/plan-the-ngrok-to-cloudflare-tunnels.md`.

### 10. Validate end-to-end

- Run a ralph workflow (or simulate one step) and verify:
  - Each step directory contains `status.json`
  - `status.json` has `files_changed` populated from git diff
  - Top-level `status.json` `steps` object is populated
  - Select steps have status.json
  - execution.log is unchanged (still clean, no regression)
- Run review step against `https://dev.schulie.com/test` and verify screenshot captures actual page content (not 404)

## Testing Strategy

- **Unit tests** (`step-recorder.test.ts`): StepRecorder open/close lifecycle, status.json writing, .log file creation/rename, files_changed from git diff
- **Integration**: Run existing `adws/tests/agents.test.ts` suite to verify no regression
- **Manual validation**: Execute ralph on a test issue and inspect `temp/builds/` output structure
- **Tunnel validation**: ~~Firecrawl screenshot of `dev.schulie.com/test`~~ (completed separately)

## Acceptance Criteria

- [ ] Every ralph step (select, tdd, refactor, review, patch, build) produces a `status.json` in its step directory
- [ ] `files_changed` in status.json is determined by `git diff`, not agent self-report
- [ ] Select steps use consistent `{counter}_{name}` naming and produce status.json
- [ ] `writeWorkflowStatus()` top-level `steps` object is populated (not empty `{}`)
- [ ] Classic workflows (`adw_plan_build_test.ts` etc.) behavior is unchanged
- [ ] `StepRecorder` is a standalone module importable by any workflow
- [ ] All existing tests pass (`bun test adws/tests/`)
- [ ] New StepRecorder tests pass
- [ ] `.env.example` documents `DEV_TUNNEL_URL`
- [ ] Cloudflare Tunnel setup documented and `dev.schulie.com` resolves to localhost:5173

## Validation Commands

- `bun test adws/tests/` — run all ADW tests
- `bun test adws/tests/step-recorder.test.ts` — run StepRecorder unit tests
- `bun run check` — TypeScript type checking across all packages
- `ls temp/builds/*/steps/*/status.json` — verify step-level status files exist after a ralph run
- `cat temp/builds/*/status.json | jq '.steps | keys'` — verify top-level aggregation
- `curl -s -o /dev/null -w "%{http_code}" https://dev.schulie.com/test` — verify tunnel returns 200

## Notes

- `getHeadSha()` and `diffFileCount()` already exist in `git-ops.ts` — reuse the pattern for `diffFileList()`
- `taggedLogger()` in logger.ts can remain as-is — StepRecorder composes it rather than replacing it
- The `openStep()` call adds one `git rev-parse HEAD` per step — negligible cost (~5ms)
- Classic workflows gain deterministic `files_changed` too — strictly more correct, minor behavioral change
- `dev.schulie.com` is publicly routable — consider Cloudflare Access if dev server exposes sensitive data
- No Convex schema changes in this plan — UI data layer is a separate future effort
