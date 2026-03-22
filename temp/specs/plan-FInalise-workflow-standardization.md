# Plan: Finalize Workflow Standardization

## Metadata
adw_id: `FInalise`
prompt: `standardisation of workflows`
task_type: refactor
complexity: medium

## Task Description
Standardize ADW workflow files to use consistent utility functions and patterns instead of inline implementations. This involves updating remaining workflows to use `createStepBanner()`, `createCommentStep()`, `createFinalStatusComment()`, `getWorkflowModels()`, and `standardizeGetAdw()` utilities from `utils.ts`.

## Objective
All ADW workflow files will use standardized utility functions for step banners, GitHub commenting, model selection, and ADW record retrieval, ensuring consistent behavior and maintainability across the codebase.

## Problem Statement
The ADW workflow system has grown organically with some workflows adopting standardized utilities while others still use inline implementations. This inconsistency creates maintenance burden and potential bugs when patterns need to be updated across all workflows.

## Solution Approach
Systematically update all workflow files to use the standardized utilities from `utils.ts`, removing inline implementations and ensuring consistent patterns across all workflows.

## Relevant Files
Use these files to complete the task:

- `adws/src/utils.ts` - Contains all standardized utility functions
- `adws/workflows/adw_sdlc.ts` - Needs all 3 fixes (banners, models, ADW retrieval)
- `adws/workflows/adw_review.ts` - Needs banner fix, has undefined `model` variable bug
- `adws/workflows/adw_plan.ts` - Needs GitHub commenting standardization
- `adws/workflows/adw_test.ts` - Needs GitHub commenting and model selection standardization
- `adws/workflows/adw_patch.ts` - Needs all fixes (ADW, commenting, models)
- `adws/workflows/adw_document.ts` - Needs model selection standardization
- `adws/workflows/adw_plan_build_document.ts` - Needs ADW retrieval and model selection
- `adws/workflows/adw_plan_build_test_review.ts` - Needs ADW retrieval and model selection
- `adws/workflows/adw_research-codebase_produce-readme_update-prime.ts` - Needs banner standardization
- `adws/workflows/adw_plan_build_test.ts` - Needs banner standardization
- `adws/workflows/adw_plan_build.ts` - Needs banner standardization

### New Files
None required - all changes are to existing files.

## Implementation Phases
### Phase 1: Fix Critical Issues
Update files with the most critical issues first (broken variables, missing imports).

### Phase 2: Standardize Core Workflows
Update the main workflow files (`adw_sdlc.ts`, `adw_review.ts`) that are most commonly used.

### Phase 3: Complete Remaining Files
Systematically update all remaining workflow files to use standardized patterns.

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Fix Critical Bug in adw_review.ts
- Fix undefined `model` variable on line 116 to use `models.default`
- Add missing final status comments using `createFinalStatusComment()`

### 2. Update adw_sdlc.ts Completely
- Replace inline `getAdw()` function with `standardizeGetAdw()` import and usage
- Replace all inline step banners (lines 105, 183, 211, 240, 277) with `createStepBanner()` calls
- Replace inline model selection logic with `getWorkflowModels()` usage
- Add GitHub commenting using `createCommentStep()` and `createFinalStatusComment()`
- Replace inline plan path extraction logic with `extractPlanPath()` utility

### 3. Standardize GitHub Commenting in adw_plan.ts
- Replace direct `makeIssueComment()` calls with `createCommentStep()` and `createFinalStatusComment()` patterns
- Ensure consistent error handling for comment failures

### 4. Update Model Selection Patterns
- Replace inline model selection logic in `adw_test.ts`, `adw_patch.ts`, `adw_document.ts` with `getWorkflowModels()`
- Update ADW retrieval patterns in files still using local `getAdw()` functions

### 5. Standardize Step Banners
- Replace all remaining inline `═".repeat(60)` patterns with `createStepBanner()` calls
- Update files: `adw_research-codebase_produce-readme_update-prime.ts`, `adw_plan_build_test.ts`, `adw_plan_build.ts`

### 6. Complete GitHub Commenting Standardization
- Update `adw_test.ts` and `adw_patch.ts` to use standardized commenting utilities
- Ensure all workflows have consistent final status reporting

### 7. Final Validation and Cleanup
- Run TypeScript checks to ensure all imports are correct
- Verify all workflows compile without errors
- Check that no inline patterns remain

## Testing Strategy
- Compile all workflow files to ensure TypeScript correctness
- Run a sample workflow to verify standardized utilities work correctly
- Validate that all standardized patterns are consistently applied

## Acceptance Criteria
- All workflow files use `createStepBanner()` for step progress banners
- All workflow files use `getWorkflowModels()` for model selection
- All workflow files use `standardizeGetAdw()` for ADW record retrieval
- All workflow files with GitHub integration use `createCommentStep()` and `createFinalStatusComment()`
- No inline `═".repeat(60)` patterns remain
- No inline `getAdw()` functions remain
- No direct `makeIssueComment()` usage without wrapper utilities
- All files compile without TypeScript errors
- Consistent error handling patterns across all workflows

## Validation Commands
Execute these commands to validate the task is complete:

- `bun run check` - Run svelte-check to validate types across all apps
- `find adws/workflows -name "*.ts" -exec grep -l '═"\.repeat(' {} \;` - Should return empty (no inline banners)
- `find adws/workflows -name "*.ts" -exec grep -l 'makeIssueComment' {} \;` - Should only return files using wrapper utilities
- `find adws/workflows -name "*.ts" -exec grep -l 'async function getAdw(' {} \;` - Should return empty (no inline ADW functions)
- `find adws/workflows -name "*.ts" -exec grep -l 'ADW_MODEL.*??' {} \;` - Should return empty (no inline model selection)

## Notes
This refactoring maintains backward compatibility while improving code consistency and maintainability. The standardized utilities provide consistent error handling and make future changes easier to implement across all workflows.