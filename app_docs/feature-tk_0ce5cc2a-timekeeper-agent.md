# Timekeeper Agent Architecture

**ADW ID:** tk_0ce5cc2a
**Date:** 2026-03-30
**Specification:** /Users/heinschulie/Documents/code/babylon/temp/specs/plan-tk_0ce5cc2a-timekeeper-agent-architecture.md

## Overview

Replaced hard per-step timeouts in the Ralph pipeline with an intelligent timekeeper agent that monitors JSONL streams and makes discretionary health judgments. This eliminates false timeouts for slow-but-progressing agents while catching stuck/looping agents early, reducing the 36% retry waste seen in v4.

## What Was Built

- **Timekeeper Agent** - Haiku-class watchdog that monitors `raw_output.jsonl` files and classifies agent health
- **Health State Classification** - Four states: Healthy, Throttled, Stalling, Looping
- **Kill File Mechanism** - Graceful termination signaling via `.kill` files instead of direct process termination
- **Pipeline Integration** - Timekeeper spawned per issue, lifecycle managed by loop-runner
- **Step Runner Polling** - Detects kill files and handles termination with GitHub notifications
- **Updated Timeout Ceilings** - Generous hard limits: 5min (consult), 20min (tdd), 10min (refactor), 15min (review)
- **Screenshot Path Consolidation** - Review screenshots moved to step directories for self-contained build records
- **Comprehensive Tests** - Unit tests for health classification, integration tests for kill file mechanism

## Technical Implementation

### Files Modified

- `adws/src/timekeeper-agent.ts`: New 532-line timekeeper implementation with JSONL monitoring, health assessment, and kill file creation
- `adws/src/loop-runner.ts`: Spawn/terminate timekeeper per pipeline run, wraps pipeline execution in try/finally
- `adws/src/step-runner.ts`: Kill file detection, GitHub comment posting on timekeeper termination
- `adws/src/ralph-pipeline.ts`: Updated timeout values to ceiling values (300s, 1200s, 600s, 900s)
- `adws/src/ralph-executor.ts`: Review screenshot path changed from `agents/{adwId}/review/` to `steps/{stepName}/screenshots/`
- `adws/src/agent-sdk.ts`: Enhanced with step directory context and kill file polling support
- `adws/tests/timekeeper-agent.test.ts`: New 248-line test suite covering health states and kill scenarios
- `adws/tests/ralph-pipeline.test.ts`: Updated for new timeout values

### Key Changes

- **Health Assessment Logic** - Parses JSONL for tool calls, detects looping (3+ same tool calls) and stalling (2+ min silence)
- **Kill File Format** - Structured JSON payload with reason, description, tool call history, and timestamp
- **Pipeline Lifecycle** - Timekeeper spawned before `runPipeline`, terminated in finally block regardless of success/failure
- **Graceful Termination** - Step runner polls for `.kill` files every execution cycle, posts GitHub comments explaining termination reason
- **Self-Contained Build Records** - Screenshots, logs, and status files all live in same step directory structure

## How to Use

The timekeeper runs automatically during Ralph pipeline execution. No manual intervention required.

1. **Pipeline Execution** - When `runLoop` processes an issue, timekeeper spawns automatically
2. **Health Monitoring** - Timekeeper checks step health every 2 minutes (first check at 1 minute)
3. **Automatic Termination** - If agent is looping or stalled, timekeeper creates `.kill` file
4. **Graceful Cleanup** - Step runner detects kill file, posts GitHub comment, completes step status
5. **Build Records** - All artifacts (logs, screenshots, kill files) stored in `temp/builds/{prd}_{adw_id}/steps/`

## Configuration

### Timekeeper Settings
- **Initial Check Delay**: 1 minute (configurable via `initialDelayMs`)
- **Check Interval**: 2 minutes (configurable via `checkIntervalMs`)
- **Stalling Grace Period**: 2 minutes silence before kill (configurable via `stallingGraceMs`)
- **Looping Threshold**: 3+ identical tool calls in recent history triggers immediate kill

### Timeout Ceilings
- **Consult**: 5 minutes (300,000ms) - was 2 minutes
- **TDD**: 20 minutes (1,200,000ms) - was 10 minutes
- **Refactor**: 10 minutes (600,000ms) - was 5 minutes
- **Review**: 15 minutes (900,000ms) - was 5 minutes

## Testing

### Unit Tests
```bash
bun run test adws/tests/timekeeper-agent.test.ts
```
Tests health state classification, JSONL parsing, looping detection, kill file creation.

### Integration Tests
```bash
bun run test adws/tests/ralph-pipeline.test.ts
```
Validates pipeline timeout updates, end-to-end kill file mechanism.

### Full Test Suite
```bash
bun run test adws/tests/
```

## Notes

- **Cost Efficiency** - Uses haiku model for timekeeper since it's simple monitoring task
- **Platform Agnostic** - Kill file approach avoids unreliable direct process termination
- **Circuit Breaker** - Timeout ceilings still provide hard limits if timekeeper itself fails
- **Minimal Disruption** - Preserves existing step-runner and pipeline interfaces
- **Debug Friendly** - Self-contained step directories make troubleshooting easier