# Plan: Fix Timekeeper Implementation Gaps

## Metadata

adw_id: `two`
prompt: `Fix three gaps in the timekeeper implementation: (1) looping detection uses naive heuristics instead of haiku LLM judgment, (2) stalling detection relies on JSONL timestamps that don't exist, (3) review command default screenshot path is stale`
conversation_id: `current`
task_type: fix
complexity: medium

## Task Description

The timekeeper agent (`adws/src/timekeeper-agent.ts`) was built by adw_sdlc (tk_0ce5cc2a) but has three gaps between design intent and implementation:

1. **Looping detection is heuristic, not LLM-based.** The design called for a haiku-class agent that reads JSONL and makes discretionary judgments. The implementation is a pure TypeScript polling loop that counts tool name repetitions. This false-positives on legitimate repeated tool use (e.g., 4x `Read` on different files).

2. **Stalling detection is broken.** `assessStepHealth()` filters JSONL entries by `entry.timestamp`, but actual raw_output.jsonl entries don't have timestamp fields. The fallback to `0` means `newEntriesSinceCheck` is always empty, making every check look stalled. The existing `getJsonlLastModified()` (file mtime) and line count growth are the correct signals.

3. **Review command default path is stale.** `.claude/commands/review.md` line 10 still references `agents/{adw_id}/{agent_name}/review_img/` but the executor now writes to `temp/builds/{prd}_{adw_id}/steps/{issue}_{step}_review/screenshots/`.

## Objective

All three gaps fixed so the timekeeper makes intelligent health judgments using haiku LLM calls for ambiguous cases, stalling detection works correctly via file mtime / line count, and the review command's default screenshot path matches the executor.

## Problem Statement

The timekeeper's core value proposition is discretionary judgment — distinguishing "stuck" from "slow but progressing" in a way that pure timeouts can't. The current implementation loses this because: (a) looping detection triggers on tool name frequency without examining arguments, so `Read("a.ts")` + `Read("b.ts")` + `Read("c.ts")` = false positive, and (b) stalling detection doesn't work at all because it looks for timestamps that don't exist in the JSONL stream.

## Solution Approach

1. **Two-tier health assessment:** Keep the fast heuristic pre-filter for obvious cases (completely idle, obvious infinite loops with identical args). For ambiguous cases (same tool name, different args), call haiku to read the last ~10 JSONL lines and classify health. This keeps cost low (haiku only called when heuristic is uncertain) while preserving the discretionary judgment.

2. **Line-count + mtime stalling detection:** Track JSONL line count between checks. If line count grows, agent is active. If line count is unchanged AND file mtime hasn't advanced, agent is stalled. No dependency on per-entry timestamps.

3. **Update review.md default path** to match the executor's new convention.

## Relevant Files

- `adws/src/timekeeper-agent.ts` — Core timekeeper logic. All three assessment functions need changes.
- `adws/src/agent-sdk.ts` — Contains `quickPrompt()` (line 581) which can make haiku calls. Also contains `createKillFileWatcher()` which is fine as-is.
- `adws/src/utils.ts` — Contains `getWorkflowModels()` (line 361) which defines `research: "claude-haiku-4-5-20251001"`. Use this for the haiku model reference.
- `adws/tests/timekeeper-agent.test.ts` — Existing tests need updating for new detection logic.
- `.claude/commands/review.md` — Line 10, stale default path.

### New Files

- None required. All changes are to existing files.

## Implementation Phases

### Phase 1: Fix stalling detection (broken functionality)

Replace timestamp-based activity detection with line count + mtime tracking. This is the most critical fix because the current implementation literally doesn't work.

### Phase 2: Add haiku LLM judgment for ambiguous looping

Add a `classifyWithHaiku()` function that sends the last ~10 JSONL lines to haiku for health classification. Wire it into `assessStepHealth()` as a second-tier check when the heuristic is uncertain.

### Phase 3: Fix review path + update tests

