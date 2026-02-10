---
date: 2026-02-10T16:02:02Z
researcher: heinschulie
git_commit: 8ea40cf7530a8a8104b3c83cd57a4d630f890c2a
branch: codex/extended-architecture
repository: babylon
topic: "Netlify to Railway migration - bun turborepo monorepo with multiple SvelteKit frontends"
tags: [research, codebase, railway, netlify, migration, sveltekit, bun, turborepo, deployment]
status: complete
last_updated: 2026-02-10
last_updated_by: heinschulie
---

# Research: Netlify → Railway Migration for Bun Turborepo + SvelteKit

**Date**: 2026-02-10T16:02:02Z
**Researcher**: heinschulie
**Git Commit**: 8ea40cf
**Branch**: codex/extended-architecture
**Repository**: babylon

## Research Question

Review the app mid-migration from Netlify to Railway. Deep research on deploying a bun-driven turborepo monorepo with multiple SvelteKit frontends onto Railway.

## Summary

The monorepo contains 2 SvelteKit SSR apps (`apps/web`, `apps/verifier`) and 3 workspace packages (`@babylon/convex`, `@babylon/shared`, `@babylon/ui`). Backend is Convex (hosted BaaS, unaffected by migration). Phase 1 code changes are mostly complete: both apps use `adapter-node`, railway.toml files exist, netlify.toml files are deleted. However, there are **critical issues** in the current railway.toml configuration and some leftover Netlify references.

---

## Current Migration Status

### What's Done (Phase 1)
- `@sveltejs/adapter-netlify` removed, `@sveltejs/adapter-node` installed in both apps
- Both `svelte.config.js` files updated to use `adapter-node`
- `start` script added to both app package.jsons: `"start": "node build/index.js"`
- `railway.toml` files created for both apps
- `netlify.toml` files deleted from both apps

### What's Not Done
- Railway project/services not yet created (Phase 2)
- Environment variables not configured on Railway
- Leftover Netlify references in code (Phase 3 cleanup)
- Railway domains not generated
- CORS/auth config not updated for Railway URLs

---

## Detailed Findings

### 1. Monorepo Architecture

```
babylon/
├── package.json          # bun@1.2.2, turbo@2.5.8
├── turbo.json
├── bun.lock
├── convex.json           # functions: "convex/"
├── convex/               # Convex backend (17 tables, 20+ function modules)
│   ├── _generated/       # Auto-generated types (api, dataModel)
│   ├── schema.ts
│   ├── auth.ts
│   ├── http.ts           # Auth routes + PayFast webhook
│   └── ...
├── apps/
│   ├── web/              # Main learner app (@babylon/web)
│   │   ├── railway.toml
│   │   ├── svelte.config.js  # adapter-node
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── hooks.server.ts       # Auth token extraction
│   │       ├── lib/server/auth.ts    # BetterAuth config (reads SITE_URL, BETTER_AUTH_SECRET)
│   │       ├── lib/convex.ts         # PUBLIC_CONVEX_URL
│   │       └── routes/
│   │           ├── api/auth/[...all]/ # Auth catch-all endpoint
│   │           ├── practice/
│   │           ├── settings/
│   │           └── ...
│   └── verifier/         # Admin/review app (@babylon/verifier)
│       ├── railway.toml
│       ├── svelte.config.js  # adapter-node (identical to web)
│       └── src/              # Nearly identical structure to web
├── packages/
│   ├── convex/           # Re-exports convex/_generated types
│   │   └── src/index.ts  # exports { api, DataModel, Doc, Id }
│   ├── shared/           # Placeholder (empty exports)
│   └── ui/               # Placeholder (empty exports)
└── .github/workflows/ci.yml  # Typecheck, test, build (no deploy)
```

### 2. Railway Configuration (Current State)

