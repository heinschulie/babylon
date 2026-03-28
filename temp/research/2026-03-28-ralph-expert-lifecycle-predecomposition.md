---
date: 2026-03-28T12:00:00+02:00
researcher: Claude
git_commit: beb08a3
branch: hein/feature/issue-64
repository: babylon
topic: 'Complete lifecycle of ADW Ralph workflow and agent expert system'
tags: [research, codebase, ralph, adw, experts, learning, self-improve]
status: complete
last_updated: 2026-03-28
last_updated_by: Claude
---

# Research: ADW Ralph Workflow & Agent Expert System — Complete Lifecycle

## Research Question

Fully research and understand the complete lifecycle of the adw_ralph workflow and the agent expert system, including how experts "learn" from workflow feedback.

## Summary

Ralph is an autonomous SDLC loop that fetches GitHub sub-issues from a parent PRD, implements each via TDD + refactor + review, and closes them with commits. Before each TDD step, Ralph consults domain experts (database, frontend) for guidance. When steps fail, Ralph records structured **learnings** tagged with expert names. A separate `adw_learn` workflow triages those learnings back into expert `expertise.yaml` files via self-improvement commands, closing a feedback loop where failures improve future expert advice.

---

## Full Lifecycle Diagram

```
                        RALPH WORKFLOW (adw_ralph.ts)
                        =============================

  --ralph comment on GH issue
  OR: bun run adws/workflows/adw_ralph.ts --adw-id <id> --issue <N>
           |
           v
  +------------------+
  | INITIALIZATION   |
  | - assertStableBranch()                     (git-ops.ts:27)
  | - create/load ADWState                     (state.ts:21)
  | - create feature branch                    (git-ops.ts:116)
  |   hein/feature/issue-{N}
  +--------+---------+
           |
           v
  +=============================+  <--- UP TO 20 ITERATIONS
  |    ITERATION LOOP           |
  |                             |
  |  1. FETCH SUB-ISSUES        |
  |     fetchSubIssues(parent)             (github.ts:303)
  |     filterUnblockedIssues()            (github.ts:409)
  |         |                   |
  |     [none left?] ---> COMPLETE (go to FINALIZE)
  |     [all blocked?] --> HALT + comment
  |         |                   |
  |  2. SELECT ISSUE            |
  |     single? auto-select     |
  |     multiple? quickPrompt() |
  |     extract complexity label|
  |         |                   |
  |  3. EXPERT CONSULTATION     |    <--- NON-FATAL (try/catch)
  |     runConsultStep()                   (agent-sdk.ts:451)
  |       |                     |
  |       v                     |
  |   +---------------------------+
  |   | /experts:consult          |          (consult.md)
  |   | - glob experts/*/expertise.yaml
  |   | - match by file_patterns + domain_tags
  |   | - invoke /experts:{name}:question in parallel (max 3)
  |   | - synthesize + debate contradictions (1 round)
  |   | - return: expert_consulted, expert_advice_summary
  |   +---------------------------+
  |       |                     |
  |       v                     |
  |   consultExpertNames[]      |
  |   consultAdviceSummary      |
  |       |                     |
  |   Inject as "## Expert Guidance" into issue body
  |         |                   |
  |  4. TDD STEP                |
  |     runTddStep(body+guidance)          (agent-sdk.ts)
  |     /tdd skill: RED -> GREEN           |
  |     record preTddSha                   |
  |         |                   |
  |     [FAIL?] --> recordLearning() ---+  |
  |                 skip issue          |  |
  |                 continue loop       |  |
  |         |                   |       |  |
  |  5. REFACTOR STEP           |       |  |
  |     (skip if trivial)       |       |  |
  |     runRefactorStep()                  (agent-sdk.ts)
  |     scope guard: files <= TDD*3     |  |
  |     non-fatal on failure    |       |  |
  |         |                   |       |  |
  |  6. REVIEW STEP             |       |  |
  |     runReviewStep()                    (agent-sdk.ts)
  |     parseReviewResult()                (review-utils.ts:28)
  |     extractScreenshots()               (review-utils.ts:92)
  |         |                   |       |  |
  |     [PASS?] --> commit + close issue|  |
  |         |                   |       |  |
  |     [FAIL?]                 |       |  |
  |         v                   |       |  |
  |  7. PATCH RETRY (max 2)     |       |  |
  |     runPatchPlanStep()      |       |  |
  |     runBuildStep()          |       |  |
  |     [PASS?] --> commit + close      |  |
  |     [FAIL x2?] --> recordLearning()-+  |
  |                   skip issue        |  |
  |         |                   |       |  |
  |  8. COMMIT & CLOSE          |       |  |
  |     commitChanges()                    (git-ops.ts:152)
  |     closeSubIssue()                    (github.ts:352)
  |     -> completedIssues[]    |       |  |
  |                             |       |  |
  +=============================+       |  |
           |                            |  |
           v                            |  |
  +------------------+                  |  |
  | FINALIZE         |                  |  |
  | - pushBranch()              (git-ops.ts:73)
  | - gh pr create              (adw_ralph.ts:471)
  | - writeWorkflowStatus()     (logger.ts:206)
  | - commentFinalStatus()      (utils.ts:370)
  | - checkout base branch      |       |  |
  +------------------+                  |  |
                                        |  |
                                        v  |
                              temp/learnings/{run_id}.md
                                        |
                                        |
       LEARNING FEEDBACK LOOP           |
       ==========================       |
                                        |
           +----------------------------+
           |
           v
  +------------------+
  | adw_learn.ts     |                     (adws/workflows/adw_learn.ts)
  | 1. Read all learnings from temp/learnings/
  | 2. Discover experts via glob expertise.yaml
  | 3. Triage: matchLearningsToExpert()    (learning-utils.ts:288)
  |    - Match by tags vs domain_tags
  | 4. Per matched expert:
  |    runSelfImproveStep(FOCUS_AREA=learnings)
  | 5. Archive processed learnings
  +--------+---------+
           |
           v
  +------------------------------------------+
  | /experts:{name}:self-improve             |
  | (e.g. database/self-improve.md)          |
  |                                          |
  | Step 1:  Check git diff                  |
  | Step 1b: Ingest runtime learnings        |
  |   - Filter learnings by domain_tags      |
  |   - Version-aware conflict resolution:   |
  |     learning.version == current?         |
  |       -> learning wins (lived experience)|
  |     learning.version < current?          |
  |       -> ai_doc wins, deprecate learning |
  | Step 2:  Read current expertise.yaml     |
  | Step 3:  Validate against live codebase  |
  | Step 4:  Identify discrepancies          |
  | Step 5:  Update expertise.yaml           |
  | Step 6:  Enforce line limit (1000)       |
  | Step 7:  Validation check                |
  +------------------------------------------+
           |
           v
  Updated expertise.yaml
  (database: 863 lines, frontend: 274 lines)
           |
           |  NEXT RALPH RUN
           +-------> consult reads updated expertise
                     -> better advice -> fewer failures
                     -> CLOSED LOOP
```

