---
date: 2026-03-25T00:00:00+02:00
researcher: Claude
git_commit: 4a209d8
branch: hein/feature/issue-61
repository: babylon
topic: 'Backend architecture and implementation'
tags: [research, codebase, convex, backend, schema, auth, billing, ai-pipeline]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: Backend

## Research Question

Comprehensive documentation of the Convex backend — schema, functions, infrastructure, auth, billing, AI pipeline, and frontend integration.

## Summary

The backend is a **Convex-only** serverless system with **20 tables**, **~21 public mutations**, **~28 public queries**, **~10 internal mutations**, **~16 internal queries**, **4 public actions**, **4 internal actions**, and **1 HTTP action** (PayFast webhook). Key subsystems: learning content management, speech recording + AI grading pipeline, human review workflow with SLA/escalation, PayFast billing with entitlement gating, web push notifications, and spaced-repetition scheduling. Auth uses BetterAuth + Convex with dual-strategy userId resolution (native identity for tests, BetterAuth for prod).

---

## Detailed Findings

### 1. Schema (20 tables)

`convex/schema.ts` — 305 lines

| Table | Purpose | Key Indexes |
|-------|---------|-------------|
| `sessions` | Daily learning sessions | by_user, by_user_date |
| `phrases` | Phrases to learn (English + translation) | by_session, by_user, by_user_category |
| `userPhrases` | Per-user FSRS spaced-repetition state | by_user_phrase, by_next_review |
| `audioAssets` | Audio files in Convex storage | by_phrase, by_attempt |
| `attempts` | Speech recordings + AI processing status | by_phrase, by_practice_session, by_user_created |
| `practiceSessions` | Practice runs with aggregate scores | by_user_started, by_user_created |
| `verifierProfiles` | Verifier account snapshots | by_user, by_active |
| `verifierLanguageMemberships` | Verifier ↔ language permissions | by_language_active, by_user_language |
| `humanReviewRequests` | Verifier work queue (lifecycle) | by_status_priority, by_language_status_priority, by_claimed_status, by_status_sla |
| `humanReviews` | Submitted verifier feedback | by_request_created, by_verifier_created |
| `humanReviewFlags` | Learner flags on reviews | by_request, by_status_created |
| `aiFeedback` | AI scoring results per attempt | by_attempt |
| `aiCalibration` | AI vs human score deltas (running sums) | by_phrase |
| `userPreferences` | Settings, push sub, locale, skin | by_user |
| `billingSubscriptions` | PayFast subscription state | by_provider_reference, by_provider_payment |
| `entitlements` | Authoritative tier gating (free/ai/pro) | by_user |
| `usageDaily` | Daily recording minutes (TZ-aware) | by_user_date |
| `billingEvents` | Raw webhook event audit log | by_provider_event, by_provider_payment |
| `scheduledNotifications` | Queued push notifications | by_user_scheduled, by_sent |
| `testTable` | Test table (emoji) | — |

**Relationship graph:**

```
sessions ← phrases ← userPhrases
                    ← attempts ← practiceSessions
                               ← audioAssets
                               ← aiFeedback
                               ← humanReviewRequests ← humanReviews
                                                     ← humanReviewFlags
                    ← aiCalibration
                    ← scheduledNotifications
```

---

### 2. Mutations & Actions by Domain

#### Learning Content

| Function | Type | File:Line | Description |
|----------|------|-----------|-------------|
| `phrases.create` | mutation | phrases.ts:55 | Create phrase in session; infer category; schedule notifications |
| `phrases.createDirect` | mutation | phrases.ts:102 | Create phrase (no session); optionally trigger async translation |
| `phrases.update` | mutation | phrases.ts:150 | Update English/translation; recalculate category |
| `phrases.remove` | mutation | phrases.ts:272 | Delete phrase |
| `phrases.recategorizeAll` | internalMutation | phrases.ts:292 | Admin: recategorize all phrases |
| `sessions.create` | mutation | sessions.ts:47 | Create/return session for date |
| `sessions.remove` | mutation | sessions.ts:80 | Delete session + cascade phrases |
| `practiceSessions.start` | mutation | practiceSessions.ts:45 | Create practice session |
| `practiceSessions.end` | mutation | practiceSessions.ts:64 | End session; schedule verifier notifications |

#### Attempts & Audio

