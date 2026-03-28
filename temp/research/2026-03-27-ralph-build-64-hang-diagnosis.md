---
date: 2026-03-27T12:00:00+02:00
researcher: Claude
git_commit: beb08a3
branch: hein/feature/issue-64
repository: babylon
topic: 'Why did the adw_ralph build 64_ralph_786f0033 get stuck and require manual kill?'
tags: [research, adw, ralph, agent-sdk, hang, background-task]
status: complete
last_updated: 2026-03-27
last_updated_by: Claude
---

# Research: Ralph Build 64 Hang Diagnosis

## Research Question

We ran `adw_ralph` (ADW ID: `786f0033`, parent issue #64) but it got stuck at some point and had to be killed manually. Why?

## Summary

**Root cause: The `/build` agent started `bun run dev` as a background task, which kept the Claude Code subprocess's stdio pipes open indefinitely. The `sdk.query()` async generator never terminated because it was waiting for pipe EOF, causing `consumeQuery()` to hang forever in the `for await` loop.**

The workflow completed 12 of 14 steps successfully. It got stuck on step `67_14_build_1` — not because the agent failed, but because the agent spawned a long-running child process (`bun run dev`) that prevented the SDK stream from closing.

## Detailed Findings

### Timeline of the Run

| Time | Step | Issue | Status |
|------|------|-------|--------|
| 10:09:46 | Start | — | ✅ |
| 10:09:48 | 65_01_consult | #65 | ✅ pass |
| 10:10:29 | 65_02_tdd | #65 | ✅ pass |
| 10:13:09 | 65_03_refactor | #65 | ✅ pass |
| 10:15:08 | 65_04_review | #65 | ✅ pass → committed 6ff1098 |
| 10:16:54 | 66_05_consult | #66 | ✅ pass |
| 10:17:40 | 66_06_tdd | #66 | ✅ pass |
| 10:20:17 | 66_07_refactor | #66 | ✅ pass |
| 10:21:47 | 66_08_review | #66 | ✅ pass → committed 1b0c00a |
| 10:23:24 | 67_09_consult | #67 | ✅ pass |
| 10:24:23 | 67_10_tdd | #67 | ✅ pass (but see below) |
| 10:27:58 | 67_11_refactor | #67 | ❌ fail — no changes to refactor |
| 10:28:29 | 67_12_review | #67 | ❌ fail — static markup, not reactive |
| 10:31:01 | 67_13_patch_1 | #67 | ✅ pass — wrote patch plan |
| 10:32:17 | 67_14_build_1 | #67 | 🔴 HUNG — agent completed but process never exited |

### Issue #67 TDD Anomaly

The TDD step for #67 reported success but didn't actually commit changes. Evidence:
- Refactor step (67_11_refactor) found `HEAD == pre-TDD SHA` — no code changes existed
- The TDD agent likely wrote code but the changes weren't committed (or were only in working tree)
- Review step confirmed: "implementation is static HTML without the specified reactive functionality"

This triggered the patch-retry loop, which is where the hang occurred.

### The Hang: Step 67_14_build_1

The `/build` agent successfully implemented the reactive timeline. Raw output (`raw_output.jsonl`) shows 72 messages, ending with a clean `"type":"result","subtype":"success"` at line 72.

**But at line 60**, the agent ran:
```json
{"name":"Bash","input":{"command":"bun run dev","description":"Start dev server to test the reactive timeline functionality","run_in_background":true}}
```

This started a `bun run dev` process as a background task within the Claude Code session. The agent then continued its work (git diff, summary), and the session completed normally — Claude Code emitted the final result message.

### Why the Workflow Hung

The data flow:

```
adw_ralph.ts
  → runBuildStep()
    → runSkillStep()
      → sdk.query(prompt)           ← returns AsyncGenerator
      → consumeQuery(query, ...)
        → findFinalResult(query, ...)
          → for await (const message of query) { ... }
            ← HUNG HERE: generator never terminates
```

`findFinalResult()` (`agent-sdk.ts:264`) iterates the async generator with `for await`. It processes the `result` message at line 280-286 but **doesn't break** — it continues waiting for the generator to complete (i.e., for the pipe to close).

The `sdk.query()` generator reads from the Claude Code subprocess's stdout pipe. The `bun run dev` background process, spawned as a child of Claude Code, **inherited the stdout file descriptor**. Even after Claude Code's main logic finished and emitted the result, the pipe stays open because `bun run dev` holds a reference to it.

Result: the generator never yields `done`, `findFinalResult` never returns, `consumeQuery` never returns, `runBuildStep` never returns, and the workflow is stuck forever.

### Evidence Chain

1. **`status.json` missing for `67_14_build_1`** — `buildStep.close()` was never called
2. **Execution log ends at `[result]`** — the `[summary]` and `[usage]` lines that `consumeQuery()` logs *after* the `for await` loop are absent
3. **`raw_output.jsonl` line 72 has `"type":"result"`** — the agent DID complete; the SDK just didn't process the stream termination
4. **`bun run dev` at line 60** — the smoking gun; a non-terminating background process

## Code References

- `adws/workflows/adw_ralph.ts:380-392` — Build step invocation in patch retry loop
- `adws/src/agent-sdk.ts:256-293` — `findFinalResult()` — the `for await` loop that hung
- `adws/src/agent-sdk.ts:297-320` — `consumeQuery()` — calls findFinalResult, never returned
- `adws/src/step-recorder.ts:78-107` — `close()` method that was never called (hence no status.json)
- `temp/builds/64_ralph_786f0033/steps/67_14_build_1/raw_output.jsonl:60` — `bun run dev` background task
- `temp/builds/64_ralph_786f0033/steps/67_14_build_1/raw_output.jsonl:72` — Final result (session completed)
- `temp/builds/64_ralph_786f0033/execution.log:394-407` — Last log entries before hang

## Architecture Documentation

### ADW Ralph Workflow Pattern

Ralph iterates over sub-issues with a consult → TDD → refactor → review pipeline. Failed reviews enter a patch-retry loop (max 2 attempts) of patch-plan → build → re-review. Each step spawns a Claude Code session via `@anthropic-ai/claude-agent-sdk`, consumed as an async generator.

### SDK Stream Consumption Pattern

The `findFinalResult` function processes ALL messages from the generator, not just up to the result. It doesn't break on `type: "result"` — it relies on the generator terminating naturally (pipe EOF). This makes it vulnerable to any scenario where the Claude Code subprocess doesn't fully exit.

## Open Questions

1. **Should `findFinalResult` break after receiving a `result` message?** Adding `if (message.type === "result") { ... break; }` would prevent this class of hang entirely, though it might miss late-arriving messages.
2. **Should the SDK/agent subprocess kill child processes on exit?** The Claude Code process could clean up background tasks before closing stdio.
3. **Why didn't TDD for #67 produce committed changes?** The TDD step reported success but HEAD didn't advance. This is the upstream bug that triggered the patch loop in the first place.
4. **Should there be a timeout on `consumeQuery`?** A per-step timeout would convert hangs into errors that the workflow can handle gracefully.