---

## Detailed Findings

### 1. Ralph Workflow Entry Points

**Trigger mechanisms:**
- **GitHub comment**: User posts `--ralph` on an issue (`adws/triggers/webhook.ts:206`)
- **Webhook**: `POST /gh-webhook` on port 8001 (`webhook.ts:42`), dispatches via `Bun.spawn()`
- **CLI**: `bun run adws/workflows/adw_ralph.ts --adw-id <id> --issue <N> [--max-iterations 20]` (`adw_ralph.ts:554-586`)

**Entry function**: `runWorkflow(adwId, parentIssueNumber, maxIterations)` at `adw_ralph.ts:52-57`

### 2. Iteration Loop — Per-Issue Lifecycle

Each iteration processes one sub-issue through these stages:

| Stage | Function | File:Line | Fatal? |
|-------|----------|-----------|--------|
| Fetch sub-issues | `fetchSubIssues()` | github.ts:303-347 | Yes |
| Filter unblocked | `filterUnblockedIssues()` | github.ts:409-432 | Yes |
| Select issue | `quickPrompt()` (if multiple) | adw_ralph.ts:164-181 | Yes |
| Expert consult | `runConsultStep()` | agent-sdk.ts:451-457 | **No** |
| TDD | `runTddStep()` | agent-sdk.ts | Yes (skip) |
| Refactor | `runRefactorStep()` | agent-sdk.ts | **No** |
| Review | `runReviewStep()` | agent-sdk.ts | Yes (patch) |
| Patch retry | `runPatchPlanStep()` + `runBuildStep()` | agent-sdk.ts | Yes (skip) |
| Commit & close | `commitChanges()` + `closeSubIssue()` | git-ops.ts:152 / github.ts:352 | Yes |

**Complexity-based routing** (`adw_ralph.ts:186-187`):
- `trivial` label → research model, skip refactor
- `complex` label → opus-4 model
- `standard` (default) → default model

### 3. Expert System Architecture

**Structure**: Each expert = directory at `.claude/commands/experts/{name}/` with 3 files:

