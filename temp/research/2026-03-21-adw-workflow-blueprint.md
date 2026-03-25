---
date: 2026-03-21T00:00:00+02:00
researcher: Claude
git_commit: e82f88e
branch: al
repository: babylon
topic: 'ADW Workflow Anatomy, Data Flow, and Blueprint'
tags: [research, codebase, adw, workflows, agent-sdk, blueprint]
status: complete
last_updated: 2026-03-21
last_updated_by: Claude
---

# Research: ADW Workflow Blueprint

## Research Question

Explain the anatomy and data flow of the various ADW workflow types in `adws/workflows/`, including how the `/create-adw` and `/port-adw` commands build them. Produce a document that serves as the definitive blueprint going forward.

## Summary

ADWs (AI Developer Workflows) are TypeScript scripts that chain Claude Agent SDK calls into multi-step pipelines. Each workflow is a standalone Bun script invoked via `bun run adws/workflows/adw_<name>.ts --adw-id <id> [--issue <number>]`. Workflows delegate SDK interaction to shared modules in `adws/src/`, invoke Claude Code slash commands (skills) as their steps, and report progress via GitHub issue comments and structured log files. Two meta-commands (`/create-adw`, `/port-adw`) automate the creation of new workflows from scratch or from Python sources.

There are **13 workflow files** spanning three architectural patterns:
1. **Single-step** (4): plan, build, test, review, document, patch — each wraps one skill
2. **Sequential multi-step** (7): plan_build, plan_build_test, plan_build_review, plan_build_test_review, plan_build_document, sdlc — linear chains
3. **Parallel multi-step** (1): research-codebase_produce-readme_update-prime — fan-out/fan-in

---

## Detailed Findings

### 1. Canonical Workflow Anatomy

Every workflow file follows the same structural skeleton:

```
┌─────────────────────────────────────────────────────────┐
│  1. JSDoc header (purpose, usage example)                │
│  2. Imports (agent-sdk, logger, utils, github)           │
│  3. Step constants (STEP_PLAN = "plan", TOTAL_STEPS = N) │
│  4. async function runWorkflow(adwId, issueNumber?)      │
│     ├── startTime, createLogger                          │
│     ├── standardizeGetAdw → prompt, workingDir, models   │
│     ├── createCommentStep + createFinalStatusComment     │
│     ├── allStepUsages[], stepStatuses[]                  │
│     ├── try {                                            │
│     │   ├── Step 1: banner → taggedLogger → runXxxStep   │
│     │   │   ├── usage tracking                           │
│     │   │   ├── success? finalize(true) + commentStep    │
│     │   │   └── failure? finalize(false) + early return  │
│     │   ├── Data extraction (e.g. planPath)              │
│     │   ├── Step 2: ...                                  │
│     │   ├── Step N: ...                                  │
│     │   ├── Final summary log (per-step + totals)        │
│     │   ├── writeWorkflowStatus()                        │
│     │   └── commentFinalStatus()                         │
│     └── } catch { exception handling }                   │
│  5. if (import.meta.main) { parseArgs, runWorkflow }     │
└─────────────────────────────────────────────────────────┘
```

**Key invariants:**
- `parseArgs` from `"util"` (Bun-compatible, no deps)
- CLI always accepts `--adw-id` (required) and `--issue` (optional)
- `standardizeGetAdw()` reads `ADW_PROMPT` and `ADW_WORKING_DIR` env vars
- `getWorkflowModels()` reads `ADW_MODEL`, `ADW_RESEARCH_MODEL`, `ADW_REVIEW_MODEL`
- Every agent step gets its own `taggedLogger` with `.finalize()` call
- Usage is tracked per-step in `allStepUsages[]` and summed at the end
- GitHub comments are gated on `issueNumber` being provided

### 2. The Shared Module Layer (`adws/src/`)

#### 2.1 agent-sdk.ts — SDK Wrapper

The core abstraction. All SDK interaction flows through this module.