| Function | Type | File:Line | Description |
|----------|------|-----------|-------------|
| `attempts.create` | mutation | attempts.ts:232 | Create attempt; increment session aggregates; check quota |
| `attempts.attachAudio` | mutation | attempts.ts:289 | Attach audio; consume minutes; create humanReviewRequest if Pro |
| `attempts.markFailed` | mutation | attempts.ts:421 | Mark attempt failed (error recovery) |
| `audioAssets.create` | mutation | audioAssets.ts:32 | Register uploaded audio; validate size/type |
| `audioUploads.generateUploadUrl` | mutation | audioUploads.ts:5 | Generate Convex storage upload URL (learner) |
| `audioUploads.generateUploadUrlForVerifier` | mutation | audioUploads.ts:14 | Generate upload URL (verifier) |

#### AI Pipeline

| Function | Type | File:Line | Description |
|----------|------|-----------|-------------|
| `aiPipeline.processAttempt` | action | aiPipeline.ts:39 | Orchestrate: Whisper transcription → Claude scoring → store feedback |
| `aiPipelineData.insertAiFeedback` | internalMutation | aiPipelineData.ts:109 | Create/update aiFeedback; update session aggregates |
| `aiPipelineData.patchAttemptStatus` | internalMutation | aiPipelineData.ts:175 | Attempt status lifecycle (claim/finish AI processing) |
| `aiFeedback.create` | mutation | aiFeedback.ts:5 | Create aiFeedback; patch attempt to feedback_ready |
| `aiCalibration.recordComparison` | internalMutation | aiCalibration.ts:5 | Record AI vs human delta (running sums) |

**AI scoring dimensions (1-5 each):** sound accuracy, rhythm & intonation, phrase accuracy

**Timeouts:** Whisper 45s, Claude feedback 35s. Stale processing detection at 5min.

#### Human Review Workflow

| Function | Type | File:Line | Description |
|----------|------|-----------|-------------|
| `humanReviews.queueAttemptForHumanReview` | internalMutation | humanReviews.ts:224 | Create request; schedule SLA escalation |
| `humanReviews.claimNext` | mutation | humanReviews.ts:317 | Verifier claims next pending for language |
| `humanReviews.releaseClaim` | mutation | humanReviews.ts:402 | Verifier releases claim |
| `humanReviews.submitReview` | mutation | humanReviews.ts:425 | Submit initial/dispute review; check agreement for resolution |
| `humanReviews.flagAttemptReview` | mutation | humanReviews.ts:673 | Learner flags review → dispute phase |
| `humanReviews.markFeedbackSeen` | mutation | humanReviews.ts:898 | Mark reviews as seen |
| `humanReviews.releaseClaimIfExpired` | internalMutation | humanReviews.ts:271 | Release expired claims |
| `humanReviews.escalateIfSlaExceeded` | internalMutation | humanReviews.ts:294 | Escalate after 24h SLA |

**Review phases:** initial → dispute. **Statuses:** pending → claimed → completed / dispute_resolved / escalated. **Claim timeout:** 5min. **SLA:** 24h.

#### Billing & Payments

| Function | Type | File:Line | Description |
|----------|------|-----------|-------------|
| `billing.createPayfastCheckout` | mutation | billing.ts:146 | Create subscription record + PayFast form fields |
| `billing.setMyTierForDev` | mutation | billing.ts:202 | Dev-only: manually set tier |
| `billing.setEntitlement` | internalMutation | billing.ts:257 | Set/update entitlement (webhook-safe) |
| `billingNode.payfastWebhook` | httpAction | billingNode.ts:48 | Validate signature/amount → update subscription/entitlement |
| `billingEvents.insert` | internalMutation | billingEvents.ts:4 | Dedupe + log webhook events |
| `billingSubscriptions.setStatus` | internalMutation | billingSubscriptions.ts:57 | Transition subscription status (state-machine safe) |

**Tiers:** free (0 ZAR), ai (150 ZAR/mo, 10 daily min), pro (500 ZAR/mo, 15 daily min). **Payment states:** pending → active / past_due / canceled.

#### Translation

| Function | Type | File:Line | Description |
|----------|------|-----------|-------------|
| `translatePhrase.translateAndPhoneticize` | internalAction | translatePhrase.ts:15 | Claude: English → isiXhosa + phonetic breakdown |
| `translateNode.verifyTranslation` | action | translateNode.ts:24 | Google Translate: verify user translation |
| `translateNode.getSuggestion` | action | translateNode.ts:134 | Google Translate: get suggestion |

#### Notifications

