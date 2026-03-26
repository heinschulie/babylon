---
date: 2026-03-25T00:00:00+02:00
researcher: Claude
git_commit: 4a209d8
branch: hein/feature/issue-61
repository: babylon
topic: 'Codebase Structure'
tags: [research, codebase, monorepo, architecture]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: Codebase Structure

## Research Question

Full codebase structure of the Babylon monorepo — packages, apps, backend, config, tests, docs.

## Summary

Babylon is a Bun + Turbo monorepo for a language-learning platform (English ↔ isiXhosa). Two SvelteKit 2 apps (`web` for learners, `verifier` for reviewers) share three internal packages (`shared`, `ui`, `convex`). The Convex serverless backend has 22 tables, ~35 mutations, ~25 queries, and ~5 Node.js actions covering learning sessions, audio recording, AI feedback (Whisper + Claude), human review queues, billing (Payfast), and push notifications. An `adws/` directory holds agentic dev workflow tooling.

## Detailed Findings

### Monorepo Root

**Package manager:** Bun 1.2.2 (engine-strict)
**Build orchestration:** Turbo 2.5.8 — cached `build`, `check`, `lint`, `test`; persistent `dev`
**Key root files:**
- `package.json` — workspace globs: `apps/*`, `packages/*`
- `turbo.json` — task pipeline & caching
- `convex.json` — Convex functions dir
- `justfile` — task runner for dev workflows
- `tunnel.config.json` — Cloudflare Tunnel config
- `.prettierrc` — shared formatting (useTabs, singleQuote)
- `.npmrc` — engine-strict=true
- `.github/workflows/ci.yml` — PR/push validation

---

### apps/web (Learner App)

**Stack:** SvelteKit 2 + Svelte 5 + Node adapter + Tailwind 4 + bits-ui
**i18n:** Paraglide (en + xh, cookie strategy, 209 message keys)
**PWA:** manifest.json, sw.js, app icons

**Routes (15):**

| Route | Purpose |
|-------|---------|
| `/` | Home |
| `/login`, `/register` | Auth |
| `/library` | Phrase library |
| `/practice`, `/practice/session/[id]` | Practice sessions |
| `/vocabulary`, `/vocabulary/[set]` | Vocabulary sets (16 hardcoded) |
| `/theory` | Grammar/theory |
| `/test` | Assessment |
| `/session/[id]` | Session detail |
| `/reveal/[id]` | Phrase reveal |
| `/settings` | User preferences |
| `/billing/cancel`, `/billing/return` | Billing flows |
| `/api/auth/[...all]` | BetterAuth catch-all |

**Hooks (server only):** security headers → Paraglide i18n → BetterAuth token extraction

**src/lib modules:**
- `server/auth.ts` — BetterAuth factory
- `vocabularySets.ts` — 16 vocabulary sets (colors, numbers, animals, etc.)
- `paraglide/` — generated i18n runtime (gitignored)
- `components/`, `stores/`, `hooks/`, `assets/` — empty placeholders

---

### apps/verifier (Reviewer App)

**Stack:** identical to web (SvelteKit 2, Node adapter, Tailwind, Paraglide)

**Routes (8):**

| Route | Purpose |
|-------|---------|
| `/` | Verifier guide & claims queue |
| `/login`, `/register` | Auth |
| `/work` | Pending review queue |
| `/work/[id]` | Single claim (recording, scoring, exemplar) |
| `/settings` | Verifier onboarding, language activation, notifications |
| `/billing/*` | Billing flows |
| `/api/auth/[...all]` | BetterAuth catch-all |

**Key difference from web:** verifier-specific Convex calls (verifierAccess, humanReviews, notificationsNode). No local components or stores — uses `@babylon/ui` and Convex reactivity directly.

---

### packages/shared

**Exports:**
- `./utils` — `cn()` (clsx + tailwind-merge), `Without*` utility types
- `./auth-client` — BetterAuth client (organization + convex plugins)
- `./convex` — ConvexClient singleton + CONVEX_URL
- `./stores/auth` — `session`, `isAuthenticated`, `isLoading`, `user` stores
- `./notifications` — push subscription helpers (VAPID)
- `./providers` — STT, LLM, TTS provider interfaces + Noop implementations
- `./styles/*` — shared CSS (recall.css)

**i18n messages:** 43 keys (nav, auth, buttons, states, errors, ARIA) in en + xh

---

### packages/ui

**9 shadcn-svelte components** (subpath exports):
- `button`, `card` (7 sub-components), `dialog` (10 sub-components), `input`, `label`, `accordion` (4 sub-components), `alert` (3 sub-components), `dropdown-menu` (16 sub-components), `header`
- Header imports from `@babylon/shared` (auth-client, stores/auth)
- No i18n — expects translated strings as props

---

### packages/convex

Thin wrapper re-exporting Convex-generated types: `api`, `DataModel`, `Doc`, `Id`

---

### Convex Backend (22 tables, 60+ functions)

**Schema tables:**

