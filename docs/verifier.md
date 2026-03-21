---
date: 2026-03-21T00:00:00+02:00
researcher: Claude
git_commit: 452e5a1
branch: al
repository: babylon
topic: 'Verifier App — Full Architecture & Codebase Research'
tags: [research, codebase, verifier, human-review, convex, sveltekit]
status: complete
last_updated: 2026-03-21
last_updated_by: Claude
---

# Research: Verifier App

## Research Question

What is the verifier app — its structure, backend, UI, auth, and how it fits into the broader Babylon system?

## Summary

The verifier app (`apps/verifier/`) is a standalone SvelteKit 2 application for human reviewers who score learner audio attempts. Verifiers claim pending review items from a queue, score them on 3 dimensions (1-5 scale), optionally validate AI analysis, and can record exemplar audio. The app shares auth (BetterAuth), UI components (`@babylon/ui`), and backend (Convex) with the learner web app but runs as a separate deployment on Railway. Authorization is data-driven — any authenticated user becomes a verifier by creating a profile and activating for a language, with no explicit role field.

## Detailed Findings

### App Structure & Routes

```
apps/verifier/
├── src/
│   ├── app.html, app.css, app.d.ts
│   ├── hooks.server.ts          — Security headers, i18n, auth token extraction
│   ├── lib/
│   │   ├── server/auth.ts       — BetterAuth instance
│   │   └── paraglide/           — Generated i18n runtime
│   └── routes/
│       ├── +layout.svelte       — Root: Convex client, auth, Header, locale/skin sync
│       ├── +page.svelte         — Home: verification guide + FAB (auto-claim)
│       ├── login/+page.svelte   — Email/password login
│       ├── register/+page.svelte — Registration
│       ├── settings/+page.svelte — Profile, language activation, notifications, stats
│       ├── work/+page.svelte    — Pending review queue (per language)
│       ├── work/[id]/+page.svelte — Core scoring interface
│       └── api/auth/[...all]/+server.ts — BetterAuth catch-all
├── messages/
│   ├── en.json                  — 107 keys
│   └── xh.json                  — isiXhosa translations
├── static/                      — PWA icons, manifest, service worker, logo
├── package.json, svelte.config.js, vite.config.ts
└── railway.toml                 — Deployment config
```

### Core Workflow: Scoring Interface (`work/[id]/+page.svelte`)

- Displays phrase (English + target language) and plays learner audio
- **3 scoring dimensions** (1-5 buttons each): Sound Accuracy, Rhythm & Intonation, Phrase Accuracy
- **AI validation**: If AI analysis exists, shows transcript + scores + yes/no correctness buttons
- **Dispute context**: Shows original verifier's name + scores when `phase=dispute`
- **Exemplar recorder**: MediaRecorder → Blob → presigned URL upload → AudioAsset creation
- **Countdown timer**: mm:ss to 5-minute claim deadline
- **Actions**: Release claim (back to queue) or Submit review (auto-claims next)

### Backend: Convex Schema (5 verifier tables)

| Table | File:Line | Purpose |
|-------|-----------|---------|
| `verifierProfiles` | `schema.ts:102-112` | userId, firstName, profileImageUrl, active flag |
| `verifierLanguageMemberships` | `schema.ts:114-124` | userId × languageCode with active flag |
| `humanReviewRequests` | `schema.ts:129-159` | Review queue items: status, phase, SLA, claim tracking |
| `humanReviews` | `schema.ts:162-181` | Submitted scores: 3 dimensions, AI correctness, exemplar audio |
| `humanReviewFlags` | `schema.ts:184-196` | Learner dispute records |

### Backend: Request Lifecycle State Machine

```
pending
  ├── Claimed → claimed (5min deadline)
  │   ├── Claim expires → pending (released)
  │   ├── Verifier submits → completed
  │   └── SLA exceeded (24h) → escalated
  ├── SLA exceeded → escalated
  └── Learner flags → phase='dispute', status='pending'
      ├── 1st dispute review → still pending (need 2)
      ├── 2nd dispute review → dispute_resolved (if scores agree ±1)
      │                      OR escalated (3-way disagreement)
      └── SLA exceeded → escalated
```

### Backend: Key Convex Functions

**`convex/humanReviews.ts` (961 lines)**

| Line | Function | Type | Purpose |
|------|----------|------|---------|
| 224 | `queueAttemptForHumanReview` | internalMutation | Creates request (called from attempts.ts) |
| 271 | `releaseClaimIfExpired` | internalMutation | 5-min claim timeout (scheduler) |
| 294 | `escalateIfSlaExceeded` | internalMutation | 24h SLA timeout (scheduler) |
| 317 | `claimNext` | mutation | Claims next pending review for language |
| 402 | `releaseClaim` | mutation | Verifier releases claim early |
| 425 | `submitReview` | mutation | Submits scores + optional exemplar |
| 673 | `flagAttemptReview` | mutation | Learner disputes a review |
| 745 | `getCurrentClaim` | query | Active claim for verifier |
| 768 | `getQueueSignal` | query | Pending count for language |
| 790 | `getAttemptHumanReview` | query | Learner views review results |
| 863 | `getUnseenFeedback` | query | Learner's unseen completed reviews |
| 932 | `listEscalated` | query | Support views escalated cases |
| 963 | `listPendingForLanguage` | query | Queue listing (50 items) |

