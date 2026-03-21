---
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, WebFetch
description: Port a Python ADW workflow to TypeScript using Bun and the Claude Agent SDK
argument-hint: [path/to/python/adw.py]
model: opus
---

# Purpose

Port a Python ADW (AI Developer Workflow) script to TypeScript, targeting the Bun runtime and `@anthropic-ai/claude-agent-sdk`. Follow the `Instructions` for critical SDK gotchas learned from prior ports, then execute the `Workflow` step by step.

## Variables

SOURCE_PATH: $0
TARGET_DIR: adws/workflows

## Instructions

- The source Python ADW at `SOURCE_PATH` must be ported to TypeScript in `TARGET_DIR/`
- Use Bun APIs (`Bun.spawn`, `Bun.write`, `import.meta.main`) — no Node-only patterns
- CRITICAL SDK gotchas (these are the most common porting mistakes):
  - `sdk.query()` returns an `AsyncGenerator<SDKMessage, void>`, NOT a Promise. You MUST iterate with `for await...of` to drive execution. Simply `await`-ing it resolves instantly without running the agent.
  - The options object uses `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true` — NOT `bypassPermissions: true`
  - You MUST set `settingSources: ["user", "project", "local"]` or the SDK runs in isolation mode and cannot discover `.claude/commands/` skills or load CLAUDE.md
  - The tool list option is `tools`, NOT `allowedTools`. Omitting it uses the default Claude Code preset which is usually correct.
  - The result message has `type: "result"`, `subtype: "success"` or `"error"`, and a `result` string field
  - Assistant messages have `message.content` as an array of content blocks (text, tool_use, thinking), not a string
- Reuse existing shared modules from `adws/src/` — read them before writing new utilities:
  - `agent-sdk.ts` — `consumeQuery()`, `runPlanStep()`, `runBuildStep()`, `quickPrompt()`, `formatUsage()`, `sumUsage()`, `StepUsage`, `QueryResult`
  - `logger.ts` — `createLogger(adwId, triggerType)` dual console+file logger (returns logger with `.logDir`), `taggedLogger(parent, tag, { logDir, step })` per-agent colored logger with file isolation, `TaggedLogger` interface with `.finalize(ok)` for status tracking
  - `utils.ts` — `makeAdwId()`, `parseJson()`, `checkEnvVars()`, `exec()`, `getProjectRoot()`
  - `git-ops.ts`, `worktree-ops.ts`, `github.ts` — git/GitHub helpers
- For logging assistant messages, use `summarizeContent()` from `agent-sdk.ts` to extract readable text from content block arrays (avoids `[object Object]` in logs)
- Use `parseArgs` from `"util"` for CLI arg parsing (Bun-compatible, no deps)
- Env vars for config: `ADW_PROMPT`, `ADW_WORKING_DIR`, `ADW_MODEL`
- **Per-phase model selection:** When a workflow has steps with different cost/capability needs, use separate env vars per phase with sane defaults:
  - Research/lightweight steps: `ADW_RESEARCH_MODEL` (default: `claude-haiku-4-5-20251001`)
  - Plan/build/generation steps: `ADW_MODEL` (default: `claude-sonnet-4-20250514`)
  - Review/verification steps: `ADW_REVIEW_MODEL` (default: `claude-sonnet-4-20250514`)
  - Use the cheapest model that can handle each phase — haiku for research/read-heavy, sonnet for generation, opus only when explicitly requested via env var
  - See `adw_research-codebase_produce-readme_update-prime.ts` for the pattern: declare per-phase model vars near the top of `runWorkflow()`, read from env with fallback defaults
- Log files go to `agents/{adw-id}/{trigger_type}/execution.log` via `createLogger`
- **Per-agent logging is MANDATORY.** Every step that runs an agent must:
  - Create a `taggedLogger(logger, tag, { logDir: logger.logDir, step: "step-name" })` — this gives the agent a colored console prefix AND writes to its own file at `agents/{adw-id}/{trigger_type}/{step}/{tag}.log`
  - Pass the tagged logger (not the base logger) to the SDK step function
  - Call `tlog.finalize(ok, result.usage)` when the agent completes — this writes `status.json` (with usage stats) in the step folder and renames the log to `.error.log` on failure
  - For parallel agents this is critical for debugging; for sequential steps it provides per-step file isolation
  - See `adw_research-codebase_produce-readme_update-prime.ts` for parallel usage and `adw_plan_build.ts` for sequential usage
- Keep the workflow file focused — delegate SDK interaction to `agent-sdk.ts`, add new step functions there if needed
- When a workflow step invokes a `/skill`, verify the skill exists in `.claude/commands/` before wiring it up
- Use visually distinct step banners: `"═".repeat(60)` surrounding the step name
- **Usage tracking is MANDATORY for all workflows.** Every workflow must:
  - Import `formatUsage`, `sumUsage`, and `StepUsage` from `agent-sdk.ts`
  - Import `writeWorkflowStatus` from `logger.ts`
  - Declare `const allStepUsages: { step: string; usage: StepUsage }[] = []` before the try block
  - After each step, check `result.usage` and push to `allStepUsages` + log with `formatUsage()`
  - In the final summary, log per-step usage and a `TOTAL:` line using `sumUsage()`
  - At the end of the workflow (after the summary log), call `writeWorkflowStatus(logger.logDir, { workflow, adwId, ok, startTime, totals })` — this writes a top-level `status.json` that aggregates all step statuses with usage stats
  - See `adw_plan_build.ts` or `adw_research-codebase_produce-readme_update-prime.ts` for the exact pattern

## Workflow

1. Read the source Python ADW at `SOURCE_PATH` thoroughly — understand every step, subprocess call, and data flow
2. Read existing shared modules in `adws/src/` to understand what's already available (agent-sdk.ts, logger.ts, utils.ts, git-ops.ts)
3. Identify which Python subprocess calls map to SDK `query()` calls vs direct `exec()` calls
4. Identify any `/skill` invocations in the Python code and verify those skills exist in `.claude/commands/`
5. If new SDK step functions are needed (beyond plan/build), add them to `adws/src/agent-sdk.ts` following the existing pattern: create query, consume with `consumeQuery()`, return `QueryResult`
6. Write the TypeScript workflow file to `TARGET_DIR/adw_{workflow_name}.ts` following the `adw_plan_build.ts` pattern: parseArgs entrypoint, getAdw stub, runWorkflow function with step banners and logger
7. Run `bun run adws/workflows/{new_file}.ts --adw-id test-port` with a simple test prompt to verify it works end-to-end
8. Fix any issues found during the test run

## Report

Return a summary of:
- Source file ported and target file created
- Which shared modules were reused vs new code written
- Any new step functions added to `agent-sdk.ts`
- Skills referenced and whether they exist
- Test run result (pass/fail) and any issues encountered