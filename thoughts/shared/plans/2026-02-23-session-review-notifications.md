# Push Notifications Fix — Implementation Plan

## Overview

Three notification failures:

1. **Spaced-repetition reminders are one-shot** — `scheduleForPhrase` fires at phrase creation, schedules 3 pushes for the next 24h, then never again. No cron, no recurring mechanism. After day 1, silence.
2. **Learner finishes practice session** → verifiers never learn there's new work
3. **Verifier completes a review** → learner never learns results are back

All web-push infrastructure works (`web-push`, service workers, VAPID, `userPreferences.pushSubscription`). The gaps are: no recurring scheduler, no event triggers, and no verifier push-subscription UI.

## Current State Analysis

### What exists:
- `convex/notificationsNode.ts` — `send` internal action (coupled to `scheduledNotifications`), `sendTest` action
- `convex/notifications.ts` — `scheduleForPhrase` internal mutation (one-shot, phrase-creation only)
- `packages/shared/src/notifications.ts` — browser helpers (`requestNotificationPermission`, `getSubscription`)
- `apps/web/static/sw.js` + `apps/verifier/static/sw.js` — identical push event handlers
- `apps/web/src/routes/settings/+page.svelte:100-114` — learner push subscription UI
- `convex/preferences.ts` — `upsert` mutation accepts `pushSubscription`
- `convex/schema.ts:103-112` — `verifierLanguageMemberships` already has `by_language_active` index

### What's broken/missing:
- **No recurring schedule** — `scheduleForPhrase` runs once per phrase at creation; no cron exists (`convex/crons.ts` does not exist)
- **No generic "send push to userId" action** — current `send` requires a `scheduledNotifications` record
- **No verifier push subscription UI** — verifier settings page has no notification toggle
- **No trigger in `practiceSessions.end`** to notify verifiers
- **No trigger in `humanReviews.submitReview`** to notify learner
- **Timezone-unaware quiet hours** — `generateRandomTimes` uses server UTC, not user's `timeZone` field (noted, not fixing in this plan)

## Desired End State

- **Daily spaced-repetition reminders**: A cron runs daily, picks the least-recently-practiced phrases for each push-enabled user, and schedules notifications. Users receive ongoing reminders, not just day-1.
- **Verifier work notifications**: When a learner ends a session with ≥1 `humanReviewRequest`, active verifiers for that language receive a batched push.
- **Learner results notifications**: When a verifier submits a review (`completed` or `dispute_resolved`), the learner receives a push.
- **Verifier push UI**: Settings page has enable/disable/test, matching the learner app.
- `bun run build` + `bun run check` pass.

## What We're NOT Doing

- Email notifications (web-push only)
- Quiet hours for event-driven notifications (immediate send)
- Timezone-correct quiet hours for spaced-repetition (requires more work, separate ticket)
- Notification preferences per event type (all-or-nothing via pushSubscription)
- Notification history/log table
- In-app notification center (existing `getUnseenFeedback` banner suffices)
- SM-2 or sophisticated spaced-repetition intervals (just prioritize least-recently-practiced)
- Rate limiting (sessions end infrequently enough)

---

## Phase 1: Fix Spaced-Repetition — Daily Cron

### Overview
Add a daily cron job that reschedules spaced-repetition notifications. For each push-enabled user, pick the N least-recently-practiced phrases, clean up stale unsent notifications, and schedule fresh ones.

### Changes Required:

#### 1.1 Create `convex/crons.ts`

**File**: `convex/crons.ts` (new)
**Changes**: Register a daily cron at 06:00 UTC (08:00 SAST).

```typescript
import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

crons.daily(
  'reschedule-spaced-repetition',
  { hourUTC: 6, minuteUTC: 0 },
  internal.notifications.rescheduleDaily
);

export default crons;
```

#### 1.2 Add `rescheduleDaily` internal mutation

**File**: `convex/notifications.ts`
**Changes**: Add an internal mutation that iterates push-enabled users, cleans up stale notifications, and schedules fresh ones for least-recently-practiced phrases.

