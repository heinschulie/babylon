---
date: 2026-03-22T12:00:00+02:00
researcher: Claude
git_commit: 4b14e44
branch: al
repository: babylon
topic: 'ADWS anti-patterns and issues needing attention'
tags: [research, codebase, adws, workflows, anti-patterns]
status: complete
last_updated: 2026-03-22
last_updated_by: Claude
---

# Research: ADWS Anti-Patterns & Issues

## Research Question

Research adws and tell me whether you can see any anti-patterns or things that obviously need to be addressed.

## Summary

The ADWS module is a workflow orchestration system that drives Claude Code agents through TDD/SDLC loops on GitHub issues. It has a clear canonical workflow (`adw_ralph.ts`) but carries significant technical debt: **circular dependencies**, **pervasive silent error swallowing**, **dead code in classic/ workflows**, **type safety undermined by loose typing despite Zod schemas**, and **untested trigger handlers**. The most urgent items are the circular dep architecture, the `dangerously_skip_permissions` hardcode, and the large volume of dead classic workflows.

## Detailed Findings

### 1. Circular Dependencies (Architecture)

Multiple modules dynamically import each other to avoid circular deps at load time:

- `git-ops.ts:258` — dynamic import of `workflow-ops`
- `workflow-ops.ts:361` — dynamic import of `getCurrentBranch` from `git-ops`
- `utils.ts:446` — dynamic import of `github` and `agent-sdk` inside `fetchAndClassifyIssue()`

This is a symptom of modules that have grown entangled. The dependency graph forms cycles: `git-ops ↔ workflow-ops`, `utils → github → utils`.

### 2. Silent Error Swallowing

A pervasive pattern across the codebase — try/catch blocks that log warnings or do nothing, making failures invisible:

| File | Lines | What's swallowed |
|------|-------|-----------------|
| `git-ops.ts` | 57-60 | `checkPrExists` ignores all errors |
| `git-ops.ts` | 74-81 | `createBranch` silently retries on branch-exists |
| `logger.ts` | 64-78 | `safeAppend/safeWriteJson/safeReadJson` never propagate |
| `r2-uploader.ts` | 25-28, 80-86 | Silently disables if env vars missing; maps failed uploads to original paths |
| `github.ts` | 105-108 | `markIssueInProgress` ignores label creation errors |
| `worktree-ops.ts` | 36-47 | Branch-exists error matched by string, falls through silently |
| `utils.ts` | 297-327 | `extractPlanPath` tries 3 strategies, all with silent fallbacks |

### 3. Type Safety Undermined

Despite Zod schemas in `schemas.ts`, the type system is defeated in practice:

- `state.ts:24` — `data: Record<string, unknown>` loses all Zod-validated structure
- `state.ts:88-89` — After Zod parse, immediately casts back to `Record<string, unknown>`
- `utils.ts:29-60` — `parseReviewResult()` returns synthetic "blocker" on error, indistinguishable from real data
- `workflow-ops.ts:44-76` — `extractAdwInfo()` returns partial results on no match

### 4. Dead Code — Classic Workflows

The `workflows/classic/` directory contains **12 workflow files** that appear to be superseded by `adw_ralph.ts`:

- `adw_build.ts`, `adw_patch.ts`, `adw_plan.ts`
- `adw_plan_build.ts`, `adw_plan_build_document.ts`, `adw_plan_build_review.ts`
- `adw_plan_build_test.ts`, `adw_plan_build_test_review.ts`
- `adw_sdlc.ts`, `adw_review.ts`, `adw_test.ts`, `adw_document.ts`
- `adw_research-codebase_produce-readme_update-prime.ts`

These are referenced in `AVAILABLE_ADW_WORKFLOWS` and `WORKFLOW_SCRIPT_MAP` but no evidence they're invoked from commands or CI. Each duplicates finalization logic, `stepOpts` factories, and `fetchAndClassifyIssue` patterns.

**Note:** `adw_review.ts` and `adw_test.ts` may still serve as standalone workflows — needs confirmation.

### 5. Security: `dangerously_skip_permissions` Hardcoded

- `agent.ts:395` — `dangerously_skip_permissions` set to `true` in template execution
- `agent-sdk.ts:157-170` — `createSDK()` hardcodes `permissionMode` and `allowDangerouslySkipPermissions`

This means all agent invocations bypass permission checks by default.

### 6. God Function: `promptClaudeCode`

`agent.ts:240-365` is a 125-line function with deeply nested logic:
- Writes stdout to file, sleeps 100ms, reads back (race condition risk at line 249-251)
- Multiple fallback strategies to extract results (resultMessage → messages → raw stdout)
- Silent string matching to determine success/failure

### 7. Massive Utils Module

`utils.ts` (563 lines) exports 25+ functions spanning:
- JSON parsing, env validation, subprocess management
- Review result parsing, plan path extraction
- Issue classification, app discovery, slug generation
- Duration formatting, banner creation

