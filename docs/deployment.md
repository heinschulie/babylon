---
date: 2026-03-25T12:00:00+02:00
researcher: Claude
git_commit: 4a209d8
branch: hein/feature/issue-61
repository: babylon
topic: 'deployment'
tags: [research, codebase, deployment, railway, convex, ci-cd, environment]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: Deployment

## Research Question

How is the Babylon monorepo deployed? Full audit of deployment configs, build pipeline, env vars, and secrets.

## Summary

Three services: two SvelteKit Node apps on **Railway** (auto-deploy on push to `main`) + serverless backend on **Convex Cloud** (`disciplined-spider-126`). CI via GitHub Actions (no auto-deploy). Convex deploy is manual. Prior research at `docs/deployment.md` (2026-03-21) confirmed current — this doc adds deeper env var and build detail.

## Detailed Findings

### Railway (Frontend Hosting)

Both apps deploy via Railway RAILPACK builder with identical configs:

- **apps/web/railway.toml** — Build: `bun run build:web`, Start: `node apps/web/build/index.js`
- **apps/verifier/railway.toml** — Build: `bun run build:verifier`, Start: `node apps/verifier/build/index.js`
- Health check: `GET /`, 300s timeout
- Restart: `ON_FAILURE`, max 3 retries
- Watch patterns: `apps/{web,verifier}/**` + `packages/**` (shared changes trigger redeploy)

### Convex Cloud (Backend)

- Deployment ID: `disciplined-spider-126`
- API: `https://disciplined-spider-126.convex.cloud`
- HTTP site: `https://disciplined-spider-126.convex.site`
- Routes: `/api/auth/*` (Better Auth), `/webhooks/payfast`
- Cron: daily 06:00 UTC notification rescheduling
- Manual deploy: `bun run convex:deploy` / `bunx convex deploy`
- Config: `convex.json` → `convex/` functions dir
- Component: `@convex-dev/better-auth` integrated via `convex.config.ts`

### CI/CD: GitHub Actions

- `.github/workflows/ci.yml` — triggers on PR + push to `main`
- Matrix: `@babylon/web` + `@babylon/verifier` in parallel
- Steps: checkout → Bun 1.3.9 → `bun install --frozen-lockfile` → typecheck → test → build
- Placeholder env vars for CI (lines 12-17): `PUBLIC_CONVEX_URL`, `SITE_URL`, `BETTER_AUTH_SECRET`
- **No auto-deploy** of Railway or Convex from CI

### Build Pipeline

**Adapter:** `@sveltejs/adapter-node` v5.0.0 (both apps)
- Output: `build/` dir with `index.js` (Node HTTP server) + `handler.js`
- Stale `.netlify/` dirs remain from previous Netlify hosting

**Turbo:** `turbo.json` — 8 tasks, `^build` dependency graph
- Build outputs: `build/**`, `.svelte-kit/**`, `dist/**`

**Vite:** v7.2.6 with plugins: paraglide (i18n), Tailwind CSS 4, SvelteKit
- `envDir: workspaceRoot` → reads `.env` from monorepo root
- Allowed hosts: `dev.schulie.com` (web), `verifier.schulie.com` (verifier)

**Scripts (root package.json):**
- `bun run build` — full Turbo build
- `bun run build:web` / `bun run build:verifier` — filtered builds
- `bun run convex:deploy` — production Convex push

### Environment Variables

All `.env` files at monorepo root. Apps access via `envDir: '../..'` in svelte.config.js + vite.config.ts.

#### Access Patterns by Runtime

| Runtime | Import Pattern | Example |
|---------|----------------|---------|
| Browser | `import.meta.env.VITE_*` | `VITE_VAPID_PUBLIC_KEY` |
| SvelteKit server | `$env/static/public`, `$env/dynamic/private` | `PUBLIC_CONVEX_URL`, `SITE_URL` |
| Convex actions | `process.env.*` | API keys, merchant IDs, secrets |
| ADW workflows (Bun) | `process.env.*` | `R2_*`, `CONVEX_ANTHROPIC_API_KEY` |

#### Public (3)

| Variable | Purpose |
|----------|---------|
| `PUBLIC_CONVEX_URL` | Convex API endpoint (browser) |
| `PUBLIC_CONVEX_SITE_URL` | Convex HTTP routes (auth) |
| `VITE_VAPID_PUBLIC_KEY` | Web push VAPID public key |

#### Required Private (10)

