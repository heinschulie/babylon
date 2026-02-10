---
date: 2026-02-10T14:00:00+02:00
researcher: heinschulie
git_commit: 4d9d0ff09fd592aa72a6b3a0ef402534c9c7002f
branch: codex/extended-architecture
repository: heinschulie/babylon
topic: "Monorepo deployment appraisal - best route forward"
tags: [research, codebase, monorepo, deployment, netlify, railway, vercel, cloudflare, turborepo, sveltekit]
status: complete
last_updated: 2026-02-10
last_updated_by: heinschulie
---

# Research: Monorepo Deployment Appraisal

**Date**: 2026-02-10T14:00:00+02:00
**Researcher**: heinschulie
**Git Commit**: 4d9d0ff
**Branch**: codex/extended-architecture
**Repository**: heinschulie/babylon

## Research Question

The repo was recently restructured into a turborepo monorepo with two SvelteKit frontends (`web`, `verifier`), shared packages, and a Convex backend. The Netlify CI/CD pipeline broke during the transition. What is the simplest path forward for deploying multiple SvelteKit frontends from a monorepo?

## Summary

### What you have

A clean turborepo monorepo that is **structurally sound**. The monorepo layout, workspace config, turbo tasks, and shared packages are all wired correctly. The apps build locally. The problem is purely at the deployment layer - specifically, the GitHub Actions workflow for Netlify deploys.

### What went wrong

The last 4 commits on `codex/extended-architecture` are all CI fixes:
1. `3947e11` - Added Netlify deploy workflow
2. `198cb61` - Fixed env defaults and branch checks
3. `4d9d0ff` - Skipped deploy when `NETLIFY_AUTH_TOKEN` secret missing

The deploy workflow uses `netlify-cli` via GitHub Actions to deploy pre-built artifacts. The issue is likely that `NETLIFY_AUTH_TOKEN` isn't set as a GitHub secret, so the deploy jobs skip/fail silently.

### The honest appraisal

Your Netlify setup is **not fundamentally broken** - it just needs the secret configured and possibly a few tweaks. But the approach (GitHub Actions building monorepo + CLI-deploying to two separate Netlify sites) is inherently more complex than it needs to be. Every new frontend you add means updating two matrix configs, managing another site ID, etc.

## Detailed Findings

### Current Architecture

```
babylon/
  apps/
    web/          - @babylon/web (SvelteKit + adapter-netlify)
    verifier/     - @babylon/verifier (SvelteKit + adapter-netlify)
  packages/
    convex/       - @babylon/convex (re-exports generated types)
    ui/           - @babylon/ui (placeholder)
    shared/       - @babylon/shared (placeholder)
  convex/         - Convex backend functions (deployed separately via convex deploy)
  .github/
    workflows/
      ci.yml              - typecheck + test + build (works fine)
      deploy-netlify.yml  - matrix deploy to 2 Netlify sites
```

**Key facts:**
- Both apps use `@sveltejs/adapter-netlify` - generates serverless functions for SSR
- Both apps read env from monorepo root via `envDir: '../..'`
- Convex is a BaaS - deploys independently via `bunx convex deploy`, not to Netlify/Railway
- Both apps have identical dependencies (same auth, same UI libs, same Convex client)

### Current Netlify Deploy Flow

```
GitHub push to main
  -> GitHub Actions: deploy-netlify.yml
    -> matrix[web]: bun install -> bun run build:web -> netlify-cli deploy --prod
    -> matrix[verifier]: bun install -> bun run build:verifier -> netlify-cli deploy --prod
```

Each deploy uses `--no-build` and pushes pre-built artifacts + generated Netlify Functions. The workflow requires `NETLIFY_AUTH_TOKEN` as a GitHub secret and hardcodes two Netlify site IDs.

## Platform Comparison

### Option 1: Fix Netlify (Lowest effort)

**What to do:**
1. Add `NETLIFY_AUTH_TOKEN` GitHub secret
2. Verify the two Netlify site IDs are correct and sites exist
3. That's probably it

**Pros:**
- Least work right now
- The deploy workflow already exists and looks correct
- Free tier: 100GB bandwidth, 300 build minutes/mo

**Cons:**
- Every new frontend = edit 2 YAML matrices + create new Netlify site + get site ID
- Build minutes burn fast in monorepos (full install for every app deploy)
- `adapter-netlify` locks you into Netlify's serverless function format
- More YAML to maintain as you grow

**Verdict:** If you just want to ship today, fix the secret and go.

### Option 2: Vercel (Best Turborepo integration)