Update the review command default path and adjust all tests for the new detection logic.

## Step by Step Tasks

### 1. Fix stalling detection in assessStepHealth()

- Add `previousLineCount: number` parameter to `assessStepHealth()` (or track it in the main loop state)
- In `runTimekeeperWithTermination()`, track `lastLineCount` between checks. Before each health assessment, compare current `entries.length` to `lastLineCount`
- Replace the timestamp-based `newEntriesSinceCheck` filter (lines 151-154) with a line count comparison: `const hasNewActivity = entries.length > previousLineCount`
- Also use `getJsonlLastModified()` as a secondary signal — if file mtime advanced since last check, there's activity even if line count didn't change (partial writes)
- Remove the `lastCheckTime` parameter from `assessStepHealth()` signature since it's no longer used for entry filtering. Instead pass `hasNewActivity: boolean`
- Update the stalling logic (lines 166-174): if `!hasNewActivity && !hasRecentRateLimit`, check grace period. The `timeSinceLastEntry` should be tracked in the main loop as `timeSinceLastNewLine`, not computed from `lastCheckTime`

### 2. Refactor detectLooping() to distinguish ambiguous from obvious cases

- Current `detectLooping()` returns `{ isLooping: boolean; description?: string }`
- Change return type to `{ verdict: "looping" | "ambiguous" | "not_looping"; description?: string; toolCalls?: string[] }`
- **Obvious looping (verdict: "looping"):** Same tool with IDENTICAL arguments called 3+ times. Extract args from JSONL entries, not just tool names. Update `extractRecentToolCalls()` to return `{ name: string; argsHash: string }[]` where `argsHash` is a short hash of the stringified parameters
- **Ambiguous (verdict: "ambiguous"):** Same tool name 3+ times but DIFFERENT args. This is the case haiku needs to judge (e.g., `Read("a.ts")`, `Read("b.ts")`, `Read("c.ts")` is progress, but `Bash("npm test")` x3 is likely looping)
- **Not looping (verdict: "not_looping"):** Diverse tool names or fewer than 3 repetitions

### 3. Add haiku LLM health classification

- Add `classifyWithHaiku()` async function to `timekeeper-agent.ts`
- It takes: the last ~10 JSONL lines (raw text), the current heuristic verdict, and a model string
- It calls `quickPrompt()` from `agent-sdk.ts` with model set to the research model (haiku)
- Prompt template: "You are a build health monitor. Given these recent agent actions from a JSONL log, classify the agent's health as one of: HEALTHY (making progress), LOOPING (repeating the same action without progress), STALLING (no meaningful activity). Respond with exactly one word." followed by the JSONL lines
- Parse the single-word response to map to health state
- Add `TimekeeperConfig.model?: string` field, defaulting to `"claude-haiku-4-5-20251001"`
- The `classifyWithHaiku()` call should have its own short timeout (15s) — if haiku itself fails/timeouts, fall back to the heuristic verdict

### 4. Wire haiku into assessStepHealth()