**Types:**
- `StepUsage` (line 10): `input_tokens`, `output_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `total_cost_usd`, `duration_ms`, `num_turns`
- `QueryResult` (line 20): `success`, `error?`, `session_id?`, `result?`, `usage?`

**Core function — `consumeQuery()`** (line 94):
- Takes the `AsyncGenerator` returned by `sdk.query()` and iterates it with `for await...of`
- Collects the final `type: "result"` message
- Extracts usage via `extractUsage()` (line 54)
- Returns `QueryResult`

**Step functions** (all follow identical pattern):
| Function | Line | Slash Command | Key Input |
|----------|------|---------------|-----------|
| `runPlanStep()` | 136 | `/plan <adwId> <prompt>` | prompt string |
| `runBuildStep()` | 170 | `/build <planPath>` | plan file path |
| `runReviewStep()` | 203 | `/review <adwId> <specPath>` | ADW ID + spec path |
| `runTestStep()` | 378 | `/test` | (none) |
| `runDocumentStep()` | 341 | `/document <adwId> [specPath] [screenshotsDir]` | ADW ID, optional spec + screenshots |
| `runPatchPlanStep()` | 412 | `/patch <adwId> <changeRequest> [specPath]` | ADW ID + change request |
| `runResearchCodebaseStep()` | 237 | `/research-codebase <question>` | research question |
| `runProduceReadmeStep()` | 274 | `/produce-readme <sourcePaths> <outputPath> [mode]` | source paths + output |
| `runUpdatePrimeStep()` | 309 | `/update_prime` | (none) |
| `quickPrompt()` | 449 | (raw prompt, no slash command) | prompt string |

**SDK initialization** (repeated in every step function):
```ts
const sdk = new ClaudeSDK({ model, cwd,
  permissionMode: "bypassPermissions",
  allowDangerouslySkipPermissions: true,
  settingSources: ["user", "project", "local"],
});
```

**Utilities:**
- `formatUsage()` (line 70) — compact one-line usage string
- `sumUsage()` (line 78) — reduce array of StepUsage into totals
- `summarizeContent()` (line 35) — extract readable text from SDK content blocks

#### 2.2 logger.ts — Structured Logging

**`createLogger(adwId, triggerType)`** (line 210):
- Dual output: console + `agents/{adwId}/{triggerType}/execution.log`
- Returns Logger with `.logDir` property

**`taggedLogger(parent, tag, opts)`** (line 95):
- Per-agent colored console prefix
- Writes to `{logDir}/{step}/{tag}.log`
- `finalize(ok, usage?)`: writes `status.json`, renames to `.error.log` on failure

**`writeWorkflowStatus(logDir, opts)`** (line 167):
- Aggregates all step `status.json` files
- Writes top-level `status.json` with workflow totals

**Log directory structure:**
```
agents/{adwId}/{triggerType}/
  execution.log          ← shared timeline
  status.json            ← workflow-level aggregate
  {step}/
    {agent}.log          ← per-agent log (or .error.log on failure)
    status.json          ← per-step status with usage
