# Plan: Move specs/ under temp/

## Metadata

adw_id: `when`
prompt: `Move specs/ under temp/ since all specs are temporary artifacts, update all references`
task_type: chore
complexity: medium

## Task Description

The `specs/` directory currently lives at the project root alongside `temp/`. Since specs (plans, patches) are temporary build artifacts — the same category as `temp/research/` and `temp/thoughts/` — they should be nested under `temp/specs/` for consistency. This requires updating every hardcoded `specs/` reference in command templates, TypeScript source, docs, and the codebase structure documentation.

## Objective

When complete:
- `specs/` no longer exists at the project root
- All plan/patch files are created in `temp/specs/` (with `temp/specs/patch/` for patches)
- All code that discovers, reads, or validates spec file paths uses `temp/specs/` instead of `specs/`
- All command templates (`/plan`, `/bug`, `/chore`, `/feature`, `/patch`, `/review`) reference `temp/specs/`
- Documentation reflects the new location
- Existing spec files are moved to `temp/specs/`

## Problem Statement

`specs/` is a top-level directory holding temporary build artifacts (plans, patches). The project already has `temp/` for temporary outputs (`temp/research/`, `temp/thoughts/`). Having `specs/` separate is inconsistent and clutters the root.

## Solution Approach

1. Update all command templates to write to `temp/specs/` instead of `specs/`
2. Update all TypeScript source (regex patterns, path construction, validation) to use `temp/specs/`
3. Update documentation references
4. Move existing spec files to `temp/specs/`

## Relevant Files

Use these files to complete the task:

**Command templates (write location for new plans):**
- `.claude/commands/plan.md` — Line 17: creates plans in `specs/`; Line 31: codebase structure lists `specs/`
- `.claude/commands/bug.md` — Line 15: creates issue plans in `specs/`
- `.claude/commands/chore.md` — Line 15: creates issue plans in `specs/`
- `.claude/commands/feature.md` — Line 14: creates issue plans in `specs/`
- `.claude/commands/patch.md` — Line 19: creates patch plans in `specs/patch/`
- `.claude/commands/review.md` — Lines 1, 3, 21: references `specs/*.md` for spec discovery

**TypeScript source (path construction & discovery):**
- `adws/src/utils.ts` — `extractPlanPath()` (lines 297-327): regex `specs\/` match + fallback `join(workingDir, "specs")`
- `adws/src/workflow-ops.ts` — `ensurePlanExists()` (lines 233-237): `existsSync("specs")`, `readdirSync("specs")`; `findSpecFile()` (lines 404-405): `f.startsWith("specs/")` filter; (line 423): `join(searchDir, "specs")`; `createAndImplementPatch()` (line 485): validates `specs/patch/` in path
- `adws/workflows/adw_review.ts` — `findSpecFile()` (line 55): `join(workingDir, "specs")`; error msg (line 94): `"place specs in specs/"`
- `adws/workflows/adw_document.ts` — `findSpecFile()` (line 66): `join(projectRoot, 'specs')`

**Documentation:**
- `docs/codebase-structure.md` — Line 46: lists `specs/` as "Feature specs"
- `CLAUDE.md` — Line 70: project structure (currently shows `thoughts/`, should reflect new `temp/` structure)

## Implementation Phases

### Phase 1: Foundation

Update all command templates that define where plan files are created. This is the source-of-truth for file creation paths.

### Phase 2: Core Implementation

Update all TypeScript source that constructs, discovers, or validates `specs/` paths. This includes regex patterns, path joins, existence checks, and git diff filters.

### Phase 3: Integration & Polish

Update documentation, move existing files, verify all references are updated.

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Update command templates — plan creation paths

- `.claude/commands/plan.md`:
  - Line 17: change `specs/` → `temp/specs/` in the filename instruction
  - Line 31: change `specs/` → `temp/specs/` in codebase structure section
- `.claude/commands/bug.md`:
  - Line 15: change `specs/` → `temp/specs/`
- `.claude/commands/chore.md`:
  - Line 15: change `specs/` → `temp/specs/`
- `.claude/commands/feature.md`:
  - Line 14: change `specs/` → `temp/specs/`
- `.claude/commands/patch.md`:
  - Line 19: change `specs/patch/` → `temp/specs/patch/`
- `.claude/commands/review.md`:
  - Line 1: change `specs/*.md` → `temp/specs/*.md`
  - Line 3: change `specs/*.md` → `temp/specs/*.md`
  - Line 21: change `specs/*.md` → `temp/specs/*.md`

### 2. Update extractPlanPath() in utils.ts

