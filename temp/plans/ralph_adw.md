# Plan: Unified SDLC Pipeline via Ralph Loop

> Source: Discussion on integrating new skills (TDD, prd-to-issues, refactor) into the existing ADW workflow system as a single AFK pipeline.

## Context

The existing ADW system has a well-standardized plan→build→test→review→document pipeline that operates monolithically. New skills have been introduced that enable a better approach: decompose a PRD into GitHub sub-issues, then work through them iteratively with test-first development, fresh-context refactoring, and per-issue review. This plan integrates those capabilities into the existing ADW infrastructure as a unified pipeline.

**The unified pipeline:**

```
HITL:  /grill-me → /prd → /prd-to-issues (creates parent + sub-issues)
AFK:   adw_ralph.ts loop per sub-issue: /tdd → /refactor → /review → /patch
HITL:  Human comments "document" on parent → adw_document_trigger.ts → /document
```

## Architectural decisions

- **GitHub sub-issues via GraphQL**: `gh api graphql` with `addSubIssue` mutation and `subIssues` query. No high-level CLI support exists (gh v2.86.0). Wrap in utility functions in `adws/src/github.ts`.
- **Branch strategy**: Ralph creates a feature branch named `hein/feature/issue-<parent-number>-<short-desc>` from the parent issue. All sub-issue work accumulates on this single branch.
- **ADW infrastructure**: `adw_ralph.ts` is a Tier 2 workflow using `taggedLogger()`, `ADWState`, `createSDK()`, usage tracking, `writeWorkflowStatus()`, GitHub comments — the full stack. No exceptions.
- **AFK boundary**: Everything after `/prd-to-issues` is fully autonomous. `/tdd` reads the issue body as its spec. No user confirmation prompts.
- **Existing commands unchanged**: `/plan`, `/build`, `/test`, `/review`, `/document` and all existing `adw_*.ts` workflows remain as-is for manual/alternative use.

---

## Phase 1: GitHub Sub-Issue Utilities

**User stories**: As an ADW workflow, I can create sub-issues under a parent and fetch them programmatically.

### What to build

Add GraphQL-based sub-issue functions to `adws/src/github.ts`:

- `createSubIssue(parentIssueNumber, title, body, labels?)` — creates an issue via `gh issue create`, then links it as sub-issue via `addSubIssue` GraphQL mutation
- `fetchSubIssues(parentIssueNumber, state?)` — queries `subIssues` field via GraphQL, returns list with number, title, body, state, labels
- `closeSubIssue(issueNumber, comment)` — closes issue with resolution comment

These are pure utilities — no workflow logic, no ADW dependencies.

### Acceptance criteria

- [ ] `createSubIssue` creates an issue and links it to parent via GraphQL
- [ ] `fetchSubIssues` returns open/closed/all sub-issues for a parent
- [ ] `closeSubIssue` closes with comment referencing commit SHA
- [ ] All functions handle errors gracefully (repo detection via `getRepoUrl()`)

---

## Phase 2: Modify `/tdd` for AFK Mode

**User stories**: As the Ralph loop, I can invoke /tdd against a GitHub issue without any human interaction.

### What to build

Modify `.claude/skills/tdd/SKILL.md`:

- Remove the HITL planning phase (section 1 "Confirm with user" checkboxes)
- Replace with: "Read the issue body as your specification. It contains interface specs, behaviors to test, and mocking boundaries."
- Remove the refactor step (section 4) entirely — refactoring is now a separate command
- The skill becomes: RED→GREEN loop only. Read spec → write test → minimal code to pass → repeat → commit
- Keep all reference docs (deep-modules.md, mocking.md, tests.md, interface-design.md) — they inform good test writing even without the refactor step

### Acceptance criteria

- [ ] `/tdd` can run to completion without prompting for user input
- [ ] `/tdd` reads issue body as spec when invoked with issue context
- [ ] No refactor step in the skill — ends after all RED→GREEN cycles complete
- [ ] Reference docs still loaded as context

---

## Phase 3: Create `/refactor` Command

**User stories**: As a fresh agent, I can improve code quality on existing implementation while keeping all tests green.

### What to build

New file: `.claude/commands/refactor.md`

Args:

- `$1` = adw_id

The command:

1. Reads the current implementation and test files (via `git diff --stat` against the branch base to know what changed)
2. Loads TDD reference docs as context: `deep-modules.md`, `interface-design.md`, `refactoring.md`
3. Refactors the implementation — extract duplication, deepen modules, apply SOLID where natural
4. Runs tests after each refactor step to ensure nothing breaks
5. Returns summary of changes + `git diff --stat`

Key constraint: NO new behavior. No new tests. Only restructure existing code.

### Acceptance criteria

- [ ] Command reads code cold without prior context
- [ ] References TDD supporting docs for quality guidance
- [ ] Runs tests after each refactor step
- [ ] Returns structured output (summary + diff stat)
- [ ] No new behavior introduced — only structural improvements

---

## Phase 4: Modify `/review` to Accept Issue Number

**User stories**: As the Ralph loop, I can review implementation against a GitHub issue spec, not just a local plan file.

### What to build

Modify `.claude/commands/review.md`:

- Add support for issue number as spec source: when `$2` is a number (not a file path), fetch issue body via `gh issue view <number> --json body,title`
- Use the issue body as the review spec
- Existing spec_file behavior unchanged

Modify `adws/src/agent-sdk.ts`:

- Update `runReviewStep()` signature: add optional `issueNumber` to options
- When `issueNumber` provided and no `specPath`, fetch issue and pass body as spec context

### Acceptance criteria

- [ ] `/review <adw_id> 42` fetches issue #42 and reviews against it
- [ ] `/review <adw_id> path/to/spec.md` still works as before
- [ ] `runReviewStep()` accepts `issueNumber` option
- [ ] Review JSON output format unchanged

---

## Phase 5: Modify `/prd-to-issues` to Front-Load TDD Decisions

**User stories**: As the HITL boundary, each issue I produce contains everything an AFK agent needs to build and test without asking questions.

### What to build

Modify `.claude/commands/prd-to-issues.md`:

- Each sub-issue body must include these sections:

  ```
  ## Interface Specification
  (public API, function signatures, types)

  ## Behaviors to Test (prioritized)
  1. Most critical behavior
  2. Next most critical
  ...

  ## Mocking Boundaries
  - Real: (what to test against directly)
  - Stubbed: (external APIs, databases, etc.)

  ## Acceptance Criteria
  - [ ] ...

  ## Dependencies
  - Blocked by: #X (if applicable)
  - Blocks: #Y (if applicable)
  ```

- Use Phase 1's `createSubIssue()` to link issues to parent via native GitHub sub-issues
- Add labels: `sub-issue`, plus type labels (`bug`, `enhancement`, `chore`) per issue

### Acceptance criteria

- [ ] Each sub-issue contains all 5 sections
- [ ] Sub-issues linked to parent via GitHub native sub-issues (GraphQL)
- [ ] Dependency declarations present where applicable
- [ ] Labels applied

---

## Phase 6: Create `adw_ralph.ts` Workflow

**User stories**: As an AFK pipeline, I work through all sub-issues for a parent PRD issue autonomously.

### What to build

New file: `adws/workflows/adw_ralph.ts`

Tier 2 workflow following exact patterns from `adw_review.ts` / `adw_test.ts`.

**CLI args:**

```
--adw-id <id>           (required)
--issue <number>        (required — parent PRD issue)
--max-iterations <n>    (optional, default 20)
```

**Workflow structure:**

```
runWorkflow(adwId, parentIssueNumber, maxIterations):
  1. Load/create ADWState
  2. Create feature branch: hein/feature/issue-<parent>-<short-desc>
  3. For each iteration (up to maxIterations):
     a. Fetch open sub-issues for parent (Phase 1 utility)
     b. If none remain → COMPLETE, break
     c. Agent selects highest-priority unblocked issue
     d. Run /tdd step (RED→GREEN against issue body)
     e. Run /refactor step (fresh context)
     f. Run /review step (against issue spec)
     g. If review has blockers → /patch loop (max 2 attempts, same as adw_review.ts)
     h. If review passes → commit, push, close sub-issue
     i. If review still fails after patches → skip issue, comment, continue
  4. Finalize: usage summary, workflow status, final comment on parent issue
```

**Reuse from existing infrastructure:**

- `createSDK()` / `runSkillStep()` / `quickPrompt()` — `adws/src/agent-sdk.ts`
- `ADWState` — `adws/src/state.ts`
- `taggedLogger()` / `createLogger()` — `adws/src/logger.ts`
- `getAdwEnv()` / `createCommentStep()` / `createFinalStatusComment()` / `writeWorkflowStatus()` — `adws/src/utils.ts`
- `fetchSubIssues()` / `makeIssueComment()` — `adws/src/github.ts`
- `createBranch()` / `commitChanges()` / `pushBranch()` — `adws/src/git-ops.ts`

