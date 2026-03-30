# Plan: Fix sub-issue parenting so Ralph loop processes fix issues

## Metadata

adw_id: `n/a`
prompt: `Fix Ralph loop so review-generated fix sub-issues are parented to the PRD, not the failing child issue, ensuring the loop processes them`
conversation_id: `current`
task_type: fix
complexity: simple

## Task Description

When the Ralph loop's review step FAILs a child issue (e.g. #104), it creates fix sub-issues via `createSubIssue(context.issue.number, ...)`. This parents fixes to the **failing child** (#104), not the **parent PRD** (#91). The loop only fetches direct sub-issues of #91 via `fetchSubIssues(parentIssueNumber)`, so fix sub-issues are invisible and never processed.

## Objective

Fix sub-issues created during review FAIL are parented to the PRD issue so the loop picks them up in subsequent iterations.

## Relevant Files

- `adws/src/pipeline.ts` (line 55, 60-93) — `PipelineContextSchema` and `BASE_CONTEXT_KEYS`. Add `parentIssueNumber` field.
- `adws/src/loop-runner.ts` (line 239-248) — `baseContext` construction. Populate `parentIssueNumber`.
- `adws/src/ralph-executor.ts` (line 152) — `createSubIssue` call. Use `context.parentIssueNumber` instead of `context.issue.number`.
- `adws/tests/loop-runner.test.ts` — Existing loop-runner tests. Verify `parentIssueNumber` flows through context.
- `adws/tests/pipeline.test.ts` — Pipeline validation tests. Verify schema accepts new field.

## Step by Step Tasks

### 1. Add `parentIssueNumber` to PipelineContext schema

- In `adws/src/pipeline.ts`, add `parentIssueNumber: z.number().optional()` to `PipelineContextSchema` (after `baseSha` field, line 69)
- Add `"parentIssueNumber"` to the `BASE_CONTEXT_KEYS` array (line 55)

### 2. Populate `parentIssueNumber` in loop-runner

- In `adws/src/loop-runner.ts`, add `parentIssueNumber` to the `baseContext` object (line 239-248):
  ```ts
  const baseContext: PipelineContext = {
    issue: { ... },
    complexity,
    baseSha,
    parentIssueNumber,  // already in scope from config destructuring (line 63)
  };
  ```

### 3. Use `parentIssueNumber` in ralph-executor

- In `adws/src/ralph-executor.ts`, change line 152 from:
  ```ts
  const sub = await createSubIssue(context.issue.number, subTitle, subBody, ["auto-fix"]);
  ```
  To:
  ```ts
  const sub = await createSubIssue(
    context.parentIssueNumber ?? context.issue.number,
    subTitle, subBody, ["auto-fix"]
  );
  ```
- Fallback to `context.issue.number` preserves backward compatibility if `parentIssueNumber` is absent.

### 4. Validate

- Run `cd adws && npx vitest run` to confirm all existing tests pass
- Run `bun run check` from project root to confirm types

## Acceptance Criteria

- `PipelineContextSchema` includes optional `parentIssueNumber` field
- `BASE_CONTEXT_KEYS` includes `"parentIssueNumber"`
- `baseContext` in loop-runner populates `parentIssueNumber` from config
- `ralph-executor` creates fix sub-issues under `parentIssueNumber` (falling back to `context.issue.number`)
- All existing tests pass

## Validation Commands

- `cd adws && npx vitest run` — Run all ADW tests
- `bun run check` — Type-check across all packages

## Notes

- The fix sub-issue body already references the original failing issue via `**Original issue**: #${context.issue.number}` — this stays correct and preserves traceability from fix back to the issue that failed review.
