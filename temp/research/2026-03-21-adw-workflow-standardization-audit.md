---
date: 2026-03-21T00:00:00+02:00
researcher: Claude
git_commit: ac3e48a
branch: al
repository: babylon
topic: 'ADW Workflow Standardization Audit — Post-PRD Assessment'
tags: [research, codebase, adw, workflows, standardization, audit]
status: complete
last_updated: 2026-03-21
last_updated_by: Claude
---

# Research: ADW Workflow Standardization Audit

## Research Question

After the PRD-001 through PRD-007 refactoring sequence, evaluate whether ADW workflows now follow a coherent, consistent standard. Compare structural patterns across all 13 workflow files and the shared abstraction layer.

## Summary

The standardization effort was **highly effective**. Zero legacy patterns remain — no inline SDK instantiation, no `standardizeGetAdw()`, no `stepStatuses[]`, no `formatIssueMessage()`, no direct `consumeQuery()` or `sdk.query()` calls in workflows. All 13 workflows share identical patterns for CLI parsing, usage tracking, GitHub commenting, model selection, and entry points.

The system now has two clean architectural tiers:
1. **Simple sequential workflows** (7 files) — use `runStep()` for full boilerplate encapsulation
2. **Complex workflows** (6 files) — use direct step functions + `taggedLogger()` for retry loops, parallelism, or state management

Both tiers share the same foundational utilities. The `/create-adw` and `/port-adw` templates are ~85% aligned with actual implementations — they accurately describe the core patterns but overstate `runStep()` as mandatory and lack guidance on parallel/retry patterns.

## Detailed Findings

### 1. Patterns That Are 100% Consistent Across All 13 Workflows

| Pattern | Implementation |
|---------|---------------|
| CLI parsing | `parseArgs` from `"util"` with `strict: true`, `Bun.argv.slice(2)` |
| Entry point | `if (import.meta.main)` → `parseArgs` → `runWorkflow()` → `process.exit()` |
| Logger init | `createLogger(adwId, WORKFLOW)` at workflow start |
| Env config | `getAdwEnv()` returns `{ prompt, workingDir, models }` |
| Model selection | `models.research` / `models.default` / `models.review` via `getWorkflowModels()` |
| Usage tracking | `allStepUsages: { step, ok, usage }[]` → `sumUsage()` → `writeWorkflowStatus()` |
| GitHub comments | `createCommentStep(issueNumber)` + `createFinalStatusComment(issueNumber)` |
| Final reporting | Per-step usage log + totals + `writeWorkflowStatus()` + `commentFinalStatus()` |
| Step constants | `TOTAL_STEPS` constant, step name constants |
| Signature | `async function runWorkflow(adwId, issueNumber?)` |

### 2. The Two-Tier Architecture

**Tier 1 — `runStep()` workflows (7 files):**
- `adw_build.ts`, `adw_plan_build.ts`, `adw_plan_build_review.ts`, `adw_plan_build_test.ts`, `adw_plan_build_test_review.ts`, `adw_plan_build_document.ts`, `adw_sdlc.ts`
- Each step is a single `runStep(opts, executor)` call
- `runStep()` handles: banner, taggedLogger, usage push, finalize, comments
- `adw_sdlc.ts` extends with `onFail: "continue"` for test/document steps

**Tier 2 — Direct step function workflows (6 files):**
- `adw_plan.ts`, `adw_test.ts`, `adw_review.ts`, `adw_document.ts`, `adw_patch.ts`, `adw_research-codebase_produce-readme_update-prime.ts`
- Use `taggedLogger()` + direct calls to `runPlanStep()`, `runTestStep()`, etc.
- Manage `allStepUsages` manually
- Justified by: retry loops (test, review), state management (plan, patch), parallelism (research)

### 3. Legacy Pattern Elimination — Complete

| Legacy Pattern | Status | Verified By |
|---------------|--------|-------------|
| `standardizeGetAdw()` / `AdwRecord` | Removed | Zero grep matches |
| `stepStatuses[]` | Replaced by `allStepUsages[]` | Zero grep matches |
| `formatIssueMessage()` | Removed | Zero grep matches |
| Inline `new ClaudeSDK()` in workflows | Replaced by `createSDK()` | Zero grep matches |
| Direct `consumeQuery()` in workflows | Replaced by step functions | Zero grep matches |
| Direct `sdk.query()` in workflows | Replaced by step functions | Zero grep matches |
| Inline `getAdw()` functions | Replaced by `getAdwEnv()` | Zero grep matches |
| Direct `makeIssueComment()` in workflows | Replaced by `createCommentStep()` | Zero grep matches |
| Inline banner `═".repeat()` | Replaced by `createStepBanner()` or `runStep()` | Zero grep matches |
| Inline model selection `process.env.ADW_MODEL` | Replaced by `getWorkflowModels()` | Zero code matches (docs only) |

### 4. Shared Abstraction Layer (adws/src/)

**Core abstractions (agent-sdk.ts):**
- `createSDK()` (line 156) — lazy-loaded SDK factory with standard permissions
- `consumeQuery()` (line 176) — async generator drain + usage extraction
- `runStep()` (line 122) — step boilerplate: banner, logger, usage, finalize, comments
- 10 step functions: plan, build, review, test, document, patch, research, readme, prime, quickPrompt

