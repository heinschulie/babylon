---
date: 2026-03-21T00:00:00+02:00
researcher: Claude
git_commit: 452e5a1
branch: al
repository: babylon
topic: 'apps/web application architecture'
tags: [research, codebase, web, sveltekit, convex, auth, i18n]
status: complete
last_updated: 2026-03-21
last_updated_by: Claude
---

# Research: apps/web Application Architecture

## Research Question

Comprehensive research of the `apps/web` application — structure, routing, components, data flow, auth, i18n, styling, and configuration.

## Summary

`apps/web` is a Xhosa language learning SPA built with SvelteKit 2 (Svelte 5 runes), Tailwind CSS 4, and Convex as the serverless backend. It features audio-based practice sessions with AI feedback, a phrase library, vocabulary flashcards, theory content, billing, and settings. Auth via BetterAuth + Convex. i18n via Paraglide JS (en/xh, cookie-only strategy). Theming supports dark mode + mono skin variant. Deployed via Node adapter (Netlify).

## Detailed Findings

### 1. Directory Structure

```
apps/web/
├── package.json, svelte.config.js, vite.config.ts, tsconfig.json
├── vitest.config.ts, eslint.config.js, components.json
├── project.inlang/settings.json        # Paraglide config
├── messages/{en,xh}.json               # App-specific i18n (209 keys)
├── static/                              # PWA assets, manifest, sw.js
└── src/
    ├── app.html                         # Shell: dark mode script, fonts, PWA
    ├── app.css                          # Single import of shared styles
    ├── app.d.ts                         # App-level type declarations
    ├── hooks.server.ts                  # Security headers → i18n → auth middleware
    ├── lib/
    │   ├── server/auth.ts               # BetterAuth server config
    │   ├── vocabularySets.ts            # Hardcoded vocab data (colors, numbers)
    │   ├── paraglide/                   # Generated i18n runtime (gitignored)
    │   └── index.ts
    └── routes/                          # All page routes (below)
```

### 2. Routing Map

| Route | File | Purpose |
|-------|------|---------|
| `/` | `+page.svelte` (~800 lines) | Practice hub: phrase queue, audio recording, session history, streak |
| `/login` | `+page.svelte` | Email/password login form |
| `/register` | `+page.svelte` | Email/password registration form |
| `/library` | `+page.svelte` | Phrase library grouped by category, add phrases, billing status |
| `/vocabulary` | `+page.svelte` | Vocabulary set grid (colors, numbers, etc.) |
| `/vocabulary/[set]` | `+page.svelte` | Flashcard carousel with Unsplash images |
| `/theory` | `+page.svelte` | Xhosa linguistics guide (clicks, noun classes, tone) |
| `/reveal/[id]` | `+page.svelte` | Translation quiz for a single phrase |
| `/session/[id]` | `+page.svelte` | Legacy session editor/viewer |
| `/practice` | `+page.ts` | Redirects 301 → `/` |
| `/practice/session/[id]` | `+page.svelte` | Session review: attempts, audio playback, human feedback |
| `/settings` | `+page.svelte` | Avatar, locale, skin, notifications, quiet hours, billing tier |
| `/billing/cancel` | `+page.svelte` | Static cancellation confirmation |
| `/billing/return` | `+page.svelte` | Static success confirmation |
| `/api/auth/[...all]` | `+server.ts` | BetterAuth catch-all GET/POST handler |

### 3. Component & State Patterns

**No separate component library** — all UI is in route page files, importing shadcn-svelte primitives from `@babylon/ui` (Button, Card, Dialog, Accordion, Input, Label).

**Svelte 5 runes throughout:**
- `$state` — all local reactive state (loading flags, form fields, audio state, indices)
- `$derived` — computed values (isCorrect, currentPhrase, minutesRemaining, activePracticeSessionId)
- `$effect` — side effects (locale sync, theme sync, auth guards, audio player seeding, scroll-to-feedback)

**No external state management** beyond convex-svelte hooks and shared auth stores.

### 4. Convex Data Flow

**Client init** (`+layout.svelte`):
```ts
setupConvex(CONVEX_URL);
createSvelteAuthClient({ authClient, convexUrl: CONVEX_URL });
```

**Read pattern**: `useQuery(api.module.fn, () => condition ? args : 'skip')`
**Write pattern**: `const client = useConvexClient(); client.mutation(api.module.fn, args)`
**Action pattern**: `client.action(api.module.fn, args)` (fire-and-forget for AI)

**Key Convex modules used:**

| Module | Queries | Mutations | Actions |
|--------|---------|-----------|---------|
| `phrases` | `get`, `listBySession`, `listAllByUser`, `listGroupedByCategory` | `create`, `createDirect`, `remove` | — |
| `practiceSessions` | `list`, `get`, `getStreak` | `start`, `end` | — |
| `attempts` | `listByPracticeSessionAsc` | `create`, `attachAudio` | — |
| `preferences` | `get`, `getProfileImageUrl` | `upsert`, `generateProfileImageUploadUrl` | — |
| `billing` | `getStatus` | `createPayfastCheckout`, `setMyTierForDev` | — |
| `humanReviews` | `getUnseenFeedback` | `markFeedbackSeen` | — |
| `audioUploads` | — | `generateUploadUrl` | — |
| `audioAssets` | — | `create` | — |
| `aiPipeline` | — | — | `processAttempt` |
| `unsplash` | — | — | `getRandomPhoto` |
| `notificationsNode` | — | — | `sendTest` |

**Audio submission flow** (practice page, ~lines 272-306):
1. `attempts.create` → attemptId
2. `audioUploads.generateUploadUrl` → signed URL
3. `fetch(url, {POST blob})` → storageId
4. `audioAssets.create` → audioAssetId
5. `attempts.attachAudio` → links audio
6. `aiPipeline.processAttempt` → fire-and-forget AI scoring

