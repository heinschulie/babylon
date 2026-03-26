---
date: 2026-03-25T00:00:00+02:00
researcher: Claude
git_commit: 4a209d8
branch: hein/feature/issue-61
repository: babylon
topic: 'Auth system architecture and implementation'
tags: [research, codebase, auth, better-auth, convex, sveltekit]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: Auth

## Research Question

How does authentication work across the Babylon codebase?

## Summary

Babylon uses **Better Auth** with the **@convex-dev/better-auth** adapter and **@mmailaender/convex-better-auth-svelte** for SvelteKit integration. Auth supports **email/password only** (no OAuth/social). The system spans three layers: Convex backend (auth factory, HTTP routes, user identity resolution), SvelteKit server (token extraction via hooks), and client (reactive stores, route guards). Both `apps/web` and `apps/verifier` share identical auth wiring. Testing uses Convex's native `withIdentity()` mechanism, bypassing Better Auth entirely.

## Detailed Findings

### 1. Backend Auth Factory

**`convex/auth.ts`** (178 lines) — Central auth configuration.

- Creates Better Auth instance via `createClient<DataModel>()` from `@convex-dev/better-auth`
- Plugins: `emailAndPassword`, `organization` (teams enabled), `convex`
- Environment variables:
  - **Required**: `SITE_URL`, `BETTER_AUTH_SECRET`
  - **Optional**: `VERIFIER_SITE_URL`, `NODE_ENV`, `AUTH_REQUIRE_EMAIL_VERIFICATION`, `AUTH_ALLOW_LOCALHOST_ORIGINS`, `AUTH_ALLOW_UNVERIFIED_EMAILS_PROD`, `AUTH_EXTRA_TRUSTED_ORIGINS`
- Trusted origins built dynamically (lines 105-135): production requires https, dev allows localhost
- Email verification defaults to on in production (lines 87-102)

**`convex/auth.config.ts`** (6 lines) — Minimal bridge exporting `getAuthConfigProvider()`.

**`convex/convex.config.ts`** (7 lines) — Registers `betterAuth` as Convex component via `app.use(betterAuth)`.

**`convex/http.ts`** (16 lines) — `authComponent.registerRoutes(http, createAuth, { cors: true })` exposes `/api/auth/*` endpoints.

### 2. User Identity Resolution

**`convex/lib/auth.ts`** (27 lines) — `getAuthUserId(ctx)` helper with dual strategy:

1. **Convex native identity** (`ctx.auth.getUserIdentity()`) — used in tests via `withIdentity()`
2. **Better Auth fallback** (`authComponent.getAuthUser(ctx)`) — used in production with session tokens
3. Throws `'Not authenticated'` if both fail

Every public Convex function calls `getAuthUserId(ctx)` as its first line. Ownership checks are inline (userId matching), not role-based.

### 3. Database Schema

**`convex/schema.ts`** — Auth-related tables:

- **Better Auth auto-managed**: `users`, `sessions`, `accounts`, `verification`, `twoFactor`, `passkey`, `oauthApplication`, `oauthAccessToken`, `oauthConsent`, `jwks`, `rateLimit`
- **App tables keyed by `userId: v.string()`**:
  - `userPreferences` (lines 226-236): locale, skin, notifications, push subscription, timezone
  - `verifierProfiles` (lines 103-112): firstName, profileImageUrl, active status
  - `billingSubscriptions` (lines 239-254): PayFast integration, plan/status
  - `entitlements` (lines 257-263): tier gating (tier, status, source)

### 4. SvelteKit Server Integration

Identical in both apps (`apps/web` and `apps/verifier`):

**`src/hooks.server.ts`** (47 lines) — Three hooks via `sequence()`:
1. Security headers (HSTS, CSP)
2. i18n (Paraglide)
3. Auth: `getToken(createAuth, event.cookies)` → stores token in `event.locals.token`

**`src/lib/server/auth.ts`** (27 lines) — Minimal Better Auth instance for token/cookie parsing only. Trusted origins include localhost dev ports + env vars.

**`src/routes/api/auth/[...all]/+server.ts`** (6 lines) — Catch-all route via `createSvelteKitHandler()` from `@mmailaender/convex-better-auth-svelte/sveltekit`. Exports GET and POST.