```typescript
/**
 * Daily cron: reschedule spaced-repetition notifications for all push-enabled users.
 * Picks the N least-recently-practiced phrases per user (N = notificationsPerPhrase, default 3).
 */
export const rescheduleDaily = internalMutation({
  args: {},
  handler: async (ctx) => {
    const allPrefs = await ctx.db.query('userPreferences').collect();
    const pushUsers = allPrefs.filter((p) => p.pushSubscription);

    for (const prefs of pushUsers) {
      // Clean up old unsent notifications (scheduled >24h ago, never sent)
      const oldNotifications = await ctx.db
        .query('scheduledNotifications')
        .withIndex('by_user_scheduled', (q) => q.eq('userId', prefs.userId))
        .collect();

      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      for (const notif of oldNotifications) {
        if (!notif.sent && notif.scheduledFor < cutoff) {
          await ctx.db.delete(notif._id);
        }
      }

      // Get user's phrases
      const phrases = await ctx.db
        .query('phrases')
        .withIndex('by_user', (q) => q.eq('userId', prefs.userId))
        .collect();

      if (phrases.length === 0) continue;

      // Score each phrase by recency of last attempt (never-attempted = highest priority)
      const phraseScores: Array<{ phraseId: typeof phrases[0]['_id']; lastAttemptAt: number }> = [];
      for (const phrase of phrases) {
        const latestAttempt = await ctx.db
          .query('attempts')
          .withIndex('by_phrase', (q) => q.eq('phraseId', phrase._id))
          .order('desc')
          .first();
        phraseScores.push({
          phraseId: phrase._id,
          lastAttemptAt: latestAttempt?._creationTime ?? 0
        });
      }

      // Sort: oldest/never-attempted first
      phraseScores.sort((a, b) => a.lastAttemptAt - b.lastAttemptAt);

      // Pick top N phrases to remind about (1 notification each)
      const count = prefs.notificationsPerPhrase ?? 3;
      const phrasesToRemind = phraseScores.slice(0, count);

      const quietStart = prefs.quietHoursStart ?? 22;
      const quietEnd = prefs.quietHoursEnd ?? 8;

      for (const { phraseId } of phrasesToRemind) {
        const times = generateRandomTimes(1, quietStart, quietEnd);
        for (const scheduledFor of times) {
          const notificationId = await ctx.db.insert('scheduledNotifications', {
            phraseId,
            userId: prefs.userId,
            scheduledFor,
            sent: false
          });
          await ctx.scheduler.runAt(scheduledFor, internal.notificationsNode.send, {
            notificationId
          });
        }
      }
    }
  }
});
```

**Behavior**: Each day, a user with `notificationsPerPhrase = 3` and 20 phrases gets 3 notifications throughout the day — one for each of the 3 least-recently-practiced phrases. This keeps the volume manageable while ensuring neglected phrases surface.

### Success Criteria:

#### Automated Verification:
- [x] `npx convex dev --once` deploys (cron registers, new mutation resolves)
- [x] `bun run build` succeeds
- [x] `bun run check` passes

#### Manual Verification:
- [ ] Cron visible in Convex dashboard under scheduled functions
- [ ] Trigger manually via Convex dashboard → notifications scheduled
- [ ] Push notifications arrive for least-recently-practiced phrases
- [ ] Old unsent notifications cleaned up

**Implementation Note**: Pause here for manual confirmation before proceeding.

---

## Phase 2: Generic Push Action

### Overview
Decouple push sending from `scheduledNotifications` by adding a general-purpose `sendPushToUser` internal action.

### Changes Required:

#### 2.1 New internal action: `sendPushToUser`

**File**: `convex/notificationsNode.ts`
**Changes**: Add `sendPushToUser` — takes `userId`, `title`, `body`, `url`, `tag` directly.

```typescript
export const sendPushToUser = internalAction({
  args: {
    userId: v.string(),
    title: v.string(),
    body: v.string(),
    url: v.string(),
    tag: v.string()
  },
  handler: async (ctx, { userId, title, body, url, tag }) => {
    const prefs = await ctx.runQuery(internal.notifications.getPreferencesByUserId, { userId });
    if (!prefs?.pushSubscription) return;

    const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    const siteUrl = process.env.SITE_URL || 'http://localhost:5173';

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('VAPID keys not configured');
      return;
    }

    webpush.setVapidDetails(
      `mailto:noreply@${new URL(siteUrl).hostname}`,
      vapidPublicKey,
      vapidPrivateKey
    );

    const payload = JSON.stringify({ title, body, url, tag });

    try {
      await webpush.sendNotification(JSON.parse(prefs.pushSubscription), payload);
    } catch (error) {
      console.error(`Failed to send push to user ${userId}:`, error);
    }
  }
});
```

### Success Criteria:

#### Automated Verification:
- [x] `npx convex dev --once` deploys
- [x] `bun run build` succeeds
- [x] `bun run check` passes

#### Manual Verification:
- [ ] Existing `sendTest` still works from learner settings

---

## Phase 3: Notify Verifiers on Session End

### Overview
When a learner ends a practice session, count pending `humanReviewRequests` from that session and push-notify all active verifiers for the language.

