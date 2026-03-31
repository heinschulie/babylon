# Plan: Implement Timekeeper Implementation Gaps

## Metadata

adw_id: `two`
prompt: `Read the existing plan at temp/specs/plan-two-fix-timekeeper-gaps.md and implement it exactly as specified. Save the plan to temp/specs/ with the standard naming convention.`
conversation_id: `current_conversation_id`
task_type: fix
complexity: medium

## Task Description

Implement three critical fixes in the timekeeper agent (`adws/src/timekeeper-agent.ts`) to address gaps between design intent and implementation:

1. **Replace heuristic looping detection with haiku LLM judgment** - Current detection counts tool name repetitions but false-positives on legitimate repeated tool use with different arguments (e.g., 4x `Read` on different files)

2. **Fix broken stalling detection** - Current implementation filters by `entry.timestamp` fields that don't exist in actual JSONL entries, making stalling detection non-functional

3. **Update review command default screenshot path** - Path in `.claude/commands/review.md` references old `agents/{adw_id}/{agent_name}/review_img/` instead of current `temp/builds/{prd}_{adw_id}/steps/{issue}_{step}_review/screenshots/`

## Objective

Fix all three gaps so the timekeeper makes intelligent health judgments using haiku LLM calls for ambiguous cases, stalling detection works correctly via file mtime/line count, and the review command's default screenshot path matches the executor.

## Problem Statement

The timekeeper's core value is discretionary judgment - distinguishing "stuck" from "slow but progressing" in ways that pure timeouts can't. Current implementation loses this because: (a) looping detection triggers on tool name frequency without examining arguments, and (b) stalling detection doesn't work at all due to looking for non-existent timestamps.

## Solution Approach

1. **Two-tier health assessment:** Keep fast heuristic pre-filter for obvious cases, call haiku only for ambiguous cases (same tool name, different args) to preserve discretionary judgment while controlling cost

2. **Line-count + mtime stalling detection:** Track JSONL line count between checks plus file mtime to detect activity without depending on per-entry timestamps

3. **Update review.md path** to match executor's new convention

## Relevant Files

- `adws/src/timekeeper-agent.ts` — Core timekeeper logic requiring changes to all three assessment functions
- `adws/src/agent-sdk.ts` — Contains `quickPrompt()` (line 581) for haiku calls
- `adws/src/utils.ts` — Contains `getWorkflowModels()` (line 361) with `research: "claude-haiku-4-5-20251001"`
- `adws/tests/timekeeper-agent.test.ts` — Tests needing updates for new detection logic
- `.claude/commands/review.md` — Line 10 has stale default path

### New Files

None required. All changes are to existing files.

## Implementation Phases

### Phase 1: Fix stalling detection (broken functionality)

Replace timestamp-based activity detection with line count + mtime tracking.

### Phase 2: Add haiku LLM judgment for ambiguous looping

Add `classifyWithHaiku()` function with intelligent two-tier detection.

### Phase 3: Fix review path + update tests

Update review command and adjust all tests for new logic.

## Step by Step Tasks

### 1. Fix stalling detection in assessStepHealth()

- Add line count tracking to `runTimekeeperWithTermination()` main loop
- Replace timestamp-based `newEntriesSinceCheck` filter (lines 151-154) with line count comparison
- Use `getJsonlLastModified()` as secondary activity signal
- Remove unused `lastCheckTime` parameter, replace with `hasNewActivity: boolean`
- Update stalling logic to use `timeSinceLastNewLine` tracked in main loop

### 2. Refactor detectLooping() for obvious vs ambiguous cases

- Change return type to `{ verdict: "looping" | "ambiguous" | "not_looping"; description?: string; toolCalls?: string[] }`
- **Obvious looping:** Same tool with IDENTICAL arguments 3+ times (verdict: "looping")
- **Ambiguous:** Same tool name 3+ times with DIFFERENT args (verdict: "ambiguous")
- **Not looping:** Diverse tools or <3 repetitions (verdict: "not_looping")
- Update `extractRecentToolCalls()` to return `{ name: string; argsHash: string }[]`

