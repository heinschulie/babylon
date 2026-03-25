---
date: 2026-03-20T00:00:00+02:00
researcher: Claude
git_commit: 452e5a1
branch: al
repository: babylon
topic: 'Frontend architecture across the Babylon monorepo'
tags: [research, codebase, frontends, sveltekit, svelte5, ui, shared]
status: complete
last_updated: 2026-03-20
last_updated_by: Claude
---

# Research: Frontends

## Research Question

What are the frontend applications, shared packages, component libraries, and build/deploy configuration in the Babylon monorepo?

## Summary

Babylon has **two SvelteKit 2 / Svelte 5 frontend apps** (`apps/web` for learners, `apps/verifier` for human reviewers) sharing a **component library** (`packages/ui`, 46 shadcn-svelte components) and a **shared utilities package** (`packages/shared` — auth, stores, styles, notifications, provider interfaces). Both apps use identical toolchains: Tailwind CSS 4, Paraglide i18n (en/xh), Convex real-time backend, Better Auth, and deploy via Netlify with the SvelteKit Node adapter. Turbo + Bun workspaces orchestrate builds.

## Detailed Findings

### apps/web — Learner Frontend

The main learner-facing app for practising isiXhosa pronunciation.

**Route tree (12 routes):**

| Route | Purpose |
|-------|---------|
| `/` | Practice hub — quick-start, recording, session review, streak |
| `/login` | Email/password sign-in |
| `/register` | Email/password registration |
| `/library` | Add/manage phrases, view unseen feedback |
| `/practice` | Redirect to `/` |
| `/practice/session/[id]` | Read-only historical session review |
| `/reveal/[id]` | 3-step phrase translation quiz |
| `/settings` | Locale, theme, skin, push notifications, subscription tier, profile picture |
| `/theory` | Static isiXhosa language fundamentals (clicks, noun classes, tone) |
| `/vocabulary` | Grid of 15 vocabulary category cards |
| `/vocabulary/[set]` | Flashcard viewer with Unsplash images |
| `/billing/cancel`, `/billing/return` | Stripe checkout callbacks |
| `/api/auth/[...all]` | Better Auth catch-all handler |

