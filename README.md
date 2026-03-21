# Babylon

Language-learning platform for practising isiXhosa pronunciation. Learners record phrases, get AI feedback (Whisper + Claude), and optionally receive human verification scores. Supports spaced repetition (FSRS), subscription billing (PayFast in ZAR), push notifications, and i18n (English + isiXhosa).

## Architecture

```
apps/web/           → Learner SvelteKit app (practice, library, vocabulary, billing)
apps/verifier/      → Verifier SvelteKit app (review queue, scoring, disputes)
packages/shared/    → Auth client, stores, styles, notifications, provider interfaces
packages/ui/        → shadcn-svelte components (bits-ui + tailwind-variants)
packages/convex/    → Type re-exports from convex/_generated/
convex/             → Serverless backend: 19 tables, ~65 functions, 1 daily cron
```

**Build order (Turbo DAG):**

```
@babylon/convex → @babylon/shared → @babylon/ui → apps/{web,verifier}
```

**Data flow:** Learner records audio → Convex storage → `attempts` → AI pipeline (Whisper transcription → Claude scoring) → `aiFeedback` → optional human review queue → verifier scores + exemplar → dispute resolution → `aiCalibration` drift tracking. All real-time via `convex-svelte`, no REST/GraphQL.

## Backend (Convex)

19 tables across 7 domains:

- **Learning** — `sessions`, `phrases`, `userPhrases` (FSRS), `practiceSessions`, `attempts`, `audioAssets`
- **AI Pipeline** — `aiFeedback`, `aiCalibration`. Attempt → Whisper transcription (45s) → Claude scoring (35s) → scores (sound/rhythm/phrase, 1–5). Race-protected via `aiRunId` claim.
- **Human Verification** — `humanReviewRequests`, `humanReviews`, `humanReviewFlags`, `verifierProfiles`, `verifierLanguageMemberships`. Claim-based queue (5min TTL), 24h SLA auto-escalation, multi-phase dispute resolution (2 additional reviewers, ±1 tolerance, 3-way disagreement → escalation).
- **Billing** — `billingSubscriptions`, `entitlements`, `usageDaily`, `billingEvents`. Dual-table pattern: subscriptions (PayFast provider state) + entitlements (authoritative feature gating). Webhook-driven state machine with event deduplication. Terminal cancellation (no reactivation).
- **User** — `userPreferences` (timezone, locale, push subscription, quiet hours, skin)
- **Notifications** — `scheduledNotifications`. Daily cron (06:00 UTC) reschedules spaced-repetition pushes. Quiet hours respected (default 22:00–08:00).
- **Auth** — Better Auth-managed tables (users, sessions, accounts, verification, rate limits, etc.)

**Tiers:** free (R0, 0 min/day) · ai (R150/mo, 10 min/day) · pro (R500/mo, 15 min/day). Usage resets at local midnight (defaults to Africa/Johannesburg).

**Function types:**
- `query` / `mutation` — V8 isolates (real-time subscriptions, transactional writes)
- `action` (`'use node'`) — Node.js for external APIs: `aiPipeline.ts`, `billingNode.ts`, `notificationsNode.ts`, `translateNode.ts`, `translatePhrase.ts`
- `httpAction` — `/api/auth/*` (Better Auth, CORS), `POST /webhooks/payfast`
- `internalMutation` / `internalQuery` — backend-only, not client-callable

**External services:** Anthropic Claude, OpenAI Whisper, Google Translate, PayFast, Web Push (VAPID), Unsplash

**Utilities (`convex/lib/`):** auth (dual fallback), billing (entitlements, usage tracking, timezone-aware reset), payfast (MD5 signatures via spark-md5), languages (9 supported), phraseCategories (16 keyword-matched), vocabularySets, fetchWithTimeout (retries, abort, error classification), safeErrors (secret redaction, 8 error categories), publicActionGuards (rate limiting)

**Tests:** 11 test files using Vitest + convex-test. Pattern: `convexTest(schema, modules)` fresh in-memory DB per test. Covers: sessions, phrases, attempts, AI pipeline, audio assets, notifications, human review flags, PayFast signatures, billing webhooks, billing dev toggle, fetchWithTimeout.

## Auth

**Better Auth** hosted on Convex via `@convex-dev/better-auth`, shared by both apps. Email/password only (no OAuth). Organization plugin enabled. Configurable email verification (required in prod by default).

**Flow:** Browser → `/api/auth/*` (SvelteKit catch-all) → Convex HTTP action → session cookie → `hooks.server.ts` extracts token via `getToken()` → `event.locals.token` → Convex functions enforce via `getAuthUserId(ctx)` (dual fallback: native identity for tests, Better Auth for production).

**Guards:** Client-side only via `$effect` + `$isAuthenticated` → redirect to `/login`. All domain tables have `userId` + `by_user` index for ownership scoping. Verifiers additionally require active language membership (`assertVerifierLanguageAccess`).

## Frontends

Both apps: SvelteKit 2, Svelte 5 (runes), Tailwind CSS 4, Paraglide i18n, `@sveltejs/adapter-node`. Identical config: svelte.config.js, vite.config.ts, hooks.server.ts, tsconfig.json. Differences are purely in routes and UI.

**Web app** (13 routes): Practice dashboard with audio recording (Web Audio API) + queue modes, phrase library with auto-translation + category grouping, vocabulary flashcards (Unsplash images), translation self-test, theory pages (clicks, noun classes, tone), settings (profile, locale, skin, notifications, billing), PayFast checkout flows. PWA-enabled.

