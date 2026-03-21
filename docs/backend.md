---
date: 2026-03-21T00:00:00+02:00
researcher: Claude
git_commit: 452e5a1
branch: al
repository: babylon
topic: 'Backend architecture and Convex functions'
tags: [research, codebase, convex, backend, billing, ai-pipeline, auth]
status: complete
last_updated: 2026-03-21
last_updated_by: Claude
---

# Research: Backend

## Research Question

Comprehensive research of the Babylon backend — schema, functions, infrastructure patterns, billing, and AI integrations.

## Summary

Babylon's backend is **100% Convex** — 19 tables, ~65 exported functions (26 queries, 16 mutations, 16 internal mutations, 6 actions, 1 HTTP endpoint), 1 daily cron. Key domains: language learning (phrases/sessions/attempts), AI pronunciation feedback (OpenAI Whisper + Anthropic Claude), human verifier review queue with SLA tracking, PayFast billing with entitlement gating, and spaced-repetition push notifications.

## Detailed Findings

### Schema (19 Tables)

| Table | Purpose | Key Indexes |
|-------|---------|-------------|
| `sessions` | Daily learning sessions per user | by_user, by_user_date |
| `phrases` | Vocabulary items with translations, phonetics, tags | by_session, by_user, by_user_category |
| `userPhrases` | FSRS spaced-repetition state per user×phrase | by_user_phrase, by_next_review |
| `attempts` | Audio recording attempts with AI processing status | by_phrase, by_practice_session, by_user_created |
| `practiceSessions` | Multi-phrase practice runs with aggregated AI scores | by_user_started, by_user_created |
| `audioAssets` | Convex storage references (audio files, ≤25MB) | by_phrase, by_attempt |
| `aiFeedback` | AI-generated scores + coaching text per attempt | by_attempt |
| `aiCalibration` | Per-phrase AI vs human score calibration deltas | by_phrase |
| `humanReviewRequests` | Verifier review queue (SLA-tracked, priority-ordered) | by_status_priority, by_language_status_priority, by_status_sla |
| `humanReviews` | Completed verifier review submissions | by_request_created, by_attempt, by_verifier_created |
| `humanReviewFlags` | Learner dispute flags against reviews | by_request, by_attempt |
| `verifierProfiles` | Human verifier profile + activation state | by_user, by_active |
| `verifierLanguageMemberships` | Verifier→language routing (BCP 47 codes) | by_language_active, by_user_language |
| `userPreferences` | Settings: quiet hours, push sub, timezone, locale, skin | by_user |
| `billingSubscriptions` | PayFast subscription state | by_user, by_provider_reference, by_provider_payment |
| `entitlements` | Authoritative tier gating (free/ai/pro) | by_user |
| `usageDaily` | Daily recording minutes per user (timezone-aware) | by_user_date |
| `billingEvents` | Raw audit log of webhook events | by_provider_event, by_provider_payment |
| `scheduledNotifications` | Spaced-repetition notification queue | by_phrase, by_user_scheduled, by_sent |

### Key Relationships

```
phrases ← sessions (optional sessionId)
        → userPhrases, audioAssets, attempts, humanReviewRequests,
          scheduledNotifications, aiCalibration

attempts → practiceSessions, audioAssets, aiFeedback,
           humanReviewRequests, humanReviews, humanReviewFlags

humanReviewRequests → humanReviews (initialReviewId), humanReviewFlags
audioAssets → humanReviews (exemplarAudioAssetId)
billingSubscriptions ↔ entitlements (userId), billingEvents
```

### Public API Surface

**Queries (26):** `sessions.get/list/getByDate`, `phrases.get/listBySession/listAllByUser/listGroupedByCategory`, `attempts.listByPhrase/listByPracticeSession/listByPracticeSessionAsc`, `practiceSessions.list/get/getStreak`, `preferences.get/getProfileImageUrl`, `billing.getStatus`, `aiFeedback.getByAttempt`, `aiCalibration.listAll`, `audioAssets.listByPhrase`, `humanReviews.getCurrentClaim/getQueueSignal/getAttemptHumanReview/getUnseenFeedback/listEscalated/listPendingForLanguage`, `verifierAccess.getMyVerifierState/listSupportedLanguages`, `unsplash.getRandomPhoto`

