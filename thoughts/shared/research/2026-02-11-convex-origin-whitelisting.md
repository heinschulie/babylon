---
date: 2026-02-11T06:38:17Z
researcher: heinschulie
git_commit: b8d5f024a0b7d59a785c1f73adb4015710a3daf3
branch: codex/extended-architecture
repository: babylon
topic: "Convex origin whitelisting for multiple apps sharing one backend"
tags: [research, codebase, convex, better-auth, cors, origins, multi-app]
status: complete
last_updated: 2026-02-11
last_updated_by: heinschulie
---

# Research: Convex Origin Whitelisting for Multiple Apps

**Date**: 2026-02-11T06:38:17Z
**Researcher**: heinschulie
**Git Commit**: b8d5f024a0b7d59a785c1f73adb4015710a3daf3
**Branch**: codex/extended-architecture
**Repository**: babylon

## Research Question

When logging into the verifier app, an "Invalid origin" error occurs. How does origin validation work with Convex + BetterAuth, and how to whitelist multiple URLs when multiple apps share one backend?

## Summary

The codebase already has the architecture for multi-origin support. BetterAuth's `trustedOrigins` array is configured in three places (Convex backend, web app server, verifier app server) and accepts multiple URLs. The "Invalid origin" error is almost certainly caused by the `VERIFIER_SITE_URL` environment variable not being set in one or more of these locations (Convex dashboard, web app Railway service, verifier app Railway service).

## Detailed Findings

### Current Auth Architecture

The project uses **BetterAuth** with the **@convex-dev/better-auth** adapter. Auth is configured in three locations that must stay in sync:

1. **Convex backend** (`convex/auth.ts:14-43`) - the source of truth
2. **Web app server** (`apps/web/src/lib/server/auth.ts:9-27`) - minimal config for cookie parsing
3. **Verifier app server** (`apps/verifier/src/lib/server/auth.ts:9-27`) - identical to web app

### Origin Validation Configuration

All three locations build the same `trustedOrigins` array (`convex/auth.ts:16-22`):

```typescript
const verifierSiteUrl = process.env.VERIFIER_SITE_URL;
const trustedOrigins = [
    'http://localhost:5173',
    'http://localhost:5178',
    'http://localhost:5180',
    siteUrl,          // from SITE_URL env var
    verifierSiteUrl   // from VERIFIER_SITE_URL env var
].filter(Boolean) as string[];
```

The `.filter(Boolean)` removes `undefined` if `VERIFIER_SITE_URL` is not set.

### Environment Variables Involved

| Variable | Where Set | Purpose |
|----------|-----------|---------|
| `SITE_URL` | Convex dashboard, web Railway service, verifier Railway service | Primary app URL, used as `baseURL` for BetterAuth |
| `VERIFIER_SITE_URL` | Convex dashboard, web Railway service, verifier Railway service | Verifier app URL, added to `trustedOrigins` |
| `BETTER_AUTH_SECRET` | All three locations | Must be identical everywhere |

### Current `.env` / `.env.local` State

- `.env` (production): `SITE_URL=https://disciplined-spider-126.convex.site` - **no `VERIFIER_SITE_URL` set**
- `.env.local` (dev): `SITE_URL=http://localhost:5173` - **no `VERIFIER_SITE_URL` set**

### HTTP Router CORS

`convex/http.ts:6-8` registers auth routes with `cors: true`:

```typescript
authComponent.registerRoutes(http, createAuth, {
    cors: true
});
```

This enables CORS headers on the Convex HTTP Actions endpoints (`*.convex.site`).

### Auth Request Flow

1. User submits login on verifier app
2. BetterAuth client POSTs to `/api/auth/sign-in/email` (local SvelteKit route)
3. SvelteKit handler (`apps/verifier/src/routes/api/auth/[...all]/+server.ts`) proxies to Convex
4. Convex BetterAuth validates request `Origin` header against `trustedOrigins`
5. If origin not in list -> **"Invalid origin" error**