**apps/web/railway.toml:**
```toml
[build]
builder = "RAILPACK"
buildCommand = "bun run build:web"
watchPatterns = ["apps/web/**", "packages/**"]

[deploy]
startCommand = "bun run start"
healthcheckPath = "/"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

**apps/verifier/railway.toml** — identical except `buildCommand = "bun run build:verifier"` and `watchPatterns = ["apps/verifier/**", "packages/**"]`.

### 3. Critical Issue: startCommand + Root Directory

The migration plan says to set **Root Directory** in Railway dashboard to `/apps/web` and `/apps/verifier` respectively. This creates a conflict:

| Scenario | buildCommand works? | startCommand works? |
|---|---|---|
| Root dir = `/` (monorepo root) | `bun run build:web` — root package.json has this script | `bun run start` — **FAILS** (root package.json has no `start` script) |
| Root dir = `/apps/web` | `bun run build:web` — **FAILS** (app package.json has no `build:web` script) | `bun run start` — works (resolves to `node build/index.js`) |

**Resolution options:**
1. **Don't set root directory** (deploy from monorepo root). Change startCommand to `node apps/web/build/index.js` — but this breaks env loading since adapter-node expects CWD to be the app dir
2. **Set root directory to app dir**. Change buildCommand to `cd ../.. && bun run build:web` or use the full turbo command
3. **Don't set root directory, fix startCommand** to `cd apps/web && node build/index.js`

Per Railway docs for **shared monorepos** (turborepo with shared dependencies): **DO NOT set root directory** — it prevents access to workspace dependencies. Instead, use filtered build/start commands from root.

**Recommended approach:** Deploy from monorepo root. The startCommand should be `node apps/web/build/index.js` or `cd apps/web && node build/index.js`. The current `bun run start` will not work from root because the root package.json has no `start` script.

Note: The original migration plan (`thoughts/shared/plans/2026-02-10-netlify-to-railway-migration.md`) had `startCommand = "node apps/web/build/index.js"` and `startCommand = "node apps/verifier/build/index.js"` — the current railway.toml files diverge from this and use `bun run start` instead.

### 4. Railpack + Bun Support

Per Railway docs and community:
- **Railpack natively supports Bun** and always supports the latest version
- Bun is auto-detected from `bun.lock` / `bun.lockb` — ensure no other lockfiles exist (`package-lock.json`, `yarn.lock`)
- **builder = "RAILPACK"** is correct and recommended over NIXPACKS for Bun projects
- Railpack is newer but handles Bun better than Nixpacks

### 5. SvelteKit adapter-node on Railway

- Railway automatically injects `PORT` env var — adapter-node reads it automatically
- No custom HOST/PORT code needed in app source (confirmed: none exists)
- adapter-node defaults: `PORT=3000`, `HOST=0.0.0.0` — Railway overrides PORT
- Healthcheck on `/` is fine for SvelteKit
- `env.dir: '../..'` in svelte.config.js loads `.env` from monorepo root — Railway injects env vars directly, so this mainly matters for local dev

### 6. Environment Variables

**Required on Railway (both services):**

| Variable | Type | Purpose |
|---|---|---|
| `PUBLIC_CONVEX_URL` | Build-time (static/public) | Convex client connection |
| `PUBLIC_CONVEX_SITE_URL` | Build-time (static/public) | Convex auth callback URL |
| `SITE_URL` | Runtime (dynamic/private) | BetterAuth baseURL |
| `BETTER_AUTH_SECRET` | Runtime (dynamic/private) | Auth token encryption |
| `VERIFIER_SITE_URL` | Runtime (dynamic/private) | CORS trusted origin |
| `VITE_VAPID_PUBLIC_KEY` | Build-time (Vite) | Push notification subscription |
| `VAPID_PRIVATE_KEY` | Runtime (private) | Push notification sending (Convex-side only) |

Railway supports **shared variables** across services via `${{shared.VARIABLE_NAME}}` syntax — ideal for `PUBLIC_CONVEX_URL`, `PUBLIC_CONVEX_SITE_URL`, `BETTER_AUTH_SECRET`, `VITE_VAPID_PUBLIC_KEY`.

`SITE_URL` must differ per service (each service's own Railway URL).

**Not needed on Railway** (managed in Convex dashboard):
`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_TRANSLATE_API_KEY`, `PAYFAST_*`

### 7. Remaining Netlify References

**Code that needs updating:**

1. **Auth trusted origins** — hardcoded `https://intaka.netlify.app`:
   - `apps/web/src/lib/server/auth.ts:23`
   - `apps/verifier/src/lib/server/auth.ts:23`
   - `convex/auth.ts:20`

2. **Vite config comments** — Netlify-specific hash explanation:
   - `apps/web/vite.config.ts:15-17`
   - `apps/verifier/vite.config.ts:15-17`

3. **Ignore patterns** — `.netlify/` directory:
   - `apps/web/.prettierignore:3`
   - `apps/verifier/.prettierignore:3`
   - Both `eslint.config.js` files

4. **Documentation**:
   - `README.md:56-67` (Netlify deploy instructions)
   - `docs/PUSH_NOTIFICATIONS_SETUP.md` (entire guide references Netlify)

### 8. Railway Deployment Best Practices (from research)

**For this specific monorepo:**

1. **Don't set root directory** per service — deploy from monorepo root so workspace dependencies resolve
2. **Use `watchPatterns`** to trigger selective rebuilds (already configured correctly)
3. **buildCommand runs from root** — `bun run build:web` delegates to turbo which runs vite in the app dir
4. **startCommand must account for CWD being root** — either `node apps/web/build/index.js` or `cd apps/web && node build/index.js`
5. **Ensure only bun.lock exists** — no competing lockfiles
6. **Railway doesn't create .env files** — env vars are injected directly into `process.env`
7. **Use `${{shared.VAR}}` syntax** for variables shared across services
8. **`RAILWAY_PUBLIC_DOMAIN`** system variable gives you the `.up.railway.app` URL

### 9. adapter-node vs adapter-bun

