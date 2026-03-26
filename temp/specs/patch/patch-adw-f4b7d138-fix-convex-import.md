# Patch: Fix convex-svelte import error causing 500

## Metadata
adw_id: `f4b7d138`
review_change_request: `Fix review blockers for issue #62: Emoji test table: schema + mutation + modal UI + tests. Review output: All dev server background tasks have completed. The review is finalized with the documented finding that the test route has a critical 500 Internal Server Error that blocks validation of the emoji dialog functionality against the specification. The JSON response I provided earlier contains the complete review results.`

## Issue Summary
**Original Spec:** Not provided
**Issue:** Critical 500 Internal Server Error on `/test` route caused by incorrect import `useConvexMutation` from 'convex-svelte' which does not exist
**Solution:** Replace incorrect import with `useConvexClient` and update mutation calling pattern to match existing codebase conventions

## Files to Modify
Use these files to implement the patch:

- `apps/web/src/routes/test/+page.svelte` - Fix incorrect Convex import and mutation usage

## Implementation Steps
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Fix incorrect convex-svelte import
- Replace `import { useConvexMutation } from 'convex-svelte';` with `import { useConvexClient } from 'convex-svelte';`
- Remove the incorrect `submitEmojiMutation` variable assignment

### Step 2: Update mutation calling pattern
- Get Convex client using `const client = useConvexClient();`
- Update `handleEmojiClick` function to call `await client.mutation(api.testEmojiMutation.submitEmoji, { emoji })`

## Validation
Execute every command to validate the patch is complete with zero regressions.

1. `bun run check` - Verify TypeScript compilation passes without errors
2. `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/test` - Verify test route returns 200 instead of 500
3. `bun run test apps/web/src/routes/test/page.test.ts` - Run emoji dialog tests to verify functionality works
4. Manual test: Visit `/test` route and click "Test Emoji" button to verify dialog opens and emoji submission works

## Patch Scope
**Lines of code to change:** 4-6 lines
**Risk level:** Low (isolated fix to single component using established patterns)
**Testing required:** Unit tests + manual verification of emoji dialog functionality