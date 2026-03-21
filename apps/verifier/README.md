# Verifier App

Standalone SvelteKit 2 app for human reviewers who score learner audio attempts. Verifiers claim pending reviews from a queue, score on 3 dimensions, optionally validate AI analysis, and can record exemplar audio.

## Features

- **Work queue** — Claim pending reviews (5-min TTL per claim, 24h SLA)
- **Scoring UI** — Rate across 3 dimensions (Sound Accuracy, Rhythm & Intonation, Phrase Accuracy), 1–5 scale
- **AI validation** — Confirm/reject AI-generated transcript and scores
- **Exemplar recording** — Record native-speaker reference audio per phrase
- **Dispute workflow** — Learner contests → 2 additional reviewers → agreement (±1) resolves, disagreement escalates
- **AI calibration** — Human scores update per-phrase delta tracking in `aiCalibration` table
- **Push notifications** — Web Push API; subscription stored in Convex
- **i18n** — English + isiXhosa via Paraglide (cookie-based)

## Verification Flow

```
pending
  ├─ claimed (5min deadline)
  │   ├─ expires → pending
  │   ├─ released → pending
  │   └─ submitted → completed
  ├─ 24h SLA exceeded → escalated
  └─ learner flags → phase=dispute, status=pending
      ├─ 2 agreeing reviewers (±1 tolerance) → dispute_resolved
      └─ 3-way disagreement → escalated
```

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Verification guide + FAB to claim work |
| `/login` | Email/password login |
| `/register` | Registration |
| `/work` | Pending review queue (per language) |
| `/work/[id]` | Scoring grid, audio playback, exemplar recorder, countdown timer |
| `/settings` | Profile, language activation, push notifications, stats |

## Structure

```
src/
├── hooks.server.ts            — Security headers, i18n, auth token extraction
├── lib/server/auth.ts         — BetterAuth instance
├── lib/paraglide/             — Generated i18n runtime (gitignored)
└── routes/
    ├── +layout.svelte         — Convex client, auth, Header, locale/skin sync
    ├── +page.svelte           — Home: verification guide + FAB (auto-claim)
    ├── login/                 — Email/password login
    ├── register/              — Registration
    ├── work/
    │   ├── +page.svelte       — Work queue listing
    │   └── [id]/+page.svelte  — Core scoring UI
    ├── settings/              — Profile, language activation, notifications, stats
    └── api/auth/[...all]/     — BetterAuth catch-all
messages/
├── en.json                    — ~107 keys
└── xh.json                    — isiXhosa translations
static/                        — PWA icons, manifest, service worker
```

No app-specific components — all UI from `@babylon/ui` (shadcn-svelte).

## Backend (Convex)

**5 tables**: `verifierProfiles`, `verifierLanguageMemberships`, `humanReviewRequests`, `humanReviews`, `humanReviewFlags`

**`convex/humanReviews.ts`** (~961 lines):
`claimNext`, `releaseClaim`, `submitReview`, `getCurrentClaim`, `getQueueSignal`, `listPendingForLanguage`, `flagAttemptReview`, `getAttemptHumanReview`, `getUnseenFeedback`, `listEscalated`

**`convex/verifierAccess.ts`**:
`upsertMyProfile`, `setMyLanguageActive`, `getMyVerifierState`, `listSupportedLanguages`, `getMyStats`

**Constants**: claim timeout 5min, SLA 24h, dispute agreement tolerance ±1.

## Auth & Authorization

- **Auth**: Shared BetterAuth (email/password) via `@babylon/shared`
- **Token flow**: BetterAuth cookie → `hooks.server.ts` extracts token → Convex client
- **No explicit role field** — data-driven authorization:
  - `verifierProfiles` record + `active=true` → is a verifier
  - `verifierLanguageMemberships` with `active=true` → can review that language
- **Backend guard**: `assertVerifierLanguageAccess()` on all review mutations/queries
- **Frontend**: `$isAuthenticated` store for route protection

## Shared Packages

| Package | Used For |
|---------|----------|
| `@babylon/shared` | Auth client, stores, notifications, Convex URL |
| `@babylon/convex` | Type-safe Convex function refs (`api`, `Id<>`) |
| `@babylon/ui` | All UI components (shadcn-svelte) |
| `convex-svelte` | `useQuery`, `useConvexClient` |

## Deployment

- **Platform**: Railway (not Netlify)
- **Adapter**: `@sveltejs/adapter-node`
- **Build**: `bun run build:verifier` → `node apps/verifier/build/index.js`
- **CSP**: Allows `wss:` (Convex WebSocket), `blob:`/`data:` (audio), HTTPS images

## Dev

```sh
bun run dev:verifier    # from monorepo root
npx convex dev          # backend (shared with web app)
```
