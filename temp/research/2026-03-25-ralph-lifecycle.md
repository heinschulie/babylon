---
date: 2026-03-25T00:00:00+02:00
researcher: Claude
git_commit: 29e23b3
branch: hein/feature/issue-31-create-test-route
repository: babylon
topic: 'Lifecycle of the adw_ralph loop — trigger, execution, finalization'
tags: [research, codebase, ralph, adw, workflow, tdd]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: Ralph Workflow Lifecycle

## Research Question

How does the adw_ralph loop get kicked off, run through its typical execution, and finalize its work reporting back to the system/user?

## Summary

Ralph is an automated TDD loop that processes a parent GitHub issue's sub-issues sequentially. It is triggered via a `--ralph` comment on a GitHub issue, received by a Bun webhook server, which spawns the workflow as a background process. Each iteration selects an unblocked sub-issue, runs TDD → Refactor → Review (with patch retry), commits on success, and closes the sub-issue. On completion it pushes the feature branch, creates a PR, and posts a final status comment with cost/token metrics.

## Lifecycle Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                        1. TRIGGER                                │
│                                                                  │
│  GitHub Issue Comment: "--ralph"                                 │
│         │                                                        │
│         ▼                                                        │
│  Webhook Server (POST /gh-webhook, port 8001)                    │
│  adws/triggers/webhook.ts                                        │
│         │                                                        │
│         ├─ Detect "--ralph" keyword                               │
│         ├─ Map to WORKFLOW_SCRIPT_MAP["adw_ralph"]                │
│         ├─ Generate ADW ID (8-char UUID)                          │
│         ▼                                                        │
│  Bun.spawn() background:                                         │
│    bun run workflows/adw_ralph.ts --adw-id <id> --issue <num>    │
│         │                                                        │
│  Respond to GitHub webhook immediately (<10s)                    │
└─────────┼────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────┐
│                     2. INITIALIZATION                            │
│                                                                  │
│  ┌─ assertStableBranch()  ← reject if on feature branch         │
│  ├─ ADWState.load() or new ADWState()                            │
│  ├─ Record baseBranch (current branch)                           │
│  ├─ quickPrompt() → generate 2-4 word branch description        │
│  └─ createBranch("hein/feature/issue-{N}-{desc}")                │
│                                                                  │
│  State: { adw_id, issue_number, base_branch, branch_name }      │
└─────────┼────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────┐
│              3. MAIN ITERATION LOOP (max 20)                     │
│                                                                  │
│  for iteration = 1..maxIterations:                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  3a. FETCH & FILTER                                     │     │
│  │                                                         │     │
│  │  fetchSubIssues(parent, "open")                         │     │
│  │     └─ if none remain → COMPLETE, break                 │     │
│  │                                                         │     │
│  │  fetchSubIssues(parent, "closed") + completedIssues     │     │
│  │     └─ filterUnblockedIssues() ← deterministic,         │     │
│  │        parses "Blocked by: #N" from issue body          │     │
│  │                                                         │     │
│  │  if all blocked → halt with comment                     │     │
│  └─────────────────────────────────────────────────────────┘     │
│                      │                                           │
│                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  3b. SELECT ISSUE                                       │     │
│  │                                                         │     │
│  │  1 unblocked → auto-select                              │     │
│  │  N unblocked → quickPrompt() picks highest priority     │     │
│  │                                                         │     │
│  │  Complexity routing via labels:                          │     │
│  │    trivial  → default model, skip refactor              │     │
│  │    standard → default model                              │     │
│  │    complex  → opus model                                 │     │
│  └─────────────────────────────────────────────────────────┘     │
│                      │                                           │
│                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  3c. TDD STEP                                           │     │
│  │                                                         │     │
│  │  Record preTddSha                                       │     │
│  │  runTddStep(issueBody) → /tdd skill                     │     │
│  │    RED:    write failing tests from spec                 │     │
│  │    GREEN:  minimal code to pass                          │     │
│  │    REFACTOR: basic cleanup                               │     │
│  │                                                         │     │
│  │  On failure → skip issue, continue to next iteration    │     │
│  └─────────────────────────────────────────────────────────┘     │
│                      │                                           │
│                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  3d. REFACTOR STEP (skipped if trivial)                 │     │
│  │                                                         │     │
│  │  runRefactorStep(adwId, issueNumber, body, preTddSha)   │     │
│  │    → /refactor-step skill                                │     │
│  │    Uses git diff preTddSha..HEAD to scope changes       │     │
│  │                                                         │     │
│  │  Guardrail: if refactorFiles > tddFiles * 3 → warn     │     │
│  │  Non-fatal: continues even on failure                    │     │
│  └─────────────────────────────────────────────────────────┘     │
│                      │                                           │
│                      ▼                                           │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  3e. REVIEW STEP                                        │     │
│  │                                                         │     │
│  │  runReviewStep(adwId, issueBody as INLINE_SPEC)          │     │
│  │    → /review skill                                       │     │
│  │    Validates implementation against spec                 │     │
│  │    Returns JSON: { success: bool, review_issues[] }     │     │
│  │                                                         │     │
│  │  If success → proceed to commit                         │     │
│  │  If fail    → enter PATCH LOOP                          │     │
│  └─────────────────────────────────────────────────────────┘     │
│                      │                                           │
│              ┌───────┴────────┐                                  │
│              │  reviewPassed? │                                  │
│              └───┬────────┬───┘                                  │
│              YES │        │ NO                                   │
│                  │        ▼                                      │
│                  │  ┌──────────────────────────────────────┐     │
│                  │  │  3f. PATCH LOOP (max 2 attempts)     │     │
│                  │  │                                      │     │
│                  │  │  for attempt = 1..2:                  │     │
│                  │  │    runPatchPlanStep() → /patch        │     │
│                  │  │      Creates patch plan from review   │     │
│                  │  │    runBuildStep(plan) → /build        │     │
│                  │  │      Implements the patch             │     │
│                  │  │    if success → reviewPassed, break   │     │
│                  │  └──────────────────────────────────────┘     │
│                  │        │                                      │
│                  ▼        ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │  3g. COMMIT & CLOSE (if passed)                         │     │
│  │                                                         │     │
│  │  commitChanges("feat(#N): title")                       │     │
│  │  closeSubIssue(N, "Resolved by Ralph (ADW: id)")        │     │
│  │  commentStep("completed ✅")                             │     │
│  │  → add to completedIssues[]                              │     │
│  │                                                         │     │
│  │  OR if not passed:                                       │     │
│  │  commentStep("skipped ❌")                               │     │
│  │  → add to skippedIssues[]                                │     │
│  └─────────────────────────────────────────────────────────┘     │
│                      │                                           │
│                      └──→ next iteration                         │
└─────────┼────────────────────────────────────────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────────┐
│                      4. FINALIZATION                              │
│                                                                  │
│  ┌─ sumUsage() → aggregate all step token/cost metrics           │
│  ├─ pushBranch(featureBranch)                                    │
│  ├─ gh pr create --base {baseBranch} --head {featureBranch}      │
│  │    Title: "feat(#N): #A, #B completed"                        │
│  │    Body: completed/skipped lists, ADW ID                      │
│  ├─ checkoutBranch(baseBranch) ← return to base                  │
│  │                                                               │
│  ├─ writeWorkflowStatus() → status.json in build dir             │
│  │    { workflow, adwId, ok, startTime, totals }                 │
│  │                                                               │
│  └─ commentFinalStatus() → markdown table on parent issue        │
│       ┌──────────────────────────────────────────┐               │
│       │ ## Workflow PASS ✅                       │               │
│       │ **Workflow:** ralph                       │               │
│       │ **ADW ID:** a1b2c3d4                      │               │
│       │ **Duration:** 12m 45s                     │               │
│       │                                           │               │
│       │ | Step       | Status | Duration |        │               │
│       │ |------------|--------|----------|        │               │
│       │ | 01_tdd_42  | ✅     | 3m 20s   |        │               │
│       │ | 02_refac_42| ✅     | 1m 10s   |        │               │
│       │ | 03_rev_42  | ❌     | 2m 05s   |        │               │
│       │ | 04_patch_42| ✅     | 1m 30s   |        │               │
│       │                                           │               │
│       │ **Tokens:** 45,320 in / 12,050 out        │               │
│       │ **Cost:** $0.1234                         │               │
│       └──────────────────────────────────────────┘               │
│                                                                  │
│  Exit code: 0 (all completed) or 1 (any skipped/failed)         │
└──────────────────────────────────────────────────────────────────┘
```

## Detailed Findings

### 1. Trigger Chain

**Entry point:** A user comments `--ralph` on a GitHub issue.

- **Webhook server** (`adws/triggers/webhook.ts`) runs as a Bun HTTP server on port 8001
- `POST /gh-webhook` receives GitHub `issue_comment.created` events
- Keyword detection at lines 78-80: `--ralph` maps to `adw_ralph` workflow, `--document` maps to `adw_document_ralph`
- `WORKFLOW_SCRIPT_MAP` (lines 143-158) resolves to `workflows/adw_ralph.ts`
- Dispatch (lines 179-212): `Bun.spawn()` runs workflow in background with env vars `ADW_PROMPT` (issue title+body) and `ADW_WORKING_DIR`
- Webhook responds to GitHub immediately with `{status, issue, adwId, workflow, logPath}`

**Alternative triggers:**
- Issue opened with `adw_` in body → auto-dispatches matching workflow
- Manual CLI: `bun run adws/workflows/adw_ralph.ts --adw-id <id> --issue <num>`

### 2. Initialization (adw_ralph.ts:41-103)

1. **Stable branch guard** (line 69-74): `assertStableBranch()` rejects execution from `hein/feature/issue-*` branches
2. **State creation** (lines 56-61): `ADWState.load()` or new, persisted to `temp/builds/{issueNum}_ralph_{adwId}/state.json`
3. **Branch naming** (lines 81-95): `quickPrompt()` asks Claude for a 2-4 word kebab-case description, creates `hein/feature/issue-{N}-{desc}`
4. **State saved** with `base_branch` and `branch_name`

### 3. Main Loop (adw_ralph.ts:106-351)

Up to `DEFAULT_MAX_ITERATIONS = 20` iterations (configurable via `--max-iterations`).

**Per iteration:**

| Phase | Lines | Mechanism | Failure Mode |
|-------|-------|-----------|--------------|
| Fetch open sub-issues | 112-117 | GraphQL `fetchSubIssues(parent, "open")` | None remain → COMPLETE |
| Dependency filtering | 122-143 | `filterUnblockedIssues()` — deterministic regex on "Blocked by: #N" | All blocked → halt |
| Issue selection | 146-174 | Single → auto; multiple → `quickPrompt()` priority pick | Selection fail → `continue` |
| Complexity routing | 179-182 | Label `complexity:trivial\|standard\|complex` | Default: standard |
| TDD | 186-208 | `runTddStep(issueBody)` → `/tdd` skill | Fail → skip issue |
| Refactor | 211-246 | `runRefactorStep()` → `/refactor-step` skill | Non-fatal; guardrail warns if scope > 3x TDD files |
| Review | 248-278 | `runReviewStep()` → `/review` skill | Fail → patch loop |
| Patch loop | 281-327 | `runPatchPlanStep()` + `runBuildStep()`, max 2 attempts | Exhaust → skip issue |
| Commit & close | 330-350 | `commitChanges()`, `closeSubIssue()` | Commit fail logged (may already be committed) |

**Step execution infrastructure:**
- Each step uses `openStep()` (step-recorder.ts) to capture pre-SHA, create log dirs, and track files changed
- `createSDK()` (agent-sdk.ts:185-200) wraps `@anthropic-ai/claude-agent-sdk` with `bypassPermissions` mode
- Usage tracked per step in `allStepUsages[]`

### 4. Finalization (adw_ralph.ts:353-461)

1. **Usage aggregation**: `sumUsage()` totals all step token/cost metrics
2. **Push & PR** (lines 362-395):
   - `pushBranch(featureBranch)`
   - `gh pr create --base {baseBranch} --head {featureBranch}` with summary of completed/skipped issues
3. **Return to base** (lines 398-405): `checkoutBranch(baseBranch)`
4. **Status file** (line 418-424): `writeWorkflowStatus()` writes `status.json` to build dir
5. **Final comment** (lines 426-433): `commentFinalStatus()` posts markdown table to parent issue with per-step statuses, total tokens, and cost

**Exception handling** (lines 436-461): On unhandled error, still writes `status.json` (ok: false) and posts failure comment.

### 5. Document Ralph (adw_document_ralph.ts)

Separate companion workflow triggered by `--document` comment:
1. Validates `--document` keyword exists on issue
2. Fetches closed sub-issues
3. Aggregates context: parent PRD + sub-issue summaries + `git diff --stat`
4. Runs `/document` skill
5. Commits and pushes documentation to the feature branch

### 6. Build Directory Structure

```
temp/builds/{issueNumber}_ralph_{adwId}/
├── execution.log           # unified timeline
├── state.json              # ADWState snapshot
├── status.json             # workflow-level aggregated status
└── steps/
    ├── 01_branch-name/
    │   └── status.json
    ├── 42_02_tdd/
    │   ├── prompt.txt
    │   ├── tdd.log
    │   └── status.json
    ├── 42_03_refactor/
    │   ├── refactor.log
    │   └── status.json
    ├── 42_04_review/
    │   ├── review.log
    │   ├── review_img/     # screenshots if frontend
    │   └── status.json
    └── 42_05_patch_1/
        ├── patch.log
        └── status.json