```

#### 2.3 utils.ts — Shared Utilities

**Types:** `AdwRecord`, `FinalStatusOpts`, `WorkflowOptions`, `WorkflowModels`, `ReviewResult`, `ReviewIssue`

**Key functions:**
- `standardizeGetAdw()` (line 419) — reads `ADW_PROMPT`, `ADW_WORKING_DIR` env vars, returns `AdwRecord`
- `getWorkflowModels()` (line 408) — reads `ADW_MODEL`, `ADW_RESEARCH_MODEL`, `ADW_REVIEW_MODEL` with defaults
- `extractPlanPath()` (line 294) — regex + fallback directory scan for plan file
- `createCommentStep()` (line 355) — factory for GitHub issue progress comments
- `createFinalStatusComment()` (line 370) — factory for final markdown status table
- `parseReviewResult()` (line 29) — parse review JSON from agent output
- `extractReviewVerdict()` (line 69) — PASS / FAIL / PASS_WITH_ISSUES from review

#### 2.4 github.ts — GitHub CLI Wrapper

All functions use the `gh` CLI tool.

- `makeIssueComment()` (line 74) — auto-prepends `[ADW-AGENTS]` bot identifier
- `postReviewToIssue()` (line 218) — uploads screenshots to R2, builds markdown comment with verdict + issues
- `fetchIssue()` (line 47) — fetches issue details
- `fetchOpenIssues()` (line 117) — lists open issues (up to 1000)
- `findKeywordFromComment()` (line 183) — searches issue comments for keyword triggers

#### 2.5 git-ops.ts — Git Operations

- `createBranch()` (line 63) — create + checkout, with exists-fallback
- `commitChanges()` (line 84) — `git add -A` + commit
- `pushBranch()` (line 20) — push with `-u`
- `finalizeGitOperations()` (line 214) — push → check PR → create PR if needed

#### 2.6 worktree-ops.ts — Isolated Worktrees

- `createWorktree()` (line 7) — creates `trees/{adwId}/` from `origin/main`
- `findNextAvailablePorts()` (line 173) — deterministic port assignment (backend: 9100-9114, frontend: 9200-9214)
- `removeWorktree()` (line 77) — cleanup with force-remove fallback

### 3. Workflow Taxonomy

#### 3.1 Single-Step Workflows

These wrap a single skill and handle the full lifecycle (logging, usage, comments, status).

| Workflow | File | Skill | Unique Behavior |
|----------|------|-------|-----------------|
| **plan** | `adw_plan.ts` | `/plan` | 4 internal sub-steps: classify issue → generate branch → plan → commit. Requires `--issue`. Uses ADWState persistence. |
| **build** | `adw_build.ts` | `/build` | Pure single-step. Takes plan path from `ADW_PROMPT`. |
| **test** | `adw_test.ts` | `/test` | Retry loop (max 4 attempts) with auto-resolution via `quickPrompt()`. Optional E2E. Auto-generates ADW ID. |
| **review** | `adw_review.ts` | `/review` | Retry loop (max 3 attempts) with per-blocker resolution via `/patch` + `/build`. Auto-discovers spec file. |
| **document** | `adw_document.ts` | `/document` | State-dependent (requires existing ADW). Skips if no changes vs `origin/main`. |
| **patch** | `adw_patch.ts` | `/patch` + `/build` | Extracts patch content from GitHub issue comments via keyword search. |

#### 3.2 Sequential Multi-Step Workflows

Linear chains where each step's output feeds the next. All halt on step failure (except where noted).

| Workflow | File | Steps | Non-Fatal Steps | Model Strategy |
|----------|------|-------|-----------------|----------------|
| **plan_build** | `adw_plan_build.ts` | plan → build | none | default for both |
| **plan_build_test** | `adw_plan_build_test.ts` | plan → build → test | none | default, default, review |
| **plan_build_review** | `adw_plan_build_review.ts` | plan → build → review | none | default, default, review |
| **plan_build_document** | `adw_plan_build_document.ts` | plan → build → document | none | default for all |
| **plan_build_test_review** | `adw_plan_build_test_review.ts` | plan → build → test → review | none | default, default, research, review |
| **sdlc** | `adw_sdlc.ts` | plan → build → test → review → document | test + document | default, default, research, review, default |

**Data flow between sequential steps:**
```
prompt ──→ /plan ──→ planPath ──→ /build ──→ (cwd state) ──→ /test ──→ (cwd state) ──→ /review ──→ verdict
                         │                                                                  ↑
                         └──────────────────── specPath ────────────────────────────────────┘
