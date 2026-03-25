# Plan: Ralph Hardening — Git Flow, Screenshots, Complexity, Observability

## Metadata

adw_id: `the`
prompt: `decisions from temp/research/2026-03-25-ralph-build-56-critique.md decision log`
conversation_id: `N/A`
task_type: refactor
complexity: complex

## Task Description

Implement 7 decisions from the /grill-me session on the ralph build 56 critique: (1) ralph commits per sub-issue and creates a PR at the end, (2) stable branch guard on /prd and ralph, (3) review.md uses Firecrawl for screenshots and posts them as GitHub issue comments, (4) prd-to-issues assigns complexity labels that ralph reads to skip refactor on trivial issues and use Opus on complex ones, (5) observability improvements (post_sha, visual_validation, base_branch, log truncation), (6) ngrok-to-cloudflare cleanup, (7) checkout back to base branch after PR.

## Objective

After this work, ralph will: commit per sub-issue, create a PR when done, guard against running from unstable branches, take Firecrawl screenshots for frontend reviews posted to GitHub issues, skip refactor for trivial issues, use Opus for complex ones, and produce richer build artifacts.

## Problem Statement

Ralph completed 3 sub-issues but committed nothing. Reviews silently degraded to code-only because the Playwright tooling gate never matches. All issues get identical treatment regardless of complexity. The git flow allows feature branches to stack on each other creating invisible dependencies.

## Solution Approach

Incremental changes across 6 phases — each phase produces a testable, independently valuable change. Foundation work (git helpers, schema) first, then core ralph changes, then review/screenshots, then complexity pipeline, then cleanup.

## Relevant Files

- `adws/workflows/adw_ralph.ts` — main workflow to modify (git flow, commits, complexity routing)
- `adws/src/git-ops.ts` — add `checkoutBranch()`, stable branch assertion
- `adws/src/state.ts` — add `base_branch` to core fields
- `adws/src/schemas.ts` — add `base_branch` to ADWStateDataSchema
- `adws/src/step-recorder.ts` — add `post_sha` capture
- `adws/src/logger.ts` — fix log truncation, add `visual_validation` to StepSummary
- `adws/src/github.ts` — add screenshot comment helper
- `adws/src/workflow-ops.ts` — `createPullRequest()` already exists, will be imported by ralph
- `.claude/commands/review.md` — replace Playwright gate with Firecrawl
- `.claude/commands/prepare_app.md` — update tunnel references
- `.claude/commands/prd.md` — add stable branch guard
- `.claude/commands/prd-to-issues.md` — add complexity label assignment
- `.env.example` — clean up ngrok references (already done — just verify)

### New Files

- None — all changes modify existing files

## Implementation Phases

### Phase 1: Foundation (git helpers, schema, state)

Add the building blocks other phases depend on: `checkoutBranch()`, `isStableBranch()`, `base_branch` in schema/state, `post_sha` in step-recorder.

### Phase 2: Ralph Git Flow (commits, PR, checkout-back)

Wire ralph to commit per sub-issue, create PR at finalization, checkout back to base branch.

### Phase 3: Review Screenshots (Firecrawl)

Replace Playwright gate in review.md with Firecrawl. Add screenshot-to-GitHub-comment posting in ralph after review step.

### Phase 4: Complexity Pipeline

Update prd-to-issues to assign complexity labels. Update ralph to read labels and route accordingly (skip refactor on trivial, Opus on complex).

### Phase 5: Observability

Fix log truncation, add `visual_validation` to StepSummary interface.

### Phase 6: Cleanup

Remove ngrok references, update prepare_app.md tunnel docs.

## Step by Step Tasks

### 1. Add git helpers to `git-ops.ts`

- Add `checkoutBranch(branchName, cwd?)` — wraps `git checkout <branch>`, returns `[boolean, string | null]`
- Add `isStableBranch(branchName)` — returns `false` if `branchName` matches `hein/feature/issue-*`, `true` otherwise
- Add `assertStableBranch(cwd?)` — gets current branch, calls `isStableBranch()`, throws if unstable

### 2. Add `base_branch` to state schema

- `adws/src/schemas.ts`: add `base_branch: z.string().nullable().optional()` to `ADWStateDataSchema`
- `adws/src/state.ts`: add `"base_branch"` to `CORE_FIELDS` set

### 3. Add `post_sha` to step-recorder

