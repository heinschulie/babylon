---
date: 2026-03-19T00:00:00+02:00
researcher: Claude
git_commit: 452e5a1
branch: al
repository: babylon
topic: 'apps/verifier'
tags: [research, codebase, verifier, human-review, svelte]
status: complete
last_updated: 2026-03-19
last_updated_by: Claude
---

# Research: apps/verifier

## Research Question

What is apps/verifier, how is it structured, and how does it work?

## Summary

`apps/verifier` is a standalone SvelteKit 2 app for human reviewers (verifiers) who listen to learner pronunciation recordings, score them across three dimensions, record exemplar audio, and optionally validate AI analysis. It shares auth, styles, UI components, and Convex types with the main learner app via workspace packages. Deployed to Railway via Node adapter; supports push notifications and i18n (en/xh).

## Detailed Findings

### Purpose and User Flow

The verifier app is a review tool for native/fluent speakers. The workflow:

1. **Register/Login** -- email+password via Better Auth (shared `authClient`)
2. **Activate** -- settings page: enter first name, optional profile image, join a language team (currently only `xh-ZA`)
3. **Browse queue** -- `/work` shows pending `humanReviewRequests` for the language
4. **Claim & review** -- `/work/[id]` shows learner audio, phrase text, AI feedback; verifier scores 3 dimensions (1-5), marks AI correct/incorrect, records exemplar audio
5. **Submit** -- uploads exemplar to Convex storage, submits scores, auto-claims next item

A FAB on the home page also allows quick "claim next" without browsing the queue.

### Route Structure

| Route | File | Purpose |
|---|---|---|
| `/` | `src/routes/+page.svelte` | Guide/landing with scoring instructions + FAB |
| `/login` | `src/routes/login/+page.svelte` | Email/password sign-in |
| `/register` | `src/routes/register/+page.svelte` | Email/password registration |
| `/work` | `src/routes/work/+page.svelte` | Queue browser with pending items list |
| `/work/[id]` | `src/routes/work/[id]/+page.svelte` | Active review session with scoring, recording, timers |
| `/settings` | `src/routes/settings/+page.svelte` | Profile, language team, push notifications, stats |
| `/api/auth/[...all]` | `src/routes/api/auth/[...all]/+server.ts` | Auth API catch-all |

### Layout and Shared Dependencies

`+layout.svelte` (line 1-71):
- Sets up Convex client via `setupConvex(CONVEX_URL)`
- Creates Better Auth client via `createSvelteAuthClient`
- Syncs locale from Convex `preferences.uiLocale` on first load
- Syncs skin preference from `preferences.uiSkin`
- Renders shared `Header` component from `@babylon/ui` with nav links (Home, Work) and settings/logout

Workspace packages used:
- `@babylon/shared` -- auth client, stores (`isAuthenticated`, `isLoading`), `CONVEX_URL`, shared styles (`recall.css`), notification helpers
- `@babylon/ui` -- Header, Button, Card, Input, Label components
- `@babylon/convex` -- typed `api` export, `Id` type

### Server-Side Hooks

`src/hooks.server.ts` (line 1-47) runs three hooks in sequence:
1. **Security headers** -- nosniff, referrer-policy, permissions-policy, HSTS in production
2. **i18n** -- Paraglide middleware, cookie-based locale, injects `%lang%` into HTML
3. **Auth** -- extracts Better Auth token from cookies, stores on `event.locals.token`

### Auth Configuration

`src/lib/server/auth.ts` (line 1-27): minimal Better Auth config for token extraction only. Trusted origins include localhost ports (5173, 5178, 5180), `SITE_URL`, and `VERIFIER_SITE_URL`.

### Convex Backend Functions Used

The verifier app calls these Convex functions:

**verifierAccess.ts** (`convex/verifierAccess.ts`):
- `getMyVerifierState` -- returns profile + language memberships
- `upsertMyProfile` -- creates/updates verifier profile (firstName, profileImageUrl)
- `setMyLanguageActive` -- joins/leaves a language team
- `listSupportedLanguages` -- returns supported languages (currently only xh-ZA)
- `getMyStats` -- total and today's review count

**humanReviews.ts** (`convex/humanReviews.ts`):
- `claimNext` -- claims oldest pending request; reclaims expired, escalates SLA breaches; 5-min claim timeout
- `releaseClaim` -- returns claimed item to queue
- `submitReview` -- validates scores (1-5), uploads review with exemplar audio, handles initial vs dispute phases, updates AI calibration, sends push notification to learner
- `getCurrentClaim` -- returns active claim for current user
- `getQueueSignal` -- pending count for a language
- `listPendingForLanguage` -- up to 50 pending items with phrase data

**Other functions called:**
- `api.audioUploads.generateUploadUrlForVerifier` -- gets upload URL for exemplar audio
- `api.audioAssets.create` -- registers uploaded audio asset
- `api.preferences.get` / `api.preferences.upsert` -- user preferences (locale, push subscription)
- `api.notificationsNode.sendTest` -- test push notification

### Review Claim System

