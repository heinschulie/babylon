---
date: 2026-03-24T10:30:00+02:00
researcher: Claude
git_commit: 29e23b3
branch: hein/feature/issue-31-create-test-route
repository: babylon
topic: 'Audit of ADW logging quality for issue #42 ralph run'
tags: [research, observability, logging, adw, ralph]
status: complete
last_updated: 2026-03-24
last_updated_by: Claude
---

# Research: ADW Logging Audit for Issue #42

## Research Question

How well was the work done on issue #42 logged in `temp/builds`? Critical review in the context of improving ADW observability.

## Summary

The ralph run for issue #42 produced a **clean, human-readable execution.log** (199 lines, 15KB) that successfully filters out SDK noise and assistant content — a major improvement over the previous ~32KB noisy logs. `[summary]` lines appear for 8 of 9 work steps. Step folder naming correctly uses the new `{issueNumber}_{counter}_{name}` format. However, **no step-level status.json files were written**, meaning structured summary data exists only in the execution.log text stream and raw_output.jsonl, not in the machine-parseable status files the plan intended. The root cause is that ralph calls SDK functions directly rather than through `runStep()`, which is where `taggedLogger.finalize()` writes status.json.

## Detailed Findings

### 1. execution.log Quality

**File**: `temp/builds/42_ralph_a660c357/execution.log` (199 lines, 15KB)

**What's present:**
- Workflow lifecycle markers (start, 4 iterations, completion)
- Step transitions with clear phase markers (`ITERATION 1/20`, etc.)
- 11 `[result]` lines with subtype and truncated result text
- 11 `[usage]` lines with token counts, cost, duration, turns
- 8 `[summary]` lines with structured status/action/decision/blockers

**What's absent (by design):**
- Zero `[assistant]` content summaries — filtered out as planned
- Zero `[sdk] type=` debug noise — filtered out as planned
- Zero `DEBUG` level entries — only INFO makes it to execution.log

**Verdict**: The log reads as a clean orchestration timeline. You can reconstruct the entire workflow — which issues were selected, what TDD/refactor/review cycle each went through, pass/fail status, cost, and duration — without reading any code or raw output. This is a significant improvement.

### 2. Step Folder Naming

**11 step folders found:**

| Folder | Pattern | Correct? |
|--------|---------|----------|
| `01_select_1` | `{counter}_{name}` (utility) | Yes |
| `05_select_2` | `{counter}_{name}` (utility) | Yes |
| `45_02_tdd` | `{issueNumber}_{counter}_{name}` | Yes |
| `45_03_refactor` | `{issueNumber}_{counter}_{name}` | Yes |
| `45_04_review` | `{issueNumber}_{counter}_{name}` | Yes |
| `43_06_tdd` | `{issueNumber}_{counter}_{name}` | Yes |
| `43_07_refactor` | `{issueNumber}_{counter}_{name}` | Yes |
| `43_08_review` | `{issueNumber}_{counter}_{name}` | Yes |
| `44_09_tdd` | `{issueNumber}_{counter}_{name}` | Yes |
| `44_10_refactor` | `{issueNumber}_{counter}_{name}` | Yes |
| `44_11_review` | `{issueNumber}_{counter}_{name}` | Yes |

**Verdict**: 100% compliance. Issue grouping is clear — `ls` on the steps directory visually groups by issue number. Global counter preserves execution order across issues.

### 3. Step Summary Extraction

**8 of 9 work steps produced `## Step Summary` blocks** in their raw_output.jsonl. The 2 select steps (utility) did not — expected, as they're simple priority-selection prompts.

All 8 summaries were successfully extracted and logged to execution.log as `[summary]` lines. Example:

```
[summary] status=pass action=Implemented template changes using TDD with vertical slices for background color and H1 text decision=Used existing test patterns with file content matching blockers=none
```

**Notable**: The `prompt.txt` files (which capture the SDK-level prompt) don't contain the `## Step Summary` instruction. The instruction lives in the command/skill .md files resolved by Claude Code at runtime. The agents are generating summaries from those instructions, and the stream processor is extracting them correctly.

