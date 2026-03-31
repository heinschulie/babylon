# Plan: Timekeeper Agent Architecture for Ralph Pipeline

## Metadata

adw_id: `tk_0ce5cc2a`
prompt: `tk_0ce5cc2a # Timekeeper Agent Architecture for Ralph Pipeline

## Context

The Ralph pipeline (`adws/src/ralph-pipeline.ts`) runs a 4-step loop per issue: `consult → tdd → refactor → review`. Steps currently use hard `timeout` values that can't distinguish a stuck agent from a slow-but-progressing one. In v4, 3/4 frontend reviews timed out at 300s while actively working (37 tool calls, 6 firecrawl scrapes mid-flight). This caused $3.80 (36%) retry waste from full-pipeline re-runs.

## What to Build

Replace dumb per-step timeouts with a **timekeeper agent** — a haiku-class watchdog that reads each step's `raw_output.jsonl` stream and makes discretionary health judgments. The existing pipeline `timeout` field becomes a generous hard ceiling (circuit breaker) that only fires if the timekeeper itself fails.

## Architecture Decisions

### 1. Timekeeper Scope
- Watches **every step** in the pipeline, not just review.
- **One timekeeper per pipeline run** (not per step). It watches whichever step is currently active by reading the active step's JSONL file.
- The step-runner spawns the timekeeper when the pipeline begins for an issue, kills it when the pipeline completes.

### 2. Health States
The timekeeper classifies the running step into one of four states:

| State | Signal | Action |
|-------|--------|--------|
| **Healthy** | New tool calls appearing since last check. Diverse tool names. File growing. | Do nothing. |
| **Throttled** | `rate_limit_event` in JSONL with no new tool calls. | Treat as healthy — patience, not intervention. |
| **Stalling** | No new JSONL lines in 2+ minutes. No rate_limit_event. | Give one grace interval (2 min). If still stalled after ~4 min total silence, kill. |
| **Looping** | Same tool called 3+ times with similar args in recent tool call history. | Kill immediately. |

### 3. Check Cadence
- **First check at 1 minute** after step start (catches early pathological behavior).
- **Subsequent checks every 2 minutes.**

### 4. Hard Ceilings (Pipeline `timeout` field)
These replace the current timeout values in `adws/src/ralph-pipeline.ts`. They are circuit breakers, not targets.

| Step | Current | New ceiling |
|------|---------|-------------|
| consult | 120s | **5 min** (300_000) |
| tdd | 600s | **20 min** (1_200_000) |
| refactor | 300s | **10 min** (600_000) |
| review | 300s | **15 min** (900_000) |

### 5. Kill Mechanism
The timekeeper does NOT kill the subprocess directly. It writes a `.kill` file in the active step directory. The **step-runner** polls for this file and handles termination.

**Kill file path:** `temp/builds/{prd}_{adw_id}/steps/{issue}_{step}_{name}/.kill`

**Kill file payload:**
```json
{
  "reason": "looping",
  "description": "Agent called mcp__firecrawl__firecrawl_scrape 4 times with similar args in last 6 tool calls",
  "state": "looping | stalling",
  "last_tool_calls": ["firecrawl_scrape", "firecrawl_scrape", "firecrawl_scrape"],
  "lines_at_kill": 89,
  "killed_at": "2026-03-30T14:22:00Z"
}
```

### 6. Notification Ownership
The **step-runner** (not the timekeeper) owns all side effects on kill:
- Posts a GitHub comment on the issue with the kill reason
- Completes the step's `status.json` with failed state, reason, and duration

The timekeeper's scope is strictly: **observe, judge, signal**. It has no GitHub credentials, no step-recorder access, no status.json writes.

### 7. Review Screenshot Path Fix
Move review screenshots from `agents/{adw_id}/review_agent/{issue}_review_img/` to `temp/builds/{prd}_{adw_id}/steps/{issue}_{step}_review/screenshots/`.

This makes the build record self-contained — screenshots live alongside `raw_output.jsonl` and `status.json` for that step.

**Files to change:**
- `adws/src/ralph-executor.ts` — review step image dir construction (line 89)
- `.claude/commands/review.md` — default `review_image_dir` path (line 10)

## Key Files

| File | Relevance |
|------|-----------|
| `adws/src/ralph-pipeline.ts` | Pipeline definition — update `timeout` values to new ceilings |
| `adws/src/loop-runner.ts` | Owns pipeline execution per issue — spawn/kill timekeeper here |
| `adws/src/step-runner.ts` | Step execution loop — poll for `.kill` file, handle termination + GitHub comment + status.json |
| `adws/src/ralph-executor.ts` | Review step — update screenshot path (line 89) |
| `adws/src/step-recorder.ts` | Records step execution details — status.json writes |
| `.claude/commands/review.md` | Review skill — update default review_image_dir |
| `adws/tests/ralph-pipeline.test.ts` | Pipeline tests — update expected timeout values |

## What NOT to Build
- **Parallel review** — Rejected. Git state coordination and dev server correctness problems outweigh throughput gains.
- **PRD-level review** — Rejected. Breaks the per-issue feedback loop, increases blast radius. Per-issue review stays; `/review-build` serves as optional end-gate.
- **Step-level retry** — Out of scope for this change. The timekeeper reduces false kills, which reduces the need for retry. Step-level retry can be revisited separately.`
conversation_id: `unknown`
task_type: feature
complexity: complex

