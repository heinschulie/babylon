---
date: 2026-03-21T00:00:00+02:00
researcher: Claude
git_commit: 452e5a1
branch: al
repository: babylon
topic: 'runtime'
tags: [research, codebase, bun, sveltekit, convex, railway, runtime]
status: complete
last_updated: 2026-03-21
last_updated_by: Claude
---

# Research: Runtime

## Research Question

How does runtime work across the Babylon monorepo — what executes where, with what configuration?

## Summary

Babylon has **four distinct runtime environments**: (1) **Bun** as local dev runtime, package manager, and task runner; (2) **Node.js** as the SvelteKit production server via `@sveltejs/adapter-node`; (3) **Convex V8 isolates** (+ Node.js for `'use node'` actions) as the serverless backend; (4) **Browser** for the service worker and client-side code. Railway is the active deployment platform (not Netlify, which has stale artifacts). Turbo orchestrates the build pipeline across Bun workspaces.

## Detailed Findings

### 1. Bun — Dev Runtime & Package Manager

Bun 1.2.2 is the declared package manager (`package.json:5`) and primary dev runtime.

**Workspace config** — `package.json:6-8`:
```json
"workspaces": ["apps/*", "packages/*"]
```

Five workspace packages: `@babylon/web`, `@babylon/verifier`, `@babylon/convex`, `@babylon/shared`, `@babylon/ui`. All ESM (`"type": "module"`).

**Bun-specific APIs used in codebase:**

| API | File | Usage |
|-----|------|-------|
| `Bun.serve()` | `adws/triggers/webhook.ts:208-223` | HTTP server for GitHub webhooks (port 8001) |
| `Bun.spawn()` | `adws/triggers/webhook.ts:164-169`, `adws/triggers/cron.ts:75-83` | Async subprocess spawning for ADW workflows |
| `Bun.spawnSync()` | `.claude/hooks/setup_init.ts:25`, `.claude/hooks/setup_maintenance.ts:20` | Synchronous process execution |
| `Bun.stdin` | `.claude/hooks/setup_init.ts:49`, `.claude/hooks/session_start.ts:26` | Reading JSON hook input from stdin |
| `Bun.file()` | `.claude/hooks/session_start.ts:55-58` | File existence check and async read |
| `Bun.write()` | `adws/src/state.ts:70` | Writing ADW state JSON |
| `Bun.env` | `.claude/hooks/setup_init.ts:63-91`, `.claude/hooks/session_start.ts:38-39` | Environment variable access |

**Runtime detection fallback** — `adws/src/utils.ts:108-139`: checks `typeof globalThis.Bun !== "undefined"`, falls back to `child_process.execFileSync` for Node/Vitest compat.

**Types**: `@types/bun@^1.3.10` (root `package.json:38-39`).

### 2. Node.js — SvelteKit Production Server

Both apps use `@sveltejs/adapter-node` (`apps/web/svelte.config.js:1`, `apps/verifier/svelte.config.js:1`).

**Production start command**: `node apps/web/build/index.js` (Railway) or `bun build/index.js` (local).

**Hooks middleware chain** (`apps/web/src/hooks.server.ts:47`):
1. **Security headers** (lines 8-31) — nosniff, referrer-policy, permissions-policy, HSTS in production
2. **Paraglide i18n** (lines 39-45) — cookie-based locale via `AsyncLocalStorage`
3. **Auth token extraction** (lines 33-37) — BetterAuth token from cookies into `event.locals.token`

Both apps have identical config: same svelte.config.js, vite.config.ts, hooks.server.ts, tsconfig.json.

**Vite plugins** (`apps/web/vite.config.ts:12-20`): Paraglide (cookie+baseLocale strategy), Tailwind CSS 4, SvelteKit.

**Environment variables**:
- Static public: `PUBLIC_CONVEX_URL` via `$env/static/public` (`packages/shared/src/convex.ts:2`)
- Dynamic private: `SITE_URL`, `BETTER_AUTH_SECRET`, `VERIFIER_SITE_URL` via `$env/dynamic/private` (`apps/web/src/lib/server/auth.ts:2`)

**CSP** (`svelte.config.js:5-38`): strict defaults, production `upgrade-insecure-requests`, allows WebSocket (`wss:`), blob workers.

### 3. Convex — Serverless Backend Runtime

**Config**: `convex.json` → `{ "functions": "convex/" }`. Plugin: Better Auth via `convex/convex.config.ts`.

**Runtime split**:
- **V8 isolates** (default) — all queries and mutations run in Convex's V8 sandbox
- **Node.js runtime** (`'use node'` directive) — 4 action files that call external APIs:
  - `convex/aiPipeline.ts:1` — OpenAI Whisper + Claude Sonnet 4
  - `convex/notificationsNode.ts:1` — web-push library
  - `convex/translatePhrase.ts` — Claude Sonnet 4 translation
  - `convex/translateNode.ts` — Google Translate verification

