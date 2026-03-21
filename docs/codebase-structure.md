---
date: 2026-03-21T00:00:00+02:00
researcher: Claude
git_commit: 452e5a1
branch: al
repository: babylon
topic: 'Codebase Structure'
tags: [research, codebase, monorepo, sveltekit, convex]
status: complete
last_updated: 2026-03-21
last_updated_by: Claude
---

# Research: Codebase Structure

## Research Question

Full codebase structure of the Babylon monorepo.

## Summary

Babylon is a **Bun + Turborepo monorepo** for a language-learning platform (English ↔ isiXhosa). It has 2 SvelteKit frontends (learner + verifier), 3 shared packages (convex types, UI components, auth/utils), and a Convex serverless backend with 19 database tables. The platform features audio recording practice, AI-powered pronunciation scoring (Whisper + Claude), human verifier review queues, spaced repetition (FSRS), PayFast billing (ZAR), and full i18n via Paraglide JS.

## Detailed Findings

### Top-Level Directory Structure

```
babylon/
├── apps/
│   ├── web/              — Learner SvelteKit app
│   └── verifier/         — Verifier SvelteKit app
├── packages/
│   ├── shared/           — Auth, stores, styles, utils, providers
│   ├── ui/               — shadcn-svelte components (bits-ui)
│   └── convex/           — Convex type re-exports
├── convex/               — Backend: schema, mutations, queries, actions
├── .claude/              — Claude AI config & commands
├── .github/workflows/    — CI (ci.yml)
├── .githooks/            — Git hooks
├── adws/                 — ADW workflow definitions
├── agents/               — AI agent configs
├── ai_docs/              — AI documentation
├── docs/                 — 9 architecture research docs
├── scripts/              — Shell utilities
├── specs/                — Feature specs
├── temp/                 — Temporary files
├── package.json          — Root workspace (bun workspaces)
├── turbo.json            — Turborepo task config
├── convex.json           — Convex config (functions: "convex/")
├── justfile              — Just recipes
└── .env.example          — Env var template
```

### Workspace Dependency Graph

```
apps/web (@babylon/web)
  ├── @babylon/convex
  ├── @babylon/shared
  └── @babylon/ui

apps/verifier (@babylon/verifier)
  ├── @babylon/convex
  ├── @babylon/shared
  └── @babylon/ui

packages/shared (@babylon/shared)
  └── better-auth, convex, clsx, tailwind-merge

packages/ui (@babylon/ui)
  ├── bits-ui, tailwind-variants, @lucide/svelte
  └── @babylon/shared (peer)

packages/convex (@babylon/convex)
  └── re-exports from convex/_generated/
```

### apps/web — Learner Frontend

SvelteKit 2, Svelte 5, Tailwind 4, Node adapter.

**Routes:**

| Route | Purpose |
|-------|---------|
| `/` | Practice hub — start sessions, streak, recent sessions |
| `/practice?run=[id]` | Active recording session (Web Audio API) |
| `/practice/session/[id]` | Session review with AI scores + verifier feedback |
| `/library` | Phrase management by category |
| `/vocabulary`, `/vocabulary/[set]` | Browse vocab sets |
| `/theory` | Educational content |
| `/settings` | Locale, skin, push notifications, quiet hours |
| `/login`, `/register` | Auth pages |
| `/billing/{cancel,return}` | Payment flow |
| `/api/auth/[...all]` | BetterAuth proxy |

**Key files:**
- `src/routes/+layout.svelte` — Convex + auth init, Header, locale/skin sync
- `src/routes/+page.svelte` — ~800 lines, main practice flow (recording, playback, review)
- `src/hooks.server.ts` — Security headers → i18n → auth middleware chain
- `src/lib/server/auth.ts` — BetterAuth server config
- `messages/{en,xh}.json` — 209 keys each

### apps/verifier — Verifier Frontend

Same stack as web. Separated app for audio review/verification role.

**Routes:**

| Route | Purpose |
|-------|---------|
| `/` | Verification guide + pending-count FAB |
| `/work` | Pending review queue |
| `/work/[id]` | Scoring UI (audio, 3-axis scoring grid, exemplar recorder, timer) |
| `/settings` | Profile activation, language, push, stats |
| `/login`, `/register` | Auth |

**Key files:**
- `src/routes/work/[id]/+page.svelte` — 350+ lines, core scoring component
- `messages/{en,xh}.json` — 107 keys each (11 xh marked `[TODO]`)

### packages/shared

