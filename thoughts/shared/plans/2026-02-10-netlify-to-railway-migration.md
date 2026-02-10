# Netlify → Railway Migration Plan

## Overview

Migrate both SvelteKit frontends (`apps/web`, `apps/verifier`) from Netlify to Railway. Swap adapter-netlify → adapter-node, add Railway config, set up env vars. Convex backend is unaffected.

## Current State

- 2 SvelteKit SSR apps deployed as separate Netlify sites
- Both use `@sveltejs/adapter-netlify`
- Build runs from repo root via Turbo (`bun run build:web` / `bun run build:verifier`)
- Backend is Convex Cloud (no migration needed)
- Env vars live in Netlify site settings + `.env` / `.env.local` locally
- CI runs on GitHub Actions (typecheck, test, build) - no deploy step

## Desired End State

- Both apps running on Railway as services in a single project
- `adapter-node` serving both apps
- Railway auto-deploys on push to `main`
- Each service only rebuilds when its `apps/` dir or shared `packages/` change
- Env vars configured in Railway dashboard (shared where possible)
- `*.up.railway.app` domains (custom domains later)
- Netlify sites deleted

## What We're NOT Doing

- Cloudflare CDN (defer until custom domains / perf matters)
- Staging/preview environments (add later)
- Docker/containerization (Railway's Railpack auto-detects SvelteKit)
- Convex migration (stays exactly as-is)
- CI changes (GitHub Actions stays for typecheck/test - Railway handles deploy)

---

## Phase 1: Code Changes

### Overview

Swap the SvelteKit adapter from Netlify to Node in both apps. Add Railway config files. Add a start script.

### Changes Required:

#### 1.1 Install adapter-node, remove adapter-netlify

Both `apps/web/package.json` and `apps/verifier/package.json`:

```bash
# From repo root
cd apps/web && bun remove @sveltejs/adapter-netlify && bun add -D @sveltejs/adapter-node
cd ../verifier && bun remove @sveltejs/adapter-netlify && bun add -D @sveltejs/adapter-node
```

#### 1.2 Update svelte.config.js (both apps)

**Files**: `apps/web/svelte.config.js`, `apps/verifier/svelte.config.js`

```js
import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		env: {
			dir: '../..'
		},
		adapter: adapter()
	}
};

export default config;
```

Only change: `adapter-netlify` → `adapter-node`. Everything else stays.

#### 1.3 Add start script to both app package.jsons

**Files**: `apps/web/package.json`, `apps/verifier/package.json`

Add to `"scripts"`:
```json
"start": "node build/index.js"
```

`adapter-node` outputs to `build/` by default. It reads `PORT` and `HOST` env vars automatically (Railway injects `PORT`).

#### 1.4 Add railway.toml for web

**File**: `apps/web/railway.toml` (new)

```toml
[build]
builder = "RAILPACK"
buildCommand = "bun run build:web"
watchPatterns = ["apps/web/**", "packages/**"]

[deploy]
startCommand = "node apps/web/build/index.js"
healthcheckPath = "/"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

#### 1.5 Add railway.toml for verifier

**File**: `apps/verifier/railway.toml` (new)

```toml
[build]
builder = "RAILPACK"
buildCommand = "bun run build:verifier"
watchPatterns = ["apps/verifier/**", "packages/**"]

[deploy]
startCommand = "node apps/verifier/build/index.js"
healthcheckPath = "/"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
```

#### 1.6 Delete Netlify configs

Remove:
- `apps/web/netlify.toml`
- `apps/verifier/netlify.toml`

### Success Criteria:

#### Automated Verification:

- [ ] `bun install` succeeds from repo root
- [ ] `bun run build:web` succeeds (outputs to `apps/web/build/`)
- [ ] `bun run build:verifier` succeeds (outputs to `apps/verifier/build/`)
- [ ] `bun run check` passes (typecheck)
- [ ] `bun run test:run` passes
- [ ] `node apps/web/build/index.js` starts and responds on PORT (smoke test)
- [ ] `node apps/verifier/build/index.js` starts and responds on PORT

#### Manual Verification:

- [ ] Confirm `apps/web/build/index.js` exists after build
- [ ] Confirm `apps/verifier/build/index.js` exists after build

**Pause here for manual confirmation before proceeding to Phase 2.**

---

## Phase 2: Railway Account & Project Setup

### Overview

Create Railway account, project, and link both services to the monorepo.

### Steps:

#### 2.1 Create Railway account

1. Go to https://railway.com and sign up (GitHub OAuth recommended)
2. Select **Pro plan** ($20/mo, includes $20 usage credit)

#### 2.2 Install Railway CLI

```bash
brew install railway
railway login
```

#### 2.3 Create project with 2 services

From repo root:

```bash
railway init
# Name the project "babylon" or similar
```

Then in the **Railway dashboard** (UI is easier for initial setup):

1. Open the project
2. **Add service** → "GitHub Repo" → select the babylon repo
   - Name: `web`
   - Settings → Source → Root Directory: `/apps/web`
   - This tells Railway to use `apps/web/railway.toml`
3. **Add service** → "GitHub Repo" → select the babylon repo (again)
   - Name: `verifier`
   - Settings → Source → Root Directory: `/apps/verifier`
   - This tells Railway to use `apps/verifier/railway.toml`

#### 2.4 Configure environment variables

In Railway dashboard, for **each service**, add these variables:

**Shared across both services:**
```
PUBLIC_CONVEX_URL=https://disciplined-spider-126.convex.cloud
PUBLIC_CONVEX_SITE_URL=https://disciplined-spider-126.convex.site
BETTER_AUTH_SECRET=<copy from current Netlify>
VITE_VAPID_PUBLIC_KEY=<copy from current Netlify>
VAPID_PRIVATE_KEY=<copy from current Netlify>
```

**Web-specific:**
```
SITE_URL=<railway web service URL, set after first deploy>
VERIFIER_SITE_URL=<railway verifier service URL, set after first deploy>
```

**Verifier-specific:**
```
SITE_URL=<railway verifier service URL, set after first deploy>
VERIFIER_SITE_URL=<railway verifier service URL, set after first deploy>
```

Note: `SITE_URL` and `VERIFIER_SITE_URL` create a chicken-and-egg problem. Deploy first with placeholder values, grab the `*.up.railway.app` URLs, then update.

PayFast/billing/Google Translate vars are Convex-side env vars (set in Convex dashboard), not needed in Railway.

#### 2.5 Generate Railway domains

In each service's settings → Networking → Generate Domain. This gives you `web-production-XXXX.up.railway.app` and `verifier-production-XXXX.up.railway.app`.

#### 2.6 Update CORS / auth config

After getting Railway URLs, update:

1. **Convex Better Auth config** - add Railway origins to trusted origins / CORS
2. **`SITE_URL`** env var on Railway web service → set to Railway web URL
3. **`VERIFIER_SITE_URL`** env var on Railway verifier service → set to Railway verifier URL

### Success Criteria:

#### Automated Verification:

- [ ] `railway status` shows project with 2 services
- [ ] Both services show "Active" deployment status in Railway dashboard

#### Manual Verification:

- [ ] Web app loads at `*.up.railway.app` URL
- [ ] Verifier app loads at `*.up.railway.app` URL
- [ ] Login works on both apps (auth callbacks resolve correctly)
- [ ] Practice session flow works end-to-end on web app
- [ ] Verifier review queue loads and functions

**Pause here for manual confirmation before proceeding to Phase 3.**

---

## Phase 3: Cleanup

### Overview

Remove Netlify, update CI if needed, verify auto-deploys.

### Steps:

#### 3.1 Verify Railway auto-deploy

Push a small change to `main`. Confirm:
- Railway detects the push
- Only the affected service rebuilds (watch patterns working)
- Deploy completes successfully

#### 3.2 Delete Netlify sites

1. Go to Netlify dashboard
2. Delete the web site
3. Delete the verifier site
4. (Optional) Delete Netlify account if no other sites

#### 3.3 Remove adapter-netlify from lockfile

Already done in Phase 1, but verify `@sveltejs/adapter-netlify` is fully gone:

```bash
bun pm ls | grep netlify
# Should return nothing
```

#### 3.4 Update any hardcoded Netlify URLs

Search codebase for old Netlify URLs and replace with Railway URLs:

```bash
# Search for any netlify references
grep -r "netlify" --include="*.ts" --include="*.js" --include="*.svelte" --include="*.json" --include="*.md"
```

### Success Criteria:

#### Automated Verification:

- [ ] No references to `netlify` in source code (excluding git history)
- [ ] `bun run check` passes
- [ ] `bun run test:run` passes

#### Manual Verification:

- [ ] Push to `main` triggers Railway deploy (not Netlify)
- [ ] Both apps accessible and functional after auto-deploy
- [ ] Netlify sites are deleted

---

## Environment Variables Summary

| Variable | Where | Notes |
|---|---|---|
| `PUBLIC_CONVEX_URL` | Railway (both) | Convex deployment URL |
| `PUBLIC_CONVEX_SITE_URL` | Railway (both) | Convex HTTP endpoint |
| `SITE_URL` | Railway (both) | Set to respective Railway URL |
| `VERIFIER_SITE_URL` | Railway (both) | Verifier Railway URL |
| `BETTER_AUTH_SECRET` | Railway (both) | Copy from Netlify |
| `VITE_VAPID_PUBLIC_KEY` | Railway (both) | Copy from Netlify |
| `VAPID_PRIVATE_KEY` | Railway (both) | Copy from Netlify |
| `OPENAI_API_KEY` | Convex dashboard | Not needed in Railway |
| `GOOGLE_TRANSLATE_API_KEY` | Convex dashboard | Not needed in Railway |
| `PAYFAST_*` | Convex dashboard | Not needed in Railway |

## References

- [Railway SvelteKit guide](https://docs.railway.com/guides/sveltekit)
- [Railway monorepo guide](https://docs.railway.com/guides/monorepo)
- [Railway config-as-code](https://docs.railway.com/config-as-code/reference)
- [SvelteKit adapter-node docs](https://svelte.dev/docs/kit/adapter-node)
