# Plan: Unify classify-issue across ADW workflows

## Metadata
adw_id: `a`
prompt: `Consolidate issue classification so it's consistently applied through all issue-driven ADW workflows, eliminate the dual execution path, fix the /patch type mismatch, and remove dead code`
task_type: refactor
complexity: medium

## Task Description
Issue classification (`/classify_issue`) determines whether a GitHub issue is a `/chore`, `/bug`, or `/feature`, which drives:
1. Branch naming prefix (`hein/{type}/issue-{num}-...`)
2. Plan template selection (each type has a distinct planning prompt with different structure)

Currently this only works in `adw_plan.ts`. All composite workflows (`plan_build`, `sdlc`, etc.) skip classification entirely — they take a raw `ADW_PROMPT` string and pass it directly to `runPlanStep()` with the generic `/plan` command instead of the type-specific `/chore`, `/bug`, or `/feature` command. This means composites produce generic plans instead of type-tailored ones, and branches lack the issue-type prefix.

Additionally:
- Two divergent code paths exist for classification: `adw_plan.ts` uses `quickPrompt()` (new SDK pipeline); `workflow-ops.ts:classifyIssue()` uses `executeTemplate()` (old CLI-subprocess pipeline)
- `adw_test.ts` imports `classifyIssue` but never calls it (dead import)
- The `classify_issue.md` prompt tells the LLM to respond with `/patch`, but `IssueClassSlashCommand` in `schemas.ts` is `z.enum(["/chore", "/bug", "/feature"])` — `/patch` would fail Zod validation
- `createOrFindBranch()` and several other functions in `workflow-ops.ts` use the old `executeTemplate` pipeline and are not called by any current workflow

## Objective
When complete:
- Any workflow that starts from a GitHub issue (via `--issue`) will classify that issue and use the type-specific planning template
- A single `classifyIssue()` function exists, using the standardized SDK pipeline
- The `/patch` type mismatch is resolved
- Dead code is removed
- Composite workflows that receive `--issue` benefit from classification without requiring `ADW_PROMPT`

## Problem Statement
Classification exists but is siloed in `adw_plan.ts`. The 6 composite workflows that include a plan step all bypass it, producing generic plans. Two execution pipelines coexist for the same operation. Type definitions don't match the prompt's output space.

## Solution Approach
1. Create a `classifyIssue()` step function in `agent-sdk.ts` using `runSkillStep()`, replacing both existing paths
2. Add issue-fetching + classification as an optional preamble in composite workflows when `--issue` is provided (without `ADW_PROMPT`)
3. Route classified issues to the correct `/chore`, `/bug`, or `/feature` planning command instead of generic `/plan`
4. Fix the Zod schema and classify prompt to align on supported types
5. Clean up dead code in `workflow-ops.ts` and `adw_test.ts`

## Relevant Files
Use these files to complete the task:

- `adws/src/agent-sdk.ts` — Add `runClassifyStep()` using `runSkillStep()` pattern
- `adws/src/schemas.ts` — Fix `IssueClassSlashCommand` enum to include or exclude `/patch`
- `adws/src/workflow-ops.ts` — Remove old `classifyIssue()` function; assess which other functions are dead code from the old pipeline
- `adws/src/agent.ts` — Contains `executeTemplate()` and old `SLASH_COMMAND_MODEL_MAP`; check if still needed after migration
- `adws/workflows/adw_plan.ts` — Refactor to use new `runClassifyStep()`; extract shared issue→classify→branch→plan logic
- `adws/workflows/adw_plan_build.ts` — Add optional issue-driven path
- `adws/workflows/adw_plan_build_review.ts` — Add optional issue-driven path
- `adws/workflows/adw_plan_build_test.ts` — Add optional issue-driven path
- `adws/workflows/adw_plan_build_test_review.ts` — Add optional issue-driven path
- `adws/workflows/adw_plan_build_document.ts` — Add optional issue-driven path
- `adws/workflows/adw_sdlc.ts` — Add optional issue-driven path
- `adws/workflows/adw_test.ts` — Remove dead `classifyIssue` import
- `.claude/commands/classify_issue.md` — Fix `/patch` in command mapping to align with schema
- `.claude/commands/chore.md` — Reference: chore plan template (read-only)
- `.claude/commands/bug.md` — Reference: bug plan template (read-only)
- `.claude/commands/feature.md` — Reference: feature plan template (read-only)
- `adws/src/github.ts` — Reference: `fetchIssue()`, `getRepoUrl()`, `extractRepoPath()` (read-only)

