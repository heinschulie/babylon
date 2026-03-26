# Convex Backend

Serverless backend for Babylon — a language-learning platform with AI pronunciation feedback, human verifier reviews, spaced-repetition notifications, and PayFast billing. Pure Convex architecture: no REST/GraphQL.

## Schema (20 Tables)

| Table | Purpose |
|-------|---------|
| `sessions` | Daily per-user learning containers |
| `phrases` | Phrase library (text, translation, grammar/phonetic/domain tags, audio, difficulty) |
| `userPhrases` | FSRS spaced-repetition state |
| `audioAssets` | Stored audio files (≤25MB, ≤15min) |
| `attempts` | Learner recordings with status state machine |
| `practiceSessions` | Practice run aggregation with score sums |
| `verifierProfiles` | Verifier identity + active flag |
| `verifierLanguageMemberships` | Verifier language qualifications |
| `humanReviewRequests` | Review queue lifecycle (phase, status, SLA tracking) |
| `humanReviews` | Submitted reviews (3 scores 1-5) |
| `humanReviewFlags` | Learner dispute flags |
| `aiFeedback` | AI scores (transcript, confidence, errorTags, 3 scores 1-5) |
| `aiCalibration` | AI vs human score drift tracking per phrase |
| `userPreferences` | Notification/UI prefs (quiet hours, push, timezone, locale, skin) |
| `billingSubscriptions` | PayFast subscription state |
| `entitlements` | Authoritative tier gating |
| `usageDaily` | Daily recording minutes (resets at user's local midnight) |
| `billingEvents` | Webhook audit log |
| `scheduledNotifications` | Push notification queue |
| `testTable` | Test table (emoji) |

### Entity Relationships

```
sessions ──1:N──► phrases ──1:N──► attempts ──1:1──► aiFeedback
                    │                  │
                    ├──1:N──► userPhrases (FSRS)
                    │                  │
                    │                  ├──N:1──► practiceSessions
                    │                  ├──1:N──► audioAssets
                    │                  └──1:1──► humanReviewRequests ──1:N──► humanReviews
                    │                                                  └──1:N──► humanReviewFlags
                    └──1:1──► aiCalibration

phrases ──1:N──► scheduledNotifications
```

## Subsystems

### Auth

- Better Auth + Convex adapter (`auth.ts`)
- Email/password with optional email verification
- Organization plugin
- Dual trusted origins (learner app + verifier app)
- `lib/auth.ts` — `getAuthUserId()` tries Convex native identity first (tests), falls back to Better Auth session
- HTTPS-only trusted origins in prod; localhost conditionally allowed in dev

### Billing & Entitlements

**Tiers:** free (0 min/day), ai (R150/mo, 10 min/day), pro (R500/mo, 15 min/day)

1. `billing.createPayfastCheckout(plan)` → pending subscription + PayFast form fields
2. PayFast webhook → validate signature/merchant/amount → update subscription + entitlement
3. `billing.getStatus()` → tier, status, usage, limits

Safety: MD5 signature validation, PayFast server validation, event deduplication, state machine (canceled is terminal).

Payment states: pending → active / past_due / canceled.

Files: `billing.ts`, `billingNode.ts`, `billingSubscriptions.ts`, `billingEvents.ts`, `lib/billing.ts`, `lib/payfast.ts`

### AI Pipeline

attempt created → `processAttempt` action → **Whisper** transcription (45s timeout) → **Claude** feedback (35s timeout) → scores stored

- Race protection via `aiRunId` + 5-min staleness check
- Claude grades soundAccuracy, rhythmIntonation, phraseAccuracy (1-5) + coaching text
- Delta-based score aggregation on practice sessions (`aiPipelineData.ts`)
- AI vs human calibration tracking (`aiCalibration.ts`)

### Phrases & Translation

- CRUD: `phrases.ts` — create (in session or direct), update, remove, list
- Auto-categorization: 17 categories via keyword matching (`lib/phraseCategories.ts`)
- Auto-translation: Claude translates English → isiXhosa + phonetic breakdown (`translatePhrase.ts`)
- Google Translate: verify user translations, get suggestions (`translateNode.ts`)
- 15 Xhosa/English vocabulary sets (`lib/vocabularySets.ts`)

### Practice Sessions & Attempts

- `practiceSessions.start()` → container for attempts
- `practiceSessions.end()` → triggers verifier notifications
- `practiceSessions.getStreak()` → timezone-aware consecutive day count
- `attempts.create()` → status `queued`, billing check
- `attempts.attachAudio()` → status `processing`, consume minutes, auto-creates human review for Pro users (24h SLA)

### Human Review System

1. Pro user's attempt → `queueAttemptForHumanReview` → pending request (24h SLA)
2. Verifier calls `claimNext(languageCode)` → 5-min claim deadline
3. Verifier submits review (3 scores 1-5 + exemplar audio + aiAnalysisCorrect flag)
4. Learner can flag → dispute phase → 2 more verifiers review
5. Dispute resolution: ±1 agreement tolerance, median scores, escalation on 3-way disagreement

**Statuses:** pending → claimed → completed → (flagged) → dispute → dispute_resolved | escalated

### Notifications

- Web Push via `web-push` library (`notificationsNode.ts`)
- Spaced repetition: schedule N random notifications within quiet hours on phrase creation
- Daily cron (06:00 UTC): reschedule for least-practiced phrases
- Verifier alerts: broadcast "new work" push when learner ends session
- Quiet hours: default 22:00-08:00, user-configurable

### Preferences & Profiles

- `preferences.ts` — user prefs CRUD (push subscription, locale, skin, quiet hours)
- `verifierAccess.ts` — verifier profile management, language membership toggles, stats

## Structure

```
schema.ts                 # 20-table schema
auth.ts / auth.config.ts  # BetterAuth setup
http.ts                   # HTTP router (auth + webhook)
crons.ts                  # Daily notification cron
convex.config.ts          # Plugin registration

# Core modules
phrases.ts                # Phrase CRUD + categorization
sessions.ts               # Session CRUD
attempts.ts               # Attempt lifecycle + enriched queries
practiceSessions.ts       # Practice aggregation + streak
preferences.ts            # User preferences
audioAssets.ts / audioUploads.ts  # Audio storage

# AI & Review
aiPipeline.ts             # Whisper + Claude processing
aiFeedback.ts             # AI feedback storage
aiCalibration.ts          # AI vs human drift tracking
aiPipelineData.ts         # Internal AI data helpers
humanReviews.ts           # Full review workflow
verifierAccess.ts         # Verifier profiles + languages

# Billing
billing.ts                # Subscription management + queries
billingNode.ts            # PayFast webhook handler
billingSubscriptions.ts   # Subscription state machine
billingEvents.ts          # Webhook audit log

# Translation
translatePhrase.ts        # Claude translation + phonetics
translateNode.ts          # Google Translate verification
translatePhraseData.ts    # Internal translation helpers

# Notifications
notifications.ts          # Scheduling logic
notificationsNode.ts      # Web Push sending (Node runtime)

# Utilities (lib/)
lib/auth.ts               # getAuthUserId() dual-strategy
lib/billing.ts            # Entitlement checks, usage tracking, plan defs
lib/payfast.ts            # PayFast signature building
lib/languages.ts          # 9 supported languages
lib/phraseCategories.ts   # 17 phrase categories
lib/vocabularySets.ts     # 15 Xhosa/English vocabulary sets
lib/publicActionGuards.ts # Rate limiting + input validation
lib/fetchWithTimeout.ts   # HTTP client with timeout/retry
lib/safeErrors.ts         # Error classification + secret redaction
```

## HTTP Routes

| Method | Path | Handler |
|--------|------|---------|
| `*` | `/api/auth/*` | Better Auth (CORS enabled) |
| `POST` | `/webhooks/payfast` | PayFast webhook processor |

## Cron Jobs

| Schedule | Handler |
|----------|---------|
| Daily 06:00 UTC | `notifications.rescheduleDaily` |

## External Services

| Service | Timeout | Rate Limit |
|---------|---------|------------|
| Claude (scoring) | 35s | — |
| Whisper (STT) | 45s | — |
| Claude (translate) | 20s | — |
| Google Translate | 8s | 30/60s/user |
| Unsplash | 8s | 30/60s/user |
| PayFast validate | 4s | — |
| Web Push | — | — |

## Conventions

- Public functions call `getAuthUserId(ctx)` as first line (except `verifierAccess.listSupportedLanguages`)
- `*Node.ts` suffix for files needing Node APIs (web-push, crypto)
- `*Data.ts` suffix for internal data helpers
- Test files colocated with source (`*.test.ts`)
- Ownership checks (userId matching), not role-based access
- Compound indexes for multi-field lookups
- Process-local rate limiting for expensive actions
- Timezone-aware daily usage (defaults to `Africa/Johannesburg`)

## Architecture Patterns

- **Convex-only** — all logic in queries, mutations, actions
- **Node.js actions** (`'use node'`) for external APIs (OpenAI, Anthropic, Google Translate, web-push, PayFast)
- **Internal functions** for cross-module communication
- **Scheduler** (`ctx.scheduler.runAfter`) for async work
- **State machines** for attempts (`queued→processing→feedback_ready|failed`), subscriptions (`pending→active|past_due|canceled`), reviews (`pending→claimed→completed|escalated`)
- **Delta aggregation** for practice session scores
- **Webhook safety**: event deduplication, signature verification, out-of-order tolerant transitions
- **Error handling**: classify → sanitize sensitive data → log safely → return client-safe message
- **Graceful degradation** when API keys missing

## Frontend Integration

- **Client**: `packages/shared/src/convex.ts` creates singleton `ConvexClient`
- **Queries**: `useQuery(api.module.function, args)` — reactive, auto-updates. Skip: `() => condition ? args : 'skip'`
- **Mutations**: `await client.mutation(api.module.function, {...})` in event handlers
- **Actions**: `client.action(api.module.function, {...})` — fire-and-forget for AI processing
- **File uploads**: `mutation(generateUploadUrl)` → `fetch(POST, url, blob)` → extract storageId → `mutation(attachAudio, {storageId})`
- **Auth stores**: `session`, `isAuthenticated`, `isLoading`, `user` — route guards + conditional query skipping
- **Server-side**: `hooks.server.ts` extracts token from cookies via `getToken(createAuth, event.cookies)`

## Environment Variables

| Category | Variables |
|----------|-----------|
| Auth | `SITE_URL`, `BETTER_AUTH_SECRET`, `VERIFIER_SITE_URL`, `NODE_ENV`, `AUTH_ALLOW_LOCALHOST_ORIGINS`, `AUTH_REQUIRE_EMAIL_VERIFICATION` |
| AI | `OPENAI_API_KEY`, `CONVEX_ANTHROPIC_API_KEY` |
| Push | `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |
| APIs | `GOOGLE_TRANSLATE_API_KEY`, `UNSPLASH_ACCESS_KEY` |
| Billing | `PAYFAST_MERCHANT_ID`, `PAYFAST_PASSPHRASE`, `PAYFAST_SANDBOX`, `PAYFAST_ENABLE_RECURRING`, `BILLING_DEV_TOGGLE`, `BILLING_DEV_TOGGLE_ALLOWLIST` |

## Testing

Test files using Vitest + convex-test. `convexTest(schema, modules)` creates fresh in-memory DB per test. `t.withIdentity()` for auth. Coverage: CRUD, multi-user isolation, billing state machines, idempotency, cascade deletes, fetch timeouts, PayFast signatures, notifications, dev toggles.