| Variable | Purpose |
|----------|---------|
| `SITE_URL` | BetterAuth baseURL |
| `BETTER_AUTH_SECRET` | Session encryption (32-byte hex) |
| `CONVEX_ANTHROPIC_API_KEY` | Claude feedback + translation |
| `OPENAI_API_KEY` | Whisper transcription |
| `VAPID_PRIVATE_KEY` | Web push signing |
| `PAYFAST_MERCHANT_ID` | PayFast account |
| `PAYFAST_MERCHANT_KEY` | PayFast API key |
| `PAYFAST_RETURN_URL` | Post-payment redirect |
| `PAYFAST_CANCEL_URL` | Payment cancel redirect |
| `PAYFAST_NOTIFY_URL` | Webhook endpoint (must be public) |

#### Optional Private (11+)

| Variable | Purpose |
|----------|---------|
| `VERIFIER_SITE_URL` | Cross-origin auth for verifier |
| `GOOGLE_TRANSLATE_API_KEY` | Translation verification (degrades gracefully) |
| `UNSPLASH_ACCESS_KEY` | Random photo lookup (degrades) |
| `PAYFAST_PASSPHRASE` | Webhook signature |
| `PAYFAST_SANDBOX` | Sandbox/live toggle |
| `PAYFAST_ENABLE_RECURRING` | Subscription mode |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | Override email verify in prod |
| `AUTH_ALLOW_LOCALHOST_ORIGINS` | Allow localhost in prod |
| `AUTH_EXTRA_TRUSTED_ORIGINS` | Comma-separated extra origins |
| `BILLING_DEV_TOGGLE` | Dev tier switching |
| `R2_*` (5 vars) | Cloudflare R2 storage for ADW workflows |

#### Env Validation

- `packages/shared/src/convex.ts:6-8` — throws if `PUBLIC_CONVEX_URL` missing
- `convex/auth.ts:60-85` — `readAuthEnv()`: `requireEnv()` + `parseBooleanEnv()` + `parseCommaSeparatedEnv()`
- `convex/billing.ts:155-160` — `requireEnv()` for PayFast creds
- `convex/notificationsNode.ts:49-51` — both VAPID keys required
- `adws/src/r2-uploader.ts:25-28` — all R2 creds required together; degrades if any missing

### Dev Tooling

- **Cloudflare Tunnel:** `cloudflared tunnel run babylon-dev` → `dev.schulie.com`
- **justfile:** Local CLI recipes wrapping Turbo + Convex commands
- **Codegen check:** `scripts/check-convex-generated.sh` — CI fails if `convex/_generated/` stale

## Code References

- `apps/web/railway.toml` — Railway deploy config (web)
- `apps/verifier/railway.toml` — Railway deploy config (verifier)
- `apps/web/svelte.config.js:1,34` — adapter-node, env dir
- `apps/verifier/svelte.config.js:1,34` — adapter-node, env dir
- `apps/web/vite.config.ts:11,22` — envDir, allowedHosts
- `convex.json` — Convex functions directory
- `convex/convex.config.ts:1-7` — Better Auth component integration
- `convex/http.ts` — HTTP routes (auth, webhooks)
- `convex/auth.ts:60-163` — Auth env validation
- `convex/billing.ts:24-160` — Billing env handling
- `convex/aiPipeline.ts:140,233` — OpenAI/Anthropic key usage
- `convex/notificationsNode.ts:49-51` — VAPID key usage
- `convex/crons.ts` — Scheduled jobs
- `.github/workflows/ci.yml` — CI pipeline
- `turbo.json` — Build orchestration
- `.env.example:1-51` — Env var template
- `package.json:10-32` — Root scripts
- `justfile` — Local dev recipes
- `packages/shared/src/convex.ts:2,6-8` — Convex client init + validation
- `scripts/check-convex-generated.sh` — Codegen freshness check

## Architecture Documentation

```
GitHub Actions (CI: typecheck + test + build)
        │
        ▼ (push to main)
  Railway (RAILPACK auto-deploy)
  ┌──────────────┐  ┌─────────────────┐
  │ apps/web     │  │ apps/verifier   │
  │ Node.js      │  │ Node.js         │
  │ (SvelteKit)  │  │ (SvelteKit)     │
  └──────┬───────┘  └────────┬────────┘
         │                   │
         └─────────┬─────────┘
                   ▼
         Convex Cloud (manual deploy)
         disciplined-spider-126
         ┌─────────────────────┐
         │ Functions + Schema  │
         │ HTTP: auth + webhook│
         │ Cron: daily 06:00   │
         └─────────────────────┘
                   │
         ┌────────┼────────┐
         ▼        ▼        ▼
      OpenAI  Anthropic  PayFast
      (Whisper) (Claude) (Billing)
```

## Open Questions

- Railway project/service IDs not in codebase — dashboard-configured?
- Convex env vars set via `npx convex env set` or dashboard?
- Stale `.netlify/` dirs — cleanup needed?
- Staging/preview environment exists?
- `UNSPLASH_ACCESS_KEY` referenced in code but missing from `.env.example`