## Task Description

Replace dumb per-step timeouts in the Ralph pipeline with an intelligent timekeeper agent that watches JSONL streams and makes discretionary health judgments. The timekeeper will prevent false timeouts for slow-but-progressing agents while catching stuck/looping agents early.

## Objective

Implement a haiku-class timekeeper agent that monitors step execution via `raw_output.jsonl` files, distinguishes between healthy progress and pathological behavior, and signals termination only when necessary. This will eliminate the 36% retry waste caused by false timeouts in v4.

## Problem Statement

Current pipeline steps use hard timeout values that can't distinguish between a stuck agent and a slow-but-progressing one. This led to 3/4 frontend reviews timing out at 300s in v4 despite being actively working (37 tool calls, 6 firecrawl scrapes mid-flight), causing $3.80 retry waste from full-pipeline re-runs.

## Solution Approach

Create a timekeeper agent that:
1. Monitors `raw_output.jsonl` files for signs of progress (new tool calls, diverse tools)
2. Classifies agent health into 4 states: Healthy, Throttled, Stalling, Looping
3. Uses a `.kill` file mechanism for graceful termination signaling
4. Leaves side effects (GitHub comments, status updates) to the step-runner
5. Operates as circuit breaker with generous timeout ceilings

## Relevant Files

Use these files to complete the task:

- `adws/src/ralph-pipeline.ts` - Contains current timeout values (120s, 600s, 300s, 300s) that need to be updated to ceiling values (300s, 1200s, 600s, 900s)
- `adws/src/loop-runner.ts` - Pipeline orchestrator where timekeeper needs to be spawned per issue at pipeline start and killed at completion
- `adws/src/step-runner.ts` - Step execution engine that needs to poll for .kill file and handle termination with GitHub notifications
- `adws/src/ralph-executor.ts` - Step executor with review image directory path (line 89) that needs updating to new structure
- `adws/src/step-recorder.ts` - Creates step directories and status.json - provides context for kill file location
- `.claude/commands/review.md` - Review command with default image dir path (line 10) that needs updating
- `adws/src/agent-sdk.ts` - Agent execution infrastructure for understanding step execution context
- `adws/src/pipeline.ts` - Pipeline types and validation infrastructure
- `adws/tests/ralph-pipeline.test.ts` - Pipeline tests that may need timeout validation updates

### New Files

- `adws/src/timekeeper-agent.ts` - New timekeeper agent implementation with JSONL monitoring and health assessment logic

## Implementation Phases

### Phase 1: Foundation

Create the timekeeper agent infrastructure and core health monitoring logic. Update timeout ceilings in pipeline definition.

### Phase 2: Core Implementation

Integrate timekeeper spawning/killing into pipeline execution flow. Implement kill file mechanism and step-runner polling.

### Phase 3: Integration & Polish

Update review screenshot paths, add comprehensive tests, validate end-to-end flow with realistic scenarios.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Update Pipeline Timeout Ceilings

