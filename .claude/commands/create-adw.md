---
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, WebFetch
description: Create a new TypeScript ADW workflow from a list of slash commands
argument-hint: [comma-separated slash commands e.g. /plan, /build, /review]
model: opus
---

# Purpose

Create a new TypeScript ADW (AI Developer Workflow) that chains the specified slash commands into a sequential workflow. Each command becomes a step executed via the Claude Agent SDK. Follow the `Instructions` for SDK patterns and conventions, then execute the `Workflow` step by step.

## Variables

COMMANDS: $0
PROMPT: $1
TARGET_DIR: adws/workflows
SHARED_SRC: adws/src

## Instructions

- Parse `COMMANDS` as a comma-separated list of slash commands (e.g. `/plan,/build,/review`)
- Each command becomes a numbered step in the workflow, executed sequentially
- The `PROMPT` variable, if it is provided, will give further instructions about how the adw should behave.
- The workflow file name is prefixed with `adw_` and derived from the command names joined by underscores, preserving hyphens within command names (e.g. `/research-codebase,/produce-readme` → `adw_research-codebase_produce-readme.ts`). Only use underscores as the separator BETWEEN commands, never replace hyphens within a command name.
- Use Bun APIs (`Bun.spawn`, `Bun.write`, `import.meta.main`) — no Node-only patterns
- CRITICAL SDK gotchas (these are the most common mistakes):
  - `sdk.query()` returns an `AsyncGenerator<SDKMessage, void>`, NOT a Promise. You MUST iterate with `for await...of` to drive execution. Simply `await`-ing it resolves instantly without running the agent.
  - The options object uses `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true` — NOT `bypassPermissions: true`
  - You MUST set `settingSources: ["user", "project", "local"]` or the SDK runs in isolation mode and cannot discover `.claude/commands/` skills or load CLAUDE.md
  - The tool list option is `tools`, NOT `allowedTools`. Omitting it uses the default Claude Code preset which is usually correct.
  - The result message has `type: "result"`, `subtype: "success"` or `"error"`, and a `result` string field
  - Assistant messages have `message.content` as an array of content blocks (text, tool_use, thinking), not a string
- Reuse existing shared modules from `SHARED_SRC` — read them before writing new utilities:
  - `agent-sdk.ts` — `consumeQuery()`, `runPlanStep()`, `runBuildStep()`, `runReviewStep()`, `quickPrompt()`, `formatUsage()`, `sumUsage()`, `StepUsage`, `QueryResult`
  - `logger.ts` — `createLogger(adwId, triggerType)` dual console+file logger (returns logger with `.logDir`), `taggedLogger(parent, tag, { logDir, step })` per-agent colored logger with file isolation, `TaggedLogger` interface with `.finalize(ok)` for status tracking
  - `utils.ts` — `makeAdwId()`, `parseJson()`, `checkEnvVars()`, `exec()`, `getProjectRoot()`
  - `git-ops.ts`, `worktree-ops.ts`, `github.ts` — git/GitHub helpers
- For logging assistant messages, use `summarizeContent()` from `agent-sdk.ts` to extract readable text from content block arrays
- Use `parseArgs` from `"util"` for CLI arg parsing (Bun-compatible, no deps)
- Env vars for config: `ADW_PROMPT`, `ADW_WORKING_DIR`, `ADW_MODEL`, `ADW_REVIEW_MODEL`
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
- Use visually distinct step banners: `"═".repeat(60)` surrounding the step name
- **Usage tracking is MANDATORY for all workflows.** Every workflow must:
  - Import `formatUsage`, `sumUsage`, and `StepUsage` from `agent-sdk.ts`
  - Import `writeWorkflowStatus` from `logger.ts`
  - Declare `const allStepUsages: { step: string; usage: StepUsage }[] = []` before the try block
  - After each step, check `result.usage` and push to `allStepUsages` + log with `formatUsage()`
  - In the final summary, log per-step usage and a `TOTAL:` line using `sumUsage()`
  - At the end of the workflow (after the summary log), call `writeWorkflowStatus(logger.logDir, { workflow, adwId, ok, startTime, totals })` — this writes a top-level `status.json` that aggregates all step statuses with usage stats
  - See `adw_plan_build.ts` or `adw_research-codebase_produce-readme_update-prime.ts` for the exact pattern
- Data passing between steps:
  - `/plan` produces a plan file path — extract it from the result text or fall back to scanning `specs/`
  - `/build` consumes a plan file path
  - `/review` consumes the original prompt and plan file path
  - `/test` runs after build with no special input
  - For custom commands, assume they take the original prompt unless the command name suggests otherwise
- Verify every `/command` in `COMMANDS` exists in `.claude/commands/` before wiring it up
- Follow the pattern established in `adws/workflows/adw_plan_build.ts` and `adws/workflows/adw_plan_build_review.ts`

## Workflow

1. Parse `COMMANDS` into an ordered list of command names (strip `/` prefix)
2. Read existing shared modules in `SHARED_SRC` to understand available step functions: `agent-sdk.ts`, `logger.ts`, `utils.ts`
3. Read existing workflow files in `TARGET_DIR` to understand the established patterns (`adw_plan_build.ts`, `adw_plan_build_review.ts`)
4. For each command in the list, verify the corresponding skill exists in `.claude/commands/{command}.md` — log a warning if missing
5. Identify which commands already have step functions in `agent-sdk.ts` (e.g. `runPlanStep`, `runBuildStep`, `runReviewStep`) vs which need new ones
6. If new step functions are needed, add them to `SHARED_SRC/agent-sdk.ts` following the existing pattern: create query with `/skill` prompt, consume with `consumeQuery()`, return `QueryResult`
7. Write the workflow file to `TARGET_DIR/adw_{command_names_joined}.ts` with:
   - JSDoc header with usage example
   - `parseArgs` entrypoint with `--adw-id` flag
   - `getAdw()` stub reading from env vars
   - `runWorkflow()` function with step banners, logger, and sequential step execution
   - Data passing between steps (plan path extraction, prompt forwarding, etc.)
   - Duration tracking and final summary log
8. Run `bun run TARGET_DIR/adw_{new_file}.ts --adw-id test-create` with `ADW_PROMPT="test" ADW_WORKING_DIR=$(pwd)` to verify it parses and starts correctly
9. Fix any issues found during the test run

## Report

Return a summary of:

- Commands parsed and workflow file created
- Which commands had existing step functions vs new ones added
- Any commands that were missing from `.claude/commands/` (warnings)
- Data flow between steps (what each step produces/consumes)
- Test run result and any issues encountered