**Key features:**
- MediaRecorder-based audio capture with codec negotiation (WebM/Opus > MP4 > OGG)
- Fire-and-forget AI scoring on submit (doesn't block UI)
- Queue modes: once / shuffle / repeat
- Three scoring dimensions: Sound, Rhythm, Phrase
- i18n: 209 keys in `apps/web/messages/en.json`

**Config:**
- `svelte.config.js`: Node adapter, strict CSP
- `vite.config.ts`: Paraglide + Tailwind + SvelteKit plugins
- Env dir at monorepo root

---

### apps/verifier — Reviewer Frontend

Human review tool for scoring learner pronunciation attempts.

**Route tree (6 routes):**

| Route | Purpose |
|-------|---------|
| `/` | Onboarding guide + queue FAB (claim next review) |
| `/login` | Email/password sign-in |
| `/register` | Email/password registration |
| `/settings` | Verifier profile activation, language team, stats, push notifications |
| `/work` | Queue list of pending learner attempts |
| `/work/[id]` | Claim review: scoring (S/R/P), AI analysis audit, exemplar recording, timer |
| `/api/auth/[...all]` | Better Auth catch-all handler |

**Key features:**
- Claim-based work assignment with deadline timer (MM:SS countdown)
- 5-point scoring on same three dimensions (Sound, Rhythm, Phrase)
- AI analysis audit (mark correct/incorrect)
- Exemplar audio recording (verifier records correct pronunciation)
- Dispute review flow (re-review with original scores visible)
- Auto-claim next after submit
- i18n: 107 keys in `apps/verifier/messages/en.json`

**Config:** Identical to web (Node adapter, same Vite plugin stack).

---

### packages/ui — Component Library

46 Svelte 5 components across 9 families, built on **bits-ui** primitives + **tailwind-variants**.

| Family | Components | Pattern |
|--------|-----------|---------|
| `button` | 1 | Styled with `tv()` variants (6 variants, 6 sizes) |
| `card` | 7 | Layout wrappers (Root, Header, Content, Title, Description, Footer, Action) |
| `dialog` | 10 | bits-ui wrappers (Portal, Content, Overlay, Close, etc.) |
| `dropdown-menu` | 14 | bits-ui wrappers (Trigger, Content, Item, Sub, Checkbox, Radio, etc.) |
| `accordion` | 4 | bits-ui wrappers (Root, Item, Trigger, Content) |
| `alert` | 3 | Styled with `tv()` variants (default, destructive) |
| `input` | 1 | Generic with file/text split via generics |
| `label` | 1 | Simple wrapper |
| `header` | 1 | App-specific; auth-aware, uses SvelteKit nav + `@babylon/shared` |

**Conventions:**
- Svelte 5 runes: `$props()`, `$bindable()`, `{@render children?.()}`
- `data-slot="name"` attributes for CSS targeting
- Dual exports: `Root` + semantic name (e.g., `Button`, `CardContent`)
- No i18n — all translated strings passed as props
- `cn()` from `@babylon/shared/utils` for class merging

---

### packages/shared — Shared Utilities

Centralised auth, state, styling, and provider abstractions for both apps.

**Exports:**

| Module | Purpose |
|--------|---------|
| `./auth-client` | Better Auth client (org + Convex plugins) |
| `./convex` | ConvexClient singleton from `PUBLIC_CONVEX_URL` |
| `./stores/auth` | Reactive stores: `session`, `isAuthenticated`, `isLoading`, `user` |
| `./notifications` | Push subscription: `requestNotificationPermission()`, `getSubscription()` |
| `./providers/{llm,stt,tts}` | Abstract interfaces for AI/voice providers + noop fallbacks |
| `./styles/*` | `recall.css` — full design system (925 lines) |
| `./utils` | `cn()` class merger + TypeScript type helpers |

**i18n:** 43 shared keys (nav, auth, buttons, state, errors, aria labels) in `packages/shared/messages/{en,xh}.json`.

**Design system (`recall.css`):**
- Imports Tailwind 4 + tw-animate-css
- OKLch colour space; light/dark modes + "mono" skin variant
- Typography: Bebas Neue (display), Public Sans (body)
- Component classes: `.page-shell`, `.target-phrase`, `.practice-session`, `.practice-record-btn`, `.vocab-*`, `.streak-display`, `.feedback-banner`, `.practice-fab`
- `@source` scans `packages/ui` for Tailwind class detection

---

### Build & Deploy

**Orchestration:** Turbo + Bun workspaces (`apps/*`, `packages/*`)

**Scripts:**
```
bun run dev             → turbo dev --filter=@babylon/web
bun run dev:verifier    → turbo dev --filter=@babylon/verifier
bun run build           → turbo build (all)
bun run check           → svelte-check across apps
npx convex dev          → backend with file watching
```

**Build pipeline (turbo.json):**
- `build`: depends on `^build` (upstream first), outputs `build/`, `.svelte-kit/`, `dist/`
- `dev`: persistent, non-cached
- `check`, `lint`, `format`, `test`: depend on upstream equivalents

**TypeScript:** Strict mode, `moduleResolution: bundler`, extends `.svelte-kit/tsconfig.json`

**Deployment:** Netlify — both apps use `@sveltejs/adapter-node`. No `netlify.toml` files (configured via Netlify UI). `.netlify/` artifact directories present.

**Tailwind CSS 4:** No standalone config file — configured inline via `@tailwindcss/vite` plugin + `recall.css` theme block.

## Code References

- `apps/web/svelte.config.js` — Node adapter, CSP
- `apps/web/vite.config.ts` — Paraglide + Tailwind + SvelteKit
- `apps/web/src/routes/+layout.svelte` — Root layout: Convex, auth, i18n sync
- `apps/web/src/routes/+page.svelte` — Practice hub (recording, sessions, streak)
- `apps/web/src/lib/vocabularySets.ts` — 15 categories, ~120 items
- `apps/web/messages/en.json` — 209 i18n keys
- `apps/verifier/src/routes/+layout.svelte` — Root layout (mirrors web pattern)
- `apps/verifier/src/routes/work/[id]/+page.svelte` — Claim review (scoring, timer, exemplar recording)
- `apps/verifier/messages/en.json` — 107 i18n keys
- `packages/ui/src/index.ts` — Component barrel export
- `packages/ui/src/components/button/button.svelte` — tailwind-variants pattern
- `packages/ui/src/components/header/Header.svelte` — Auth-aware app header
- `packages/shared/src/auth-client.ts` — Better Auth client singleton
- `packages/shared/src/stores/auth.ts` — Reactive session/user stores
- `packages/shared/src/styles/recall.css` — 925-line design system
- `packages/shared/src/notifications.ts` — Push notification utilities
- `packages/shared/src/providers/{llm,stt,tts}.ts` — Abstract AI/voice provider interfaces
- `packages/shared/messages/en.json` — 43 shared i18n keys
- `turbo.json` — Build pipeline configuration
- `package.json` (root) — Workspace scripts

## Architecture Documentation

**Pattern: Two apps, shared core.** Both SvelteKit apps are structurally identical (same adapter, plugins, auth flow, Convex setup, i18n strategy). They diverge only in routes and domain logic. Shared packages prevent duplication of auth, state, styling, and UI components.

**Pattern: Props-based i18n in UI components.** `packages/ui` has no Paraglide compilation — translated strings flow down as props from app layouts. Three i18n message scopes (shared, web, verifier) with Paraglide compiling per-app.

**Pattern: Cookie-only locale strategy.** No URL prefixes for locale. Cookie set by `setLocale()`, synced from Convex user preferences on layout mount.

**Pattern: Convex-first data layer.** No REST/GraphQL — all data via `useQuery()` / `useConvexClient()` for real-time reactivity. Auth tokens extracted server-side and passed to Convex.

**Pattern: Claim-based work assignment (verifier).** Verifiers claim items from a queue with deadline timers. Auto-claim-next on submit keeps reviewers in flow.

**Pattern: Fire-and-forget AI scoring (web).** Audio submissions trigger AI processing via `client.action()` without blocking UI. Pending counter tracks in-flight results.

## Open Questions

- No `netlify.toml` files found — deploy config managed entirely via Netlify UI?
- `packages/ui` Header component depends on SvelteKit (`$app/*`) and `@babylon/shared` — should it live in ui or in shared/app layer?
- Provider interfaces (LLM/STT/TTS) defined in shared but implementations not visible in frontend code — where are concrete implementations?