- In `step-recorder.ts` `close()` method: after computing `filesChanged`, capture `postSha = await getHeadSha(cwd)`
- Pass `post_sha` into the status.json data written by `log.finalize()`
- Update `AgentStatus` type in `logger.ts` to include optional `post_sha: string`
- Update `writeAgentStatus()` to persist `post_sha`

### 4. Add `visual_validation` to StepSummary

- In `logger.ts`: add `visual_validation?: "passed" | "failed" | "skipped"` to `StepSummary` interface
- Ensure `writeAgentStatus()` persists the new field

### 5. Fix execution.log truncation

- In `adws/src/agent-sdk.ts` or wherever result text is logged: find the truncation point and either increase the limit to 1000 chars or append `… [truncated]` marker
- Search for where `[result]` lines are logged and trace the truncation

### 6. Ralph: stable branch guard + base_branch recording

- At top of `runWorkflow()` in `adw_ralph.ts`, before branch creation:
  - Call `assertStableBranch(workingDir)` — if it throws, log error and return false
  - Record `state.update({ base_branch: existingBranch })` before creating the feature branch
- Remove the `isOnFeatureBranch` reuse logic (lines 70-74) — ralph should NEVER reuse an existing feature branch

### 7. Ralph: commit per sub-issue

- Import `commitChanges` from `git-ops.ts`
- After review passes (and patch retries if any), before `closeSubIssue()`:
  - `const commitMsg = \`feat(#${selectedIssue.number}): ${selectedIssue.title}\``
  - `const [commitOk, commitErr] = await commitChanges(commitMsg, workingDir)`
  - If commit fails, log warning but don't skip the issue (changes may already be committed by subprocess)
  - Capture `post_sha = await getHeadSha(workingDir)` and log it

### 8. Ralph: create PR and checkout back at finalization

- Import `createPullRequest` from `workflow-ops.ts` (or use `gh pr create` directly via exec)
- After push, before the final status log:
  - Read `base_branch` from state
  - `gh pr create --base <base_branch> --head <branch_name> --title "feat(#${parentIssueNumber}): <title>" --body "<summary>"`
  - Log the PR URL
- After PR creation:
  - `checkoutBranch(baseBranch, workingDir)` — return to stable base
  - Log the checkout

### 9. Review.md: replace Playwright with Firecrawl

- Remove the Playwright tooling gate (lines 19-23)
- Replace with frontend/backend detection logic:
  - "Determine if changes are frontend (files in `apps/`, `packages/ui/`, route files, `.svelte`, `.css`) or backend-only"
  - "If frontend: use `firecrawl_scrape` with `formats: ["screenshot"]` against `DEV_TUNNEL_URL` from env"
  - "If backend-only: perform code-only review, set `visual_validation: skipped` in summary"
- Update screenshot instructions to use Firecrawl's `screenshotOptions: { fullPage: true }`
- Remove references to Playwright MCP tools entirely
- Add instruction: "Post each screenshot as a comment on the sub-issue via `gh issue comment`"
- Update Setup section: remove Playwright references, keep prepare_app.md execution

### 10. Ralph: post review screenshots to GitHub issue

- After review step completes, if review result contains screenshots:
  - For each screenshot path, post as a GitHub issue comment on the sub-issue
  - Use `makeIssueComment()` from `github.ts` with markdown image syntax
  - Alternatively: if Firecrawl returns base64, save to file and upload to R2, then post R2 URL as comment

### 11. prd-to-issues: add complexity labels

- In `.claude/commands/prd-to-issues.md`:
  - Add to the issue template a new section: `## Complexity` with values `trivial`, `standard`, or `complex`
  - In the workflow instructions, add: "For each slice, assess implementation complexity as `trivial` (single-file change, cosmetic), `standard` (multi-file, straightforward), or `complex` (architectural, multi-system). Add the corresponding `complexity:<level>` label."
  - Update the `createSubIssue()` call example to include the complexity label: `['sub-issue', 'enhancement', 'complexity:trivial']`

### 12. Ralph: read complexity label and route pipeline

- After selecting an issue, extract complexity from labels:
  - `const complexity = selectedIssue.labels.find(l => l.startsWith("complexity:"))?.split(":")[1] ?? "standard"`
- Use complexity to determine:
  - `skipRefactor = complexity === "trivial"`
  - `model = complexity === "complex" ? "claude-opus-4-20250514" : models.default`
- Wrap the refactor step in `if (!skipRefactor) { ... }`
- Pass `model` to `runTddStep()` and `runReviewStep()` calls
- Log the complexity and decisions: `logger.info(\`Issue #${n} complexity: ${complexity} — model: ${model}, refactor: ${skipRefactor ? "skip" : "run"}\`)`

