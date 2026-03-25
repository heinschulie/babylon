---
date: 2026-03-25T14:30:00+02:00
researcher: Claude
git_commit: 29e23b3
branch: hein/feature/issue-31-create-test-route
repository: babylon
topic: 'Ralph build 56 post-improvement assessment — how much has the code improved since the critique?'
tags: [research, ralph, observability, firecrawl, build-artifacts, git-ops, complexity]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude (third pass — corrected visual_validation and ngrok status)
---

# Research: Ralph Build 56 — Post-Improvement Assessment (v3)

## Research Question

Re-evaluate the 8 critique areas from `2026-03-25-ralph-build-56-critique.md` against the current codebase and assess how much the code has improved.

## Summary

**All 8 critique areas are addressed in code. One config remnant remains (`.env.local` ngrok URL).** Ralph went from "declares pass but commits nothing" to a complete, complexity-aware automated development loop with proper git lifecycle, visual validation via Firecrawl, per-step observability, and model routing by issue complexity.

**Improvement magnitude: ~95%.** The only gap is a one-line `.env.local` update.

## Scorecard

| # | Critique Area | Before | After | Verdict |
|---|---|---|---|---|
| 1 | Work not committed | No `commitChanges()` call; push was no-op | One commit per sub-issue after review passes (`adw_ralph.ts:333`) | **Fixed** |
| 2 | Screenshots / visual validation | Gated on Playwright MCP (never configured); silent degradation | Firecrawl + DEV_TUNNEL_URL; failure = blocker, not silent fallback | **Fixed** |
| 3 | Git lifecycle (guard, PR, checkout) | No guard; no PR; no checkout-back | `assertStableBranch()`, `base_branch` persistence, crash recovery, `gh pr create` | **Fixed** |
| 4 | Observability: `post_sha` | Not tracked | Captured per step (`step-recorder.ts:85`), written to status.json | **Fixed** |
| 5 | Observability: log truncation | Results cut mid-sentence, no marker | Multi-layer truncation with `"... (truncated)"` suffix | **Fixed** |
| 6 | Observability: `visual_validation` field | Did not exist | Full pipeline: types → extraction → parsing → status.json | **Fixed** |
| 7 | Cost: complexity-driven pipeline | All issues same model + full pipeline | Label-based: trivial→Haiku+skip refactor, standard→Sonnet, complex→Opus | **Fixed** |
| 8 | ngrok → cloudflare | ngrok everywhere | Code/docs/configs 100% cloudflare; `.env.local` still ngrok | **99%** |

## Detailed Findings

### 1. Commit Flow — The Critical Fix

**Before:** `adw_ralph.ts` never imported `commitChanges()`. Push was no-op. All 3 issues closed with zero code committed.

**After:**
- `adw_ralph.ts:35` — imports `commitChanges` from `../src/git-ops`
- `adw_ralph.ts:333` — `commitChanges(commitMsg, workingDir)` called inside `reviewPassed` block
- `git-ops.ts:152-168` — stages with `git add -A`, commits, returns no-op `[true, null]` if no changes (idempotent)
- Line 335 — logs warning if commit fails (non-fatal)

### 2. Git Lifecycle — Branch Guard + Crash Recovery + PR

**Before:** Ralph ran on whatever branch, no guard, no PR creation, no cleanup.

**After:**
- `git-ops.ts:22-24` — `isStableBranch()` rejects `^hein\/feature\/issue-` branches
- `git-ops.ts:27-32` — `assertStableBranch()` throws: `"Refusing to run from unstable feature branch: {branch}"`
- `adw_ralph.ts:74-87` — two-phase guard: rejects unstable branches BUT allows resume on target branch (crash recovery)
- `adw_ralph.ts:90` — `state.update({ base_branch: baseBranch })` before creating feature branch
- `state.ts:17` — `base_branch` in `CORE_FIELDS`; `schemas.ts:225` — Zod validated
- `adw_ralph.ts:361` — retrieves `base_branch` for PR target
- `adw_ralph.ts:382-392` — `gh pr create --base {base_branch}` with issue count summary
- `adw_ralph.ts:399-405` — checkout back to `base_branch` after push

### 3. Visual Validation — Fully Wired Pipeline

**Before:** `review.md` checked for Playwright MCP tools (`browser_navigate`, `browser_screenshot`) — never configured. Silent code-only fallback.

**After — complete pipeline:**

1. **Instruction:** `review.md:20` mandates `firecrawl_scrape` with `formats: ["screenshot"]`. No Playwright references remain.
2. **No silent degradation:** `review.md:20` — if Firecrawl fails on frontend change, report blocker + set `visual_validation: "failed"`. NOT code-only fallback.
3. **Types:** `logger.ts:20` — `StepSummary.visual_validation?: "passed" | "failed" | "skipped"`; also in `AgentStatus` (line 38) and `StepStatusExtras` (line 133)
4. **Agent parsing:** `agent-sdk.ts:72-73` — extracts `visual_validation` from `## Step Summary` markdown block; line 80 includes in return if valid enum
5. **Extraction:** `review-utils.ts:87-131` — `extractScreenshots()` derives status: no screenshots→`"skipped"`, blocker with screenshot_path→`"failed"`, else→`"passed"`
6. **Integration:** `adw_ralph.ts:266-274` — `parseReviewResult()` → `extractScreenshots(parsedReview, tunnelUrl)` → passes `visual_validation` + `screenshots` to `reviewStep.close()`
7. **Persistence:** `logger.ts:159` — writes `visual_validation` to step status.json
8. **Tests:** `review-utils.test.ts` covers skipped, passed, and failed scenarios