| File | Purpose |
|------|---------|
| `expertise.yaml` | Knowledge base: file patterns, domain tags, tables, operations, constraints |
| `question.md` | Q&A command — reads expertise, validates against codebase, answers |
| `self-improve.md` | Self-improvement — ingests learnings + git diff, updates expertise.yaml |

**Current experts:**

| Expert | expertise.yaml | File Patterns | Domain Tags |
|--------|---------------|---------------|-------------|
| **database** | 863 lines (v4, validated 2026-03-26) | `convex/**`, `packages/convex/**` | convex, database, schema, queries, mutations, actions, indexes, validators, billing, auth, crons |
| **frontend** | 274 lines (validated 2026-03-27) | `apps/web/**`, `apps/verifier/**`, `packages/ui/**`, `packages/shared/**` | svelte, sveltekit, components, routing, tailwind, shadcn, i18n, paraglide, stores, runes |

**Three-Tier Knowledge Value System** (database self-improve.md:48-54):
1. **Tier 1** (Schema Reference): Table/field/index lists — necessary but lowest value
2. **Tier 2** (Operational Catalog): Function mappings, conventions — where most files stop
3. **Tier 3** (Architectural Intuition): Cross-table flows, platform constraints, invariants — rare, most valuable

### 4. Consultation Flow (`/experts:consult`)

Located at `.claude/commands/experts/consult.md` (92 lines):

1. **Discovery** (line 25-29): Glob `.claude/commands/experts/*/expertise.yaml`
2. **Matching** (line 31-36): Score experts by file_patterns + domain_tags overlap, cap at 3
3. **Parallel consultation** (line 38-44): Invoke `/experts:{name}:question` via Task tool
4. **Synthesis** (line 46-50): Identify agreement and contradictions across expert responses
5. **Debate** (line 52-58): One-round contradiction resolution (conditional)
6. **Return** (line 60-81): Structured `{ expert_consulted, expert_advice_summary }`

### 5. Learning Capture

**When**: On TDD failure (`adw_ralph.ts:256-270`) and review+patch failure (`adw_ralph.ts:422-436`)

**Schema** (from `temp/learnings/README.md`):
```yaml
- id: learn-{N}
  workflow: adw_ralph
  run_id: "ralph-{date}-{adwId:8}"
  date: 2026-03-28T12:34:56Z
  tags: [database, convex]         # from consultExpertNames or inferTagsFromFiles()
  context: "TDD step for issue #42: Add user schema"
  expected: "TDD succeeds following expert guidance: ..."
  actual: "TDD failed: Schema validation error..."
  confidence: medium
  platform_context: { convex: "1.31.6", svelte: "5.48.0" }
```

**Tag inference fallback** (`learning-utils.ts:340-349`): When no expert was consulted, `inferTagsFromFiles()` matches changed files against expert `file_patterns` to derive domain tags.

**Storage**: `temp/learnings/{run_id}.md`

### 6. Learning Ingestion (`adw_learn.ts`)

Located at `adws/workflows/adw_learn.ts` (251 lines):

1. **Read** all learning files from `temp/learnings/` (line 50-51)
2. **Discover** experts via glob of `expertise.yaml` (line 73-74)
3. **Triage** — `matchLearningsToExpert()` per expert (line 87-96) using tag overlap
4. **Self-improve** — invoke `/experts:{name}:self-improve` with `FOCUS_AREA=learnings` (line 109-116)
5. **Archive** — move processed learnings to `temp/learnings/archive/` (line 146-153)

### 7. Self-Improvement Workflow

Each expert's `self-improve.md` follows a 7-step process:

| Step | Action |
|------|--------|
| 1 | Check git diff for schema/code changes |
| 1b | Ingest runtime learnings (filtered by domain_tags) |
| 2 | Read current expertise.yaml |
| 3 | Validate every claim against live codebase |
| 4 | Identify discrepancies (stale entries, missing entries, learning conflicts) |
| 5 | Update expertise.yaml with validated knowledge |
| 6 | Enforce line limit (1000 lines max) |
| 7 | Final validation check |

**Version-aware conflict resolution** (database self-improve.md:64-77):
- `learning.platform_version == current_version` AND conflicts with existing → **learning wins** (lived experience > docs)
- `learning.platform_version < current_version` AND ai_doc conflicts → **ai_doc wins**, deprecate learning

### 8. State Persistence

**ADWState** (`state.ts:21-132`): Persisted to `temp/builds/{issueNumber}_ralph_{adwId}/state.json`
- Fields: adw_id, issue_number, branch_name, base_branch, plan_file, worktree_path, model_set

