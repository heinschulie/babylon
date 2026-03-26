---
date: 2026-03-25T00:00:00+02:00
researcher: Claude
git_commit: 4a209d8
branch: hein/feature/issue-61
repository: babylon
topic: 'apps/web — full application research'
tags: [research, codebase, web, sveltekit, convex, auth, i18n]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: apps/web

## Research Question

Comprehensive research of the `apps/web` SvelteKit application — structure, routing, components, state, auth, Convex integration, and i18n.

## Summary

`apps/web` is the learner-facing SvelteKit 2 app for Xhosa language acquisition. It has **15 route components** across auth, practice, vocabulary, library, theory, settings, and billing flows. All backend logic goes through **Convex** (47 direct API calls). Auth uses **BetterAuth + Convex** with cookie-based token extraction. i18n uses **Paraglide** with 209+ message keys (en/xh). UI built on **shadcn-svelte** components from `@babylon/ui`. No complex client stores — just 3 BetterAuth-derived stores in `@babylon/shared`.

## Detailed Findings

### Project Structure

```
apps/web/
├── src/
│   ├── app.html              — HTML template (dark mode, fonts, PWA)
│   ├── app.css               — Imports shared styles from packages/shared
│   ├── app.d.ts              — App.Locals { token?: string }
│   ├── hooks.server.ts       — Security headers + auth + i18n middleware
│   ├── routes/               — 15 route components (see below)
│   └── lib/
│       ├── index.ts           — Empty barrel
│       ├── vocabularySets.ts  — 13 vocab categories (colors→places)
│       ├── server/auth.ts     — BetterAuth server config
│       └── paraglide/         — Generated i18n (gitignored)
├── messages/
│   ├── en.json               — 209 English message keys
│   └── xh.json               — 209 Xhosa keys (some [TODO])
├── static/                    — Favicon, manifest, etc.
├── svelte.config.js           — Node adapter, CSP directives
├── vite.config.ts             — Paraglide + Tailwind 4 + SvelteKit plugins
└── package.json               — Svelte 5.45, SvelteKit 2.49, Convex 1.31
```

### Route Map

| Route | Auth? | Purpose | Convex Queries | Convex Mutations/Actions |
|-------|-------|---------|----------------|--------------------------|
| `/` | ✅ | Practice dashboard — session launcher, recording, review | phrases.listAllByUser, practiceSessions.list/get/getStreak, attempts.listByPracticeSessionAsc | practiceSessions.start/end, attempts.create/attachAudio, audioUploads.generateUploadUrl, audioAssets.create, aiPipeline.processAttempt |
| `/login` | — | Email/password login | — | authClient.signIn.email |
| `/register` | — | Email/password signup | — | authClient.signUp.email |
| `/library` | ✅ | Phrase library by category | phrases.listGroupedByCategory, billing.getStatus, humanReviews.getUnseenFeedback | phrases.createDirect |
| `/settings` | — | Profile, language, skin, notifications, billing | preferences.get, billing.getStatus, preferences.getProfileImageUrl | preferences.upsert (×5), preferences.generateProfileImageUploadUrl, billing.createPayfastCheckout, billing.setMyTierForDev, notificationsNode.sendTest |
| `/theory` | — | Static educational content (clicks, agglutination, noun classes) | — | — |
| `/vocabulary` | — | Vocab set grid (13 sets) | — | — |
| `/vocabulary/[set]` | — | Flashcard with Unsplash images | — | unsplash.getRandomPhoto |
| `/session/[id]` | — | Legacy phrase management per session | phrases.listBySession | phrases.create/remove, translateNode.verifyTranslation |
| `/practice/session/[id]` | — | Practice session review — AI + human scores, dual audio | attempts.listByPracticeSessionAsc | humanReviews.markFeedbackSeen |
| `/reveal/[id]` | — | Single-phrase translation quiz | phrases.get | — |
| `/billing/cancel` | — | Payment canceled static page | — | — |
| `/billing/return` | — | Payment complete static page | — | — |
| `/test` | — | Dev test page (emoji dialog) | — | testEmojiMutation.submitEmoji |
| `/api/auth/[...all]` | — | BetterAuth catch-all handler (GET/POST) | — | — |

### Auth Flow

1. **Layout mount** → `setupConvex(CONVEX_URL)` + `createSvelteAuthClient({ authClient, convexUrl })`
2. **Server hooks** (`hooks.server.ts:33-37`) → `getToken()` extracts JWT from cookies → `event.locals.token`
3. **Client stores** (`packages/shared/src/stores/auth.ts`) → `session`, `isAuthenticated`, `isLoading`, `user` derived from `authClient.useSession()`
4. **Protected routes** → `$effect` checks `$isAuthenticated`, redirects to `/login` if false
5. **API routes** → `/api/auth/[...all]` handles BetterAuth callbacks via `createSvelteKitHandler`

### Server Hooks Chain (`hooks.server.ts`)

Three handlers composed via `sequence()`:
1. **securityHeadersHandle** (lines 15-31) — nosniff, referrer-policy, permissions-policy (mic=self only), HSTS in prod
2. **authHandle** (lines 33-37) — Token extraction from cookies
3. **i18nHandle** (lines 39-45) — Paraglide middleware, replaces `%lang%` in HTML

### Convex Integration Patterns

