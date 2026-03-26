---
date: 2026-03-25T00:00:00+02:00
researcher: Claude
git_commit: 4a209d8
branch: hein/feature/issue-61
repository: babylon
topic: 'Verifier app — full architecture and codebase research'
tags: [research, codebase, verifier, human-review, convex, sveltekit]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: Verifier App

## Research Question

Comprehensive research of the verifier app — structure, backend, UI, shared dependencies, and workflows.

## Summary

The verifier is a standalone SvelteKit 2 app (`apps/verifier/`) for human reviewers who score learner pronunciation attempts. It shares a Convex backend, auth system, and UI library with the main web app but deploys independently via Node adapter. The core workflow: learners submit audio → system queues for human review → verifiers claim items (5-min deadline) → score on 3 dimensions + record exemplar audio → learners can dispute → 2 more verifiers arbitrate. Currently hardcoded to isiXhosa (`xh-ZA`) only.

## Detailed Findings

### App Structure & Routes

6 pages + 1 API route:

| Route | Purpose |
|---|---|
| `/` | Guide page — verification approach, scoring dimensions, FAB to claim work |
| `/login` | Email/password login via Better Auth |
| `/register` | Account creation |
| `/work` | Queue listing — pending reviews with phrase metadata |
| `/work/[id]` | Claim detail — audio playback, 3-dimension scoring (1-5), AI analysis review, exemplar recording, 5-min timer |
| `/settings` | Profile activation, stats, language team, push notifications, locale/skin prefs |
| `/api/auth/[...all]` | Better Auth catch-all handler |

Config: Node adapter (not Netlify adapter), Paraglide i18n (cookie strategy), Tailwind CSS 4, CSP headers.

### Convex Backend — Schema

5 verification tables in `convex/schema.ts`:

- **`verifierProfiles`** (L102-112) — userId, firstName, profileImageUrl, active
- **`verifierLanguageMemberships`** (L114-124) — userId, languageCode (BCP 47), active
- **`humanReviewRequests`** (L129-159) — Queue lifecycle; fields: attemptId, phraseId, learnerUserId, languageCode, phase (initial|dispute), status (pending|claimed|completed|dispute_resolved|escalated), priority, SLA tracking, claim metadata. 6 compound indexes.
- **`humanReviews`** (L162-181) — Submitted reviews; 3 scores (soundAccuracy, rhythmIntonation, phraseAccuracy), aiAnalysisCorrect, exemplar audio ref, agreesWithOriginal (disputes)
- **`humanReviewFlags`** (L184-196) — Learner dispute flags; reason, status (open|resolved|escalated)
- **`aiCalibration`** (L213-223) — AI vs human score drift per phrase

### Convex Backend — Functions

**`convex/verifierAccess.ts`** (135 lines):
- `upsertMyProfile` — mutation; set firstName + profileImageUrl
- `setMyLanguageActive` — mutation; activate language team membership
- `getMyVerifierState` — query; profile + active languages
- `listSupportedLanguages` — query; BCP 47 codes
- `getMyStats` — query; totalReviews + todayReviews

**`convex/humanReviews.ts`** (994 lines) — the core workflow engine:

| Function | Type | Purpose |
|---|---|---|
| `queueAttemptForHumanReview` | internal mutation | Creates pending request + schedules SLA escalation |
| `claimNext` | mutation | Verifier claims next pending item; 5-min deadline; dispute rotation (blocks original reviewer) |
| `releaseClaim` | mutation | Release claim back to pending |
| `submitReview` | mutation | Submit 3 scores + exemplar; handles initial vs dispute phase |
| `flagAttemptReview` | mutation (learner) | Creates dispute flag; transitions request to dispute phase |
| `getCurrentClaim` | query | Active claim for verifier |
| `getQueueSignal` | query | Pending count for language |
| `listPendingForLanguage` | query | Up to 50 pending items with phrase metadata |
| `getAttemptHumanReview` | query (learner) | Full review state incl. median scores from all reviews |
| `getUnseenFeedback` | query (learner) | First unseen completed request |
| `listEscalated` | query | All escalated requests |

Helpers: `scoresAreValid()` (1-5 range), `agreesWithOriginal()` (±1 tolerance), `medianOf()`, `updateAiCalibration()`, `reclaimExpiredClaims()`, `escalateExpiredSla()`.

**Trigger:** `convex/attempts.ts` L315-354 — `attachAudio` creates humanReviewRequest when learner has Pro entitlement.

### State Machine

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

### Auth Integration