- 5-minute claim timeout (`CLAIM_TIMEOUT_MS = 5 * 60 * 1000`)
- 24-hour SLA (`SLA_MS = 24 * 60 * 60 * 1000`); breached items escalated
- Expired claims automatically reclaimed via scheduled `releaseClaimIfExpired`
- SLA breaches scheduled via `escalateIfSlaExceeded`
- Dispute phase: 2 additional reviewers needed; agreement tolerance of 1 point per dimension; if 2/2 agree with original -> resolved, otherwise -> escalated
- Median scoring across all reviewers for final scores

### Scoring Dimensions

Three 1-5 integer scores per review:
1. **Sound Accuracy** -- individual phonetic sounds (clicks, vowels, consonants)
2. **Rhythm & Intonation** -- stress, pauses, pitch patterns
3. **Phrase Accuracy** -- correct words in correct order

Plus optional AI analysis correctness (boolean).

### Exemplar Recording

The review session page (`/work/[id]`) includes a browser MediaRecorder integration:
- Supports `audio/webm;codecs=opus`, `audio/webm`, `audio/mp4`, `audio/ogg;codecs=opus`
- Records exemplar, uploads to Convex storage, links to review
- Exemplar is required for submission (submit button disabled without it)

### AI Calibration

`humanReviews.ts` lines 37-76: after each review submission, if AI feedback exists for the attempt, the system records delta between AI and human scores in `aiCalibration` table (per phrase). Tracks sum of deltas and absolute deltas for bias/accuracy measurement.

### i18n

- Paraglide JS with cookie strategy
- Base locale: `en`, additional: `xh`
- Message sources: `packages/shared/messages/{locale}.json` (shared) + `apps/verifier/messages/{locale}.json` (verifier-specific)
- ~106 verifier-specific message keys covering guide text, work queue, claim session, settings, auth, and time formatting

### Push Notifications

- Service worker at `static/sw.js` handles `push` and `notificationclick` events
- Settings page allows enable/disable/test
- Uses `@babylon/shared/notifications` `requestNotificationPermission` helper
- Subscription stored as JSON string in `preferences.pushSubscription`
- Backend sends notifications via `notificationsNode.sendPushToUser` on review completion and dispute resolution

### Deployment

- `railway.toml`: Railpack builder, `bun install` + `bun run build:verifier`, starts `node apps/verifier/build/index.js`
- SvelteKit Node adapter
- CSP headers configured in `svelte.config.js` with strict directives
- PWA manifest at `static/manifest.json` (name: "Language Recall")
- Env reads from monorepo root (`kit.env.dir: '../..'`)

### Static Assets

`static/` contains: `manifest.json`, `sw.js`, `robots.txt`, icons (`badge-72.png`, `icon-192.png`, `icon-512.png`), logos (`thetha_logo.avif`, `thetha_logo.png`)

### Testing

- `vitest.config.ts` present but no test files found in `src/`
- `test-robot-user.ts` exports a fixture user for integration testing

## Code References

- `apps/verifier/src/routes/+layout.svelte:1-71` -- Layout with Convex setup, auth, locale/skin sync, Header
- `apps/verifier/src/routes/+page.svelte:1-123` -- Guide page with scoring instructions and claim FAB
- `apps/verifier/src/routes/work/+page.svelte:1-141` -- Queue browser with pending items list
- `apps/verifier/src/routes/work/[id]/+page.svelte:1-391` -- Core review session (scoring, recording, submission)
- `apps/verifier/src/routes/settings/+page.svelte:1-235` -- Settings with profile, language, notifications, stats
- `apps/verifier/src/hooks.server.ts:1-47` -- Security headers, i18n, auth hooks
- `apps/verifier/src/lib/server/auth.ts:1-27` -- Better Auth config for token extraction
- `convex/humanReviews.ts:1-994` -- Full human review backend (claim, submit, dispute, escalation, calibration)
- `convex/verifierAccess.ts:1-134` -- Verifier profile and language membership management
- `apps/verifier/railway.toml:1-10` -- Railway deployment config
- `apps/verifier/svelte.config.js:1-42` -- CSP directives and Node adapter config

## Architecture Documentation

**Pattern: Separate app, shared backend.** The verifier runs as a distinct SvelteKit deployment but shares the same Convex backend, auth system, and UI library as the learner app. No separate API layer exists -- all data flows through Convex mutations/queries.

**Pattern: Claim-based work queue.** Items enter the queue via `queueAttemptForHumanReview` (called internally by the learner flow). Verifiers claim items with a 5-minute TTL, enforced by both client-side timers and server-side scheduled functions.

**Pattern: Dispute escalation.** Learners can flag reviews, triggering a dispute phase. Two additional verifiers must review; if both agree within 1 point of the original on all dimensions, the dispute resolves. Otherwise it escalates for manual intervention.

**Pattern: AI calibration loop.** Every human review is compared against AI scores for the same attempt, building per-phrase calibration data that can be used to adjust AI scoring over time.

## Open Questions

- No verifier-specific tests exist in `src/` -- is testing done elsewhere or planned?
- `apps/verifier/apps/verifier/` nested directory exists -- purpose unclear (possibly build artifact)
- `manifest.json` names the app "Language Recall" not "Verifier" -- intentional shared branding?
- Only `xh-ZA` language is selectable in the settings dropdown (filtered) -- is multi-language support planned?
