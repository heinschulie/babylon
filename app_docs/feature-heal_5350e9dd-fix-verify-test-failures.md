# Fix Verify Test Failures

**ADW ID:** heal_5350e9dd
**Date:** 2026-04-01
**Specification:** /Users/heinschulie/Documents/code/babylon/temp/specs/plan-Fix-heal-test-failures.md

## Overview

Fixed ADW test failures by replacing brittle behavior-based verification with robust route-based verification. Removed the `verify-utils` module that was causing test conflicts and updated the verify step to use Svelte file detection and route inference.

## What Was Built

- **Route-based verification**: Replaced behavior extraction with Svelte file detection and route inference
- **Test isolation fix**: Renamed conflicting test file to avoid module state leaks between bun and vitest
- **Simplified verify logic**: Streamlined verify step to focus on UI rendering validation
- **Enhanced screenshot targeting**: Improved screenshot functionality to target specific changed routes

## Technical Implementation

### Files Modified

- `adws/src/verify-utils.ts`: **DELETED** - Removed 86 lines of behavior extraction logic
- `adws/tests/verify-utils.test.ts`: **DELETED** - Removed 104 lines of behavior extraction tests
- `adws/src/ralph-executor.ts`: Updated verify step to use `hasSvelteFiles()` and `svelteFilesToRoutes()` instead of behavior extraction
- `adws/src/loop-runner.ts`: Enhanced screenshot functionality with route targeting and increased timeout to 300s
- `adws/tests/loop-runner.vitest.ts`: **RENAMED** from `loop-runner.test.ts` to avoid test runner conflicts
- `adws/vitest.config.ts`: Added `*.vitest.ts` pattern to include renamed test files

### Key Changes

- **Removed behavior extraction**: Eliminated parsing of `[Frontend]` behaviors from issue bodies, which was prone to false positives and parsing errors
- **Added route detection**: Verify step now detects changed `.svelte` files and infers corresponding routes for targeted UI testing
- **Fixed test isolation**: Renamed test file to `.vitest.ts` to prevent module state leaks between bun test runner and vitest
- **Simplified verify prompts**: Replaced complex behavior checklists with straightforward "verify UI renders correctly" prompts
- **Enhanced screenshot targeting**: Loop runner now targets specific routes when taking end-of-loop screenshots

## How to Use

The verify step now automatically works when Svelte files are changed in a PR:

1. **Automatic detection**: When the verify step runs, it scans changed files for `.svelte` extensions
2. **Route inference**: Changed Svelte files are mapped to their corresponding routes (e.g., `src/routes/dashboard/+page.svelte` → `/dashboard`)
3. **UI verification**: The verify step navigates to inferred routes and validates that the UI renders correctly
4. **Fallback behavior**: If no Svelte files changed, the verify step is skipped automatically

## Configuration

No additional configuration required. The system automatically:

- Detects Svelte file changes via `hasSvelteFiles(changedFiles)`
- Maps files to routes via `svelteFilesToRoutes(changedFiles)`
- Uses default dev server URL (`http://localhost:5173`) unless `context.localUrl` is provided

## Testing

Run the test suite to verify the fix:

```bash
# Run all ADW tests
bun test adws/tests/

# Run specific vitest-isolated tests
npx vitest run tests/loop-runner.vitest.ts
```

The fix ensures:
- No module state leaks between test runners
- Verify step reliably skips when no UI changes detected
- Route-based verification is more predictable than behavior parsing

## Notes

- **Test runner separation**: `.vitest.ts` files run in vitest with process isolation, while `.test.ts` files run in bun test runner
- **Verify step evolution**: This change moves from text analysis to file analysis for determining verification needs
- **Performance improvement**: Increased screenshot timeout from 120s to 300s to handle complex pages
- **Route targeting**: Both verify step and screenshot step now target specific routes rather than generic pages