- Make `assessStepHealth()` async (it currently isn't)
- When `detectLooping()` returns `"ambiguous"`, call `classifyWithHaiku()` to get the final verdict
- If haiku says HEALTHY, return healthy. If haiku says LOOPING, return looping. If haiku call fails, return healthy (safe default — let the hard ceiling handle it)
- Update the main loop to `await` the now-async `assessStepHealth()`
- Log the haiku classification result: `[timekeeper] haiku classified ${stepName} as ${verdict}`

### 5. Update extractRecentToolCalls() to include arguments

- Current signature: `extractRecentToolCalls(entries, count): string[]`
- New signature: `extractRecentToolCalls(entries, count): { name: string; args?: string }[]`
- Extract tool arguments from JSONL entries. The entries have a `message.content[]` structure where tool_use blocks contain `name` and `input` fields
- For the args hash in looping detection, use a simple JSON.stringify of the input truncated to 200 chars — enough to distinguish `Read("a.ts")` from `Read("b.ts")` without being expensive
- Update all callers of `extractRecentToolCalls()` to handle the new return type

### 6. Fix review command default screenshot path

- In `.claude/commands/review.md` line 10, change:
  - FROM: `review_image_dir: $4 if provided, otherwise '<absolute path to codebase>/agents/<adw_id>/<agent_name>/review_img/'`
  - TO: `review_image_dir: $4 if provided, otherwise the step's build directory at 'temp/builds/{prd}_{adw_id}/steps/{issue}_{step}_review/screenshots/'`
- Note: The executor (`ralph-executor.ts:90`) already passes the correct path as $4, so this is documentation alignment

### 7. Update tests

- **Fix timestamp-dependent tests:** Remove any test setup that relies on `timestamp` fields in JSONL entries. Use line count growth as the activity signal instead
- **Update looping test:** Test both obvious looping (identical args) and ambiguous cases (different args, same tool). Mock the haiku call for the ambiguous case
- **Add haiku classification test:** Mock `quickPrompt()` to return "HEALTHY" / "LOOPING" / "STALLING" and verify the timekeeper respects the classification
- **Add false-positive regression test:** Create JSONL with 4x `Read` on different files, assert the timekeeper does NOT kill the step (this is the exact scenario that currently false-positives)
- **Update stalling test:** Verify stalling detection uses line count, not timestamps

### 8. Validate

- Run `bun test adws/tests/timekeeper-agent.test.ts` — all tests pass
- Run `bun run check` — no type errors
- Manually verify: create a mock JSONL with 4x `Read` on different files, run timekeeper with short intervals, confirm no kill file created

## Testing Strategy

- **Unit tests for `detectLooping()`:** Test obvious loops (same tool + same args), ambiguous cases (same tool + different args), and non-loops (diverse tools). Verify return type includes `verdict` field
- **Unit tests for `assessStepHealth()`:** Test with mock JSONL data, verifying line-count-based activity detection works. Test the haiku fallback path with mocked `quickPrompt()`
- **Integration test for false-positive prevention:** The key regression test — 4x Read on different files must NOT trigger a kill
- **Haiku timeout test:** Verify that if haiku call times out (15s), the timekeeper falls back to safe default (healthy)

## Acceptance Criteria

- `detectLooping()` distinguishes identical-arg repetition (obvious loop) from different-arg repetition (ambiguous — needs haiku)
- `assessStepHealth()` uses line count growth + file mtime for activity detection, not per-entry timestamps
- Haiku is called only for ambiguous cases, not on every check (cost control)
- 4x `Read` on different files does NOT trigger a kill (false-positive regression fixed)
- 4x `Bash("npm test")` with identical output DOES trigger a kill (true positive preserved)
- Haiku failure/timeout falls back to safe default (healthy), not a kill
- Review command default path in `.claude/commands/review.md` matches executor convention
- All existing tests updated and passing, new tests added for haiku path

## Validation Commands

- `bun test adws/tests/timekeeper-agent.test.ts` — Run timekeeper unit tests
- `bun run check` — Type-check all packages
- `grep -n "timestamp" adws/src/timekeeper-agent.ts` — Verify no timestamp-based entry filtering remains
- `grep -n "review_img" .claude/commands/review.md` — Verify old path pattern is gone

## Notes

- The haiku model (`claude-haiku-4-5-20251001`) is already defined in `getWorkflowModels().research` in `adws/src/utils.ts`
- `quickPrompt()` in `agent-sdk.ts:581` is the simplest way to make a haiku call — it accepts a model option
- The timekeeper runs in the same process as the loop-runner, so it has access to all SDK functions. No need for subprocess communication
- Cost estimate: haiku calls only on ambiguous cases. In a typical 4-step pipeline, maybe 1-2 ambiguous checks per run = ~$0.01 additional cost. Negligible
- The JSONL entry structure from real data: `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"..."}}]}}` — tool args are nested in `message.content[].input`
