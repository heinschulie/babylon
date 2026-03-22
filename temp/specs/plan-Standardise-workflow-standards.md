# Plan: Standardize ADW Workflow Implementations

## Metadata
adw_id: `Standardise`
prompt: `workflows`
task_type: refactor
complexity: complex

## Task Description
Ensure that all current ADW workflows in the `adws/workflows/` folder strictly follow the patterns described in the create_adw and port_adw commands. Standardize implementations to follow consistent patterns, extract common functionality into `adws/src/utils.ts`, and eliminate code duplication while maintaining readability and maintainability.

## Objective
All ADW workflows will follow identical patterns for CLI parsing, logging, error handling, GitHub integration, usage tracking, and model selection. Common functionality will be extracted to utils.ts to reduce duplication and improve maintainability.

## Problem Statement
The current ADW workflows have evolved organically and exhibit inconsistent patterns across multiple areas:

1. **Model selection**: Some workflows implement per-phase model selection while others use single model
2. **Error handling**: Inconsistent error handling and early return patterns
3. **GitHub integration**: Varying levels of GitHub issue commenting implementation
4. **Code duplication**: Common patterns like plan path extraction, duration formatting, and step banners are duplicated
5. **State management**: Inconsistent use of ADWState across workflows
6. **Usage tracking**: While most workflows track usage, implementation varies significantly
7. **Environment variable handling**: Inconsistent patterns for reading configuration

## Solution Approach
Standardize all workflows by:

1. **Extract common utilities** to `utils.ts` for shared functionality
2. **Establish standard patterns** for all workflows following create-adw/port-adw specifications
3. **Implement consistent model selection** with per-phase model environment variables
4. **Standardize GitHub integration** with consistent issue commenting patterns
5. **Unify error handling** with consistent patterns and early returns
6. **Consolidate usage tracking** with identical implementation across all workflows
7. **Standardize CLI and environment** variable handling patterns

## Relevant Files
Use these files to complete the task:

### Existing Workflow Files
- `adws/workflows/adw_plan_build_review.ts` — Most comprehensive workflow, good example of GitHub integration
- `adws/workflows/adw_plan.ts` — Complex workflow with state management and GitHub integration
- `adws/workflows/adw_build.ts` — Simple single-step workflow
- `adws/workflows/adw_test.ts` — Test workflow with retry logic
- `adws/workflows/adw_review.ts` — Review workflow with resolution retry loop
- `adws/workflows/adw_document.ts` — Documentation generation workflow
- `adws/workflows/adw_patch.ts` — Patch workflow
- `adws/workflows/adw_plan_build.ts` — Two-step plan-build workflow
- `adws/workflows/adw_plan_build_test.ts` — Three-step workflow
- `adws/workflows/adw_plan_build_document.ts` — Three-step workflow with documentation
- `adws/workflows/adw_plan_build_test_review.ts` — Four-step comprehensive workflow
- `adws/workflows/adw_research-codebase_produce-readme_update-prime.ts` — Research workflow with parallel agents
- `adws/workflows/adw_sdlc.ts` — Software development lifecycle workflow

### Supporting Infrastructure
- `adws/src/agent-sdk.ts` — Contains step functions and SDK patterns
- `adws/src/logger.ts` — Logging infrastructure and tagged loggers
- `adws/src/utils.ts` — Shared utilities (needs expansion)
- `adws/src/git-ops.ts` — Git operations
- `adws/src/github.ts` — GitHub integration functions
- `adws/src/workflow-ops.ts` — Workflow-specific operations
- `adws/src/state.ts` — ADW state management

### Reference Standards
- `.claude/commands/create-adw.md` — Standard patterns for new workflows
- `.claude/commands/port-adw.md` — Patterns for porting workflows

## Implementation Phases

### Phase 1: Foundation
Extract common functionality to utils.ts and establish standard patterns

### Phase 2: Core Implementation
Apply standardization to all workflow files systematically

### Phase 3: Integration & Polish
Validate all workflows follow standards and test consistency

## Step by Step Tasks
IMPORTANT: Execute every step in order, top to bottom.

### 1. Extract Common Utilities to utils.ts
- Add `fmtDuration(ms: number): string` function (from adw_plan_build_review.ts)
- Add `createStepBanner(stepName: string, stepNumber?: number, totalSteps?: number): string` function
- Add `extractPlanPath(resultText: string, workingDir: string, adwId: string): string | null` function (standardize logic from multiple workflows)
- Add `createDefaultStepUsage(): StepUsage` function for consistent empty usage objects
- Add `createCommentStep(issueNumber: string | undefined): (msg: string) => Promise<void>` function factory for GitHub commenting
- Add `createFinalStatusComment(issueNumber: string | undefined): (opts: FinalStatusOpts) => Promise<void>` function factory
- Add `standardizeGetAdw(adwId: string, workflowName: string): Promise<AdwRecord | null>` function with consistent env var patterns

### 2. Define Standard TypeScript Interfaces
- Add `AdwRecord` interface for consistent ADW data structure
- Add `FinalStatusOpts` interface for final GitHub status comments
- Add `WorkflowOptions` interface for standard workflow configuration
- Add `StandardStepResult` interface extending QueryResult with consistent fields

### 3. Standardize Model Selection Pattern
- Ensure all workflows support per-phase model selection with consistent environment variable names:
  - `ADW_RESEARCH_MODEL` (default: `claude-haiku-4-5-20251001`)
  - `ADW_MODEL` (default: `claude-sonnet-4-20250514`)
  - `ADW_REVIEW_MODEL` (default: `claude-sonnet-4-20250514`)