| Function | Type | File:Line | Description |
|----------|------|-----------|-------------|
| `notifications.scheduleForPhrase` | internalMutation | notifications.ts:62 | Schedule N spaced-repetition notifications (quiet hours aware) |
| `notifications.rescheduleDaily` | internalMutation | notifications.ts:103 | Daily cron: reschedule for least-recently-practiced phrases |
| `notificationsNode.send` | internalAction | notificationsNode.ts:16 | Web push for phrase practice reminder |
| `notificationsNode.notifyVerifiersNewWork` | internalAction | notificationsNode.ts:98 | Push to verifiers when new reviews available |
| `notificationsNode.sendTest` | action | notificationsNode.ts:180 | User-callable test push |

#### Preferences & Profiles

| Function | Type | File:Line | Description |
|----------|------|-----------|-------------|
| `preferences.upsert` | mutation | preferences.ts:65 | Create/update user prefs |
| `preferences.generateProfileImageUploadUrl` | mutation | preferences.ts:56 | Generate upload URL for profile pic |
| `verifierAccess.upsertMyProfile` | mutation | verifierAccess.ts:6 | Verifier profile CRUD |
| `verifierAccess.setMyLanguageActive` | mutation | verifierAccess.ts:40 | Toggle language membership |

---

### 3. Queries (28 public, 16 internal)

All public queries require auth via `getAuthUserId(ctx)` except `verifierAccess.listSupportedLanguages` (public). Standard pattern: resolve userId → verify ownership → return data.

**Key queries by domain:**

- **Phrases:** `get`, `listBySession`, `listAllByUser`, `listGroupedByCategory`
- **Attempts:** `listByPhrase`, `listByPracticeSession`, `listByPracticeSessionAsc`
- **Practice:** `list` (with pagination), `getStreak` (TZ-aware), `get`
- **Reviews:** `getCurrentClaim`, `getQueueSignal`, `getAttemptHumanReview`, `getUnseenFeedback`, `listEscalated`, `listPendingForLanguage`
- **Billing:** `getStatus` (tier + usage + quota + dev toggle)
- **Prefs:** `get` (with defaults), `getProfileImageUrl`
- **Verifier:** `getMyVerifierState`, `getMyStats`, `listSupportedLanguages`
- **AI:** `aiCalibration.listAll`, `aiFeedback.getByAttempt`

---

### 4. Infrastructure

#### Auth (`convex/auth.ts`, `convex/lib/auth.ts`)

- BetterAuth + `@convex-dev/better-auth` integration
- Dual auth strategy in `getAuthUserId()`: Convex native identity (tests) → BetterAuth (prod)
- HTTPS-only trusted origins in production; localhost conditionally allowed in dev
- Email verification enforced in prod (with safety override)
- Env vars: `SITE_URL`, `BETTER_AUTH_SECRET`, `VERIFIER_SITE_URL`, `NODE_ENV`

#### HTTP Routes (`convex/http.ts`)

- BetterAuth routes (CORS enabled)
- `POST /webhooks/payfast` → `payfastWebhook` handler

#### Cron Jobs (`convex/crons.ts`)

- `reschedule-spaced-repetition`: daily at 06:00 UTC → `notifications.rescheduleDaily`

#### Shared Libraries (`convex/lib/`)

| File | Purpose |
|------|---------|
| `auth.ts` | `getAuthUserId()` dual strategy |
| `billing.ts` | Tier constants, usage tracking, quota enforcement |
| `payfast.ts` | Signature building (MD5), form body parsing |
| `safeErrors.ts` | Error classification, sensitive data redaction, client-safe messages |
| `fetchWithTimeout.ts` | Timeout + retry wrapper, error classification |
| `publicActionGuards.ts` | In-memory rate limiter (bucket-based), validation helpers |
| `languages.ts` | 9 supported languages with BCP 47 / ISO 639-1 codes |
| `phraseCategories.ts` | 17 phrase categories with keyword matching |
| `vocabularySets.ts` | 15 vocabulary sets with Xhosa translations |

#### External Services

| Service | File | Timeout | Retries | Rate Limit |
|---------|------|---------|---------|------------|
| Claude (scoring) | aiPipeline.ts | 35s | 0 | — |
| Whisper (STT) | aiPipeline.ts | 45s | 0 | — |
| Claude (translate) | translatePhrase.ts | 20s | 0 | — |
| Google Translate | translateNode.ts | 8s | 0 | 30/60s/user |
| Unsplash | unsplash.ts | 8s | 1 (200ms) | 30/60s/user |
| PayFast validate | billingNode.ts | 4s | 0 | — |
| Web Push | notificationsNode.ts | — | 0 | — |