**Utilities (utils.ts):**
- `getAdwEnv()` (line 235) — replaces old `standardizeGetAdw()`
- `getWorkflowModels()` (line 401) — 3-tier model config from env vars
- `extractPlanPath()` (line 297) — deterministic adwId-based lookup (no mtime fallback)
- `createCommentStep()` (line 348) / `createFinalStatusComment()` (line 363) — GitHub integration
- `fmtDuration()`, `createStepBanner()`, `createDefaultStepUsage()`, `parseReviewResult()`, etc.

**Logging (logger.ts):**
- `createLogger()` (line 210) — dual console + file logger
- `taggedLogger()` (line 95) — colored per-step logger with `finalize()` hook
- `writeWorkflowStatus()` (line 167) — aggregates step status.json files

### 5. Template Alignment (/create-adw and /port-adw)

| Aspect | Template Says | Reality | Alignment |
|--------|--------------|---------|-----------|
| `createSDK()` | Standard factory | Used via step functions | Perfect |
| `runStep()` | Mandatory boilerplate | Optional; 7/13 use it | Overstated |
| `getAdwEnv()` | Standard env reader | Universal | Perfect |
| `taggedLogger()` | Per-agent logging | Universal (via runStep or manual) | Perfect |
| `allStepUsages[]` | `{ step, ok, usage }[]` | Identical | Perfect |
| `onFail` parameter | Primary error strategy | Unused except adw_sdlc | Overstated |
| GitHub commenting | `createCommentStep()` / `createFinalStatusComment()` | Universal | Perfect |
| Model selection | 3-tier via env vars | Universal | Perfect |
| Parallel execution | Not described | Used in research workflow | Gap |
| `quickPrompt()` | Not mentioned | Used in plan, test | Gap |
| `ADWState` persistence | Not mentioned | Used in plan, test, patch, document | Gap |

### 6. Remaining Minor Inconsistencies

1. **adw_review.ts** — `allStepUsages` items lack `ok` field (uses `{step, usage}` instead of `{step, ok, usage}`); maps to `ok: true` at finalization (line 331)
2. **adw_test.ts** — minimal catch block: no `writeWorkflowStatus()`, no `commentStep()` on error (line 370)
3. **adw_document.ts** — no `commentStep()` call in catch block (line 239)
4. **adw_review.ts** — no `commentStep()` call in catch block (line 337)
5. **adw_plan_build_document.ts** and **adw_document.ts** — no `--issue` CLI parameter
6. **adw_patch.ts** — reads issue from env var `ADW_ISSUE_NUMBER` instead of CLI `--issue`

## Code References

- `adws/src/agent-sdk.ts:122-149` — `runStep()` abstraction
- `adws/src/agent-sdk.ts:156-171` — `createSDK()` factory
- `adws/src/agent-sdk.ts:176-212` — `consumeQuery()` core loop
- `adws/src/utils.ts:235-241` — `getAdwEnv()` (replaced standardizeGetAdw)
- `adws/src/utils.ts:297-327` — `extractPlanPath()` deterministic lookup
- `adws/src/utils.ts:348-396` — `createCommentStep()` / `createFinalStatusComment()`
- `adws/src/utils.ts:401-407` — `getWorkflowModels()` 3-tier model config
- `adws/src/logger.ts:95-161` — `taggedLogger()` with finalize pattern
- `adws/src/logger.ts:167-204` — `writeWorkflowStatus()` aggregation
- `.claude/commands/create-adw.md` — Template for generating new workflows
- `.claude/commands/port-adw.md` — Template for porting Python workflows

## Architecture Documentation

The system now follows a **composition-over-inheritance** model with two clean tiers:

```
┌────────────────────────────────────────────────────────┐
│ Tier 1: runStep() workflows (simple sequential)        │
│  plan_build, plan_build_review, plan_build_test,       │
│  plan_build_test_review, plan_build_document,          │
│  sdlc, build                                           │
│                                                        │
│  Pattern: runStep(opts, (log) => stepFn(args))         │
│  runStep handles ALL boilerplate automatically         │
├────────────────────────────────────────────────────────┤
│ Tier 2: Direct step function workflows (complex)       │
│  plan, test, review, document, patch, research         │
│                                                        │
│  Pattern: taggedLogger() + stepFn() + manual tracking  │
│  Needed for: retry loops, parallelism, state mgmt      │
├────────────────────────────────────────────────────────┤
│ Shared Layer (adws/src/)                               │
│  createSDK() → consumeQuery() → step functions         │
│  getAdwEnv() + getWorkflowModels()                     │
│  createCommentStep() + createFinalStatusComment()      │
│  taggedLogger() + writeWorkflowStatus()                │
│  extractPlanPath() + fmtDuration() + ...               │
└────────────────────────────────────────────────────────┘
```

## Open Questions

- Should templates document the two-tier pattern explicitly (runStep vs direct)?
- Should templates add guidance for parallel workflows and `quickPrompt()`?
- Should adw_review.ts add `ok` field to its allStepUsages items for full consistency?
- Should catch blocks in adw_test, adw_review, adw_document add commentStep/writeWorkflowStatus for parity?