### Changes Required:

#### 3.1 Internal queries for session review data + verifier subscriptions

**File**: `convex/notifications.ts`
**Changes**: Add two internal queries.

```typescript
export const getSessionReviewInfo = internalQuery({
  args: { practiceSessionId: v.id('practiceSessions') },
  handler: async (ctx, { practiceSessionId }) => {
    const attempts = await ctx.db
      .query('attempts')
      .withIndex('by_practice_session', (q) => q.eq('practiceSessionId', practiceSessionId))
      .collect();

    const requests = [];
    for (const attempt of attempts) {
      const req = await ctx.db
        .query('humanReviewRequests')
        .withIndex('by_attempt', (q) => q.eq('attemptId', attempt._id))
        .unique();
      if (req && (req.status === 'pending' || req.status === 'claimed')) {
        requests.push(req);
      }
    }

    const languages = [...new Set(requests.map((r) => r.languageCode))];
    return { count: requests.length, languages };
  }
});

export const getVerifierPushSubscriptions = internalQuery({
  args: { languageCode: v.string() },
  handler: async (ctx, { languageCode }) => {
    const memberships = await ctx.db
      .query('verifierLanguageMemberships')
      .withIndex('by_language_active', (q) => q.eq('languageCode', languageCode).eq('active', true))
      .collect();

    const verifierUserIds: string[] = [];
    for (const mem of memberships) {
      const profile = await ctx.db
        .query('verifierProfiles')
        .withIndex('by_user', (q) => q.eq('userId', mem.userId))
        .unique();
      if (!profile?.active) continue;

      const prefs = await ctx.db
        .query('userPreferences')
        .withIndex('by_user', (q) => q.eq('userId', mem.userId))
        .unique();
      if (prefs?.pushSubscription) {
        verifierUserIds.push(mem.userId);
      }
    }
    return verifierUserIds;
  }
});
```

#### 3.2 Fan-out action for verifier notifications

**File**: `convex/notificationsNode.ts`
**Changes**: Add `notifyVerifiersNewWork` internal action.

```typescript
export const notifyVerifiersNewWork = internalAction({
  args: { practiceSessionId: v.id('practiceSessions') },
  handler: async (ctx, { practiceSessionId }) => {
    const info = await ctx.runQuery(internal.notifications.getSessionReviewInfo, {
      practiceSessionId
    });
    if (info.count === 0) return;

    for (const languageCode of info.languages) {
      const verifierUserIds = await ctx.runQuery(
        internal.notifications.getVerifierPushSubscriptions,
        { languageCode }
      );

      for (const userId of verifierUserIds) {
        await ctx.runAction(internal.notificationsNode.sendPushToUser, {
          userId,
          title: 'New work available',
          body: `${info.count} new recording${info.count > 1 ? 's' : ''} to review`,
          url: '/work',
          tag: `new-work-${practiceSessionId}`
        });
      }
    }
  }
});
```

#### 3.3 Trigger in `practiceSessions.end`

**File**: `convex/practiceSessions.ts`
**Changes**: After patching `endedAt`, schedule verifier notification. Add `import { internal } from './_generated/api'` at top.

```typescript
// After the ctx.db.patch line in the `end` mutation handler:
await ctx.scheduler.runAfter(0, internal.notificationsNode.notifyVerifiersNewWork, {
  practiceSessionId: args.practiceSessionId
});
```

### Success Criteria:

#### Automated Verification:
- [x] `npx convex dev --once` deploys
- [x] `bun run build` succeeds
- [x] `bun run check` passes

#### Manual Verification:
- [ ] Pro learner records ≥1 phrase, clicks Finish → verifier receives push
- [ ] Push links to `/work`
- [ ] Non-subscribed verifiers receive nothing

**Implementation Note**: Pause here for manual confirmation.

---

## Phase 4: Notify Learner on Review Completion

### Overview
When a verifier submits a review that resolves a request (`completed` or `dispute_resolved`), push-notify the learner.

### Changes Required:

#### 4.1 Trigger in `humanReviews.submitReview`

**File**: `convex/humanReviews.ts`
**Changes**: Add `import { internal } from './_generated/api'` at top. Fetch the `attempt` record early in the handler (after `request` is validated) for `practiceSessionId`.