This is a classic "junk drawer" module. Functions like `fetchAndClassifyIssue()` (line 446) and `buildIssuePlanPrompt()` belong in domain-specific modules.

### 8. Inconsistent Error Handling Paradigms

Mixed approaches across the codebase:
- **Exceptions** — `checkEnvVars()` throws (`utils.ts:131`)
- **Null returns** — `r2-uploader.ts:44` returns null on failure
- **Synthetic data** — `parseReviewResult()` returns fake blocker on error (`utils.ts:36`)
- **Silent continuation** — logger functions log and continue
- **Tuple-ish returns** — some functions return `[result, error]` style

### 9. Test Coverage Gaps

| Area | Status | Detail |
|------|--------|--------|
| `webhook.ts` handler | ❌ Not tested | HTTP handling, event routing, payload validation |
| `cron.ts` daemon | ❌ Not tested | Polling logic, comment parsing, workflow resolution |
| `agent.ts` retry logic | ❌ Not tested | `promptClaudeCodeWithRetry` has 0 tests |
| `agent.ts` JSONL parsing | ❌ Not tested | `parseJsonlOutput`, `convertJsonlToJson` |
| `github.ts` sub-issues | ❌ Not tested | `createSubIssue`, `fetchSubIssues`, `closeSubIssue` |
| `model-selection.test.ts` | Partial | Tests 3/19 commands in SLASH_COMMAND_MODEL_MAP |
| `agents.test.ts` | Fragile | Text substring matching ("contains 4"), 60s timeout |
| `parse-blockers.test.ts` | ✅ Solid | Comprehensive regex edge case coverage |

### 10. Hardcoded Magic Values

- `agent-sdk.ts:153` — `DEFAULT_MODEL = "claude-sonnet-4-20250514"` as string literal
- `worktree-ops.ts:150` — Port ranges 9100, 9200 without named constants
- `agent.ts:165-194` — Retry delays `[2000, 4000, 6000]` hardcoded
- `cron.ts` — 20s polling interval
- `webhook.ts:168-181` — `WORKFLOW_SCRIPT_MAP` duplicates `AVAILABLE_ADW_WORKFLOWS`

### 11. Workflow Code Duplication

Every workflow repeats these patterns:
- Finalization logic (usage calculation, status write, comment posting)
- `stepOpts` factory creation (identical ~3 lines in each)
- `fetchAndClassifyIssue` call chain
- Error boundary with duplicated try/catch usage summation

The `adw_ralph.ts` and `adw_document_ralph.ts` finalization blocks are copy-pasted (ralph lines 282-350, document_ralph lines 173-195).

### 12. GitHub Module Issues

- `github.ts:43` — `extractRepoPath()` uses naive `replace("https://github.com/", "")` — breaks if URL has different format
- `github.ts:173-176` — String-based date sorting (locale-dependent)
- `github.ts:412` — `filterUnblockedIssues()` treats external blockers as resolved (line 404)
- `github.ts:488-493` — Falls back to local path if R2 upload fails, potentially posting broken image links

## Code References

- `adws/src/agent.ts:240-365` — God function `promptClaudeCode`
- `adws/src/agent.ts:395` — `dangerously_skip_permissions: true` hardcode
- `adws/src/state.ts:88-89` — Zod parse → Record<string, unknown> cast
- `adws/src/state.ts:103-113` — Dead code `fromStdin()` no-op
- `adws/src/utils.ts:1-563` — Oversized utils module
- `adws/src/git-ops.ts:258` — Dynamic import (circular dep)
- `adws/src/workflow-ops.ts:361` — Dynamic import (circular dep)
- `adws/workflows/classic/` — 12 potentially dead workflow files
- `adws/triggers/webhook.ts` — Untested HTTP handler
- `adws/triggers/cron.ts` — Untested polling daemon

## Architecture Documentation

**Design pattern:** ADWs are "Agentic Development Workflows" — orchestrated sequences of Claude Code slash-command invocations (plan, build, test, review, document) driven by GitHub issues. The canonical pattern is `adw_ralph.ts` which iterates sub-issues in a TDD loop.

**Trigger model:** Two entry points — webhook (real-time GitHub events) and cron (polling). Both spawn workflow processes.

**State management:** `ADWState` persists workflow state to JSON files, keyed by ADW IDs. State flows through env vars (`ADW_PROMPT`, `ADW_STATE_PATH`) between processes.

**Agent execution:** `agent.ts` wraps Claude Code CLI invocation; `agent-sdk.ts` wraps the Claude Agent SDK. Both are used depending on the step type.

## Open Questions

- Are any classic/ workflows still actively used via webhook/cron triggers?
- Is `adw_review.ts` / `adw_test.ts` used standalone or only through ralph?
- Is `dangerously_skip_permissions` intentional or a dev shortcut that should be configurable?
- Should `cron.ts` polling be replaced by webhook-only triggering?
- What's the plan for the `fromStdin()` dead code in state.ts?
