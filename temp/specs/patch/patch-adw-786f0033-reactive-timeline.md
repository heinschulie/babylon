# Patch: Make sentiment timeline reactive with live updates

## Metadata
adw_id: `786f0033`
review_change_request: `Fix review blockers for issue #67: feat(#64): sentiment timeline UI + frontend tests. Review output: implementation is static HTML without the specified reactive functionality - missing useQuery subscription, $derived computations, and live timeline updates. Backend listRecentEmojis query exists but frontend doesn't use it.`

## Issue Summary
**Original Spec:** None provided
**Issue:** Sentiment timeline section has correct visual styling but is static HTML. Missing reactive functionality (useQuery subscription, $derived computations, live timeline updates) despite backend query existing.
**Solution:** Replace static HTML with reactive Svelte 5 implementation using useQuery subscription and $derived computations to show live emoji timeline data.

## Files to Modify
Use these files to implement the patch:

- `apps/web/src/routes/test/+page.svelte` - Add reactive timeline implementation

## Implementation Steps
IMPORTANT: Execute every step in order, top to bottom.

### Step 1: Add useQuery import and subscription
- Import `useQuery` from convex-svelte
- Add subscription to `api.testEmojiMutation.listRecentEmojis`
- Replace static HTML structure

### Step 2: Add $derived computations for mood summaries
- Create $derived computation to group emojis by mood
- Calculate mood counts (chill, angry, happy)
- Generate mood summary text dynamically

### Step 3: Implement conditional rendering states
- Show loading state while query is loading
- Show empty state when no submissions exist
- Show timeline with mood badges and counts when data available

### Step 4: Update mood badge rendering
- Render mood badges dynamically based on actual data
- Maintain existing color scheme (blue-100 for chill, red-100 for angry, orange-100 for happy)

## Validation
Execute every command to validate the patch is complete with zero regressions.

1. `bun run test apps/web/src/routes/test/page.test.ts` - All existing tests pass
2. `bun run dev` - Test page loads without errors
3. Submit emoji via UI - Timeline updates live with new emoji
4. Verify mood badges show correct colors and counts
5. Verify loading and empty states display correctly

## Patch Scope
**Lines of code to change:** ~15-20
**Risk level:** low
**Testing required:** Existing frontend tests verify visual elements, manual testing for reactive behavior