### Why the Error Occurs

The `VERIFIER_SITE_URL` environment variable is **not set** in:
- The Convex dashboard environment variables
- Likely not set in the Railway service environment variables for the verifier app

Without `VERIFIER_SITE_URL`, the verifier's production URL is excluded from `trustedOrigins`, causing BetterAuth to reject the request.

### How to Fix

Set `VERIFIER_SITE_URL` in **all three locations**:

1. **Convex dashboard**: `npx convex env set VERIFIER_SITE_URL https://<verifier-railway-domain>`
2. **Web app Railway service**: Add `VERIFIER_SITE_URL=https://<verifier-railway-domain>` env var
3. **Verifier app Railway service**: Add `VERIFIER_SITE_URL=https://<verifier-railway-domain>` env var

Also ensure `SITE_URL` on the verifier Railway service points to the **web app's URL** (since `baseURL` in BetterAuth uses `SITE_URL`).

### Adding More Apps in the Future

To add more apps sharing this backend:

1. Add a new env var (e.g., `NEW_APP_SITE_URL`)
2. Include it in the `trustedOrigins` array in all three auth files
3. Set the env var in Convex dashboard + all Railway services

Alternatively, for many origins, store a comma-separated string and parse:

```typescript
const extraOrigins = (process.env.EXTRA_ORIGINS || '').split(',').filter(Boolean);
const trustedOrigins = [
    'http://localhost:5173',
    siteUrl,
    ...extraOrigins
];
```

## Code References

- `convex/auth.ts:14-43` - Convex backend BetterAuth config with `trustedOrigins`
- `convex/http.ts:6-8` - HTTP router with CORS enabled
- `apps/web/src/lib/server/auth.ts:16-26` - Web app server auth config
- `apps/verifier/src/lib/server/auth.ts:16-26` - Verifier app server auth config
- `apps/verifier/src/routes/api/auth/[...all]/+server.ts` - Verifier auth proxy route
- `.env:8` - Production SITE_URL (no VERIFIER_SITE_URL)
- `.env.local:6` - Dev SITE_URL (no VERIFIER_SITE_URL)

## Architecture Documentation

### Multi-App Auth Pattern

```
[Web App]          [Verifier App]
    |                    |
    v                    v
/api/auth/*          /api/auth/*
(SvelteKit proxy)    (SvelteKit proxy)
    |                    |
    +--------+-----------+
             |
             v
   Convex HTTP Actions
   (*.convex.site/api/auth/*)
             |
             v
   BetterAuth validates Origin
   against trustedOrigins[]
             |
             v
   Convex DB (shared)
```

Both apps proxy auth requests through their own SvelteKit servers to avoid cross-origin cookie issues. The Convex backend validates the `Origin` header of incoming requests against the `trustedOrigins` array.

### Key Convex Docs on Multi-Origin

- BetterAuth `trustedOrigins` is the correct mechanism for multiple frontends
- Convex env vars are single strings (max 8KB, max 100 vars per deployment)
- `authComponent.registerRoutes(http, createAuth, { cors: true })` handles CORS headers automatically
- Each frontend app needs its own `/api/auth/[...all]` proxy route for same-origin cookies

## Related Research

- `thoughts/shared/research/2026-02-10-netlify-to-railway-migration.md` - Railway migration (mentions SITE_URL chicken-and-egg problem)
- `thoughts/shared/plans/2026-01-23-cross-origin-auth-fix.md` - Original cross-origin auth fix plan

## Open Questions

- What is the verifier app's Railway domain? (needed to set `VERIFIER_SITE_URL`)
- Is `VERIFIER_SITE_URL` set in the Convex dashboard currently?
- Should `SITE_URL` on the verifier service point to the web app URL or the verifier URL? (currently both server auth configs use `SITE_URL` as `baseURL`, which may need to differ per app)
