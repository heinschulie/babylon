# Plan: Move ADWState into build directory

## Metadata

adw_id: `a`
prompt: `Eliminate loose _state_*.json files from temp/builds/ by writing state into the per-run build directory`
conversation_id: `current`
task_type: refactor
complexity: simple

## Task Description

`ADWState.getStatePath()` writes `temp/builds/_state_{adwId}.json` as a loose file. The per-run build directory `temp/builds/{issue}_{workflow}_{adwId}/` already exists and already contains `status.json`. The state file should live inside that directory as `state.json`, eliminating the loose artifact.

## Objective

`ADWState` reads/writes `temp/builds/{issue}_{workflow}_{adwId}/state.json` instead of `temp/builds/_state_{adwId}.json`. No loose `_state_*` files generated.

## Relevant Files

- `adws/src/state.ts` — `ADWState` class, `getStatePath()`, `save()`, `load()`
- `adws/src/logger.ts` — `createLogger()` constructs the `logDir` path (the build directory)
- `adws/workflows/adw_ralph.ts` — creates state before logger in some paths; primary consumer
- `adws/src/workflow-ops.ts` — calls `ADWState.load()` and `save()`
- `adws/workflows/classic/adw_plan.ts` — creates/loads state
- `adws/workflows/classic/adw_test.ts` — loads state
- `adws/workflows/classic/adw_document.ts` — loads state

### New Files

None.

## Step by Step Tasks

### 1. Add `logDir` awareness to ADWState

- Add an optional `logDir` field to `ADWState` (set via constructor or setter)
- Change `getStatePath()`: if `logDir` is set, return `{logDir}/state.json`; otherwise fall back to current `_state_{adwId}.json` path (backward compat during migration)
- Change `save()` to use updated path
- Change `load()` to accept optional `logDir` param — look in `{logDir}/state.json` first, fall back to legacy `_state_` path

### 2. Update callers to pass logDir

- `adw_ralph.ts`: logger is created at line 48, state at line 56. Pass `logger.logDir` to state after creation — or restructure so state gets logDir.
  - **Key decision**: state is created _before_ the build dir exists in some flows. `createLogger()` creates the dir. So: create logger first, then create/load state with logDir.
- `workflow-ops.ts`: pass logDir where available
- Classic workflows (`adw_plan`, `adw_test`, `adw_document`): same pattern

### 3. Clean up legacy path

- Remove fallback once all callers pass logDir
- Delete any existing `_state_*.json` files from `temp/builds/`

### 4. Validate

- Run a ralph workflow or manually verify state.json lands in the build dir
- Confirm no `_state_*.json` files created at `temp/builds/` root

## Acceptance Criteria

- `ADWState.save()` writes to `{logDir}/state.json`
- `ADWState.load()` reads from `{logDir}/state.json`
- No `_state_*.json` files created in `temp/builds/`
- All existing ADWState consumers updated
- Existing workflows still function (state persists across steps)

## Validation Commands

- `grep -r "_state_" adws/src/state.ts` — should show no hardcoded `_state_` path (or only in deprecated fallback)
- `ls temp/builds/_state_*.json` — should return nothing after cleanup
- `bun test adws/tests/` — existing tests pass

## Notes

- The chicken-and-egg problem (state created before logDir exists) is solved by ensuring `createLogger()` runs first — it already `mkdirSync`'s the build dir.
- `ADWState.load()` signature changes — grep all callers to update.