**`src/app.d.ts`** — Declares `App.Locals { token?: string }`.

### 5. Client-Side Auth

**`packages/shared/src/auth-client.ts`** (7 lines) — Shared `authClient` created via `createAuthClient()` from `better-auth/svelte` with `organizationClient()` and `convexClient()` plugins.

**`packages/shared/src/stores/auth.ts`** (25 lines) — Reactive Svelte stores:
- `session`: Raw session from `authClient.useSession()` (data, isPending, error, refetch)
- `isAuthenticated`: Derived boolean
- `isLoading`: Derived from isPending
- `user`: Derived user object or null

**Root `+layout.svelte`** (both apps):
- Calls `setupConvex(CONVEX_URL)`
- Calls `createSvelteAuthClient({ authClient, convexUrl })` to bridge auth ↔ Convex
- Conditionally fetches user preferences when `$isAuthenticated`

### 6. Auth UI

**Login** (`apps/web/src/routes/login/+page.svelte`, 68 lines):
- Email/password form → `authClient.signIn.email()` → `goto('/')`

**Register** (`apps/web/src/routes/register/+page.svelte`, 74 lines):
- Email/password form → `authClient.signUp.email()` → `goto('/')`

**Logout** (`packages/ui/src/components/header/Header.svelte`):
- `authClient.signOut()` → `goto('/login')`

**Route guards** — Client-side only via `$effect()`:
- Watch `$isLoading && !$isAuthenticated` → `goto('/login')`
- No server-side route protection

### 7. Testing

**`apps/web/src/lib/stores/auth.test.ts`** (106 lines) — Vitest suite mocking `authClient`, testing reactive store behavior for authenticated/unauthenticated/loading states.

**Convex function tests** (e.g., `convex/phrases.test.ts`) — Use `t.withIdentity({ subject: 'userId' })` which feeds into `getAuthUserId()`'s native identity path.

## Code References

- `convex/auth.ts:1-178` — Main auth factory with env config and trusted origins
- `convex/auth.config.ts:1-6` — Auth config provider bridge
- `convex/convex.config.ts:1-7` — Better Auth component registration
- `convex/http.ts:1-16` — HTTP route registration with CORS
- `convex/lib/auth.ts:1-27` — `getAuthUserId()` dual-strategy helper
- `convex/schema.ts:103-263` — User-related and auth tables
- `packages/shared/src/auth-client.ts:1-7` — Shared Better Auth client
- `packages/shared/src/stores/auth.ts:1-25` — Reactive auth stores
- `apps/web/src/hooks.server.ts:33-37` — Token extraction hook
- `apps/web/src/lib/server/auth.ts:1-27` — App-level auth config
- `apps/web/src/routes/api/auth/[...all]/+server.ts:1-6` — Catch-all API route
- `apps/web/src/routes/+layout.svelte:18-21` — Auth client initialization
- `apps/web/src/routes/login/+page.svelte:1-68` — Login page
- `apps/web/src/routes/register/+page.svelte:1-74` — Register page
- `apps/web/src/lib/stores/auth.test.ts:1-106` — Auth store tests

## Architecture Documentation

**Auth flow (production)**:
```
User credentials → SvelteKit catch-all /api/auth/* → Convex HTTP routes
→ Better Auth processes → session in Convex DB → cookie set
→ subsequent requests: hook extracts token → Convex functions use getAuthUserId()
```

**Auth flow (testing)**:
```
t.withIdentity({ subject: 'userId' }) → getAuthUserId() reads native identity → skips Better Auth
```

**Key patterns**:
- All route protection is client-side (`$effect` + `goto`)
- No server-side middleware guards
- `userId` is a string (not Convex ID) across all app tables
- Both apps (web + verifier) share identical auth wiring
- `packages/ui` components receive auth state via store imports, not props

## Open Questions

- No server-side route protection — intentional or gap?
- Password reset flow — no UI found
- Email verification UI — no dedicated page found
- Organization plugin enabled but usage unclear beyond setup
- `AUTH_ALLOW_UNVERIFIED_EMAILS_PROD` — under what circumstances is this used?