**Mutations (16):** `sessions.create/remove`, `phrases.create/createDirect/update/remove`, `attempts.create/attachAudio/markFailed`, `practiceSessions.start/end`, `preferences.upsert/generateProfileImageUploadUrl`, `audioUploads.generateUploadUrl/generateUploadUrlForVerifier`, `billing.createPayfastCheckout/setMyTierForDev`, `humanReviews.claimNext/releaseClaim/submitReview/flagAttemptReview/markFeedbackSeen`, `verifierAccess.upsertMyProfile/setMyLanguageActive`, `aiFeedback.create`

**Actions (6):** `aiPipeline.processAttempt`, `notificationsNode.send/notifyVerifiersNewWork/sendPushToUser/sendTest`, `translateNode.verifyTranslation/getSuggestion`

**Internal Mutations (16):** `aiCalibration.recordComparison`, `aiPipelineData.insertAiFeedback/patchAttemptStatus`, `billingEvents.insert`, `billingSubscriptions.setStatus`, `billing.setEntitlement`, `humanReviews.queueAttemptForHumanReview/releaseClaimIfExpired/escalateIfSlaExceeded`, `notifications.scheduleForPhrase/rescheduleDaily/markSent`, `phrases.recategorizeAll`, `translatePhraseData.patchTranslation`

**Internal Actions (1):** `translatePhrase.translateAndPhoneticize`

**HTTP (1):** `POST /webhooks/payfast` → `billingNode.payfastWebhook`

**Cron (1):** Daily 6:00 UTC → `notifications.rescheduleDaily`

### AI Pipeline

Two AI integrations, both in Node runtime (`'use node'`):

1. **Pronunciation Feedback** (`convex/aiPipeline.ts`):
   - OpenAI Whisper transcription (45s timeout, `OPENAI_API_KEY`)
   - Anthropic Claude Sonnet scoring + coaching (35s timeout, `CONVEX_ANTHROPIC_API_KEY`)
   - 3 dimensions: sound accuracy, rhythm/intonation, phrase accuracy (1-5 scale)
   - Error-resilient: marks attempt as `failed` on any error

2. **Translation & Phonetics** (`convex/translatePhrase.ts`):
   - Anthropic Claude for English→target language translation + phonetic guide (20s timeout)
   - Called via `translatePhraseData.patchTranslation` internal mutation

### Billing & Entitlements

**Plans:** free (R0, 0 min/day), ai (R150, 10 min/day), pro (R500, 15 min/day)

**Flow:** `createPayfastCheckout` → hidden form POST to PayFast → webhook callback → `billingEvents.insert` (dedup) → `billingSubscriptions.setStatus` → `billing.setEntitlement`

**Gating:** `assertRecordingAllowed()` checks tier≠free, status=active, and daily minutes quota before any recording. Pro users auto-queue human review requests.

**Safety:** Terminal cancellation (no resurrection from canceled), event deduplication by providerEventId, amount/plan/user validation on every webhook.

**Dev toggle:** `BILLING_DEV_TOGGLE` + `BILLING_DEV_TOGGLE_ALLOWLIST` for testing.

### Auth

Better Auth + Convex plugin (`convex/auth.ts`):
- Email/password + organization plugin
- `getAuthUserId()` helper: tries Convex native identity first, BetterAuth fallback
- Trusted origins: localhost ports + SITE_URL + VERIFIER_SITE_URL
- Email verification: required in production by default

### Push Notifications

`convex/notificationsNode.ts` (Node runtime, `web-push` library):
- VAPID key pair from env vars
- Per-phrase scheduling respects user quiet hours (default 22:00-8:00)
- Daily cron reschedules all push-enabled users
- Verifier broadcast on new review work