## Implementation Phases
### Phase 1: Foundation
Fix the type mismatch and create the unified classification step function. Remove dead code.

### Phase 2: Core Implementation
Extract issue-driven planning into a shared utility. Refactor `adw_plan.ts` to use it. Add the issue-driven path to composite workflows.

### Phase 3: Integration & Polish
Validate all workflows accept `--issue` correctly. Ensure classified issues route to type-specific planning templates. Remove old pipeline code if fully unused.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Fix the /patch type mismatch
- In `adws/src/schemas.ts`: decide whether `/patch` is a valid issue class. Currently the `adw_patch.ts` workflow is invoked differently (via `adw_patch` keyword in issue comments, not via classification). Remove `/patch` from `classify_issue.md`'s command mapping since it's not a planning type — it has its own workflow trigger.
- In `.claude/commands/classify_issue.md`: remove the line `- Respond with /patch if the issue is a patch.`
- Verify `IssueClassSlashCommand` in `schemas.ts` stays as `z.enum(["/chore", "/bug", "/feature"])` — this is correct

### 2. Create runClassifyStep in agent-sdk.ts
- Add a `runClassifyStep()` function following the `runSkillStep()` pattern:
  ```ts
  export function runClassifyStep(
    issueJson: string,
    options: RunStepOptions = {}
  ): Promise<QueryResult> {
    return runSkillStep(`/classify_issue ${issueJson}`, options);
  }
  ```
- This replaces both the inline `quickPrompt("/classify_issue ...")` in `adw_plan.ts` and the `classifyIssue()` function in `workflow-ops.ts`

### 3. Create shared issue-to-plan utility in utils.ts
- Add a `classifyAndRoute()` function that:
  - Takes a `QueryResult` from `runClassifyStep()`
  - Parses the classification (`/chore`, `/bug`, `/feature`)
  - Returns the classification string and the corresponding planning slash command
- Add a `buildIssuePlanPrompt()` function that:
  - Takes issue number, adwId, and issue JSON
  - Returns the prompt string formatted for the type-specific planning command (e.g., `/bug {issueNumber} {adwId} {issueJson}`)
- Add a `fetchAndClassifyIssue()` higher-level function that:
  - Fetches the issue via `fetchIssue()`
  - Runs classification via `runClassifyStep()`
  - Returns `{ issue, issueClass, planCommand, planPrompt }` or an error

### 4. Refactor adw_plan.ts to use shared utilities
- Replace inline `quickPrompt("/classify_issue ...")` (lines 96-118) with `runClassifyStep()`
- Replace inline branch name generation `quickPrompt(branchPrompt, ...)` with a call through the shared utility
- Replace the generic `runPlanStep(planPrompt, ...)` with the type-routed command: instead of `/plan {adwId} {prompt}`, use `/{issueClass} {issueNumber} {adwId} {issueJson}` to invoke the type-specific template
- Verify the workflow still produces correctly-prefixed branches and type-specific plans

### 5. Add issue-driven path to composite workflows
- For each of the 6 composite workflows (`plan_build`, `plan_build_review`, `plan_build_test`, `plan_build_test_review`, `plan_build_document`, `sdlc`):
  - The workflow currently requires `ADW_PROMPT` env var and fails without it
  - Add logic: if `--issue` is provided and `ADW_PROMPT` is NOT set, use `fetchAndClassifyIssue()` to derive the plan prompt and command
  - If `ADW_PROMPT` IS set, use the existing generic `/plan` path (prompt-driven, no classification)
  - This makes `--issue` and `ADW_PROMPT` two alternative input modes
  - Update the plan step call to use the type-specific command when issue-driven
- Keep changes minimal: the issue-driven preamble should be ~15 lines per workflow, ideally extracted into the shared utility so it's a single function call