### 5. Authentication

**Stack**: BetterAuth + `@convex-dev/better-auth` + `@mmailaender/convex-better-auth-svelte`

**Server side** (`hooks.server.ts`):
- `authHandle` extracts JWT from cookies via `getToken(createAuth, event.cookies)`
- Sets `event.locals.token`

**Client side** (`packages/shared/src/auth-client.ts`):
- `authClient` with `organizationClient()` + `convexClient()` plugins
- Shared stores: `session`, `isAuthenticated`, `isLoading`, `user` (in `packages/shared/src/stores/auth.ts`)

**Auth API**: `/api/auth/[...all]` delegates all auth requests to BetterAuth handler.

**Protected rendering**: Header + routes check `$isAuthenticated` before rendering content.

### 6. Internationalization

**Stack**: Paraglide JS v2, cookie-only strategy, no URL prefixes.

**Locales**: `en` (base), `xh` (isiXhosa)

**Message files**:
- Shared: `packages/shared/messages/{en,xh}.json` (~43 keys — nav, auth, buttons)
- Web: `apps/web/messages/{en,xh}.json` (209 keys — practice, library, settings, theory, vocab)

**Flow**:
1. Server: `paraglideMiddleware` reads `PARAGLIDE_LOCALE` cookie → sets locale
2. Client layout: `$effect` reads Convex `preferences.uiLocale` → `setLocale()` if mismatched (one-time sync)
3. Settings page: `switchLanguage()` → `setLocale()` + `preferences.upsert({ uiLocale })` to persist both ways

**Translation status**: English 100% complete. isiXhosa ~90% — vocab and theory sections have `[TODO]` placeholders.

### 7. Styling & Theming

**Centralized styles**: `packages/shared/src/styles/recall.css` (925 lines), imported via `apps/web/src/app.css`.

**Tailwind CSS 4** with `@import 'tailwindcss'` + `tw-animate-css`. `@source` directive scans `packages/ui/src/**/*.{svelte,ts,js}`.

**Theme system** (OkLCh color space):
- Light mode: warm neutrals, lime green accent (`oklch(0.75 0.25 116)`)
- Dark mode: inverted palette, `class="dark"` on `:root`
- Mono skin: grayscale variant via `[data-skin="mono"]`
- Recording accent: coral/magenta for audio UI

**Persistence**: `localStorage` for theme (dark/light) + skin (default/mono), synced to Convex `userPreferences`.

**Custom CSS classes**: `.page-shell`, `.target-phrase` (container queries), `.practice-session`, `.feedback-banner`, `.practice-fab`, `.vocab-flashcard`, `.streak-display`.

**Fonts**: Bebas Neue (display), Public Sans (body) — Google Fonts preloaded in `app.html`.

### 8. Build & Deployment

- **Adapter**: `@sveltejs/adapter-node`
- **Build**: `bun run build` → Vite → `build/` directory
- **Start**: `bun build/index.js`
- **Turbo**: `dependsOn: ["^build"]` for upstream package builds
- **CSP**: Configured in `svelte.config.js` with nonce-based scripts, production `upgrade-insecure-requests`
- **Security headers**: HSTS, nosniff, strict-origin referrer, restrictive permissions-policy (mic: self only)
- **PWA**: `manifest.json`, `sw.js`, apple-touch-icon, theme-color meta

### 9. Server Hooks Pipeline

`hooks.server.ts` chains 3 handles via `sequence()`:
1. **securityHeadersHandle** — static security headers + HSTS in prod
2. **i18nHandle** — Paraglide locale detection + `%lang%` replacement
3. **authHandle** — BetterAuth token extraction from cookies

## Code References

- `apps/web/src/routes/+layout.svelte` — Root layout: Convex init, auth setup, locale/skin sync
- `apps/web/src/routes/+page.svelte` — Practice hub (~800 lines): recording, queue, sessions, streak
- `apps/web/src/hooks.server.ts` — Middleware pipeline (security, i18n, auth)
- `apps/web/src/lib/server/auth.ts` — BetterAuth server config with trusted origins
- `apps/web/src/lib/vocabularySets.ts` — Hardcoded vocabulary data
- `apps/web/src/app.html` — HTML shell: dark mode script, PWA, fonts
- `apps/web/src/app.css` — Single import of shared styles
- `packages/shared/src/styles/recall.css` — Centralized design system (925 lines)
- `packages/shared/src/auth-client.ts` — BetterAuth client with plugins
- `packages/shared/src/stores/auth.ts` — Auth stores (session, isAuthenticated, user)
- `packages/convex/src/index.ts` — Re-exports api, DataModel, Doc, Id types

## Architecture Documentation

**Patterns observed:**
- **Convex-first**: Zero REST/GraphQL — all backend through Convex queries, mutations, actions
- **Route-centric components**: No lib/components directory; all UI in page files with shadcn-svelte primitives
- **Fire-and-forget async**: AI processing (`aiPipeline.processAttempt`) runs after submission without blocking UI
- **Conditional queries**: `useQuery(api.x, () => condition ? {} : 'skip')` prevents queries when unauthenticated
- **Bidirectional preference sync**: Cookie ↔ Convex for locale/skin, with one-time layout sync on auth
- **Centralized styling**: Single CSS file in `packages/shared` serves both web and verifier apps
- **OkLCh theming**: Modern perceptual color space for consistent palette across light/dark/mono variants

## Open Questions

- How does the service worker (`sw.js`) handle caching/offline?
- What triggers practice session notifications (push subscription flow)?
- How does FSRS spaced-repetition (`userPhrases` table) integrate with the practice queue?
- What's the full billing/PayFast checkout flow beyond the settings page?