### Scheduled Functions

- **SLA escalation:** 24h after review request creation
- **Claim timeouts:** 5min after verifier claim
- **Phrase notifications:** random times per user preferences
- **Daily cron:** 6:00 UTC reschedule spaced-repetition

### Shared Libraries (`convex/lib/`)

| File | Purpose |
|------|---------|
| `auth.ts` | `getAuthUserId()` — dual-strategy auth extraction |
| `billing.ts` | Plan config, entitlement checks, usage tracking, timezone-aware daily limits |
| `languages.ts` | 9 supported languages (es, fr, de, it, pt, nl, af, zu, xh) with BCP 47 codes |
| `phraseCategories.ts` | 16 categories with keyword-based auto-inference |
| `payfast.ts` | MD5 signature building, form body parsing |
| `fetchWithTimeout.ts` | Timeout/retry/error-classification for all external HTTP calls |
| `safeErrors.ts` | Error sanitization, 8 error categories, sensitive data redaction |
| `publicActionGuards.ts` | Rate limiting, input validation |
| `vocabularySets.ts` | Vocabulary management |

### Environment Variables

| Category | Variables |
|----------|-----------|
| Auth | `SITE_URL`, `BETTER_AUTH_SECRET`, `VERIFIER_SITE_URL`, `NODE_ENV`, `AUTH_ALLOW_LOCALHOST_ORIGINS`, `AUTH_REQUIRE_EMAIL_VERIFICATION` |
| AI | `OPENAI_API_KEY`, `CONVEX_ANTHROPIC_API_KEY` |
| Billing | `PAYFAST_MERCHANT_ID`, `PAYFAST_PASSPHRASE`, `PAYFAST_SANDBOX`, `PAYFAST_ENABLE_RECURRING`, `BILLING_DEV_TOGGLE`, `BILLING_DEV_TOGGLE_ALLOWLIST` |
| Push | `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |

## Code References

- `convex/schema.ts:1-298` — Full schema definition (19 tables)
- `convex/http.ts:1-16` — HTTP router (auth routes + PayFast webhook)
- `convex/auth.ts:1-164` — Better Auth config, trusted origins, email verification
- `convex/lib/auth.ts` — `getAuthUserId()` helper
- `convex/aiPipeline.ts:18-283` — Whisper + Claude pronunciation pipeline
- `convex/translatePhrase.ts:15-107` — Claude translation + phonetics
- `convex/billing.ts:1-257` — Public billing API + setEntitlement internal
- `convex/billingNode.ts:48-257` — PayFast webhook handler
- `convex/billingSubscriptions.ts` — Subscription state machine
- `convex/lib/billing.ts:1-130` — Plans, entitlements, usage tracking, assertRecordingAllowed
- `convex/humanReviews.ts` — Largest module (~16 functions): verifier queue, claims, SLA
- `convex/notifications.ts` — Spaced-repetition scheduling
- `convex/notificationsNode.ts` — Web-push delivery (VAPID)
- `convex/crons.ts:1-12` — Daily 6:00 UTC reschedule cron
- `convex/lib/fetchWithTimeout.ts` — External HTTP with timeouts/retries
- `convex/lib/safeErrors.ts` — Error sanitization + classification

## Architecture Documentation

**Patterns:**
- All public functions auth-guard via `getAuthUserId(ctx)` → throws "Not authenticated"
- Ownership validation: `doc.userId === userId` before access
- Node runtime (`'use node'`) for: AI pipeline, translations, push notifications, PayFast webhook
- `ctx.scheduler.runAt()` for deferred work (SLA escalation, claim timeout, notification delivery)
- Dual-table billing: `billingSubscriptions` (provider state) vs `entitlements` (feature gating source of truth)
- Timezone-aware daily limits: `getDateKeyForTimeZone()` → YYYY-MM-DD in user's local time (default Africa/Johannesburg)
- Error handling: `fetchWithTimeout` wraps all external calls with classification + sanitized logging

## Open Questions

None — comprehensive coverage achieved.