### 3. Add haiku LLM health classification

- Create async `classifyWithHaiku()` function
- Takes last ~10 JSONL lines, current heuristic verdict, and model string
- Calls `quickPrompt()` with research model (haiku) and 15s timeout
- Prompt: "You are a build health monitor. Given these recent agent actions from a JSONL log, classify the agent's health as one of: HEALTHY (making progress), LOOPING (repeating the same action without progress), STALLING (no meaningful activity). Respond with exactly one word."
- Parse single-word response, fallback to heuristic if haiku fails

### 4. Wire haiku into assessStepHealth()

- Make `assessStepHealth()` async
- When `detectLooping()` returns "ambiguous", call `classifyWithHaiku()`
- Haiku HEALTHY → return healthy, LOOPING → return looping, failure → return healthy (safe default)
- Update main loop to `await` the now-async function
- Log haiku classification results

### 5. Update extractRecentToolCalls() to include arguments

- New signature: `extractRecentToolCalls(entries, count): { name: string; args?: string }[]`
- Extract tool arguments from JSONL `message.content[]` structure
- Create args hash from JSON.stringify of input truncated to 200 chars
- Update all callers for new return type

### 6. Fix review command default screenshot path

- In `.claude/commands/review.md` line 10, change:
  - FROM: `review_image_dir: $4 if provided, otherwise '<absolute path to codebase>/agents/<adw_id>/<agent_name>/review_img/'`
  - TO: `review_image_dir: $4 if provided, otherwise the step's build directory at 'temp/builds/{prd}_{adw_id}/steps/{issue}_{step}_review/screenshots/'`

### 7. Update tests

- Remove timestamp-dependent test setup, use line count growth
- Test both obvious looping (identical args) and ambiguous cases (different args)
- Mock haiku call for ambiguous case testing
- Add haiku classification test with mocked `quickPrompt()`
- Add false-positive regression test: 4x `Read` on different files must NOT kill
- Update stalling test to verify line count usage

### 8. Validate implementation

- Run `bun test adws/tests/timekeeper-agent.test.ts` - all tests pass
- Run `bun run check` - no type errors
- Manual verification: create mock JSONL with 4x `Read` on different files, confirm no kill file created

## Testing Strategy

- **Unit tests for `detectLooping()`:** Test obvious loops, ambiguous cases, and non-loops with new return type
- **Unit tests for `assessStepHealth()`:** Test line-count-based activity detection with mocked JSONL data
- **Integration test:** Key regression test - 4x Read on different files must NOT trigger kill
- **Haiku timeout test:** Verify 15s timeout fallback to safe default (healthy)

## Acceptance Criteria

- `detectLooping()` distinguishes identical-arg repetition (obvious) from different-arg repetition (ambiguous)
- `assessStepHealth()` uses line count + mtime for activity, not per-entry timestamps
- Haiku called only for ambiguous cases, not every check (cost control)
- 4x `Read` on different files does NOT trigger kill (false-positive fixed)
- 4x `Bash("npm test")` with identical output DOES trigger kill (true positive preserved)
- Haiku failure/timeout falls back to safe default (healthy)
- Review command default path matches executor convention
- All tests updated and passing, new tests added for haiku path

## Validation Commands

- `bun test adws/tests/timekeeper-agent.test.ts` — Run timekeeper unit tests
- `bun run check` — Type-check all packages
- `grep -n "timestamp" adws/src/timekeeper-agent.ts` — Verify no timestamp-based entry filtering remains
- `grep -n "review_img" .claude/commands/review.md` — Verify old path pattern is gone

## Notes

- Haiku model `claude-haiku-4-5-20251001` already defined in `getWorkflowModels().research`
- `quickPrompt()` at `agent-sdk.ts:581` is simplest haiku call method
- Cost estimate: haiku calls only on ambiguous cases (~1-2 per typical 4-step pipeline = ~$0.01)
- JSONL structure: `{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Read","input":{"file_path":"..."}}]}}`
- Tool args nested in `message.content[].input`