**`convex/verifierAccess.ts` (135 lines)**

| Line | Function | Type | Purpose |
|------|----------|------|---------|
| 6 | `upsertMyProfile` | mutation | Create/update verifier profile |
| 40 | `setMyLanguageActive` | mutation | Toggle language membership |
| 73 | `getMyVerifierState` | query | Profile + language memberships |
| 102 | `listSupportedLanguages` | query | Available languages |
| 113 | `getMyStats` | query | Total + today review counts |

### Auth & Authorization

- **Auth system**: Shared BetterAuth (email/password) via `@babylon/shared`
- **Token flow**: BetterAuth cookie → `hooks.server.ts` extracts via `getToken()` → `event.locals.token` → Convex client
- **No explicit role field** — verifier status is data-driven:
  - `verifierProfiles` record exists + `active=true` → is a verifier
  - `verifierLanguageMemberships` record with `active=true` → can review that language
- **Backend enforcement**: `assertVerifierLanguageAccess()` (`humanReviews.ts:78-91`) guards all review mutations/queries
- **Frontend guards**: `$isAuthenticated` store for route protection; `canReview` derived from language membership data

### Shared Dependencies

| Package | What's Used |
|---------|-------------|
| `@babylon/ui` | Header, Button, Card, Input, Label (shadcn-svelte) |
| `@babylon/shared` | `authClient`, `CONVEX_URL`, `isAuthenticated`/`isLoading` stores, `requestNotificationPermission` |
| `@babylon/convex` | `api` object, `Id<>` types |
| `convex-svelte` | `useQuery`, `useConvexClient` |

### Deployment

- **Platform**: Railway (not Netlify like web app)
- **Config**: `railway.toml` — RAILPACK builder, `bun run build:verifier`, `node apps/verifier/build/index.js`
- **Adapter**: `@sveltejs/adapter-node`
- **CSP**: Allows `wss:` (Convex WebSocket), `blob:`/`data:` (audio), HTTPS images

### AI Calibration Integration

When a verifier submits a review, `updateAiCalibration()` (`humanReviews.ts:37-76`) compares AI scores vs human scores per phrase, tracking cumulative deltas in `aiCalibration` table (`schema.ts:212-223`). This measures AI-vs-human drift over time.

### Data Flow: Learner Attempt → Verifier Review

1. Learner uploads audio (`attempts.ts:316-352`)
2. If Pro tier + active entitlement → creates `humanReviewRequest` (status=pending, SLA=24h)
3. Scheduler sets 24h escalation timeout
4. Verifier calls `claimNext()` → status=claimed, 5-min deadline set
5. Verifier submits scores → status=completed, push notification sent to learner
6. If learner disputes → phase=dispute, status=pending, needs 2 dispute reviews
7. Dispute resolved by agreement (±1 tolerance) or escalated on disagreement

## Code References

- `convex/schema.ts:102-196` — All 5 verifier-related table definitions
- `convex/humanReviews.ts:1-961` — Full review workflow (queue, claim, submit, dispute, escalation)
- `convex/humanReviews.ts:78-91` — `assertVerifierLanguageAccess()` authorization guard
- `convex/humanReviews.ts:37-76` — `updateAiCalibration()` AI-vs-human comparison
- `convex/verifierAccess.ts:1-135` — Profile & language membership management
- `convex/attempts.ts:316-352` — Pro tier gate + review request creation
- `apps/verifier/src/hooks.server.ts` — Security headers, i18n middleware, auth token extraction
- `apps/verifier/src/lib/server/auth.ts` — BetterAuth instance config
- `apps/verifier/src/routes/+layout.svelte` — Root layout: Convex, auth, locale/skin sync
- `apps/verifier/src/routes/work/[id]/+page.svelte` — Core scoring interface
- `apps/verifier/src/routes/work/+page.svelte` — Queue listing
- `apps/verifier/src/routes/settings/+page.svelte` — Profile, language activation, stats
- `apps/verifier/messages/en.json` — 107 i18n keys
- `apps/verifier/railway.toml` — Railway deployment config

## Architecture Documentation

**Patterns:**
- Implicit role model — no `role` field, authorization via table membership
- Claim-based work queue with 5-min deadlines + scheduler-based auto-release
- SLA enforcement via 24h scheduled escalation
- Dispute resolution: 2 agreeing dispute reviewers (±1 score tolerance) or escalate
- AI calibration as side-effect of human review submission
- Cookie-based locale persistence synced to Convex preferences on load
- PWA-ready with service worker, manifest, push notifications

**Conventions:**
- All state via Svelte 5 runes ($state, $derived, $effect)
- All backend via Convex (no REST/GraphQL)
- All user-facing strings via Paraglide messages
- shadcn-svelte components from shared `@babylon/ui` package

## Open Questions

- No tests found in `apps/verifier/` — are verifier-specific tests planned or do they live elsewhere?
- `listEscalated` query exists but no admin/support UI found — where are escalated cases handled?
- Language hardcoded to `xh-ZA` in several frontend components — is multi-language verifier support planned?