**Step recordings** (`step-recorder.ts`): Per-step status at `temp/builds/{...}/steps/{stepName}/status.json`
- Fields: step_name, status (pass/fail), duration_ms, usage (tokens/cost), pre_sha, post_sha, files_changed, visual_validation

**Workflow status** (`logger.ts:206-246`): Final `{logDir}/status.json` with overall verdict

### 9. Finalization & Reporting

After the loop completes:
1. `pushBranch()` → push feature branch (`git-ops.ts:73`)
2. `gh pr create` → PR with completed/skipped issue summary (`adw_ralph.ts:471-482`)
3. `writeWorkflowStatus()` → status.json (`logger.ts:206`)
4. `commentFinalStatus()` → markdown table on GH issue with per-step status, tokens, cost (`utils.ts:370-403`)
5. Checkout base branch

---

## Code References

### Core Workflow
- `adws/workflows/adw_ralph.ts` — Main Ralph loop (587 lines)
- `adws/workflows/adw_learn.ts` — Learning ingestion + expert self-improve (251 lines)
- `adws/workflows/adw_document_ralph.ts` — Documentation trigger (232 lines)

### Supporting Modules
- `adws/src/agent-sdk.ts` — Step execution wrappers (runConsultStep at line 451)
- `adws/src/github.ts` — Sub-issue GraphQL queries (line 303), issue close (line 352)
- `adws/src/git-ops.ts` — Branch ops, commit, push, diff
- `adws/src/state.ts` — ADWState persistence
- `adws/src/logger.ts` — Dual-target logging + status writer
- `adws/src/learning-utils.ts` — recordLearning (line 91), inferTagsFromFiles (line 340), matchLearningsToExpert (line 288), discoverExperts (line 246)
- `adws/src/review-utils.ts` — parseReviewResult (line 28), extractScreenshots (line 92)
- `adws/src/step-commands.ts` — Skill-to-command mapping (consult at line 91)

### Expert System
- `.claude/commands/experts/consult.md` — Orchestrator (92 lines)
- `.claude/commands/experts/database/expertise.yaml` — Database knowledge (863 lines)
- `.claude/commands/experts/database/question.md` — Database Q&A (38 lines)
- `.claude/commands/experts/database/self-improve.md` — Database self-improve (225 lines)
- `.claude/commands/experts/frontend/expertise.yaml` — Frontend knowledge (274 lines)
- `.claude/commands/experts/frontend/question.md` — Frontend Q&A (40 lines)
- `.claude/commands/experts/frontend/self-improve.md` — Frontend self-improve (188 lines)

### Triggers
- `adws/triggers/webhook.ts` — GitHub webhook handler (line 206: `--ralph` comment trigger)

### Learnings
- `temp/learnings/README.md` — Learning entry schema (57 lines)
- `temp/learnings/{run_id}.md` — Individual learning files
- `temp/learnings/archive/` — Processed learnings

---

## Architecture Documentation

### Key Patterns

1. **Pre-step consultation with graceful degradation** — Expert consult is non-fatal; TDD proceeds with raw issue body on failure
2. **Expert names as learning taxonomy** — Consultant names flow into learning tags, enabling domain-specific failure analysis
3. **Closed-loop feedback** — Ralph failures → learnings → adw_learn → self-improve → updated expertise → better Ralph advice
4. **Complexity-based model routing** — Issue labels determine Claude model and whether refactor is skipped
5. **Deterministic dependency resolution** — Pure regex "Blocked by: #N" parsing, no LLM involved
6. **Extensible expert discovery** — New expert = new directory with 3 files, auto-discovered via glob
7. **Version-aware knowledge resolution** — Platform version context determines whether lived experience or documentation wins conflicts

### Data Artifact Flow

```
preTddSha ──────────────────────> refactor scope check
selectedIssue.body ─────────────> TDD input, patch input
consultAdviceSummary ───────────> appended to TDD body as "## Expert Guidance"
consultExpertNames[] ───────────> learning tags (primary)
inferTagsFromFiles() ───────────> learning tags (fallback)
reviewResult ───────────────────> patch plan input
allStepUsages[] ────────────────> final cost report on GH issue
```

---

## Open Questions

- `CHANGED_FILES` param never passed from Ralph to consult — expert matching relies on keyword/tag matching only. Intentional?
- Frontend expertise.yaml at 274 lines vs database's 863 — still maturing?
- `inferTagsFromFiles()` duplicates expert discovery logic in consult.md — could diverge if patterns change
- `adw_learn` trigger mechanism unclear — manual invocation or scheduled?