- **Server hooks** (`src/hooks.server.ts`): security headers → i18n middleware → Better Auth token extraction
- **Server auth** (`src/lib/server/auth.ts`): minimal Better Auth instance; trusts localhost dev ports + `VERIFIER_SITE_URL`
- **Layout** (`+layout.svelte`): `setupConvex()` + `createSvelteAuthClient()` + preference syncing
- **Stores** (`packages/shared/src/stores/auth.ts`): `session`, `isAuthenticated`, `isLoading`, `user` — all derived from `authClient.useSession()`
- **Route guards**: `$effect` in each page redirects to `/login` if not authenticated
- **Auth config** (`convex/auth.ts`): trusts both main app and verifier origins

### Shared Package Dependencies

From `packages/shared/`:
- `./auth-client` — BetterAuth client with Convex plugin
- `./stores/auth` — reactive auth stores
- `./convex` — ConvexClient init
- `./notifications` — Web Push (VAPID, service worker registration)
- `./utils` — `cn()` for CSS class merging

From `packages/ui/`:
- Button, Card (Root/Header/Title/Description/Content/Footer), Input, Label, Header, DropdownMenu

### i18n

Two message sources merged by Paraglide:
1. `packages/shared/messages/{en,xh}.json` — nav, auth, buttons
2. `apps/verifier/messages/{en,xh}.json` — 108 keys; verifier guide, scoring, claim UI, settings, work queue, time helpers

Xhosa translations mostly complete; push notification keys still `[TODO]` prefixed.

### Audio Recording & Upload

MediaRecorder API with MIME fallbacks (`audio/webm`, `audio/mp4`, `audio/ogg`). Upload flow:
1. `generateUploadUrlForVerifier` → signed URL
2. POST blob to URL
3. `audioAssets.create` → register asset
4. `submitReview` with `exemplarAudioAssetId`

### Deployment

- Adapter: `@sveltejs/adapter-node`
- Turbo scripts: `dev:verifier`, `build:verifier`, `preview:verifier`
- Allowed host: `verifier.schulie.com`
- Env dir: workspace root (shares `.env` with monorepo)
- Independent Netlify deployment (own `.netlify/` directory)

## Code References

- `convex/schema.ts:102-223` — All verification-related tables
- `convex/humanReviews.ts:1-994` — Full review workflow engine
- `convex/verifierAccess.ts:1-135` — Verifier profile & language management
- `convex/attempts.ts:315-354` — Review queue trigger on audio attachment
- `convex/auth.ts:21-23,51,65,77,108-109` — Verifier origin trust
- `apps/verifier/src/routes/+layout.svelte:1-72` — Root layout, Convex + auth + prefs
- `apps/verifier/src/routes/+page.svelte:1-124` — Guide/home page
- `apps/verifier/src/routes/work/+page.svelte:1-142` — Queue listing
- `apps/verifier/src/routes/work/[id]/+page.svelte:1-392` — Core review UI
- `apps/verifier/src/routes/settings/+page.svelte:1-236` — Profile & preferences
- `apps/verifier/src/hooks.server.ts:1-48` — Security + i18n + auth middleware
- `apps/verifier/src/lib/server/auth.ts:1-27` — Server-side Better Auth config
- `packages/shared/src/stores/auth.ts:1-25` — Auth stores
- `packages/shared/src/notifications.ts:1-59` — Push notification utilities
- `packages/ui/src/components/header/Header.svelte:1-109` — Shared header component

## Architecture Documentation

**Patterns:**
- Convex-first — no REST/GraphQL; all data through Convex queries/mutations
- Claim-based work queue with time-boxed claims (5 min) and SLA escalation (24h)
- Dispute resolution requires 2 independent reviews with ±1 score tolerance for agreement
- AI calibration tracking as a feedback loop between AI and human scores
- Component state via Svelte 5 runes (`$state`, `$derived`, `$effect`); no external state management
- Auth stores shared across apps via workspace package
- i18n via Paraglide with merged shared + app-specific message files
- Push notifications for learner feedback delivery

**Conventions:**
- All routes use `$effect`-based auth guards (redirect to `/login`)
- CSS uses shared `recall.css` stylesheet + BEM-like class names (`page-shell`, `practice-session__header`)
- Language hardcoded to `xh-ZA` in multiple places (guide page FAB, settings language filter)
- Exemplar recording required before review submission

## Open Questions

- Why Node adapter if deploying to Netlify? Netlify adapter exists.
- Routes `/billing`, `/practice`, `/session`, `/reveal` found in route dir — what are these? Active or stale?
- Escalated reviews have no resolution UI — handled manually?
- Only 1 language supported (`xh-ZA`) — what's the plan for multi-language?
