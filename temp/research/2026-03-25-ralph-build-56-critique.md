---
date: 2026-03-25T10:00:00+02:00
researcher: Claude
git_commit: 29e23b3
branch: hein/feature/issue-31-create-test-route
repository: babylon
topic: 'Ralph build 56 critique — observability, cost, screenshots, and uncommitted work'
tags: [research, ralph, observability, firecrawl, build-artifacts]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: Ralph Build 56 Critique

## Research Question

Critique the ralph loop at `temp/builds/56_ralph_5ec126c5/` for observability (human + agent), cost efficiency, model selection, screenshot failures, and overall legibility of the build artifacts.

## Summary

The build **completed all 3 sub-issues** (#57, #58, #59) in 14m 24s for $2.36 — but **none of the work was committed or pushed**. The entire `apps/web/src/routes/test/` directory remains untracked. Ralph declared "pass", closed all issues, and pushed the branch — but the push was a no-op because nothing was committed. This is the critical failure.

Beyond that, the build artifacts are well-structured but have specific gaps in observability, the review step silently degraded to code-only (no visual validation), and the cost profile reveals over-investment in refactor steps for trivial changes.

## Detailed Findings

### 1. Critical: Work Not Committed

**What happened:** Ralph's TDD steps wrote files (`+page.svelte`, `page.test.ts`) to `apps/web/src/routes/test/`, but the test route directory was brand new (untracked). The agent SDK subprocess made file changes in the working tree, but ralph never ran `git add` + `git commit` for these new files. The push at line 193 of `execution.log` pushed the branch as-is (HEAD = `29e23b3`, unchanged).

**Evidence:**
- `git status -- apps/web/src/routes/test/` shows the entire directory as untracked
- `git log` shows HEAD is still `29e23b3 pre ralph test` — no new commits from ralph
- The file on disk (`+page.svelte`) has all 3 changes (red bg, new heading, 25th image) — confirming the agent DID the work
- `status.json` reports `"status": "pass"` despite no commits

**Root cause:** `adw_ralph.ts` never calls `commitChanges()`. Every other workflow (`adw_document_ralph.ts`, `adw_patch.ts`, `adw_test.ts`, `adw_plan.ts`, `adw_document.ts`) imports and calls `commitChanges()` from `git-ops.ts`. Ralph does not — zero references.

**Impact:** All 3 issues were closed on GitHub despite zero code being committed. The user sees "pass" everywhere but nothing in the repo.

### 2. Screenshot / Visual Validation Failure

**What the review skill expects:** (`review.md` lines 19-45)
- Checks for Playwright MCP tools (`browser_navigate`, `browser_screenshot`)
- If present: navigates to page, takes 1-5 screenshots, stores as `01_<name>.png` in `review_image_dir`
- If absent: gracefully degrades to code-only review

**What happened in all 3 reviews:**
- #57 review: "Code-only review due to missing Playwright tools"
- #58 review: "code-only review due to ngrok tunnel offline"
- #59 review: "code-only review" (no visual attempt)

**The problem:** The review skill checks for **Playwright MCP** tools, but these were never configured. The `prepare_app.md` command references `DEV_TUNNEL_URL` and Firecrawl as the intended browser tool — but the review skill's tooling gate looks for Playwright, not Firecrawl.

**Architecture mismatch:**
- `prepare_app.md` (lines 16-17): "When using Firecrawl or any cloud-hosted browser/scraping tool, ALWAYS use the external URL"
- `review.md` (lines 19-23): Checks for `browser_navigate`, `browser_screenshot` (Playwright MCP tool names)
- `.env.local`: Had `DEV_TUNNEL_URL` pointing to ngrok (now replaced with cloudflare tunnel `*.schulie.com`)
- The firecrawl MCP server IS configured (available in tool list) but review.md doesn't reference it

### 3. Observability: What Works Well

**Build directory structure** is solid:
```
56_ralph_5ec126c5/
├── state.json          — workflow identity
├── execution.log       — unified human-readable timeline
├── status.json         — machine-parseable status + per-step usage
└── steps/
    ├── 01_select/      — per-step artifacts
    │   ├── prompt.txt
    │   ├── raw_output.jsonl
    │   ├── select.log
    │   └── status.json
    └── ...
```

**Good for humans:**
- `execution.log` is a single chronological narrative with clear iteration headers
- Step summaries in `status.json` have structured `action`/`decision`/`blockers` fields
- Tagged log lines (`[tdd]`, `[refactor]`, `[review]`) make scanning easy
- Cost and duration at every level (per-step, per-agent, totals)

**Good for agents:**
- `status.json` is fully machine-parseable JSON
- Step summaries follow a consistent schema (`StepSummary` interface)
- `raw_output.jsonl` preserves full SDK conversation for replay/analysis
- Step naming convention `{issue}_{counter}_{phase}` enables programmatic grouping

### 4. Observability: Gaps

**4a. No commit SHA tracking per step**
- `step-recorder.ts` captures `preSha` but doesn't record the post-step SHA
- There's no way to know what commit each step produced (or whether it committed at all)
- **Fix:** Record `post_sha` in step `status.json` after `commitChanges()`

**4b. Execution.log truncates results**
- Result text is cut off mid-sentence (e.g., "No references to `#C8A2" on line 29)
- The full result is only in `raw_output.jsonl` — the log should either include full results or explicitly note truncation
- **Fix:** Increase truncation limit or append `[truncated]` marker

**4c. No visual_validation field in review summary**
- Whether screenshots were taken or skipped is buried in free text
- **Fix:** Add `visual_validation: "passed" | "failed" | "skipped"` to `StepSummary`

**4d. state.json missing base_branch**
- Needed for PR targeting and checkout-back flow
- **Fix:** Record `base_branch` before creating feature branch

### 5. Cost Analysis

| Phase | Count | Total Cost | Avg Cost | Avg Duration | Avg Turns |
|-------|-------|-----------|----------|-------------|-----------|
| select | 2 | $0.076 | $0.038 | 8.5s | 1 |
| tdd | 3 | $0.965 | $0.322 | 112.7s | 17 |
| refactor | 3 | $0.737 | $0.246 | 65.0s | 12.7 |
| review | 3 | $0.578 | $0.193 | 86.4s | 12 |
| **Total** | **11** | **$2.356** | | **14m 24s** | **127** |

**Observations:**
- **Refactor steps are pure waste here.** All 3 returned "no changes needed" for trivial changes (CSS class swap, text change, 4-line HTML add). $0.74 and 3.25 minutes spent confirming nothing needs refactoring. For tasks this simple, refactor should be skippable or use a cheaper model.
- **Review steps had no visual validation** so they're essentially duplicate code reads — the TDD step already verified the code works via tests.
- **Cache utilization is high** — cache_read_tokens dominate (2.5M of 2.7M total), which is good. The SDK is reusing context effectively.
- **Model selection:** All steps used Sonnet 4 (default). For select/refactor on trivial issues, Haiku would suffice.

### 6. Model Selection

Current defaults (`utils.ts:360-366`):
- `research`: Haiku (not used in ralph)
- `default` (tdd, refactor, patch): Sonnet 4
- `review`: Sonnet 4 (overridable via `ADW_REVIEW_MODEL`)

**No per-issue complexity assessment.** Ralph treats every sub-issue identically regardless of complexity. A CSS color change and a complex multi-file feature get the same model, same step sequence (tdd → refactor → review). The `model_set` field in state.json ("base" vs "heavy") exists but isn't used for per-step decisions.

## Code References

- `adws/workflows/adw_ralph.ts:176-263` — TDD → refactor → review loop per issue
- `adws/workflows/adw_ralph.ts:328-395` — Finalization: aggregation, status write, push
- `adws/src/step-recorder.ts:51-108` — Step lifecycle (open/close, preSha capture)
- `adws/src/logger.ts:202-242` — `writeWorkflowStatus()` builds top-level status.json
- `adws/src/logger.ts:265-271` — Step numbering scheme
- `adws/src/agent-sdk.ts:82-95` — Usage extraction from SDK results
- `adws/src/agent-sdk.ts:106-119` — `sumUsage()` aggregation
- `adws/src/utils.ts:360-366` — Model defaults per workflow phase
- `.claude/commands/review.md:19-45` — Playwright tooling gate + screenshot spec
- `.claude/commands/prepare_app.md:16-17` — Firecrawl/tunnel URL reference
- `adws/src/step-commands.ts:21-28` — Review step command builder (passes reviewImageDir)
- `adws/src/review-utils.ts:6-21` — ReviewIssue/ReviewResult interfaces (expects screenshot_path)

## Architecture Documentation

### Ralph Step Sequence Per Issue
```
select → tdd → refactor (if not trivial) → review → [patch → build → review]* → commit → close
```

### Build Artifact Hierarchy
```
status.json (workflow-level)
  └── steps/{name}/status.json (step-level)
        └── raw_output.jsonl (message-level)
```

### Screenshot Architecture (Current → Target)
```
CURRENT (broken):
  review.md → checks Playwright MCP tools → NOT FOUND → code-only fallback

TARGET:
  review.md → checks if frontend change (from files_changed)
    → YES: firecrawl_scrape(DEV_TUNNEL_URL, formats: ["screenshot"]) → post to GitHub issue
    → NO: code-only review (correct behavior for backend changes)
```

### Git Flow (Current → Target)
```
CURRENT (broken):
  ralph starts on whatever branch → reuses if feature branch → no commits → push no-op

TARGET:
  ralph starts → assert on stable branch (not hein/feature/issue-*) → record base_branch
    → create hein/feature/issue-{N}-{desc} → work sub-issues
    → commit per sub-issue → push → create PR targeting base_branch
    → checkout base_branch
```

---

## Decision Log (from /grill-me session 2026-03-25)

### 1. Uncommitted Work
**Resolution:** Ralph calls `commitChanges()` after each sub-issue's full cycle (TDD → refactor → review → patches). One commit per sub-issue referencing the issue number.

### 2. Git Lifecycle
**Resolution:** Ralph records `base_branch` in state.json before branching. Creates `hein/feature/issue-{N}-{desc}` from stable base. After all sub-issues: push, create PR targeting `base_branch`, checkout back to `base_branch`. PR is ready-for-review, human merges.

### 3. Stable Branch Guard
**Resolution:** Convention-based. Any branch matching `hein/feature/issue-*` is unstable. `/prd` and ralph refuse to run from an unstable branch. No config needed, just a string check.

### 4. Screenshots — Firecrawl Replaces Playwright
**Resolution:** `review.md` gates on `firecrawl_scrape` instead of Playwright MCP. Uses `DEV_TUNNEL_URL` (cloudflare tunnel at `*.schulie.com`, always available via `just dev`). Frontend changes require visual validation via Firecrawl screenshot; backend changes use code-only review. If Firecrawl fails on a frontend change, that's a real failure — no silent degradation. Screenshots are posted as comments on the GitHub sub-issue for online visibility.

### 5. Complexity-Driven Pipeline
**Resolution:** `prd-to-issues` assigns a `complexity:trivial|standard|complex` GitHub label per sub-issue. Human can override before ralph runs. Ralph reads the label and adjusts:
- **trivial**: skip refactor, Sonnet for TDD/review
- **standard**: full pipeline, Sonnet
- **complex**: full pipeline, Opus

### 6. Observability
**Resolution (essential):** `post_sha` per step, `visual_validation` field in review summary, `base_branch` in state.json, fix execution.log truncation. Structured error types and diff artifacts deferred.

### 7. ngrok Cleanup
**Resolution:** Replace all ngrok references with cloudflare tunnel. Update `.env.example`, `prepare_app.md`, `review.md`. `DEV_TUNNEL_URL` points to fixed `*.schulie.com` subdomain.

### 8. Resumability
**Resolution:** Deferred. Open-issue filtering is a natural checkpoint. With per-sub-issue commits, restart loses at most one issue's work.