For **initial review completion** (after status is patched to `completed`):
```typescript
if (attempt?.practiceSessionId) {
  await ctx.scheduler.runAfter(0, internal.notificationsNode.sendPushToUser, {
    userId: request.learnerUserId,
    title: 'Results are back!',
    body: `${verifierProfile.firstName} reviewed your recording`,
    url: `/practice/session/${attempt.practiceSessionId}#feedback`,
    tag: `review-${request._id}`
  });
}
```

For **dispute resolved** (after status is patched to `dispute_resolved`):
```typescript
if (attempt?.practiceSessionId) {
  await ctx.scheduler.runAfter(0, internal.notificationsNode.sendPushToUser, {
    userId: request.learnerUserId,
    title: 'Dispute resolved',
    body: 'Your flagged review has been resolved',
    url: `/practice/session/${attempt.practiceSessionId}#feedback`,
    tag: `dispute-${request._id}`
  });
}
```

Add near top of handler:
```typescript
const attempt = await ctx.db.get(request.attemptId);
```

### Success Criteria:

#### Automated Verification:
- [x] `npx convex dev --once` deploys
- [x] `bun run build` succeeds
- [x] `bun run check` passes

#### Manual Verification:
- [ ] Verifier submits review → learner receives push with verifier's name
- [ ] Notification links to `/practice/session/<id>#feedback`
- [ ] Dispute resolution also triggers notification with different body

**Implementation Note**: Pause here for manual confirmation.

---

## Phase 5: Verifier App Push Subscription UI

### Overview
Add notification enable/disable/test UI to verifier settings, mirroring the learner app pattern.

### Changes Required:

#### 5.1 Push notification card

**File**: `apps/verifier/src/routes/settings/+page.svelte`
**Changes**: Add imports (`requestNotificationPermission` from `@babylon/shared/notifications`, `preferences` query), reactive state, enable/disable/test functions, and a Card component. Follow exact pattern from `apps/web/src/routes/settings/+page.svelte:100-132`.

Key additions:
- `const preferences = useQuery(api.preferences.get, {});`
- `let notificationsEnabled = $derived(!!preferences.data?.pushSubscription);`
- `enableNotifications()` — calls `requestNotificationPermission()`, stores via `preferences.upsert`
- `disableNotifications()` — sets `pushSubscription: ''`
- `sendTestNotification()` — calls `notificationsNode.sendTest`
- New `<Card.Root>` block after the language settings card

#### 5.2 i18n strings

**File**: `apps/verifier/messages/en.json`
```json
"vsettings_push_title": "Push Notifications",
"vsettings_push_desc": "Get notified when new recordings are available to review",
"vsettings_push_enabled": "Notifications are enabled",
"vsettings_push_test": "Send Test",
"vsettings_push_test_sent": "Test notification sent!",
"vsettings_push_test_failed": "Failed to send test notification",
"vsettings_push_enable": "Enable Notifications",
"vsettings_push_disable": "Disable"
```

**File**: `apps/verifier/messages/xh.json`
Same keys, prefixed with `[TODO] `.

### Success Criteria:

#### Automated Verification:
- [x] `bun run build` succeeds
- [x] `bun run check` passes

#### Manual Verification:
- [ ] Verifier settings shows notification card
- [ ] Enable triggers browser permission prompt
- [ ] `pushSubscription` stored in `userPreferences`
- [ ] Test button sends push
- [ ] Disable clears subscription

---

## Testing Strategy

### Full Flows:

1. **Spaced repetition**: Enable push as learner → add a phrase → get 3 notifications that day → next day, cron fires → get reminders for least-recently-practiced phrases
2. **Learner → verifier**: Pro learner records phrases, ends session → verifier receives batched push → click opens `/work`
3. **Verifier → learner**: Verifier claims + submits review → learner receives push with verifier name → click opens session feedback

### Edge Cases:
- Free-tier learner (no `humanReviewRequests` created) → no verifier notification
- Session with 0 attempts → no notification
- User with expired/invalid push subscription → silent failure, no crash
- Multiple verifiers active → all receive notification

## Performance Considerations

- Daily cron iterates all push-enabled users. Fine for small user base (<100). If growth necessitates, split into fan-out pattern.
- `notifyVerifiersNewWork` fans out `sendPushToUser` per verifier. Fine for <50 verifiers per language.
- All event-driven notifications use `ctx.scheduler.runAfter(0, ...)` — fire-and-forget, doesn't block mutations.

## References

- Existing push: `convex/notificationsNode.ts`, `convex/notifications.ts`
- Learner push UI: `apps/web/src/routes/settings/+page.svelte:100-132`
- Session end: `convex/practiceSessions.ts:18`
- Review submit: `convex/humanReviews.ts:425-651`
- Verifier memberships: `convex/verifierAccess.ts`, schema index `by_language_active` already exists
- Service workers: `apps/web/static/sw.js`, `apps/verifier/static/sw.js`