- Add helper function `getWorkflowModels(): WorkflowModels` to utils.ts

### 4. Update adw_plan_build_review.ts to Standard Pattern
- Replace duplicated `fmtDuration` with utils version
- Replace inline step banner creation with `createStepBanner` utility
- Replace inline plan path extraction with `extractPlanPath` utility
- Standardize GitHub commenting to use comment helper functions
- Apply consistent error handling patterns
- Ensure per-phase model selection follows standard pattern

### 5. Update adw_plan.ts to Standard Pattern
- Standardize model selection to use helper function
- Replace inline step banner creation with utility
- Apply consistent error handling patterns
- Ensure GitHub commenting uses standard helper functions
- Standardize usage tracking implementation

### 6. Update adw_build.ts to Standard Pattern
- Add per-phase model selection support
- Replace inline patterns with utility functions
- Add optional GitHub issue commenting support (when --issue provided)
- Standardize error handling and usage tracking
- Apply consistent CLI argument patterns

### 7. Update adw_test.ts to Standard Pattern
- Replace inline patterns with utility functions
- Standardize GitHub commenting patterns
- Apply consistent model selection patterns
- Ensure error handling follows standard approach
- Standardize retry logic patterns

### 8. Update adw_review.ts to Standard Pattern
- Replace inline plan path extraction with utility
- Standardize model selection patterns
- Apply consistent GitHub commenting
- Standardize error handling and usage tracking
- Apply consistent CLI argument patterns

### 9. Update adw_document.ts to Standard Pattern
- Add comprehensive GitHub issue commenting support
- Standardize model selection patterns
- Apply consistent error handling
- Ensure usage tracking follows standard implementation
- Apply consistent CLI argument patterns

### 10. Update adw_patch.ts to Standard Pattern
- Standardize all patterns to match other workflows
- Apply consistent model selection, GitHub commenting, error handling
- Ensure usage tracking and CLI patterns are consistent
- Replace inline utilities with shared functions

### 11. Update Multi-Step Workflows
- Update `adw_plan_build.ts` to use standard utilities and patterns
- Update `adw_plan_build_test.ts` to use standard patterns
- Update `adw_plan_build_document.ts` to use standard patterns
- Update `adw_plan_build_test_review.ts` to use standard patterns
- Ensure all multi-step workflows use consistent step progression and error handling

### 12. Update Complex Workflows
- Update `adw_research-codebase_produce-readme_update-prime.ts` for parallel agent patterns
- Update `adw_sdlc.ts` for comprehensive lifecycle workflow
- Ensure complex workflows maintain their unique logic while using standard utilities
- Apply consistent error handling and GitHub integration

### 13. Validate Standardization
- Review all workflow files to ensure consistent imports from utils.ts
- Verify all workflows use the same CLI argument patterns (--adw-id, --issue)
- Confirm all workflows use standardized error handling patterns
- Ensure all workflows implement the same GitHub commenting patterns
- Validate all workflows use consistent model selection patterns
- Check that all workflows have identical usage tracking implementations

## Testing Strategy
- Test each updated workflow independently with `--adw-id test-standardize`
- Verify environment variable handling works consistently across all workflows
- Test GitHub integration patterns with actual issue numbers where available
- Validate error conditions and early returns work consistently
- Test parallel workflow execution for complex workflows
- Ensure model selection environment variables work as expected

## Acceptance Criteria
- All workflows import common utilities from `utils.ts` instead of duplicating code
- All workflows follow identical CLI argument patterns (--adw-id required, --issue optional)
- All workflows implement identical per-phase model selection with consistent env var names
- All workflows use the same error handling patterns and early return logic
- All workflows implement identical GitHub issue commenting patterns (when --issue provided)
- All workflows use identical usage tracking and reporting implementation
- All workflows use the same step banner formatting via shared utility
- Plan path extraction logic is unified across all workflows that need it
- Duration formatting is consistent via shared utility function
- All `getAdw()` functions follow the same pattern with consistent environment variable handling
- Zero code duplication for common workflow patterns
- All workflows maintain their unique business logic while using shared infrastructure

## Validation Commands
Execute these commands to validate the task is complete:

- `bun run check` - Run svelte-check to validate types across all apps
- `find adws/workflows -name "*.ts" -exec bun run {} --adw-id test-validation \; 2>&1 | grep -E "(error|Error)" || echo "No errors found"` - Test all workflows parse correctly
- `grep -r "fmtDuration" adws/workflows/` - Should only find utils import, not inline implementations
- `grep -r "═" adws/workflows/` - Should only find calls to createStepBanner utility
- `grep -r "extractPlanPath" adws/workflows/` - Should find utility usage, not inline implementations
- `grep -r "makeIssueComment" adws/workflows/` - Should find consistent GitHub commenting patterns
- `grep -r "ADW_MODEL" adws/workflows/` - Should find consistent model selection patterns in all files

## Notes
- This refactoring focuses on infrastructure standardization while preserving the unique business logic of each workflow
- The standardization will significantly improve maintainability and reduce the likelihood of bugs from duplicated code
- All workflows will maintain backward compatibility with existing environment variables and CLI arguments
- New utility functions will be designed to be flexible enough to handle the variations across different workflow types
- Complex workflows with unique patterns (like parallel agents) will use standard utilities while preserving their specialized logic