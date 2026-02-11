# Verifier Feedback Banner — Implementation Plan

## Overview

Replace the stats card and "Your Phrase Groups" heading on the library page with a prominent feedback banner that appears when a verifier has reviewed the learner's work and the learner hasn't seen it yet. Clicking navigates to the session and scrolls to the feedback. Also remove stats card and phrase-groups heading entirely.

## Current State

- Library page (`+page.svelte`) has a stats card (phrases + categories) and an `<h2>Your Phrase Groups</h2>` heading above phrase groups
- `humanReviewRequests` tracks review lifecycle but has **no "seen" tracking** — no `feedbackSeenAt`, no `acknowledgedAt`, nothing
- Reviews complete when `status` becomes `'completed'` / `'dispute_resolved'`
- Session detail page at `/practice/session/[id]` renders feedback per-attempt but has no anchor/scroll target for the feedback section
- Verifier feedback section is in `practice/session/[id]/+page.svelte:64-85`

## Desired End State

Library page layout:

```
[ page header + Add Phrase button ]

[ FEEDBACK BANNER — teal accent, full width ]     ← only if unseen feedback exists
  "Your verifier has reviewed your practice"
  → click → /practice/session/{id}#feedback

[ phrase groups... ]                               ← no heading above these
```

- Banner only visible when ≥1 completed review has `feedbackSeenAt === undefined`
- Clicking banner navigates to the practice session containing the most recent unseen review, with `#feedback` hash
- Session detail page scrolls to the first feedback section via that hash
- Opening the session page auto-marks all unseen reviews in that session as seen

## What We're NOT Doing

- Showing a count of unseen reviews (just "you have feedback")
- Explicit dismiss/acknowledge button (auto-mark on visit)
- Notification badge in the header
- Changing any verifier-side behavior

## Phase 1: Schema + Backend

### Overview

Add `feedbackSeenAt` field to `humanReviewRequests`, create a query for unseen feedback, and a mutation to mark feedback seen.

### Changes Required:

#### 1.1 Schema — add `feedbackSeenAt`

**File**: `convex/schema.ts`

Add optional field to `humanReviewRequests` table:

```ts
feedbackSeenAt: v.optional(v.number()),
```

No new index needed — we'll query by `learnerUserId` + filter on `feedbackSeenAt === undefined` and `status` in (`completed`, `dispute_resolved`).

#### 1.2 New query: `getUnseenFeedback`

**File**: `convex/humanReviews.ts`

Add a query that returns the most recent unseen completed review for the authenticated learner, including the `practiceSessionId` so the frontend can link to it.

```ts
export const getUnseenFeedback = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    // Get all completed/dispute_resolved requests for this learner that haven't been seen
    const requests = await ctx.db
      .query('humanReviewRequests')
      .withIndex('by_learner_created', (q) => q.eq('learnerUserId', userId))
      .order('desc')
      .collect();

    const unseen = requests.filter(
      (r) =>
        (r.status === 'completed' || r.status === 'dispute_resolved') &&
        r.feedbackSeenAt === undefined
    );

    if (unseen.length === 0) return null;

    const latest = unseen[0];
    const attempt = await ctx.db.get(latest.attemptId);

    return {
      practiceSessionId: attempt?.practiceSessionId ?? null,
      attemptId: latest.attemptId,
      count: unseen.length,
    };
  },
});
```

#### 1.3 New mutation: `markFeedbackSeen`

**File**: `convex/humanReviews.ts`

Mark all unseen reviews for a given practice session as seen.

```ts
export const markFeedbackSeen = mutation({
  args: {
    practiceSessionId: v.id('practiceSessions'),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const now = Date.now();

    // Get all attempts in this session
    const attempts = await ctx.db
      .query('attempts')
      .withIndex('by_practice_session', (q) =>
        q.eq('practiceSessionId', args.practiceSessionId)
      )
      .collect();

    const attemptIds = new Set(attempts.map((a) => a._id));

    // Find unseen review requests for these attempts
    const requests = await ctx.db
      .query('humanReviewRequests')
      .withIndex('by_learner_created', (q) => q.eq('learnerUserId', userId))
      .collect();

    for (const req of requests) {
      if (
        attemptIds.has(req.attemptId) &&
        req.feedbackSeenAt === undefined &&
        (req.status === 'completed' || req.status === 'dispute_resolved')
      ) {
        await ctx.db.patch(req._id, { feedbackSeenAt: now });
      }
    }
  },
});
```

### Success Criteria:

#### Automated Verification:

- [x] `npx convex dev` syncs schema without error (or `bun run build` passes)
- [x] Type check passes: `bun run check`

---

## Phase 2: Frontend — Banner + Auto-scroll

### Overview

Wire up the banner on the library page and add scroll-to-feedback + auto-mark-seen on the session detail page.

### Changes Required:

#### 2.1 Library page — replace stats + heading with feedback banner

**File**: `apps/web/src/routes/+page.svelte`

Remove:
- The entire stats `<Card.Root>` block (current lines 109-122)
- The `<h2>Your Phrase Groups</h2>` line (current line 125)
- The `totalPhraseCount` and `categoryCount` derived values (no longer needed)

Add:
- Query for `api.humanReviews.getUnseenFeedback`
- Feedback banner that conditionally renders when unseen feedback exists

Banner markup (placed where the stats card was):

```svelte
{#if unseenFeedback.data?.practiceSessionId}
  <a
    href={resolve(`/practice/session/${unseenFeedback.data.practiceSessionId}#feedback`)}
    class="feedback-banner"
  >
    <div class="feedback-banner__content">
      <span class="feedback-banner__icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </span>
      <span class="feedback-banner__text">
        Your verifier has reviewed your practice
      </span>
      <span class="feedback-banner__arrow">&rarr;</span>
    </div>
  </a>
{/if}
```

#### 2.2 Session detail page — scroll anchor + mark seen

**File**: `apps/web/src/routes/practice/session/[id]/+page.svelte`

Add:
- `id="feedback"` on the first verifier feedback `<div>` so the hash anchor works
- An `$effect` that calls `markFeedbackSeen` when session data loads
- Import `useConvexClient`

For auto-scroll, add after the data loads:

```svelte
$effect(() => {
  if (page.url.hash === '#feedback') {
    // Tick to let DOM render, then scroll
    requestAnimationFrame(() => {
      document.getElementById('feedback')?.scrollIntoView({ behavior: 'smooth' });
    });
  }
});
```

For marking seen:

```svelte
let markedSeen = $state(false);

$effect(() => {
  if (sessionData.data && !markedSeen) {
    // Check if any attempt has unseen human review
    const hasReview = sessionData.data.attempts.some((a) => a.humanReview?.initialReview);
    if (hasReview) {
      markedSeen = true;
      client.mutation(api.humanReviews.markFeedbackSeen, {
        practiceSessionId,
      });
    }
  }
});
```

#### 2.3 CSS — feedback banner styles

**File**: `packages/shared/src/styles/recall.css`

Add inside `@layer base`:

```css
.feedback-banner {
  display: block;
  background: oklch(0.55 0.18 195);
  color: oklch(0.98 0.005 195);
  border: 1px solid oklch(0.45 0.16 195);
  padding: 0.88rem var(--page-inline);
  text-decoration: none;
  transition: background-color 160ms ease;
}

.feedback-banner:hover {
  background: oklch(0.50 0.18 195);
}

.feedback-banner__content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.feedback-banner__icon {
  flex-shrink: 0;
  display: flex;
}

.feedback-banner__text {
  flex: 1;
  font-size: 0.88rem;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.feedback-banner__arrow {
  flex-shrink: 0;
  font-size: 1.1rem;
}
```

Dark-mode variant via `@media (prefers-color-scheme: dark)`:

```css
@media (prefers-color-scheme: dark) {
  .feedback-banner {
    background: oklch(0.35 0.14 195);
    color: oklch(0.95 0.01 195);
    border-color: oklch(0.42 0.14 195);
  }
  .feedback-banner:hover {
    background: oklch(0.40 0.14 195);
  }
}
```

### Success Criteria:

#### Automated Verification:

- [x] Build passes: `bun run build`
- [x] Type check passes: `bun run check`

#### Manual Verification:

- [ ] When no unseen feedback exists, banner is hidden, phrase groups render directly
- [ ] When unseen feedback exists, teal banner appears between header and phrase groups
- [ ] Clicking banner navigates to correct session page
- [ ] Session page scrolls to feedback section
- [ ] Returning to library page, banner is gone (feedback marked seen)
- [ ] Banner color is distinct teal, not yellow
- [ ] Dark mode: banner remains visible and readable

## References

- Library page: `apps/web/src/routes/+page.svelte`
- Session detail: `apps/web/src/routes/practice/session/[id]/+page.svelte`
- Human reviews backend: `convex/humanReviews.ts`
- Schema: `convex/schema.ts`
- Styles: `packages/shared/src/styles/recall.css`