**What to do:**
1. Switch adapters from `adapter-netlify` to `adapter-vercel` (or `adapter-auto`)
2. Create 2 Vercel projects, each pointed at its app directory
3. Push to main = both apps deploy

**Pros:**
- Vercel owns Turborepo - best native support
- Automatic build skipping: only rebuilds apps with changes
- One project per app, configure root directory, done
- Free for personal/hobby

**Cons:**
- $20/user/month on Pro (gets expensive with teams)
- Still need to manually create a project per app
- Vendor lock-in to Vercel's serverless primitives

**Verdict:** Strong choice if you're a solo dev or small team. Gets expensive fast with seats.

### Option 3: Railway (Best "don't think about it")

**What to do:**
1. Switch adapters from `adapter-netlify` to `adapter-node`
2. Import repo into Railway - it auto-detects the monorepo and stages a service per package
3. Push to main = both apps deploy

**Pros:**
- Auto-detects JS monorepo packages and creates services
- Watch paths prevent cross-service rebuilds
- Usage-based pricing ($5-15/mo typical)
- Can add databases alongside apps later
- Conceptually simpler: each app is a long-running Node process, not serverless functions

**Cons:**
- No permanent free tier ($5 trial credits, then $5/mo hobby)
- Fewer edge locations than Vercel/Cloudflare
- `adapter-node` means you run a Node server, not serverless (different mental model)

**Verdict:** Best match for "I don't want to think about deployment." Import, deploy, forget.

### Option 4: Cloudflare Pages (Best free tier)

**What to do:**
1. Switch adapters to `adapter-cloudflare`
2. Create projects per app in CF dashboard

**Pros:**
- Unlimited bandwidth free forever
- $5/mo paid tier
- Great edge performance

**Cons:**
- Max 5 projects per repo
- Manual config per project
- SvelteKit SSR on Workers has edge cases
- Least streamlined monorepo support

**Verdict:** Great economics, more manual setup, potential SSR quirks.

### Convex (not affected by this choice)

Convex deploys independently via `bunx convex deploy`. It runs on Convex's own cloud infrastructure. Your frontend hosting choice does not affect Convex at all.

## Honest Recommendation

**If you want to ship today:** Fix Netlify. Add the GitHub secret. Your workflow is 95% there.

**If you want the simplest long-term path:** Railway. Switch to `adapter-node`, import repo, Railway auto-detects both apps, push-to-deploy works out of the box. ~$10/mo.

**If you want the "industry standard" path:** Vercel. Best Turborepo integration since they own it. Free hobby tier. But per-seat pricing is a trap if your team grows.

The key insight: your monorepo structure is fine. The turborepo config is fine. The problem is purely "how do I get builds deployed." Any of these platforms will work. Railway requires the least ongoing thought, which is what you asked for.

## What Switching to Railway Would Involve

1. `bun add -D @sveltejs/adapter-node` in both apps
2. Change `adapter-netlify` -> `adapter-node` in both `svelte.config.js` files
3. Remove `netlify.toml` files (root + apps)
4. Remove `.github/workflows/deploy-netlify.yml`
5. Remove `hashCharacters: 'hex'` from vite configs (Netlify-specific workaround)
6. Import repo into Railway, let it auto-detect services
7. Set env vars in Railway dashboard
8. Done

## What Fixing Netlify Would Involve

1. Add `NETLIFY_AUTH_TOKEN` as a GitHub Actions secret
2. Verify both Netlify sites exist with correct site IDs
3. Push to main
4. Done (probably)

## Code References

- `package.json:1-38` - Root monorepo config
- `turbo.json:1-39` - Turbo task definitions
- `apps/web/svelte.config.js:1` - adapter-netlify import
- `apps/verifier/svelte.config.js:1` - adapter-netlify import
- `apps/web/vite.config.ts:14-18` - Netlify-specific hex hash workaround
- `apps/verifier/vite.config.ts:14-18` - Same workaround
- `.github/workflows/deploy-netlify.yml:1-91` - Full Netlify deploy workflow
- `.github/workflows/ci.yml:1-46` - CI workflow (working)
- `netlify.toml:1-6` - Root Netlify build config
- `netlify.verifier.toml:1-6` - Verifier Netlify config
- `packages/convex/src/index.ts:1-2` - Shared Convex type re-exports

## Open Questions

- Is `NETLIFY_AUTH_TOKEN` set in GitHub secrets? If not, that's likely the whole problem
- Do you have existing users/traffic on the current Netlify domains?
- Do you need SSR or could you go static (adapter-static)?
- Budget preference? (Free tier matters → Netlify/Vercel/CF. Don't care → Railway)
- Solo dev or team? (Affects Vercel pricing)