- Modify `adws/src/ralph-pipeline.ts` timeout values to new ceiling values:
  - consult: 120_000 → 300_000 (5 minutes)
  - tdd: 600_000 → 1_200_000 (20 minutes)
  - refactor: 300_000 → 600_000 (10 minutes)
  - review: 300_000 → 900_000 (15 minutes)

### 2. Create Timekeeper Agent

- Create `adws/src/timekeeper-agent.ts` with:
  - JSONL file monitoring logic
  - Health state classification (Healthy/Throttled/Stalling/Looping)
  - Kill file creation with structured payload
  - 1-minute initial check, 2-minute subsequent checks
  - Haiku-class implementation (minimal, focused)

### 3. Integrate Timekeeper with Pipeline Execution

- Modify `adws/src/loop-runner.ts` to:
  - Spawn timekeeper process before `runPipeline` call (line 252)
  - Kill timekeeper process after pipeline completion
  - Pass necessary context (logDir, adwId) to timekeeper

### 4. Implement Kill File Polling in Step Runner

- Modify `adws/src/step-runner.ts` to:
  - Poll for `.kill` file during step execution
  - Handle graceful termination when kill file detected
  - Post GitHub comment on issue with kill reason
  - Update step status.json with failure state and kill context

### 5. Update Review Screenshot Paths

- Modify `adws/src/ralph-executor.ts` line 89:
  - Change from `join(cwd, "agents", adwId, "review", "${issue}_review_img")`
  - To new path: `join(logDir, "steps", "${issue}_${step}_review", "screenshots")`
- Update `.claude/commands/review.md` line 10:
  - Change default review_image_dir from old agents path to new steps path structure

### 6. Add Comprehensive Tests

- Add timekeeper agent unit tests for health state classification
- Add integration tests for kill file mechanism
- Update `adws/tests/ralph-pipeline.test.ts` if needed to validate new timeout values
- Test end-to-end flow with mock scenarios (stalling, looping, healthy)

### 7. Validate End-to-End Integration

- Test complete pipeline with timekeeper enabled
- Verify kill file mechanism works correctly
- Confirm GitHub comments and status updates on termination
- Validate review screenshot paths work with new structure

## Testing Strategy

**Unit Tests:**
- Timekeeper health state classification logic with mock JSONL inputs
- Kill file creation and payload structure validation
- JSONL parsing edge cases (malformed, empty, rate limits)

**Integration Tests:**
- Pipeline execution with timekeeper spawn/kill lifecycle
- Kill file polling and step termination flow
- GitHub comment posting on agent termination
- Review screenshot path updates

**End-to-End Tests:**
- Full Ralph pipeline run with pathological agent behavior simulation
- Verify reduced false timeouts compared to hard timeout approach
- Validate graceful degradation when timekeeper itself fails

## Acceptance Criteria

- [ ] Pipeline timeout values updated to ceiling values (5min, 20min, 10min, 15min)
- [ ] Timekeeper agent monitors JSONL files and classifies health states correctly
- [ ] Kill file mechanism allows graceful termination signaling
- [ ] Step-runner polls for kill files and handles termination with GitHub notifications
- [ ] Review screenshot paths use new self-contained build directory structure
- [ ] Timekeeper spawned per pipeline run and properly cleaned up
- [ ] All existing tests pass with updated timeout values
- [ ] New tests cover timekeeper functionality and kill file mechanism
- [ ] Documentation updated to reflect new architecture

## Validation Commands

Execute these commands to validate the task is complete:

- `bun run test adws/tests/ralph-pipeline.test.ts` - Verify pipeline definition tests pass with new timeouts
- `bun run test adws/tests/` - Run all ADW tests to ensure no regressions
- `bun run check` - Run svelte-check to validate types across all apps
- `npx convex dev --once` - Verify Convex backend still compiles correctly
- `bun run build` - Ensure full build succeeds with changes

## Notes

- Timekeeper uses haiku model for cost efficiency since it's a simple monitoring task
- Kill file approach avoids direct process termination which can be unreliable across platforms
- Review path consolidation makes build artifacts self-contained and easier to debug
- Generous timeout ceilings ensure system still has circuit breaker protection if timekeeper fails
- Implementation preserves existing step-runner and pipeline interfaces for minimal disruption