### 4. Missing: Step-Level status.json

**Critical gap: ALL 11 step directories are missing status.json files.**

This means:
- No structured `AgentStatus` records with `summary` field written to disk
- No machine-parseable step-level pass/fail + usage + summary data
- The top-level `status.json` has an empty `steps: {}` object

**Root cause**: Ralph calls `runTddStep()`, `runRefactorStep()`, etc. directly — these return `QueryResult` but don't invoke `taggedLogger.finalize()`, which is what writes status.json. The `finalize()` path only fires when using the `runStep()` abstraction (used by classic workflows but not ralph).

**Impact**: Summary data flows to execution.log (text) but not to status.json (structured). Downstream tools that need machine-parseable step data can't get it. The plan noted this as a pre-existing bug ("ralph doesn't use `runStep()` helper — not in scope").

### 5. Missing: Agent-Level .log Files

**No `.log` files exist in any step directory.** Same root cause — ralph doesn't use `taggedLogger`, so per-agent log files are never created. Agent output is captured in `raw_output.jsonl` only.

### 6. Raw Output Capture

All 11 steps have `raw_output.jsonl` files ranging from 13.8KB (select steps) to 365KB (review step with screenshots). These capture every SDK message — assistant turns, tool uses, thinking blocks, rate limit events, and final results. This is the complete audit trail.

**One review step produced a screenshot**: `45_04_review/review_img/01_test_route_404_error.png` (9.5KB).

### 7. Top-Level status.json

```json
{
  "workflow": "ralph",
  "adw_id": "a660c357",
  "status": "pass",
  "duration_ms": 1092935,
  "started_at": "2026-03-24T07:54:03.490Z",
  "finished_at": "2026-03-24T08:12:16.425Z",
  "steps": {},
  "totals": {
    "input_tokens": 1011,
    "output_tokens": 40968,
    "cache_read_tokens": 3498096,
    "cache_creation_tokens": 212019,
    "total_cost_usd": 2.715,
    "duration_ms": 1019700,
    "num_turns": 170
  }
}
```

Workflow-level data is correct and complete. The `steps: {}` being empty confirms the status.json gap.

## Scorecard

| Objective | Status | Notes |
|-----------|--------|-------|
| execution.log contains zero `[sdk]` lines | PASS | Zero found |
| execution.log contains zero `[assistant]` lines | PASS | Zero found |
| execution.log contains `[summary]` lines per step | PASS | 8 of 9 work steps (select steps excluded) |
| Step folders named `{issueNumber}_{counter}_{name}` | PASS | 9/9 issue-specific + 2/2 utility steps correct |
| status.json contains `summary` object | FAIL | No step-level status.json files exist |
| All 7 prompt files include Step Summary instruction | PASS (indirect) | Agents produce summaries; instruction is in command/skill files, not in prompt.txt |
| Existing tests pass | PASS | 26 pass, 3 skip, 0 fail |

## Code References

- `adws/src/logger.ts:109-137` — `writeAgentStatus()` with summary support (never called by ralph)
- `adws/src/logger.ts:175-185` — `finalize()` with summary param (never called by ralph)
- `adws/src/agent-sdk.ts:59-73` — `extractStepSummary()` parser (works correctly in stream)
- `adws/src/agent-sdk.ts:225-269` — `findFinalResult()` with summary extraction (working)
- `adws/src/agent-sdk.ts:127-154` — `runStep()` abstraction that calls `finalize()` (not used by ralph)
- `adws/workflows/adw_ralph.ts:174-192` — ralph's direct `runTddStep()` calls (bypasses runStep)

## Open Questions

1. Should ralph be refactored to use `runStep()` so status.json gets written, or should the direct SDK call path also write status.json independently?
2. Should select steps also produce a `## Step Summary`? Currently they don't, and no summary is extracted for them.
3. The `files_changed` field in summaries is sometimes "none" even when files were changed — should this be verified against `git diff` rather than trusting agent self-report?