```

## Code References

- `adws/triggers/webhook.ts:26-94` — Event detection and keyword routing
- `adws/triggers/webhook.ts:143-158` — WORKFLOW_SCRIPT_MAP
- `adws/triggers/webhook.ts:179-212` — Background process dispatch
- `adws/workflows/adw_ralph.ts:41-103` — Initialization (state, branch, guards)
- `adws/workflows/adw_ralph.ts:106-351` — Main iteration loop
- `adws/workflows/adw_ralph.ts:353-461` — Finalization (push, PR, status)
- `adws/workflows/adw_document_ralph.ts:35-202` — Document Ralph companion
- `adws/src/agent-sdk.ts:205-231` — runSkillStep (generic step executor)
- `adws/src/agent-sdk.ts:410-442` — Step runner functions (TDD, refactor, review, patch, build, quickPrompt)
- `adws/src/state.ts:26-132` — ADWState persistence
- `adws/src/logger.ts:252-294` — Logger + build dir creation
- `adws/src/logger.ts:206-246` — writeWorkflowStatus
- `adws/src/github.ts:303-347` — fetchSubIssues (GraphQL)
- `adws/src/github.ts:386-432` — Blocker parsing + filtering
- `adws/src/git-ops.ts:22-32` — Stable branch guard
- `adws/src/git-ops.ts:116-153` — Branch creation + commits
- `adws/src/step-recorder.ts:51-110` — Step context manager
- `adws/src/utils.ts:307-355` — Comment step + final status comment

## Architecture Documentation

**Key patterns:**
- **Deterministic blocker resolution** — No LLM for dependency parsing; regex-based extraction from "Blocked by: #N" in issue bodies
- **Complexity-based model routing** — `complexity:trivial|standard|complex` labels determine model (sonnet vs opus) and whether refactor runs
- **Non-fatal refactor** — Refactor failure doesn't block the pipeline; only TDD failure causes issue skip
- **Patch retry with ceiling** — Review failures get max 2 patch attempts (plan + build each) before skip
- **Scope guardrail** — Refactor touching >3x TDD's file count triggers a warning comment
- **Comment loop prevention** — All issue comments prefixed with `[ADW-AGENTS]` to prevent webhook re-triggers
- **Background spawn** — Webhook responds to GitHub in <10s; actual workflow runs async via `Bun.spawn()`

## Open Questions

- How are `complexity:*` labels applied to sub-issues? (Manually by user, or auto-classified?)
- Is there retry/resume support if the process crashes mid-iteration?
- What happens if the webhook server restarts while a workflow is running?
