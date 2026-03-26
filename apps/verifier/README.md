# Verifier App

Standalone SvelteKit 2 app for human reviewers who score learner pronunciation attempts. Shares a Convex backend, auth system, and UI library with the main web app but deploys independently.

## How It Works

Learners submit audio → system queues for human review → verifiers claim items (5-min deadline) → score on 3 dimensions + record exemplar audio → learners can dispute → 2 more verifiers arbitrate. Currently hardcoded to isiXhosa (`xh-ZA`).

## Routes

| Route | Purpose |
|---|---|
| `/` | Guide — verification approach, scoring dimensions, FAB to claim work |
| `/login` | Email/password login via Better Auth |
| `/register` | Account creation |
| `/work` | Queue listing — pending reviews with phrase metadata |
| `/work/[id]` | Claim detail — audio playback, 3-dimension scoring (1-5), AI analysis review, exemplar recording, 5-min timer |
| `/settings` | Profile activation, stats, language team, push notifications, locale/skin prefs |
| `/api/auth/[...all]` | Better Auth catch-all |

## Review State Machine

```
                    ┌─────────────────────────────────────┐
                    │          INITIAL PHASE               │
                    │                                      │
  attachAudio() ──►│ pending ──► claimed ──► completed    │
                    │   ▲           │                      │
                    │   └───────────┘ (release/expire)     │
                    └──────────────────────┬──────────────-┘
                                           │ learner flags
                    ┌──────────────────────▼──────────────-┐
                    │          DISPUTE PHASE                │
                    │                                       │
                    │ pending ──► claimed ──► completed x2  │
                    │   ▲           │            │          │
                    │   └───────────┘            ▼          │
                    │              ┌─────────────────┐      │
                    │              │ 2+ agree → resolved    │
                    │              │ <2 agree → escalated   │
                    │              └─────────────────┘      │
                    └──────────────────────────────────────-┘

  Any pending/claimed past 24h SLA → escalated
```

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
├── en.json                    — ~108 keys
└── xh.json                    — isiXhosa translations
static/                        — PWA icons, manifest, service worker
```

No app-specific components — all UI from `@babylon/ui` (shadcn-svelte).

## Backend (Convex)

**Schema** — 5 verification tables + `aiCalibration`:

- **`verifierProfiles`** — userId, firstName, profileImageUrl, active
- **`verifierLanguageMemberships`** — userId, languageCode (BCP 47), active
- **`humanReviewRequests`** — Queue lifecycle: attemptId, phase (initial|dispute), status (pending|claimed|completed|dispute_resolved|escalated), priority, SLA tracking, claim metadata
- **`humanReviews`** — 3 scores (soundAccuracy, rhythmIntonation, phraseAccuracy), aiAnalysisCorrect, exemplar audio ref, agreesWithOriginal (disputes)
- **`humanReviewFlags`** — Learner dispute flags: reason, status (open|resolved|escalated)
- **`aiCalibration`** — AI vs human score drift per phrase

**`convex/humanReviews.ts`** (~994 lines) — Core workflow engine:
- `queueAttemptForHumanReview` — creates pending request + schedules SLA escalation
- `claimNext` / `releaseClaim` — claim-based work queue with 5-min deadline
- `submitReview` — 3 scores + exemplar; handles initial vs dispute phase
- `flagAttemptReview` — learner disputes; transitions to dispute phase
- `getCurrentClaim`, `getQueueSignal`, `listPendingForLanguage` — queue visibility
- `getAttemptHumanReview`, `getUnseenFeedback`, `listEscalated` — learner/admin queries

**`convex/verifierAccess.ts`** — Profile management, language team membership, stats.

**Trigger:** `convex/attempts.ts` `attachAudio` creates a review request when learner has Pro entitlement.

**Constants:** claim timeout 5min, SLA 24h, dispute agreement tolerance ±1.

## Auth & Authorization

- Shared BetterAuth (email/password) via `@babylon/shared`
- Token flow: BetterAuth cookie → `hooks.server.ts` extracts token → Convex client
- Data-driven authorization (no explicit role field):
  - `verifierProfiles` with `active=true` → is a verifier
  - `verifierLanguageMemberships` with `active=true` → can review that language
- Backend guard: `assertVerifierLanguageAccess()` on all review mutations/queries
- Frontend: `$isAuthenticated` store + `$effect`-based route guards

## Shared Packages

| Package | Used For |
|---------|----------|
| `@babylon/shared` | Auth client, stores, notifications, Convex URL, `cn()` utility |
| `@babylon/convex` | Type-safe Convex function refs (`api`, `Id<>`) |
| `@babylon/ui` | All UI components (Button, Card, Input, Label, Header, DropdownMenu) |
| `convex-svelte` | `useQuery`, `useConvexClient` |

## i18n

Two Paraglide message sources merged:
1. `packages/shared/messages/{en,xh}.json` — nav, auth, buttons
2. `apps/verifier/messages/{en,xh}.json` — 108 keys; verifier-specific UI

Xhosa translations mostly complete; push notification keys still `[TODO]` prefixed.

## Deployment

- **Adapter:** `@sveltejs/adapter-node`
- **Host:** `verifier.schulie.com` (Netlify)
- **CSP:** Allows `wss:` (Convex WebSocket), `blob:`/`data:` (audio), HTTPS images

## Dev

```sh
bun run dev:verifier    # from monorepo root
npx convex dev          # backend (shared with web app)
```