- **Queries**: `useQuery(api.namespace.op, () => $isAuthenticated ? {} : 'skip')` — skip when unauthed
- **Mutations**: `const client = useConvexClient(); await client.mutation(api.namespace.op, args)`
- **Actions**: Same as mutations but `client.action()` — can be fire-and-forget (aiPipeline.processAttempt) or awaited
- **File uploads**: Generate URL → fetch PUT → create asset record → attach to entity

### i18n Setup

- **Strategy**: Cookie-first (`PARAGLIDE_LOCALE`), fallback to base locale (`en`)
- **Locales**: `en`, `xh` (isiXhosa)
- **Message files**: `apps/web/messages/{en,xh}.json` (209 keys each)
- **Usage**: `import * as m from '$lib/paraglide/messages.js'` → `m.nav_library()`
- **Sync**: Layout reads Convex prefs on load, calls `setLocale()` if mismatched
- **Incomplete**: Some xh.json entries prefixed `[TODO]` (settings_appearance, theory, vocab sections)

### UI Components Used (from @babylon/ui)

- `Button`, `Card` (Root/Content/Header/Title/Description/Footer), `Input`, `Label`
- `Dialog` (Root/Content/Title), `Accordion` (Root/Item/Trigger/Content)
- `Header` (layout-level, receives i18n props)

### State Management

Minimal — no complex stores or context:
- **3 auth stores** in `@babylon/shared/stores/auth.ts` (session-derived)
- **Component-local** `$state` runes for forms, modals, audio playback
- **Convex reactive queries** via `useQuery()` handle server state

### Key Features by Page

**Practice (`/`)** — Core flow: start session → record audio via MediaRecorder → upload to Convex storage → create attempt → fire-and-forget AI processing. Queue modes: once/shuffle/repeat. Review shows AI scores (sound/rhythm/phrase) + human verifier feedback with dual audio playback.

**Library (`/library`)** — Phrases grouped by category. Add dialog creates phrases with `createDirect`. Feedback banner links to practice review when unseen human reviews exist. FAB shows remaining tier minutes.

**Settings (`/settings`)** — Avatar upload (Convex storage), locale switching (Paraglide + Convex), skin switching (default/mono via localStorage + DOM), push notifications (service worker + VAPID), quiet hours config, Payfast billing checkout, dev tier override.

**Vocabulary (`/vocabulary/[set]`)** — Flashcards from 13 static vocab sets. Loads Unsplash images per term. Reveal-on-demand translation. Fly transition animations.

### Shared Package Dependencies

| Import | Source | Purpose |
|--------|--------|---------|
| `authClient` | `@babylon/shared/auth-client` | BetterAuth Svelte client with org + convex plugins |
| `isAuthenticated`, `isLoading`, `user` | `@babylon/shared/stores/auth` | Reactive auth state |
| `CONVEX_URL` | `@babylon/shared/convex` | Convex endpoint |
| `requestNotificationPermission` | `@babylon/shared/notifications` | Push subscription via service worker |
| `cn` | `@babylon/shared` | Tailwind class merging |
| `api`, `Id` | `@babylon/convex` | Typed Convex API + ID types |

## Code References

- `apps/web/src/hooks.server.ts:15-47` — Server hook chain (security + auth + i18n)
- `apps/web/src/routes/+layout.svelte:16-21` — Convex + auth client setup
- `apps/web/src/routes/+page.svelte:239-306` — Practice session lifecycle (start → record → upload → AI)
- `apps/web/src/routes/settings/+page.svelte:25-32` — Avatar upload flow pattern
- `apps/web/src/routes/library/+page.svelte:15-17` — Multi-query page pattern
- `apps/web/src/lib/vocabularySets.ts:1-279` — 13 vocabulary sets (VocabularyItem/VocabularySet types)
- `apps/web/src/lib/server/auth.ts:1-27` — BetterAuth server factory
- `apps/web/messages/en.json:1-209` — All 209 i18n message keys
- `packages/shared/src/stores/auth.ts:9-24` — Auth store derivations
- `packages/shared/src/auth-client.ts:1-7` — BetterAuth client with plugins
- `packages/shared/src/convex.ts:1-12` — Convex client singleton
- `packages/shared/src/notifications.ts:18-46` — Push notification subscription

## Architecture Documentation

**Patterns:**
- SvelteKit routes as thin view layer — no server load functions except auth token extraction
- Convex handles all data fetching reactively via `useQuery()` with auth-gated skip
- File upload follows: generate URL → PUT blob → create record → attach pattern
- i18n strictly enforced — all user-facing strings via Paraglide message functions
- `@babylon/ui` components are translation-agnostic (props-only, no i18n imports)
- Dark mode / skin switching via localStorage + DOM `data-skin` attribute
- Security-first: CSP, HSTS, restrictive permissions policy, nosniff headers

**Conventions:**
- Svelte 5 runes everywhere (`$state`, `$derived`, `$effect`, `$props`)
- No legacy `let` reactivity
- `useConvexClient()` for mutations/actions, `useQuery()` for reactive reads
- Auth guard pattern: `$effect` → check `$isAuthenticated` + `!$isLoading` → `goto('/login')`

## Open Questions

- Several routes (session/[id], practice/session/[id], reveal/[id], vocabulary/*) lack explicit auth guards — intentional public access or missing?
- xh.json has `[TODO]` prefixed entries — scope of untranslated content?
- `/test` route — should it be removed or gated behind dev flag?
- `session/[id]` route appears legacy (uses `phrases.create` vs `createDirect`) — still in use?