**Exports:**
- `./auth-client` — `authClient` (better-auth/svelte + convexClient plugin)
- `./stores/auth` — `session`, `isAuthenticated`, `isLoading`, `user` stores
- `./convex` — `convexClient`, `CONVEX_URL`
- `./utils` — `cn()` (clsx + tailwind-merge), type helpers
- `./providers` — STT/LLM/TTS provider interfaces + Noop defaults
- `./notifications` — Push notification helpers (subscribe, permission)
- `./styles/recall.css` — Global theming (OKLch colors, mono skin, utility classes)
- `messages/{en,xh}.json` — 43 shared keys (nav, auth, buttons, state, errors)

### packages/ui

9 shadcn-svelte components: **button, card, dialog, input, label, accordion, alert, dropdown-menu, header**. Built on bits-ui + tailwind-variants. No i18n — translated strings passed as props.

### packages/convex

Single re-export bridge:
```typescript
export { api } from '../../../convex/_generated/api';
export type { DataModel, Doc, Id } from '../../../convex/_generated/dataModel';
```

### Convex Backend

19 database tables, ~70 functions across mutations/queries/actions.

**Schema tables:** sessions, phrases, userPhrases (FSRS), audioAssets, attempts, practiceSessions, verifierProfiles, verifierLanguageMemberships, humanReviewRequests, humanReviews, humanReviewFlags, aiFeedback, aiCalibration, userPreferences, billingSubscriptions, entitlements, usageDaily, billingEvents, scheduledNotifications.

**Key modules:**
- `aiPipeline.ts` — Whisper transcription + Claude feedback (Node action)
- `humanReviews.ts` — Verifier queue, claim lifecycle, dispute resolution
- `billing.ts` + `billingNode.ts` — PayFast integration, 3 tiers (free/ai R150/pro R500)
- `notifications.ts` + `notificationsNode.ts` — Push notification scheduling
- `translateNode.ts` — Google Translate action
- `lib/` — Auth helpers, billing constants, language validation, phrase categorization, PayFast, safe errors

**Auth:** BetterAuth + `@convex-dev/better-auth` plugin, email/password, organization plugin, `getAuthUserId()` helper resolves identity.

**Tests:** 11 test files using vitest + convex-test: sessions, phrases, attempts, aiPipeline, audioAssets, notifications, humanReviewFlags, payfast, billingDevToggle, billingWebhooks, fetchWithTimeout.

### CI/CD & Deployment

- **CI:** GitHub Actions (`ci.yml`) — PR + push to main, Bun 1.3.9, matrix test (web + verifier), typecheck → test → build
- **Deploy:** Railway (Node adapter, RAILPACK builder), Convex Cloud (manual `bun run convex:deploy`)
- **PWA:** Both apps have manifest.json + service worker stubs

### i18n Architecture

Paraglide JS with cookie-only locale strategy. 3 message locations:
- `packages/shared/messages/` — 43 shared keys
- `apps/web/messages/` — 209 app-specific keys
- `apps/verifier/messages/` — 107 verifier-specific keys

Locales: `en`, `xh`. Compiled to `src/lib/paraglide/` at build time.

## Code References

- `package.json:1` — Root workspace definition (bun workspaces)
- `turbo.json:1` — Build task orchestration
- `convex/schema.ts:1` — Complete 19-table database schema
- `convex/auth.ts:1` — BetterAuth + Convex setup
- `convex/aiPipeline.ts:1` — AI scoring pipeline
- `apps/web/src/routes/+page.svelte:1` — Main practice UI (~800 lines)
- `apps/web/src/routes/+layout.svelte:1` — Root layout (auth, convex, locale sync)
- `apps/web/src/hooks.server.ts:1` — Middleware chain
- `apps/verifier/src/routes/work/[id]/+page.svelte:1` — Core scoring UI
- `packages/shared/src/auth-client.ts:1` — Auth client singleton
- `packages/shared/src/styles/recall.css:1` — Global theming
- `packages/ui/src/components/` — 9 shadcn-svelte components
- `packages/convex/src/index.ts:1` — Type bridge to generated API
- `.github/workflows/ci.yml:1` — CI pipeline

## Architecture Documentation

**Patterns:**
- Monorepo with Bun workspaces + Turbo for task orchestration
- Convex-first backend — no REST/GraphQL, all logic in Convex functions
- Shared auth client instantiated once in `@babylon/shared`, consumed by both apps
- UI components are i18n-agnostic — translated strings passed as props from app layouts
- Cookie-only locale strategy (no URL prefixes)
- Dual-table billing pattern: `billingSubscriptions` (provider state) + `entitlements` (authoritative access)
- FSRS spaced repetition via `userPhrases` table
- Human review lifecycle: pending → claimed → completed, with dispute phase support

## Open Questions

None — comprehensive structure documented.