```

- `/plan` produces a plan file; path extracted via `extractPlanPath()` (regex + fallback scan)
- `/build` consumes the plan file path
- `/test` runs against the working directory (no explicit artifacts passed)
- `/review` consumes `adwId` + `specPath` (the plan file) and produces a structured `ReviewResult`
- `/document` consumes `adwId` + optional `specPath` + optional `screenshotsDir`

#### 3.3 Parallel Multi-Step Workflow

**`adw_research-codebase_produce-readme_update-prime.ts`** — the only parallel workflow.

```
Phase 1: Fan-out research          Phase 2: Fan-out READMEs       Phase 3: Sequential
┌─────────────────────┐            ┌──────────────────────┐       ┌──────────────────┐
│ Promise.all([       │            │ Promise.all([        │       │ runUpdatePrime() │
│   research(topic1), │──docs──→   │   readme(global),    │──→    │                  │
│   research(topic2), │            │   readme(backend),   │       └──────────────────┘
│   research(topicN), │            │   readme(app1),      │
│ ])                  │            │   readme(appN),      │
└─────────────────────┘            │ ])                   │
                                   └──────────────────────┘
```

- Topics are a mix of static definitions + auto-discovered app directories
- Research uses `models.research` (haiku); READMEs + prime use `models.default` (sonnet)
- Non-fatal fallbacks throughout: missing docs logged as warnings, workflow continues

### 4. Model Selection Strategy

Three-tier model system via env vars with defaults:

| Env Var | Default | Used For |
|---------|---------|----------|
| `ADW_RESEARCH_MODEL` | `claude-haiku-4-5-20251001` | Research, lightweight reads |
| `ADW_MODEL` | `claude-sonnet-4-20250514` | Plan, build, document, general |
| `ADW_REVIEW_MODEL` | `claude-sonnet-4-20250514` (falls back to `ADW_MODEL`) | Review, verification |

### 5. Trigger System

**`adws/triggers/cron.ts`** — polls GitHub issues every 20 seconds.

Detection logic:
- Issues with **no comments** → trigger
- Issues where **latest comment is exactly "adw"** → trigger
- Tracks processed issues in memory to avoid re-triggering

Currently hardcoded to invoke `adw_plan_build.ts` as a subprocess with the issue number.

### 6. The Meta-Commands: `/create-adw` and `/port-adw`

Both are Claude Code slash commands (`.claude/commands/`) that instruct Claude to generate workflow files.

#### `/create-adw` (`create-adw.md`)

**Input:** Comma-separated slash commands (e.g. `/plan,/build,/review`)

**Process:**
1. Parse commands into ordered list
2. Read shared modules to understand available step functions
3. Read existing workflows to understand patterns
4. Verify each command exists in `.claude/commands/`
5. If new step functions needed, add to `agent-sdk.ts`
6. Generate workflow file following the canonical skeleton
7. Test-run with `bun run` to verify parsing

**Naming convention:** `/plan,/build,/review` → `adw_plan_build_review.ts` (underscores between commands, hyphens preserved within)

#### `/port-adw` (`port-adw.md`)

**Input:** Path to a Python ADW script

**Process:**
1. Read Python source thoroughly
2. Map Python subprocess calls to SDK `query()` calls
3. Verify referenced skills exist
4. Add new step functions to `agent-sdk.ts` if needed
5. Write TypeScript workflow following established patterns
6. Test-run to verify

**Both commands embed the same critical SDK gotchas:**
- `sdk.query()` returns `AsyncGenerator`, not Promise — must iterate with `for await...of`
- Must use `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true`
- Must set `settingSources: ["user", "project", "local"]`
- Tool list option is `tools`, not `allowedTools`

### 7. Usage Tracking & Status Reporting

Every workflow must:

1. Declare `allStepUsages[]` before the try block
2. After each step: push `{ step, usage }` and log with `formatUsage()`
3. On completion: `sumUsage()` for totals, log per-step breakdown
4. Call `writeWorkflowStatus()` → writes `status.json` to log directory
5. Call `commentFinalStatus()` → posts markdown table to GitHub issue

The final status comment format:
```markdown
## Workflow PASS ✅
**Workflow:** `plan_build_review`
**ADW ID:** `abc12345`
**Duration:** 2m 34s