### 6. Remove dead code
- `adws/workflows/adw_test.ts` line 45: remove `classifyIssue` from the import (it's unused)
- `adws/src/workflow-ops.ts`: remove `classifyIssue()` function (lines 80-116) — replaced by `runClassifyStep()`
- `adws/src/workflow-ops.ts`: assess whether `createOrFindBranch()`, `buildPlan()`, `implementPlan()`, `generateBranchName()`, `createCommit()`, `createPullRequest()`, `createAndImplementPatch()` are still called anywhere. If they're only used by the old pipeline, mark them for deprecation or removal.
- `adws/src/agent.ts`: check if `executeTemplate()` is still called after removing `classifyIssue()` from `workflow-ops.ts`. If `workflow-ops.ts` was the only consumer, the old pipeline may be fully dead.

### 7. Validate
- Run `bun run check` if applicable
- Verify `adw_plan.ts` still works: `bun run adws/workflows/adw_plan.ts --adw-id test --issue 1` (dry run — will fail on issue fetch but should parse args correctly)
- Verify composite workflows accept `--issue` without `ADW_PROMPT`
- Grep for remaining references to old `classifyIssue` import and `executeTemplate` calls
- Verify no `/patch` in `classify_issue.md` command mapping

## Testing Strategy
- Run `grep -r 'classifyIssue' adws/` to verify old function is fully removed and no dangling imports remain
- Run `grep -r 'executeTemplate' adws/` to check if old pipeline is still referenced
- Run `grep '/patch' .claude/commands/classify_issue.md` to verify `/patch` is removed from mapping
- Type-check with `bun run check` or `tsc --noEmit` on the adws directory
- Manual smoke test: run `adw_plan.ts` and one composite workflow with `--issue` to verify classification flows through

## Acceptance Criteria
- `runClassifyStep()` exists in `agent-sdk.ts` and is the single classification entry point
- All 7 workflows that include a plan step (`adw_plan`, `adw_plan_build`, `adw_plan_build_review`, `adw_plan_build_test`, `adw_plan_build_test_review`, `adw_plan_build_document`, `adw_sdlc`) support `--issue` as an alternative to `ADW_PROMPT`
- When `--issue` is provided, the correct type-specific planning template (`/chore`, `/bug`, `/feature`) is invoked
- `IssueClassSlashCommand` schema and `classify_issue.md` prompt agree on the same set of valid types
- No dead imports of `classifyIssue` remain
- Old `classifyIssue()` function in `workflow-ops.ts` is removed
- Zero references to `executeTemplate` in workflow files (only in `agent.ts` and `workflow-ops.ts` if legacy functions remain)

## Validation Commands
Execute these commands to validate the task is complete:

- `grep -r 'classifyIssue' adws/workflows/` — expect 0 matches (no dead imports)
- `grep -c 'runClassifyStep' adws/src/agent-sdk.ts` — expect 1 (function defined)
- `grep '/patch' .claude/commands/classify_issue.md` — expect 0 matches
- `grep -c 'fetchAndClassifyIssue\|issue-driven' adws/workflows/adw_plan_build.ts adws/workflows/adw_sdlc.ts` — expect >= 1 per file
- `grep -c 'executeTemplate' adws/workflows/*.ts` — expect 0

## Notes
- The old pipeline (`agent.ts:executeTemplate` → `promptClaudeCode` → CLI subprocess) and the new pipeline (`agent-sdk.ts:runSkillStep` → `createSDK` → SDK query) coexist. This refactor moves classification to the new pipeline. Full removal of the old pipeline is out of scope but should be tracked as a follow-up.
- `createOrFindBranch()` in `workflow-ops.ts` contains useful branch-detection logic (checking state, finding existing branches) that the composite workflows may want when running in issue-driven mode. Consider whether to port this logic to the new pipeline or keep it for now.
- Branch name generation currently uses `quickPrompt()` with a raw prompt. This works but is an LLM call for string formatting — consider whether a deterministic function would be more reliable.

## Unresolved Questions
- Remove old pipeline (`agent.ts`, `executeTemplate`) entirely or keep for backwards compat?
- Should composite workflows also create branches when issue-driven, or only classify + plan?
- `generateBranchName()` via LLM — worth replacing with deterministic formatting?