Current setup uses `adapter-node` with `node build/index.js` as the start command. This means:
- Build produces Node.js-compatible server code
- Runtime is Node.js, not Bun (even though bun handles package management)
- This is fine and well-supported on Railway
- `svelte-adapter-bun` exists for true Bun runtime but is less battle-tested
- The `bun run` in buildCommand just invokes turbo — the actual server runs on Node

### 10. CI/CD Pipeline

**GitHub Actions** (`/.github/workflows/ci.yml`):
- Triggers on PR and push to `main`
- Matrix strategy: validates both apps independently
- Steps: checkout → setup bun 1.3.9 → install (frozen lockfile) → typecheck → test → build
- Uses placeholder env vars for CI builds
- **No deploy step** — Railway handles deployment separately via GitHub integration

---

## Code References

- `package.json:10-31` — Root monorepo scripts (build:web, build:verifier, etc.)
- `turbo.json:4-7` — Build task config with `^build` dependency chain
- `apps/web/svelte.config.js:1-13` — adapter-node config with env.dir = '../..'
- `apps/web/railway.toml:1-11` — Railway build/deploy config
- `apps/web/package.json:18` — Start script: `node build/index.js`
- `apps/web/src/hooks.server.ts:5-8` — Auth token extraction middleware
- `apps/web/src/lib/server/auth.ts:9-26` — BetterAuth config with env var usage
- `apps/web/src/lib/convex.ts:2` — PUBLIC_CONVEX_URL import
- `apps/web/src/lib/notifications.ts:1` — VITE_VAPID_PUBLIC_KEY import
- `apps/web/src/routes/api/auth/[...all]/+server.ts` — Auth catch-all endpoint
- `convex/auth.ts:9-42` — Convex-side auth with trusted origins
- `convex/http.ts:5-14` — HTTP router (auth + PayFast webhook)
- `packages/convex/src/index.ts:1-2` — Re-exports api, DataModel, Doc, Id
- `.github/workflows/ci.yml:12-45` — CI pipeline with matrix strategy

## Architecture Documentation

### Build Flow
1. Railway detects push → checks watchPatterns → triggers affected service
2. Railpack detects Bun from `bun.lock` → installs dependencies
3. `bun run build:web` → turbo resolves `^build` deps → `vite build` in app dir
4. adapter-node outputs to `apps/web/build/index.js`
5. Railway runs startCommand → Node.js server binds to `$PORT`

### Request Flow
1. Request → Railway proxy → Node.js server (`build/index.js`)
2. `hooks.server.ts` extracts auth token from cookies
3. Route matched → SSR renders page / API endpoint responds
4. Client-side: Convex client connects to `PUBLIC_CONVEX_URL`
5. Auth: BetterAuth validates via Convex HTTP endpoint

### Shared Package Resolution
- Both apps declare `"@babylon/convex": "workspace:*"`
- Bun resolves to `packages/convex/` via workspace protocol
- Package exports raw TypeScript (`src/index.ts`) — no build step
- Re-exports `convex/_generated/api` and `convex/_generated/dataModel` types

## Related Research

- `thoughts/shared/plans/2026-02-10-netlify-to-railway-migration.md` — Original migration plan
- `thoughts/shared/research/2026-02-10-monorepo-deployment-appraisal.md` — Prior deployment research

## External References

- [Railway Monorepo Guide](https://docs.railway.com/guides/monorepo)
- [Railway Config as Code](https://docs.railway.com/reference/config-as-code)
- [Railway SvelteKit Guide](https://docs.railway.com/guides/sveltekit)
- [Railway Variables Reference](https://docs.railway.com/reference/variables)
- [Railway Shared Variables](https://blog.railway.com/p/shared-variables-release)
- [Railpack Documentation](https://railpack.com/)
- [Bun Railway Deployment Guide](https://bun.com/docs/guides/deployment/railway)
- [SvelteKit adapter-node Docs](https://svelte.dev/docs/kit/adapter-node)
- [Railway Help: Turborepo Monorepo](https://station.railway.com/questions/how-to-apply-a-turborepo-monorepo-with-1e22b94c)
- [Railway Help: Bun Detection in Monorepos](https://station.railway.com/questions/bun-not-being-detected-within-monorepo-74b78641)
- [Railway Help: Turborepo Env Vars](https://station.railway.com/questions/deploy-with-turborepo-can-t-access-the-e-45e26b98)

## Open Questions

- startCommand `bun run start` won't work from monorepo root — needs fixing. Use `node apps/web/build/index.js` or `cd apps/web && node build/index.js`?
- Should `hashCharacters: 'hex'` in vite.config.ts be kept or removed? (was for Netlify lowercase path normalization)
- Railway shared variables for `BETTER_AUTH_SECRET` etc. — create in dashboard or via CLI?
- Custom domains: defer to later or set up now?
- Convex `SITE_URL` and `VERIFIER_SITE_URL` env vars need Railway URLs too — update after first deploy