---

### 5. Frontend ↔ Backend Integration

**Client setup:** `packages/shared/src/convex.ts` creates singleton `ConvexClient`. Layout files call `setupConvex()` + `createSvelteAuthClient()`.

**Query pattern:** `useQuery(api.module.function, args)` — reactive, auto-updates. Conditional skip: `() => condition ? args : 'skip'`.

**Mutation pattern:** `await client.mutation(api.module.function, {...})` in event handlers.

**Action pattern:** `client.action(api.module.function, {...})` — fire-and-forget for AI processing.

**File uploads:** `mutation(generateUploadUrl)` → `fetch(POST, url, blob)` → extract storageId → `mutation(attachAudio, {storageId})`.

**Auth stores** (`packages/shared/src/stores/auth.ts`): `session`, `isAuthenticated`, `isLoading`, `user` — used for route guards and conditional query skipping.

**Server-side:** `hooks.server.ts` extracts token from cookies via `getToken(createAuth, event.cookies)`, stored in `event.locals.token`.

---

## Code References

- `convex/schema.ts:1-305` — Full schema (20 tables)
- `convex/auth.ts:1-177` — BetterAuth config, trusted origins, email verification
- `convex/lib/auth.ts:1-27` — `getAuthUserId()` dual strategy
- `convex/http.ts:1-16` — HTTP routes (auth + PayFast webhook)
- `convex/crons.ts:1-12` — Daily notification cron
- `convex/aiPipeline.ts:39` — `processAttempt` action (Whisper + Claude)
- `convex/aiPipelineData.ts:109-175` — AI feedback insert + status lifecycle
- `convex/humanReviews.ts:224-963` — Full review workflow (queue, claim, submit, flag, escalate)
- `convex/billing.ts:126-257` — Billing status + checkout + entitlement
- `convex/billingNode.ts:48-257` — PayFast webhook handler
- `convex/lib/billing.ts:1-130` — Tier constants, usage tracking, quota
- `convex/lib/safeErrors.ts:1-160` — Error handling + redaction
- `convex/lib/fetchWithTimeout.ts:1-153` — Timeout/retry HTTP wrapper
- `convex/lib/publicActionGuards.ts:1-58` — Rate limiter + validation
- `convex/lib/languages.ts:1-93` — 9 supported languages
- `convex/lib/phraseCategories.ts:1-303` — 17 phrase categories
- `convex/lib/vocabularySets.ts:14-279` — 15 vocabulary sets
- `convex/notifications.ts:62-277` — Notification scheduling + helpers
- `convex/notificationsNode.ts:16-180` — Web push dispatch
- `convex/phrases.ts:9-292` — Phrase CRUD + queries
- `convex/attempts.ts:232-421` — Attempt lifecycle
- `convex/practiceSessions.ts:45-241` — Practice session management
- `convex/preferences.ts:14-65` — User preferences
- `convex/verifierAccess.ts:6-113` — Verifier profiles + stats
- `packages/shared/src/convex.ts:1-12` — ConvexClient singleton
- `packages/shared/src/auth-client.ts:1-7` — BetterAuth client setup
- `packages/shared/src/stores/auth.ts:1-24` — Auth reactive stores
- `apps/web/src/hooks.server.ts:33-37` — Server-side auth extraction

## Architecture Documentation

**Patterns:**
- All backend logic in Convex functions — zero REST/GraphQL
- Auth: BetterAuth with dual-strategy resolution (native identity for tests, BetterAuth for prod)
- State machines: attempts (queued→processing→feedback_ready|failed), subscriptions (pending→active|past_due|canceled), reviews (pending→claimed→completed|escalated)
- Webhook safety: event deduplication, signature verification, out-of-order tolerant state transitions
- External calls: timeout-first with `fetchWithTimeout()`, graceful degradation, process-local rate limiting
- Error handling: classify → sanitize sensitive data → log safely → return client-safe message
- Scoring: 3-dimension model (sound, rhythm, phrase) used by both AI and human reviewers
- Billing gating: entitlements table is authoritative; daily usage tracked per user TZ

## Open Questions

- `userPhrases` table exists with FSRS fields but usage in mutations/queries is minimal — partially implemented?
- `testTable` purpose beyond emoji test unclear
- No explicit migration strategy visible for schema changes