**Schema**: 19 tables (`convex/schema.ts:1-298`) covering sessions, phrases, attempts, reviews, billing, notifications.

**HTTP routes** (`convex/http.ts:1-16`):
- `/api/auth/*` — Better Auth with CORS
- `POST /webhooks/payfast` — billing webhooks

**Cron** (`convex/crons.ts:6-10`): `reschedule-spaced-repetition` daily at 06:00 UTC.

**State machines**:
- Billing: `pending → active → past_due → canceled`
- Reviews: `pending → claimed → completed → (flagged) → dispute → dispute_resolved | escalated`
- Attempts: `queued → processing → feedback_ready | failed`

### 4. Browser — Service Worker & PWA

**Service worker** (`apps/web/static/sw.js` → `build/sw.js:1-42`):
- `push` event handler (lines 3-19) — notification display
- `notificationclick` handler (lines 21-42) — window focus/navigation
- Tag: `'recall-notification'`

**PWA manifest** (`apps/web/static/manifest.json:1-17`):
- Name: "Language Recall", display: standalone, theme: `#0f172a`

**Push subscription** (`packages/shared/src/notifications.ts:22-50`):
- Registers SW, subscribes with VAPID key, stores subscription in Convex

### 5. Deployment — Railway (Active)

**Railway configs** (`apps/web/railway.toml`, `apps/verifier/railway.toml`):
- Builder: RAILPACK
- Install: `bun install`
- Build: `bun run build:web` / `bun run build:verifier`
- Start: `node apps/web/build/index.js` / `node apps/verifier/build/index.js`
- Health check: `GET /` with 300s timeout
- Restart: ON_FAILURE, max 3 retries
- Watch patterns include `packages/**` (shared package changes trigger redeploy)

**Netlify**: stale artifacts in `.netlify/` and `build/_redirects` / `build/_headers`. No longer active.

### 6. Build Pipeline — Turbo

**File**: `turbo.json`

Task DAG: `@babylon/convex` → `@babylon/shared` → `@babylon/ui` → `@babylon/web` + `@babylon/verifier`.

Cached tasks: `build`, `check`, `lint`, `typecheck`, `test`, `test:run`. Non-cached: `dev`, `preview`, `check:watch`, `format`.

### 7. CI/CD

**File**: `.github/workflows/ci.yml`

- Triggers: PRs + push to `main`
- Matrix: parallel `@babylon/web` + `@babylon/verifier`
- Runtime: Bun 1.3.9
- Steps: checkout → setup Bun → install (frozen lockfile) → typecheck → test → build
- No auto-deploy (Railway/Convex deployed separately)

## Code References

- `package.json:5` — `"packageManager": "bun@1.2.2"`
- `package.json:6-8` — workspace config
- `apps/web/svelte.config.js:1` — `@sveltejs/adapter-node`
- `apps/web/vite.config.ts:12-20` — Vite plugins (Paraglide, Tailwind, SvelteKit)
- `apps/web/src/hooks.server.ts:47` — middleware sequence
- `convex.json:1-3` — Convex functions directory
- `convex/convex.config.ts:1-7` — Better Auth plugin registration
- `convex/schema.ts:1-298` — 19-table schema
- `convex/http.ts:1-16` — HTTP routes
- `convex/crons.ts:6-10` — daily spaced repetition cron
- `convex/aiPipeline.ts:1` — `'use node'` for external AI APIs
- `apps/web/railway.toml:1-12` — Railway deployment config
- `apps/web/static/sw.js` — service worker source
- `apps/web/static/manifest.json:1-17` — PWA manifest
- `packages/shared/src/notifications.ts:22-50` — push subscription logic
- `adws/triggers/webhook.ts:208-223` — `Bun.serve()` webhook server
- `adws/src/utils.ts:108-139` — Bun/Node runtime detection fallback
- `.github/workflows/ci.yml:1-46` — CI pipeline
- `turbo.json:1-40` — build task orchestration

## Architecture Documentation

**Runtime boundary pattern**: Bun for dev/tooling, Node.js for production SvelteKit servers, Convex V8 isolates for serverless functions (with Node.js escape hatch via `'use node'`), browser for service worker. The codebase uses runtime detection (`typeof globalThis.Bun`) to bridge Bun/Node differences in shared code.

**Identical twin apps**: `apps/web` and `apps/verifier` share identical runtime config (svelte.config, vite.config, hooks, tsconfig). Differences are purely in routes and UI.

**Environment strategy**: Static public vars at build time (`$env/static/public`), dynamic private vars at runtime (`$env/dynamic/private`), `.env` files at monorepo root shared via `envDir: workspaceRoot` in Vite.

## Open Questions

- None — runtime picture is comprehensive.
