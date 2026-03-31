# Timekeeper Agent Implementation and Fixes

**ADW ID:** two
**Date:** 2026-03-30
**Specification:** /Users/heinschulie/Documents/code/babylon/temp/specs/plan-two-implement-timekeeper-fixes.md

## Overview

Implemented a comprehensive timekeeper agent with intelligent health monitoring for ADW step execution. Fixed critical gaps in looping detection, stalling detection, and integrated haiku LLM for ambiguous judgment calls to prevent false positives while maintaining effective intervention.

## What Was Built

- **Complete timekeeper agent** (`adws/src/timekeeper-agent.ts`) with smart health assessment
- **Two-tier looping detection** distinguishing obvious loops from ambiguous cases
- **Haiku LLM integration** for discretionary judgment on ambiguous tool usage patterns
- **Line-count based activity detection** replacing broken timestamp-based stalling detection
- **Kill file mechanism** for graceful step termination with detailed reasoning
- **Comprehensive test suite** with mocked LLM calls and edge case coverage
- **Pipeline integration** across ralph-executor, step-runner, and loop-runner

## Technical Implementation

### Files Modified

- `adws/src/timekeeper-agent.ts`: New 668-line core timekeeper implementation
- `adws/src/agent-sdk.ts`: Added kill file checking and quickPrompt integration
- `adws/src/ralph-executor.ts`: Timekeeper spawning integration
- `adws/src/ralph-pipeline.ts`: Pipeline coordination with timekeeper
- `adws/src/step-runner.ts`: Step-level timekeeper integration
- `adws/src/loop-runner.ts`: Loop-level termination handling
- `adws/tests/timekeeper-agent.test.ts`: 426-line comprehensive test suite
- `adws/tests/ralph-pipeline.test.ts`: Updated pipeline tests

### Key Changes

- **Smart looping detection**: Analyzes tool name + argument hash patterns to distinguish identical repeated calls (obvious loops) from legitimate repeated tool usage with different arguments (ambiguous)
- **Haiku LLM judgment**: Calls `claude-haiku-4-5-20251001` for 15-second classification of ambiguous cases, falling back to safe defaults on timeout
- **Activity-based stalling**: Tracks JSONL line count growth and file modification times instead of non-existent per-entry timestamps
- **Kill file payload**: Structured termination signals with reason, description, state, last tool calls, and timing data
- **Graceful termination**: 2-minute grace periods with throttling awareness for rate-limited scenarios

## How to Use

The timekeeper runs automatically during ADW step execution:

1. **Automatic spawning**: Pipeline automatically spawns timekeeper for each step
2. **Health monitoring**: Monitors `raw_output.jsonl` files every 2 minutes after 1-minute initial delay
3. **Intervention signals**: Creates `.kill` files when intervention needed
4. **Termination handling**: Step runner checks for kill files and terminates gracefully

### Configuration

Default timekeeper config (customizable via `TimekeeperConfig`):
- `initialDelayMs: 60000` - 1 minute before first check
- `checkIntervalMs: 120000` - 2 minutes between checks
- `stallingGraceMs: 120000` - 2 minute grace period for stalling

## Testing

- **Unit tests**: 426-line test suite covering all detection scenarios
- **Regression tests**: Specifically validates that 4x `Read` on different files doesn't trigger false positive kills
- **Edge case coverage**: Haiku timeout handling, kill file parsing, rate limiting scenarios
- **Mocked integrations**: LLM calls mocked for deterministic testing

Run tests with:
```bash
bun test adws/tests/timekeeper-agent.test.ts
```

## Notes

- **Cost optimization**: Haiku calls only for ambiguous cases (~$0.01 per 4-step pipeline)
- **False positive prevention**: Key regression test ensures legitimate repeated tool usage with different arguments doesn't trigger kills
- **Rate limiting awareness**: Distinguishes between stalling and rate-limited throttling
- **Remaining gap**: Review command screenshot path update not yet implemented (`.claude/commands/review.md` line 10 still uses old path pattern)

The timekeeper provides discretionary judgment that pure timeouts cannot, distinguishing between "stuck" and "slow but progressing" scenarios through intelligent pattern analysis and LLM-assisted classification.