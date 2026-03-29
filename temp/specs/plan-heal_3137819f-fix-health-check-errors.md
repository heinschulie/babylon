# Plan: Fix Health Check Errors

## Metadata

adw_id: `heal_3137819f`
prompt: `heal_3137819f ## Health Check Error Report

### 1. Build: PASSED

### 2. Type Check (bun run check): FAILED — 21 errors

**File: apps/web/src/routes/test/tag-functionality.test.ts:82**
- Type '{ tag: string; } | undefined' is not assignable to type '{ tag: never; } | undefined'.

**File: packages/ui/src/index.ts (lines 3-6)**
- Multiple "already exported a member named 'Root'" errors from re-exporting button, card, dialog components with conflicting export names (Root, Content, Description, Footer, Title).
- This is caused by `export *` from multiple shadcn components that share the same export names (e.g., both button and dialog export `Root`).

### 3. Tests (vitest run adws/tests/): FAILED — 2 test failures

**File: adws/tests/learning-dedup.test.ts**
- TypeError: The "path" argument must be of type string. Received undefined
- `import.meta.dir` is undefined (Bun-specific API used under Vitest/Node)

**File: adws/tests/postcondition.test.ts:73,77**
- ReferenceError: Bun is not defined — tests reference `Bun.spawn` which doesn't exist in Vitest/Node runtime

### Fix Instructions
1. Fix packages/ui/src/index.ts: Replace `export *` with named exports to avoid ambiguous re-exports
2. Fix tag-functionality.test.ts:82: Fix the type mismatch for the tag query args
3. Fix learning-dedup.test.ts: Replace `import.meta.dir` with a Node-compatible equivalent (e.g., `path.dirname(new URL(import.meta.url).pathname)`)
4. Fix postcondition.test.ts: Replace `Bun.spawn` references with a cross-runtime spawn approach or mock properly`
conversation_id: `conv_heal_errors_3137819f`
task_type: fix
complexity: simple

## Task Description

Fix health check errors preventing clean builds and test passes. Four specific issues need resolution:
1. Type conflicts from shadcn component wildcard exports
2. Type mismatch in test query args
3. Bun-specific APIs breaking Vitest runtime compatibility

## Objective

Resolve all TypeScript type errors and test failures to achieve clean health check status with passing builds, type checks, and tests.

## Relevant Files

Use these files to complete the task:

- `packages/ui/src/index.ts` — Replace wildcard exports to fix shadcn component name conflicts
- `packages/ui/src/components/*/index.ts` — Reference for proper export patterns
- `apps/web/src/routes/test/tag-functionality.test.ts:82` — Fix type narrowing for conditional query args
- `adws/tests/learning-dedup.test.ts:6` — Replace Bun-specific `import.meta.dir` with Node-compatible path resolution
- `adws/tests/postcondition.test.ts:73,77` — Replace `Bun.spawn` with proper cross-runtime approach

## Step by Step Tasks

IMPORTANT: Execute every step in order, top to bottom.

### 1. Fix UI Package Export Conflicts

- Replace `export *` wildcard exports in `packages/ui/src/index.ts` with explicit named exports
- Use component-prefixed names (e.g., `Button as Button`, `Dialog as Dialog`) to avoid conflicts
- Test with `bun run check` to verify type errors resolved

### 2. Fix Test Type Error

- Fix type narrowing issue in `apps/web/src/routes/test/tag-functionality.test.ts:82`
- Ensure conditional typing properly handles `{ tag: string } | undefined` vs `{ tag: never } | undefined`
- Add explicit type assertion if needed

### 3. Fix ADW Test Runtime Compatibility

- Replace `import.meta.dir` in `adws/tests/learning-dedup.test.ts:6` with Node-compatible equivalent
- Use `path.dirname(new URL(import.meta.url).pathname)` for cross-runtime compatibility
- Replace `Bun.spawn` usage in `adws/tests/postcondition.test.ts` with proper mocking or cross-runtime spawn

### 4. Validate All Fixes

- Run `bun run check` to verify zero type errors
- Run `bun run test` to verify all tests pass
- Run `bun run build` to verify clean build

## Acceptance Criteria

- `bun run check` passes with zero type errors
- `bun run test` passes with zero test failures
- `bun run build` completes successfully
- No breaking changes to existing component APIs
- ADW tests run properly in Vitest/Node environment

## Validation Commands

Execute these commands to validate the task is complete:

- `bun run check` — Run svelte-check to validate types across all apps
- `bun run test` — Run full test suite including ADW tests
- `bun run build` — Verify clean build with all packages

## Notes

Maintain backward compatibility for UI component exports by providing both original and prefixed export names where appropriate. Use Node.js compatible APIs for ADW tests to ensure cross-runtime compatibility.