---
date: 2026-03-21T12:00:00+02:00
researcher: Claude
git_commit: 452e5a1
branch: al
repository: babylon
topic: 'deployment'
tags: [research, codebase, deployment, railway, convex, ci-cd]
status: complete
last_updated: 2026-03-21
last_updated_by: Claude
---

# Research: Deployment

## Research Question

How is the Babylon monorepo deployed?

## Summary

A comprehensive deployment research doc already exists at `docs/deployment.md` (2026-03-20) and remains current. This document summarizes the findings and confirms no drift since that doc was written.

**TL;DR:** Three services — two SvelteKit Node apps on **Railway** (auto-deploy on push to `main`) + serverless backend on **Convex Cloud** (`disciplined-spider-126`). CI via GitHub Actions (no auto-deploy). Convex deploy is manual.

## Detailed Findings

### Frontend: Railway

Both apps use `@sveltejs/adapter-node` and deploy via Railway RAILPACK builder.

- `apps/web/railway.toml` — Build: `bun run build:web`, Start: `node apps/web/build/index.js`
- `apps/verifier/railway.toml` — Build: `bun run build:verifier`, Start: `node apps/verifier/build/index.js`
- Health check: `GET /`, 300s timeout, restart ON_FAILURE (max 3)
- Watch patterns include `packages/**` so shared changes trigger redeploy

### Backend: Convex Cloud

- Deployment: `disciplined-spider-126.convex.cloud`
- Manual deploy: `bun run convex:deploy`
- HTTP routes: `/api/auth/*` (Better Auth), `/webhooks/payfast`
- Cron: Daily 06:00 UTC — notification rescheduling
- Auth: Better Auth with email/password, env-validated via `requireEnv()` in `convex/auth.ts`

### CI/CD: GitHub Actions

- `.github/workflows/ci.yml` — PR + push to `main`
- Matrix: web + verifier in parallel
- Steps: checkout → `bun install --frozen-lockfile` → typecheck → test → build
- No auto-deploy of Railway or Convex from CI

### Build Orchestration: Turbo + Bun

- `turbo.json` — 8 tasks with `^build` dependency graph
- Root `package.json` — orchestration scripts for dev, build, deploy, check
- `justfile` — local CLI recipes wrapping Turbo commands

### Environment Variables

All `.env` files live at monorepo root. Apps reference via `envDir: workspaceRoot` in Vite config.

**Public (3):** `PUBLIC_CONVEX_URL`, `PUBLIC_CONVEX_SITE_URL`, `VITE_VAPID_PUBLIC_KEY`

**Required private (10):** `SITE_URL`, `BETTER_AUTH_SECRET`, `CONVEX_ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_RETURN_URL`, `PAYFAST_CANCEL_URL`, `PAYFAST_NOTIFY_URL`, `VAPID_PRIVATE_KEY`

**Optional private (11):** `VERIFIER_SITE_URL`, `GOOGLE_TRANSLATE_API_KEY`, `PAYFAST_PASSPHRASE`, `PAYFAST_SANDBOX`, `AUTH_REQUIRE_EMAIL_VERIFICATION`, `AUTH_ALLOW_LOCALHOST_ORIGINS`, `AUTH_ALLOW_UNVERIFIED_EMAILS_PROD`, `BILLING_DEV_TOGGLE`, `BILLING_DEV_TOGGLE_ALLOWLIST`, `BILLING_DEV_TOGGLE_ADMIN_ALLOWLIST`, `PAYFAST_MINIMAL_CHECKOUT`

### Legacy

Stale `.netlify/` dirs in both apps from previous Netlify deployment. No `netlify.toml` — was UI-configured.

## Code References

- `apps/web/railway.toml` — Railway config (web)
- `apps/verifier/railway.toml` — Railway config (verifier)
- `apps/web/svelte.config.js:1,34` — adapter-node
- `apps/verifier/svelte.config.js:1,34` — adapter-node
- `apps/web/vite.config.ts:11` — envDir
- `convex.json` — Convex functions dir
- `convex/http.ts` — HTTP routes
- `convex/auth.ts:60-163` — Auth env validation
- `convex/billing.ts:24-124` — Billing env handling
- `convex/crons.ts` — Scheduled jobs
- `.github/workflows/ci.yml` — CI pipeline
- `turbo.json` — Build orchestration
- `.env.example` — Env var template
- `package.json:10-32` — Root scripts
- `justfile` — Local dev recipes
- `docs/deployment.md` — Prior comprehensive research

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
- Convex env vars: `npx convex env set` or dashboard?
- Should stale `.netlify/` dirs be cleaned up?
- Staging/preview environment exists?
