# Health Check Error Fixes

**ADW ID:** heal_3137819f
**Date:** 2026-03-29
**Specification:** temp/specs/plan-heal_3137819f-fix-health-check-errors.md

## Overview

Fixed critical health check errors preventing clean builds and test passes, including TypeScript type conflicts from shadcn component exports, test type mismatches, and Bun-specific API compatibility issues in Vitest runtime.

## What Was Built

- Explicit component export system in UI package to resolve naming conflicts
- Type assertion fixes for conditional query arguments in tests
- Cross-runtime compatibility fixes for ADW tests (Node.js/Vitest support)
- Proper mocking setup for Bun-specific APIs in test environment

## Technical Implementation

### Files Modified

- `packages/ui/src/index.ts`: Replaced wildcard exports with explicit named exports to resolve shadcn component naming conflicts (Root, Content, etc.)
- `apps/web/src/routes/test/tag-functionality.test.ts`: Added type assertions for conditional query args to fix `{ tag: string } | undefined` vs `{ tag: never } | undefined` mismatch
- `adws/tests/learning-dedup.test.ts`: Replaced Bun-specific `import.meta.dir` with Node-compatible `dirname(new URL(import.meta.url).pathname)`
- `adws/tests/postcondition.test.ts`: Added proper mocking setup for `Bun.spawn` to work in Vitest/Node runtime

### Key Changes

- **Export conflicts resolved**: Changed from `export *` to explicit exports (e.g., `Button`, `Dialog`, `Card`) preventing ambiguous re-exports
- **Type safety improved**: Added explicit type annotations and assertions where TypeScript couldn't infer correct types
- **Cross-runtime compatibility**: Replaced Bun-specific APIs with Node.js equivalents for test compatibility
- **Test mocking enhanced**: Added proper setup/teardown for globalThis.Bun object in test environment

## How to Use

The fixes are transparent to end users. Components continue to work as before with the same API:

1. **UI Components**: Import components normally from `@packages/ui`
   ```typescript
   import { Button, Dialog, Card } from '@packages/ui';
   ```

2. **Testing**: ADW tests now run properly in both Bun and Node/Vitest environments
   ```bash
   bun run test  # Works in Bun
   vitest        # Also works in Node/Vitest
   ```

## Configuration

No configuration changes required. All fixes maintain backward compatibility.

## Testing

Validate fixes with these commands:
- `bun run check` — Verify zero TypeScript errors
- `bun run test` — Ensure all tests pass including ADW tests
- `bun run build` — Confirm clean build process

## Notes

- Maintains full backward compatibility for UI component APIs
- Explicit exports prevent future naming conflicts from new shadcn components
- ADW tests now properly support cross-runtime execution (Bun/Node)
- Type assertions resolve edge cases where TypeScript inference was insufficient