**Minor doc gap:** Step Summary template in `review.md:93-102` doesn't list `visual_validation` as a field, though instructions at line 21 mention it. Non-blocking — backend parses it regardless.

### 4. Observability — All 4 Gaps Closed

**post_sha:**
- `step-recorder.ts:85` — `postSha = await getHeadSha(cwd)` after step execution
- `step-recorder.ts:106` — passes `postSha` to `log.finalize()` via extras
- `logger.ts:37-38` — `AgentStatus.post_sha?: string`
- `logger.ts:158-159` — written to status.json when provided

**Log truncation:**
- `jsonl-processor.ts:15-22` — `truncateRegularOutput()` at configurable `maxLength` (default 500) with `"... (truncated)"` suffix
- `agent.ts:105,154,180` — agent-level truncation at 800 chars
- `agent-sdk.ts:240` — SDK logging at 1000 chars with `"… [truncated]"` marker

**visual_validation:** See section 3 above — fully implemented.

**base_branch:** See section 2 above — fully implemented.

### 5. Complexity-Driven Pipeline

**Before:** Every sub-issue got Sonnet + full pipeline (TDD→refactor→review). $0.74 wasted on refactor for trivial CSS changes.

**After:**
- `adw_ralph.ts:176` — reads `complexity:` label from GitHub issue labels; defaults to `"standard"`
- `adw_ralph.ts:177` — `skipRefactor = complexity === "trivial"`
- `adw_ralph.ts:178` — model routing:
  - `complex` → Opus 4 (`claude-opus-4-20250514`)
  - `trivial` → Haiku (`claude-haiku-4-5-20251001`) via `models.research`
  - `standard` → Sonnet 4 (`claude-sonnet-4-20250514`) via `models.default`
- `adw_ralph.ts:252` — review model: `complex`→Opus, others→configurable review model
- `adw_ralph.ts:209-212` — refactor step gated by `skipRefactor` with log on skip
- `prd-to-issues.md:42-51` — documents complexity assessment and `complexity:trivial|standard|complex` label assignment

**Model applied consistently** to TDD (line 189), refactor (line 216), patch plan (line 292), build (line 312), and review (line 254) steps.

### 6. Tunnel Migration — 99% Complete

**Code/docs/configs — 100% cloudflare:**
- `tunnel.config.json` — `babylon-dev` tunnel: `dev.schulie.com:5173`, `verifier.schulie.com:5178`, `webhook.schulie.com:8001`
- `scripts/setup-tunnels.sh` — 111-line cloudflare setup script
- `justfile:10` — `cloudflared tunnel run babylon-dev` in dev recipe
- `apps/web/vite.config.ts:22` — `allowedHosts: ['dev.schulie.com']`
- `apps/verifier/vite.config.ts:22` — `allowedHosts: ['verifier.schulie.com']`
- `.env.example:11-12` — documents `DEV_TUNNEL_URL=https://dev.schulie.com` with cloudflare reference
- `prepare_app.md` — references cloudflare tunnel startup
- `review-utils.test.ts:18,23` — uses `https://dev.schulie.com` in tests

**Remaining:** `.env.local:10` still has `DEV_TUNNEL_URL=https://intimate-satyr-model.ngrok-free.app`. One-line fix.

## Code References

- `adws/workflows/adw_ralph.ts:35` — commitChanges import
- `adws/workflows/adw_ralph.ts:74-90` — Branch guard + crash recovery + base_branch recording
- `adws/workflows/adw_ralph.ts:176-178` — Complexity label reading + model routing
- `adws/workflows/adw_ralph.ts:209-212` — Conditional refactor execution
- `adws/workflows/adw_ralph.ts:252` — Review model complexity routing
- `adws/workflows/adw_ralph.ts:266-274` — Screenshot extraction + visual_validation integration
- `adws/workflows/adw_ralph.ts:333` — commitChanges() call
- `adws/workflows/adw_ralph.ts:382-392` — gh pr create
- `adws/workflows/adw_ralph.ts:399-405` — checkout back to base_branch
- `adws/src/git-ops.ts:22-32` — isStableBranch + assertStableBranch
- `adws/src/git-ops.ts:152-168` — commitChanges implementation
- `adws/src/step-recorder.ts:85-106` — postSha capture + extras pass-through
- `adws/src/logger.ts:20,37-38,133,158-159` — visual_validation + post_sha in types/writer
- `adws/src/review-utils.ts:87-131` — extractScreenshots() with visual_validation derivation
- `adws/src/agent-sdk.ts:72-80` — visual_validation parsing from step summary
- `adws/src/jsonl-processor.ts:15-22` — truncation with explicit marker
- `adws/src/state.ts:17` — base_branch in CORE_FIELDS
- `adws/src/schemas.ts:225` — base_branch Zod schema
- `.claude/commands/review.md:20` — Firecrawl screenshot mandate
- `.claude/commands/prd-to-issues.md:42-51` — Complexity label assignment
- `.env.local:10` — Still ngrok (last remaining reference)

## Open Questions

- `.env.local` ngrok URL — intentional holdover or forgotten?
- Has complexity-driven pipeline been validated end-to-end with a real ralph run?