**New step functions needed in `agent-sdk.ts`:**

- `runTddStep(issueBody, options)` — invokes `/tdd` with issue body as context
- `runRefactorStep(adwId, options)` — invokes `/refactor`

### Acceptance criteria

- [ ] Workflow runs with `bun run adws/workflows/adw_ralph.ts --adw-id <id> --issue <number>`
- [ ] Creates feature branch from parent issue
- [ ] Iterates sub-issues in priority order, respecting dependency blocks
- [ ] Per issue: tdd → refactor → review → patch (if needed)
- [ ] Closes sub-issues on success with commit reference
- [ ] Skips blocked/failed issues with comment, continues to next
- [ ] Terminates when all sub-issues closed or max iterations reached
- [ ] Full usage tracking, logging, GitHub comments on parent
- [ ] Follows Tier 2 patterns exactly (taggedLogger, ADWState, allStepUsages, writeWorkflowStatus)

---

## Phase 7: Document Trigger — GitHub Actions Webhook + Workflow

**User stories**: As a human reviewer, I comment "document" on the parent issue and the system automatically documents all completed work.

### What to build

**Two pieces:**

#### 7a. GitHub Actions workflow (webhook listener)

New file: `.github/workflows/document-trigger.yml`

Triggered on `issue_comment` event. When a comment containing "document" is posted:

1. Check out the repo on the feature branch for that issue
2. Run `bun run adws/workflows/adw_document_trigger.ts --issue <issue-number>`
3. The action needs: Bun installed, gh CLI authenticated, repo checkout

```yaml
on:
  issue_comment:
    types: [created]
# Filter: only run when comment body contains "document"
# Extract issue number from event context
```

#### 7b. `adw_document_trigger.ts` workflow

New file: `adws/workflows/adw_document_trigger.ts`

Tier 2 workflow. CLI args: `--adw-id` (required), `--issue` (required, parent issue number).

This workflow:

1. Fetches the parent issue and validates a "document" keyword comment exists (via `findKeywordFromComment()` from `github.ts`)
2. Fetches all closed sub-issues for the parent via `fetchSubIssues(state='closed')`
3. Determines the feature branch from ADWState or branch naming convention
4. Reads git diff on feature branch vs main
5. Invokes `/document` with aggregated context (parent PRD body + sub-issue summaries + diff)
6. Commits documentation, pushes
7. Comments on parent issue confirming documentation is complete

### Acceptance criteria

- [ ] GitHub Actions workflow triggers on `issue_comment` events
- [ ] Only fires when comment body contains "document"
- [ ] `adw_document_trigger.ts` fetches closed sub-issues and aggregates context
- [ ] Invokes `/document` with full feature context
- [ ] Commits documentation to feature branch
- [ ] Fully automated — no manual intervention after commenting

---

## Phase 8: Deprecate Shell-Based Ralph

**User stories**: As a developer, I use ADW workflows instead of shell scripts for all automation.

### What to build

- Archive `ralph.sh`, `ralph-gh.sh`, `prompt-gh.md`, `prd.json` to `temp/archive/` (or delete)
- Update any references in docs or CLAUDE.md

### Acceptance criteria

- [ ] Shell scripts archived/removed
- [ ] No references to ralph.sh in active docs
- [ ] `adw_ralph.ts` is the canonical way to run the Ralph loop

---

## Verification

1. **Phase 1**: Create a test parent issue, use `createSubIssue()` to add 2 sub-issues, verify `fetchSubIssues()` returns them
2. **Phase 2**: Run `/tdd` against a sub-issue — confirm no user prompts, RED→GREEN completes
3. **Phase 3**: Run `/refactor` against Phase 2's output — confirm tests still pass, code improved
4. **Phase 4**: Run `/review <adw_id> <issue-number>` — confirm review runs against issue body
5. **Phase 6**: Full dry run — create a small PRD parent with 2 sub-issues, run `adw_ralph.ts`, verify both sub-issues closed with tested+refactored+reviewed code
6. **Phase 7**: Comment "document" on parent, run `adw_document_trigger.ts`, verify docs generated