- `adws/src/utils.ts` line 309: change regex from `specs\/` to `temp\/specs\/` — `text.match(/(?:temp\/specs\/[^\s`"']+\.md)/)`
- `adws/src/utils.ts` line 316: change `join(workingDir, "specs")` → `join(workingDir, "temp", "specs")`

### 3. Update workflow-ops.ts — ensurePlanExists, findSpecFile, createAndImplementPatch

- `ensurePlanExists()` (lines 233-236):
  - Change `existsSync("specs")` → `existsSync("temp/specs")`
  - Change `readdirSync("specs")` → `readdirSync("temp/specs")`
  - Change `join("specs", f)` → `join("temp", "specs", f)`
- `findSpecFile()` (lines 404-405):
  - Change filter from `f.startsWith("specs/")` → `f.startsWith("temp/specs/")`
- `findSpecFile()` (line 423):
  - Change `join(searchDir, "specs")` → `join(searchDir, "temp", "specs")`
- `createAndImplementPatch()` (line 485):
  - Change `"specs/patch/"` → `"temp/specs/patch/"`

### 4. Update adw_review.ts — local findSpecFile

- Line 55: change `join(workingDir, "specs")` → `join(workingDir, "temp", "specs")`
- Line 94: change error message from `"place specs in specs/"` → `"place specs in temp/specs/"`

### 5. Update adw_document.ts — local findSpecFile

- Line 66: change `join(projectRoot, 'specs')` → `join(projectRoot, 'temp', 'specs')`

### 6. Update documentation

- `docs/codebase-structure.md` line 46: change `specs/` → `temp/specs/` (description: "Feature specs")
- `CLAUDE.md` line 70: change `thoughts/` → `temp/` with description reflecting `temp/specs/`, `temp/research/`, `temp/thoughts/`

### 7. Move existing spec files

- Run: `mkdir -p temp/specs`
- Run: `mv specs/*.md temp/specs/` (move all existing plan files)
- If `specs/patch/` exists, run: `mkdir -p temp/specs/patch && mv specs/patch/*.md temp/specs/patch/`
- Run: `rmdir specs/patch 2>/dev/null; rmdir specs` (remove empty dirs)

### 8. Validate

- Run `grep -r '"specs/' adws/` — expect 0 matches (all should be `"temp/specs/` or `temp", "specs"`)
- Run `grep -r "'specs/" adws/` — expect 0 matches
- Run `grep "specs/" .claude/commands/*.md` — all matches should be `temp/specs/`
- Run `ls temp/specs/` — verify plan files exist
- Run `ls specs/ 2>&1` — should error (directory removed)
- Verify `extractPlanPath()` regex matches `temp/specs/...` paths

## Acceptance Criteria

- Zero references to bare `specs/` (without `temp/` prefix) in command templates
- Zero references to bare `specs/` in TypeScript source paths under `adws/`
- All existing spec files accessible at `temp/specs/`
- `specs/` directory no longer exists at project root
- Documentation updated to reflect `temp/specs/`
- Patch plan validation in `createAndImplementPatch` checks for `temp/specs/patch/`

## Validation Commands

Execute these commands to validate the task is complete:

- `grep -rn '"specs/' adws/src/ adws/workflows/` — expect 0 matches
- `grep -rn "'specs/" adws/src/ adws/workflows/` — expect 0 matches
- `grep -n 'specs/' .claude/commands/plan.md .claude/commands/bug.md .claude/commands/chore.md .claude/commands/feature.md .claude/commands/patch.md .claude/commands/review.md` — all should show `temp/specs/`
- `test -d temp/specs && echo "OK" || echo "MISSING"` — expect OK
- `test ! -d specs && echo "OK" || echo "STILL EXISTS"` — expect OK
- `ls temp/specs/*.md` — should list existing plan files

## Notes

- The `temp/` directory is already version-controlled (not in `.gitignore`). No `.gitignore` changes needed.
- `CLAUDE.md` currently lists `thoughts/` in the project structure, which doesn't exist at root — it's at `temp/thoughts/`. This should be corrected to show `temp/` as a whole.
- The `agents/` directory (gitignored) also stores plan copies under `agents/{adwId}/sdlc_planner/plan.md` via `findPlanForIssue()` — this is a separate path and unaffected by this change.
- Some spec paths will be stored as absolute paths in ADW state (`plan_file` field). Existing state files may have stale `specs/...` paths — these are ephemeral and will self-correct on next run.

## Unresolved Questions

- Should `temp/` be added to `.gitignore` since its contents are temporary? Or keep tracking for visibility?
- The `extractPlanPath` regex also matches absolute paths — should the absolute path regex also be updated to expect `temp/specs/`?