### 13. Stable branch guard on `/prd`

- In `.claude/commands/prd.md`:
  - Add to Instructions: "Before starting, check the current git branch. If on a branch matching `hein/feature/issue-*`, STOP and tell the user they must switch to a stable branch (e.g., `main`) before creating a PRD. Do not proceed."

### 14. Cleanup: ngrok references

- `.claude/commands/prepare_app.md`: replace "ngrok" references with "cloudflare tunnel". Update the `DEV_TUNNEL_URL` comment to reference `cloudflared tunnel run babylon-dev`
- `.claude/commands/review.md`: remove any ngrok references (should be gone after step 9)
- Verify `.env.example` already references cloudflare (it does — line 11)

### 15. Validate all changes

- Run `bun run check` to validate TypeScript
- Run existing tests: `bun test adws/tests/`
- Manual smoke test: verify ralph can be invoked with `--help`
- Review all changed files for consistency

## Testing Strategy

- **Unit tests**: Run existing `adws/tests/` suite to ensure no regressions
- **Type checking**: `bun run check` across all packages
- **Git helpers**: Test `isStableBranch()` with various branch names: `main` (true), `develop` (true), `hein/feature/issue-42-foo` (false), `hein/stream/q2-work` (true)
- **Integration**: After all changes, trigger ralph on a test PRD from `main` branch and verify:
  - Feature branch created from main
  - Commits appear per sub-issue
  - PR created targeting main
  - Checkout returns to main
- **Screenshot flow**: Manually test review with Firecrawl on a frontend change with tunnel running

## Acceptance Criteria

- [ ] Ralph calls `commitChanges()` after each sub-issue cycle — one commit per issue
- [ ] Ralph creates a PR targeting `base_branch` after all sub-issues complete
- [ ] Ralph checks out back to `base_branch` after PR creation
- [ ] Ralph refuses to run from a `hein/feature/issue-*` branch
- [ ] `/prd` refuses to run from a `hein/feature/issue-*` branch
- [ ] `state.json` includes `base_branch` field
- [ ] Step `status.json` includes `post_sha` field
- [ ] `review.md` uses Firecrawl `firecrawl_scrape` with `formats: ["screenshot"]` for frontend changes
- [ ] `review.md` uses code-only review for backend-only changes
- [ ] Review screenshots posted as comments on GitHub sub-issues
- [ ] `prd-to-issues` assigns `complexity:trivial|standard|complex` labels
- [ ] Ralph reads complexity labels: skips refactor on trivial, uses Opus on complex
- [ ] `StepSummary` includes `visual_validation` field
- [ ] Execution.log results are not truncated mid-sentence
- [ ] All ngrok references replaced with cloudflare tunnel
- [ ] `bun run check` passes
- [ ] `bun test adws/tests/` passes

## Validation Commands

- `bun run check` — TypeScript type checking across all packages
- `bun test adws/tests/` — Run ADW test suite
- `bun run adws/workflows/adw_ralph.ts --help` — Verify ralph still parses args
- `grep -r "ngrok" .claude/commands/ .env.example` — Verify no ngrok references remain
- `grep -r "Playwright" .claude/commands/review.md` — Verify no Playwright references remain
- `grep "base_branch" adws/src/schemas.ts` — Verify schema includes base_branch
- `grep "post_sha" adws/src/step-recorder.ts` — Verify post_sha capture exists
- `grep "visual_validation" adws/src/logger.ts` — Verify StepSummary includes field
- `grep "complexity" .claude/commands/prd-to-issues.md` — Verify complexity label instructions

## Notes

- The `createPullRequest()` function in `workflow-ops.ts` exists but uses the agent SDK to generate PR content. For ralph, a simpler `gh pr create` via `exec()` may be more appropriate since we already have the issue list and summary from the workflow.
- Firecrawl's `firecrawl_scrape` returns screenshots as part of the response. The review skill (running as a Claude Code subprocess) has access to Firecrawl MCP. The challenge is getting the screenshot image data back to ralph for GitHub posting. Two approaches: (a) the review skill posts the comment itself during review, or (b) ralph reads screenshot files from `review_image_dir` and posts them. Option (a) is simpler — add instruction to review.md to post screenshots as comments.
- The Opus model ID for complex issues is `claude-opus-4-20250514`. Verify this is correct at implementation time.
- The `SubIssue` interface in `github.ts` already includes `labels: string[]`, so ralph can read complexity labels without changes to the GitHub module.