| Table | Purpose |
|-------|---------|
| sessions | Learning sessions (one/day/user) |
| phrases | Phrases in sessions or library |
| userPhrases | Per-user FSRS learning state |
| audioAssets | Audio recordings (object storage) |
| attempts | User recording attempts |
| practiceSessions | Practice runs with aggregates |
| verifierProfiles | Verifier profile snapshots |
| verifierLanguageMemberships | Verifier language assignments |
| humanReviewRequests | Human review queue |
| humanReviews | Submitted reviews |
| humanReviewFlags | Learner flags on reviews |
| aiFeedback | AI feedback per attempt |
| aiCalibration | AI vs human score calibration |
| userPreferences | Notification & UI prefs |
| billingSubscriptions | Payfast billing state |
| entitlements | Effective billing tiers |
| usageDaily | Daily usage tracking |
| billingEvents | Billing audit log |
| scheduledNotifications | Spaced repetition notifications |
| testTable | Test/emoji table |

**Function groups:**
- **sessions.ts** — CRUD + date lookup
- **phrases.ts** — CRUD + category grouping + auto-translation trigger
- **attempts.ts** — create, attach audio, mark failed; triggers AI pipeline + human review
- **audioAssets.ts** / **audioUploads.ts** — storage + upload URL generation (billing-gated)
- **practiceSessions.ts** — start/end sessions, streak tracking
- **preferences.ts** — get/upsert user prefs, profile image upload
- **notifications.ts** / **notificationsNode.ts** — spaced repetition scheduling, push notifications, verifier alerts
- **humanReviews.ts** — claim/release/submit review queue, flagging, escalation
- **verifierAccess.ts** — verifier profile management, language memberships, stats
- **aiPipeline.ts** — Whisper transcription + Claude feedback (Node.js action)
- **translatePhrase.ts** — Claude-powered English→isiXhosa translation (Node.js action)
- **aiFeedback.ts** / **aiCalibration.ts** — AI feedback storage + calibration tracking
- **billing.ts** / **billingSubscriptions.ts** / **billingNode.ts** / **billingEvents.ts** — Payfast integration, entitlements, webhooks

**HTTP routes:** Payfast webhook + BetterAuth routes
**Cron:** daily 6AM UTC — reschedule spaced repetition notifications

**Lib utilities:** auth, billing, languages, payfast, phraseCategories, fetchWithTimeout, safeErrors, vocabularySets, publicActionGuards

---

### Tests (20 files)

**Convex tests (13):** sessions, phrases, attempts, audioAssets, aiPipeline, notifications, humanReviewFlags, billing (dev toggle + webhooks), payfast, fetchWithTimeout, testEmojiMutation
**ADWS tests (7):** agents, health-check, model-selection, parse-blockers, review-utils, step-recorder, webhook
**Web app tests (2):** auth store, test page

**Config:** per-app `vitest.config.ts` — edge-runtime for Convex, jsdom for browser code

---

### Documentation

**docs/ (9 files):** auth, backend, billing, codebase-structure, deployment, frontends, runtime, verifier, web
**.claude/ (35 commands, 7 skills, 4 expert files, 1 agent)**
**temp/ (11 research docs, 6 specs, 1 plan, build artifacts)**

---

### ADWS (Agentic Dev Workflows)

Exists at `/adws/` — TypeScript-based agentic workflow tooling with its own tsconfig and test suite. Referenced by root `adw:*` scripts.

## Code References

- `package.json:1` — Workspace config, scripts
- `turbo.json:1` — Build pipeline
- `convex/schema.ts:1` — 22-table schema
- `convex/http.ts:1` — HTTP routes (Payfast webhook + auth)
- `convex/crons.ts:1` — Daily spaced repetition cron
- `apps/web/src/routes/` — 15 learner routes
- `apps/verifier/src/routes/` — 8 verifier routes
- `packages/shared/src/` — Auth client, stores, providers, utils
- `packages/ui/src/components/` — 9 shadcn-svelte components
- `packages/convex/src/index.ts` — Type re-exports
- `.github/workflows/ci.yml` — CI pipeline

## Architecture Documentation

**Dependency graph:**
```
apps/web ──┐
            ├── @babylon/shared (auth, stores, providers, utils)
apps/verifier ┘    │
                   ├── @babylon/ui (shadcn-svelte components)
                   │      └── depends on @babylon/shared
                   └── @babylon/convex (type re-exports)
                          └── wraps convex/_generated/*
```

**Key patterns:**
- Bun workspace protocol (`workspace:*`) for internal deps
- Turbo caching with transitive dependency awareness
- Cookie-based i18n (Paraglide) — no URL prefixes
- BetterAuth + Convex auth (organization plugin)
- Svelte 5 runes everywhere — no legacy reactivity
- UI package is i18n-agnostic — translated strings passed as props
- Provider interfaces (STT, LLM, TTS) with Noop defaults for progressive rollout
- Billing gates on audio upload (Payfast subscriptions)
- AI pipeline: Whisper STT → Claude LLM feedback → optional human review

## Open Questions

None — comprehensive structure documented.