| Step | Status | Duration |
|------|--------|----------|
| plan | ✅ | 42s |
| build | ✅ | 1m 12s |
| review | ✅ | 40s |

**Tokens:** 12,000 in / 8,000 out (cache read: 3,000)
**Cost:** $0.0450
```

---

## Code References

- `adws/src/agent-sdk.ts:94-130` — `consumeQuery()`, the core SDK iteration loop
- `adws/src/agent-sdk.ts:136-475` — All step functions (plan, build, review, test, document, patch, research, readme, prime, quickPrompt)
- `adws/src/logger.ts:95-161` — `taggedLogger()` with `finalize()` pattern
- `adws/src/logger.ts:167-204` — `writeWorkflowStatus()` status aggregation
- `adws/src/logger.ts:210-241` — `createLogger()` dual-output logger
- `adws/src/utils.ts:294-334` — `extractPlanPath()` with regex + fallback scan
- `adws/src/utils.ts:355-403` — Comment factory functions
- `adws/src/utils.ts:408-440` — `getWorkflowModels()` and `standardizeGetAdw()`
- `adws/src/github.ts:74-96` — `makeIssueComment()` with bot identifier
- `adws/src/github.ts:218-292` — `postReviewToIssue()` with R2 screenshot upload
- `adws/src/git-ops.ts:214-284` — `finalizeGitOperations()` push + PR creation
- `adws/src/worktree-ops.ts:7-52` — `createWorktree()` isolation
- `adws/triggers/cron.ts:42-64` — Issue detection logic
- `.claude/commands/create-adw.md` — Meta-command for generating new workflows
- `.claude/commands/port-adw.md` — Meta-command for porting Python workflows

## Architecture Documentation

### Design Principles

1. **Composition over inheritance** — workflows are flat scripts that compose shared functions; no class hierarchy
2. **Slash commands as atomic units** — each workflow step maps to a `/command` skill; the SDK invokes Claude Code which executes the skill
3. **Fail-fast by default** — sequential steps halt on failure; non-fatal steps (test, document in SDLC) are explicitly marked
4. **Observability is mandatory** — every step produces structured logs, usage metrics, and optional GitHub comments
5. **Environment-driven configuration** — model selection, working directory, and prompts flow through env vars, not hardcoded values
6. **Bot identity** — all GitHub comments prefixed with `[ADW-AGENTS]` to prevent webhook loops

### Naming Convention

Workflow files: `adw_{step1}_{step2}_{stepN}.ts` where each step name matches its slash command, with hyphens preserved within command names and underscores separating commands.

### Data Contract Between Steps

| Producer | Artifact | Consumer | Extraction Method |
|----------|----------|----------|-------------------|
| `/plan` | Plan `.md` file in `specs/` | `/build`, `/review`, `/document` | `extractPlanPath()` — regex for absolute/relative paths, fallback to `specs/` directory scan |
| `/build` | Modified files in working dir | `/test`, `/review` | Implicit (working directory state) |
| `/test` | Test results (stdout) | (logged only) | `parseTestResults()` in `adw_test.ts` |
| `/review` | JSON `ReviewResult` | GitHub issue, workflow verdict | `parseReviewResult()` + `extractReviewVerdict()` |
| `/document` | Documentation files | (committed) | Implicit |

### Extension Points

To add a new workflow:
1. If the step needs a new slash command, create it in `.claude/commands/`
2. If the SDK needs a new step function, add to `adws/src/agent-sdk.ts` following the pattern
3. Run `/create-adw /step1,/step2,...` to generate the workflow file
4. Or manually create following the canonical skeleton above

## Open Questions

- Cron trigger currently hardcoded to `adw_plan_build` — is there a plan to make it workflow-configurable?
- `adw_plan.ts` and `adw_test.ts` use `ADWState` persistence while most other workflows use `standardizeGetAdw()` — is state consolidation planned?
- `adw_plan_build_document.ts` has no GitHub issue comments — intentional or oversight?
