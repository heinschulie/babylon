# apps/web

Xhosa language learning SPA built with SvelteKit 2 (Svelte 5 runes), Tailwind CSS 4, and Convex. Features audio-based practice sessions with AI feedback, a phrase library, vocabulary flashcards, theory content, billing, and settings.

## Structure

```
src/
├── app.html              # Shell: dark mode script, fonts, PWA
├── app.css               # Imports shared recall.css theme
├── hooks.server.ts       # sequence(security, i18n, auth)
├── lib/
│   ├── server/auth.ts    # BetterAuth config
│   ├── vocabularySets.ts # Static vocab categories
│   └── paraglide/        # Generated i18n (gitignored)
└── routes/               # 13 page routes, flat structure
```

Most component/store code lives in `packages/shared` and `packages/ui`, not here. All UI is in route page files, importing shadcn-svelte primitives from `@babylon/ui`.

## Routes

| Route | Purpose |
|-------|---------|
| `/` | Practice hub — phrase queue, audio recording, session history, streak |
| `/login` | Email/password login |
| `/register` | Registration |
| `/library` | Phrase library grouped by category, billing status |
| `/theory` | Xhosa linguistics guide (clicks, noun classes, tone) |
| `/vocabulary` | Vocabulary set grid |
| `/vocabulary/[set]` | Flashcard carousel with Unsplash images |
| `/settings` | Avatar, locale, skin, notifications, quiet hours, billing tier |
| `/practice` | Redirects 301 → `/` |
| `/practice/session/[id]` | Session review: attempts, audio playback, human feedback |
| `/session/[id]` | Legacy session editor/viewer |
| `/reveal/[id]` | Translation quiz |
| `/billing/return` | PayFast success confirmation |
| `/billing/cancel` | PayFast cancel confirmation |
| `/api/auth/[...all]` | BetterAuth catch-all handler |

Single root layout — no nested layouts.

## Initialization

**Server (per request)** via `hooks.server.ts` — `sequence()` chains:

1. **securityHeadersHandle** — HSTS on prod, nosniff, strict-origin referrer, permissions-policy (mic: self)
2. **i18nHandle** — Paraglide locale from cookie → `%lang%` replacement
3. **authHandle** — BetterAuth token extraction from cookies → `event.locals.token`

**Client (on mount)** via `+layout.svelte`:

1. `setupConvex(CONVEX_URL)` — Convex client
2. `createSvelteAuthClient()` — auth registration
3. `useQuery(api.preferences.get)` — fetch locale/skin prefs
4. `$effect` syncs locale + skin theme from Convex

## Data Flow

All data through Convex — no REST/GraphQL.

- **Queries** (`useQuery`): phrases, sessions, attempts, preferences, billing, streaks, human reviews
- **Mutations** (`useConvexClient().mutation`): create phrases, start/end sessions, upload audio, update preferences
- **Actions** (`useConvexClient().action`): Unsplash images, AI pipeline, test notifications, PayFast checkout
- Conditional skip: `() => $isAuthenticated ? {} : 'skip'`

**Key Convex endpoints:**

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

**Audio submission flow:**

1. `attempts.create` → attemptId
2. `audioUploads.generateUploadUrl` → signed URL
3. `fetch(url, {POST blob})` → storageId
4. `audioAssets.create` → audioAssetId
5. `attempts.attachAudio` → links audio
6. `aiPipeline.processAttempt` → fire-and-forget AI scoring

## Practice Flow

1. Home shows streak, phrases ready, recent sessions
2. "Start" creates session → URL gains `?run=<sessionId>`
3. Phrase displayed in English, user records audio
4. Queue modes: once / shuffle / repeat
5. Audio blob uploaded, attempt created, AI scoring fires async
6. Review screen with sound/rhythm/phrase scores
7. Verifier scores and feedback shown when available

## Auth

- Server: BetterAuth instance in `lib/server/auth.ts` with trusted origins
- API: `/api/auth/[...all]` delegates to `@mmailaender/convex-better-auth-svelte/sveltekit`
- Client: `@babylon/shared/auth-client` with organization + Convex plugins
- Stores: `session`, `isAuthenticated`, `isLoading`, `user` from `packages/shared`
- Guards: `$effect` checks `$isAuthenticated`, redirects to `/login`

## i18n

Paraglide JS v2, cookie-only strategy (`PARAGLIDE_LOCALE`, 400-day max-age), no URL prefixes.

- Locales: `en` (base), `xh` (isiXhosa)
- Shared messages: `packages/shared/messages/{en,xh}.json` (~43 keys — nav, auth, buttons)
- App messages: `apps/web/messages/{en,xh}.json` (~209 keys — practice, library, settings, theory, vocab)
- Usage: `import * as m from '$lib/paraglide/messages.js'`
- Convex `preferences.uiLocale` is authoritative; synced to client on layout mount
- isiXhosa ~90% complete — `[TODO]` prefix on missing translations

## Styling & Theming

- **Centralized**: `packages/shared/src/styles/recall.css` (925 lines), imported via `app.css`
- **Tailwind CSS 4**: `@import 'tailwindcss'` + `tw-animate-css`, `@source` scans `packages/ui`
- **OkLCh color space**: warm neutrals + lime accent (light), inverted (dark), grayscale (mono)
- **Modes**: dark via `class="dark"` on `:root`, mono via `[data-skin="mono"]`
- **Fonts**: Bebas Neue (display), Public Sans (body) — Google Fonts preloaded
- **Persistence**: `localStorage` for theme/skin, synced to Convex preferences
- **Custom classes**: `.page-shell`, `.target-phrase`, `.practice-session`, `.feedback-banner`, `.practice-fab`, `.vocab-flashcard`, `.streak-display`

## Monorepo Dependencies

| Package | Provides |
|---------|----------|
| `@babylon/convex` | `api`, `Id`, `Doc`, `DataModel` types |
| `@babylon/shared` | Convex client, auth client, auth stores, notifications, `cn` util |
| `@babylon/ui` | shadcn-svelte components (Button, Card, Dialog, Header, etc.) |

## Configuration

- **Adapter**: `@sveltejs/adapter-node` (Netlify Node runtime)
- **CSP**: Strict in prod — `'self'` defaults, googleapis fonts, `https:` images, WebSocket, nonce-based scripts, `upgrade-insecure-requests`
- **Vite plugins**: Paraglide → Tailwind → SvelteKit
- **Env directory**: `../..` (monorepo root)
- **PWA**: `manifest.json`, `sw.js`, apple-touch-icon, theme-color meta, push notifications via web-push

## Settings

1. Profile picture upload
2. Language switcher (en/xh)
3. Appearance skin (default/mono)
4. Push notifications (enable, test, quiet hours, frequency, timezone)
5. Billing (free/ai/pro tiers, usage stats, checkout)

## Environment Variables

| Var | Scope |
|-----|-------|
| `PUBLIC_CONVEX_URL` | Public |
| `PUBLIC_CONVEX_SITE_URL` | Public |
| `VITE_VAPID_PUBLIC_KEY` | Public |
| `SITE_URL` | Server |
| `BETTER_AUTH_SECRET` | Server |
| `VAPID_PRIVATE_KEY` | Server |