**Verifier app** (7 routes): Verification guide, queue-based work assignment with FAB, 3-dimension scoring (Sound Accuracy / Rhythm & Intonation / Phrase Accuracy, 1–5), AI analysis audit, MediaRecorder exemplar recording, countdown timer for 5-min claim deadline, auto-claim-next on submit, language team management, verifier stats. Authorization is data-driven — no role field, verifier status from `verifierProfiles` + `verifierLanguageMemberships` tables.

**Shared styling:** OKLCh color system with semantic tokens, light/dark mode + `[data-skin="mono"]` grayscale variant. Fonts: Bebas Neue (display) + Public Sans (body). All styles in `packages/shared/src/styles/recall.css` (925 lines). Theme IIFE in `app.html` prevents flash.

**i18n:** Paraglide JS, cookie-only locale (`PARAGLIDE_LOCALE`, no URL prefixes). 3-tier messages: shared (~43 keys), web (~209 keys), verifier (~107 keys). Layout syncs Convex `userPreferences.uiLocale` on mount. Locales: `en`, `xh`.

**UI components** (`packages/ui`): Button, Card, Dialog, Input, Label, Accordion, Alert, DropdownMenu, Header. No i18n — translated strings passed as props.

## Runtime

Four runtime environments:

1. **Bun** (v1.2.2) — package manager, script runner, workspace orchestrator. Bun-specific APIs used in ADW workflows and Claude hooks (`Bun.serve()`, `Bun.spawn()`, `Bun.file()`).
2. **Node.js** — SvelteKit production server via `adapter-node`. Started with `node apps/*/build/index.js`.
3. **Convex** — V8 isolates (queries/mutations, deterministic) + Node.js (`'use node'` actions for external APIs).
4. **Browser** — Service worker (push notifications, notification click handling), PWA manifest.

Runtime detection fallback (`typeof globalThis.Bun`) bridges Bun/Node differences in shared code.

Env vars shared across apps via `envDir: '../..'` in Vite config. Public vars: `PUBLIC_`/`VITE_` prefix. Private: `$env/dynamic/private` or `process.env`.

**Server hooks chain** (both apps): Security headers (HSTS, CSP, nosniff) → Paraglide i18n middleware → Auth token extraction.

## Getting Started

**Prerequisites:** Bun ≥ 1.2.2, Convex account + CLI

```sh
bun install
cp .env.example .env        # fill in required values
bun run hooks:install        # git pre-push hook
```

**Dev:**

```sh
bun run dev                  # web app (port 5173)
bun run dev:verifier         # verifier app (port 5178)
npx convex dev               # backend (watches + deploys)
```

**Build & validate:**

```sh
bun run build                # all packages
bun run check                # svelte-check
bun run test                 # vitest + convex-test
bun run format               # prettier
```

**Convex:**

```sh
npx convex dev --once        # single push (no watch)
bun run convex:deploy        # production deploy
bun run convex:check-generated  # verify codegen is current
```

## Deployment

- **Frontend:** Railway (RAILPACK builder, Node adapter). Both apps produce `build/index.js`. Health checks on `/` (300s timeout, max 3 restarts). Auto-deploy from `main`. Watch patterns include `packages/**` so shared changes trigger redeploy. Config in `apps/*/railway.toml`.
- **Backend:** Convex Cloud (`disciplined-spider-126`). Manual deploy via `bun run convex:deploy`. HTTP routes for auth (CORS) + PayFast webhook. Daily cron at 06:00 UTC.
- **CI:** GitHub Actions — PR/push to `main` → Bun 1.3.9 → `bun install --frozen-lockfile` → typecheck → test → build (matrix: web, verifier). Validation only, no automated deploy.
- **Pre-deploy checks:** `scripts/check-convex-generated.sh`, `scripts/check-lockfile-sync.sh`, `.githooks/pre-push`

## Environment Variables

**Required:**

| Variable | Purpose |
|----------|---------|
| `PUBLIC_CONVEX_URL` | Convex client endpoint |
| `PUBLIC_CONVEX_SITE_URL` | Auth routes + webhooks |
| `SITE_URL` | Better Auth base URL (HTTPS in prod) |
| `BETTER_AUTH_SECRET` | Token signing |

**AI & Services:**

| Variable | Purpose |
|----------|---------|
| `CONVEX_ANTHROPIC_API_KEY` | Claude AI feedback + translation |
| `OPENAI_API_KEY` | Whisper transcription |
| `VITE_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web push notifications |

**Billing (PayFast):**

| Variable | Purpose |
|----------|---------|
| `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` | Merchant credentials |
| `PAYFAST_PASSPHRASE` | Webhook signature (optional) |
| `PAYFAST_RETURN_URL` / `PAYFAST_CANCEL_URL` / `PAYFAST_NOTIFY_URL` | Redirect + webhook URLs |
| `PAYFAST_SANDBOX` | Sandbox mode (default: false) |

**Optional:**

| Variable | Purpose |
|----------|---------|
| `VERIFIER_SITE_URL` | Verifier app origin (cross-origin auth) |
| `GOOGLE_TRANSLATE_API_KEY` | Translation verification (degrades gracefully) |
| `BILLING_DEV_TOGGLE` | Dev tier switching |
| `BILLING_DEV_TOGGLE_ALLOWLIST` | Comma-separated user IDs for dev toggle |

**Feature flags:** `AUTH_REQUIRE_EMAIL_VERIFICATION`, `AUTH_ALLOW_LOCALHOST_ORIGINS`, `AUTH_ALLOW_UNVERIFIED_EMAILS_PROD`, `BILLING_DEV_TOGGLE_ALLOW_PRODUCTION`

## Tech Stack

SvelteKit 2 · Svelte 5 · Tailwind CSS 4 · shadcn-svelte (bits-ui) · Convex · Better Auth · Paraglide JS · PayFast · Bun · Turbo · Vitest · Lucide icons
