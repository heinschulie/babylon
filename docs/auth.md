---
date: 2026-03-21T00:00:00+02:00
researcher: Claude
git_commit: 452e5a1
branch: al
repository: babylon
topic: 'Auth system architecture and implementation'
tags: [research, codebase, auth, better-auth, convex, sveltekit]
status: complete
last_updated: 2026-03-21
last_updated_by: Claude
---

# Research: Auth

## Research Question

How does authentication work across the Babylon monorepo?

## Summary

Babylon uses **Better Auth** with the **`@convex-dev/better-auth`** adapter to run auth entirely on the Convex backend. Email/password is the only auth method (no OAuth). The SvelteKit apps (web + verifier) extract tokens from cookies via server hooks, while client-side reactive stores drive UI guards. A dual-strategy `getAuthUserId()` helper supports both production (Better Auth sessions) and test (Convex native identity) contexts. Better Auth auto-manages 11 infrastructure tables; the app extends these with `userPreferences`, billing, and verifier profile tables keyed by `userId`.

## Detailed Findings

### 1. Server-Side Auth Configuration

**`convex/auth.ts`** — Central auth factory.

- `authComponent` (line 15): Created via `createClient<DataModel>(components.betterAuth)`
- `createAuth(ctx)` (lines 17-47): Returns a `betterAuth` instance configured with:
  - **Email/password** enabled (lines 33-36), email verification configurable
  - **Organization plugin** (line 38): Teams enabled, user org creation disabled
  - **Convex plugin** (line 44): Wires auth to Convex DB adapter
  - **Database**: `authComponent.adapter(ctx)` (line 32)
  - **Trusted origins**: Dynamic — main site, verifier site, optional localhost (lines 103-130)

**`convex/auth.config.ts`** (lines 1-6): Minimal config exporting `getAuthConfigProvider()`.

**`convex/convex.config.ts`** (lines 1-7): Registers `betterAuth` as a Convex component via `app.use(betterAuth)`.

**Environment variables** (`convex/auth.ts` lines 60-82):
| Variable | Required | Purpose |
|---|---|---|
| `SITE_URL` | Yes | Base URL for auth callbacks |
| `BETTER_AUTH_SECRET` | Yes | Auth secret key |
| `VERIFIER_SITE_URL` | No | Cross-origin verifier app |
| `NODE_ENV` | No | Production detection |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | No | Override email verification |
| `AUTH_ALLOW_LOCALHOST_ORIGINS` | No | Allow localhost in prod |
| `AUTH_ALLOW_UNVERIFIED_EMAILS_PROD` | No | Risk acknowledgment bypass |

**Email verification** (lines 85-101): Required by default in production. Explicit `AUTH_ALLOW_UNVERIFIED_EMAILS_PROD=true` needed to disable, with console warning.

### 2. HTTP Route Registration

**`convex/http.ts`** (lines 1-16):
```
authComponent.registerRoutes(http, createAuth, { cors: true })
```
All Better Auth endpoints served at `/api/auth/*` with CORS enabled for cross-origin requests between web and verifier apps.

### 3. Auth Client (Shared)

**`packages/shared/src/auth-client.ts`** (lines 1-7):
- `createAuthClient()` from `better-auth/svelte`
- Plugins: `organizationClient()`, `convexClient()`
- Exposes `signIn.email()`, `signUp.email()`, `signOut()`

### 4. Reactive Auth Stores

**`packages/shared/src/stores/auth.ts`** (lines 1-25):
| Store | Type | Source |
|---|---|---|
| `session` | `{ data, isPending, error, refetch }` | `authClient.useSession()` |
| `isAuthenticated` | `boolean` | `session.data !== null` |
| `isLoading` | `boolean` | `session.isPending` |
| `user` | `User \| null` | `session.data?.user` |

### 5. SvelteKit Hooks (Server)

**`apps/web/src/hooks.server.ts`** and **`apps/verifier/src/hooks.server.ts`** (identical, lines 1-47):

Three sequential middleware via `sequence()`:
1. **securityHeadersHandle** (lines 15-31): CSP, HSTS, etc.
2. **authHandle** (lines 33-37): Extracts token via `getToken(createAuth, event.cookies)` from `@mmailaender/convex-better-auth-svelte/sveltekit`, stores in `event.locals.token`
3. **i18nHandle** (lines 39-45): Paraglide locale

**`apps/web/src/app.d.ts`**: Declares `Locals { token?: string }`.

### 6. SvelteKit Auth API Catch-All

**`apps/web/src/routes/api/auth/[...all]/+server.ts`** (lines 1-6) and verifier equivalent:
- `createSvelteKitHandler()` from `@mmailaender/convex-better-auth-svelte/sveltekit`
- Exports `GET` and `POST` handlers

### 7. App-Level Server Auth (Token-Only)

**`apps/web/src/lib/server/auth.ts`** and verifier equivalent (lines 1-27):
- Minimal `betterAuth` config — no DB, no plugins
- Only used for cookie/token parsing in hooks
- Trusted origins: localhost dev ports + `SITE_URL` + `VERIFIER_SITE_URL`

### 8. Layout Initialization

**`apps/web/src/routes/+layout.svelte`** (lines 1-78):
1. `setupConvex(CONVEX_URL)` (line 16)
2. `createSvelteAuthClient({ authClient, convexUrl: CONVEX_URL })` (lines 18-21)
3. Syncs `userPreferences` locale/skin from Convex on load (lines 23-29)
4. Renders `Header` only when `$isAuthenticated` (line 57)

### 9. Client-Side Route Guards

**Pattern**: Svelte 5 `$effect()` in route components:
```svelte
$effect(() => {
  if (!$isLoading && !$isAuthenticated) {
    goto(resolve('/login'));
  }
});
```

Used in:
- `apps/web/src/routes/+page.svelte` (lines 53-56)
- `apps/web/src/routes/library/+page.svelte`
- `apps/verifier/src/routes/+page.svelte` (lines 16-18)
- `apps/verifier/src/routes/settings/+page.svelte`
- `apps/verifier/src/routes/work/+page.svelte`

**No server-side route protection** — all guards are client-side reactive.

### 10. Login / Register / Logout UI

**Login** (`apps/web/src/routes/login/+page.svelte`, lines 1-67):
- Email/password form → `authClient.signIn.email({ email, password })`
- Redirects to `/` on success

**Register** (`apps/web/src/routes/register/+page.svelte`, lines 1-73):
- Name/email/password form → `authClient.signUp.email({ name, email, password })`
- Redirects to `/` on success

**Logout** (`packages/ui/src/components/header/Header.svelte`, lines 43-46):
- `authClient.signOut()` → `goto('/login')`
- Triggered from dropdown menu in header

Verifier app has identical login/register pages.

**No OAuth/social login** is implemented.

### 11. Backend Auth Helper

**`convex/lib/auth.ts`** (lines 1-28):
- `getAuthUserId(ctx)`: Dual-strategy extraction:
  1. Convex native identity via `ctx.auth.getUserIdentity()` (works in tests with `withIdentity`)
  2. Fallback: `authComponent.getAuthUser(ctx)` (production Better Auth sessions)
  3. Returns `user.userId ?? user._id`
  4. Throws `"Not authenticated"` if both fail

### 12. Auth Database Schema

**Better Auth auto-managed tables** (via `@convex-dev/better-auth` component):
| Table | Key Fields |
|---|---|
| `users` | name, email, emailVerified, image, createdAt |
| `sessions` | token, expiresAt, ipAddress, userAgent, userId |
| `accounts` | accountId, providerId, userId, password |
| `verification` | identifier, value, expiresAt |
| `twoFactor` | secret, backupCodes, userId |
| `passkey` | credentialID, publicKey, userId |
| `oauthApplication` | clientId, clientSecret, name |
| `oauthAccessToken` | accessToken, refreshToken, userId |
| `oauthConsent` | clientId, userId, scopes |
| `jwks` | publicKey, privateKey |
| `rateLimit` | key, count, lastRequest |

**App-specific user tables** (in `convex/schema.ts`):

| Table | Lines | Key Fields |
|---|---|---|
| `userPreferences` | 226-236 | userId, quietHours, notifications, pushSubscription, timeZone, uiLocale, uiSkin, profileImageStorageId |
| `verifierProfiles` | 103-112 | userId, firstName, profileImageUrl, active |
| `verifierLanguageMemberships` | 115-124 | userId, languageCode, active |
| `billingSubscriptions` | 239-254 | userId, provider, plan, status, PayFast refs |
| `entitlements` | 257-263 | userId, tier, status, source |

All domain tables (`sessions`, `phrases`, `userPhrases`, `attempts`, `practiceSessions`, etc.) include `userId: v.string()` with `by_user` indexes.

### 13. Test Support

**`apps/web/src/lib/stores/auth.test.ts`** (106 lines):
- Mocks `authClient` from `@babylon/shared/auth-client`
- Tests reactive stores for authenticated/unauthenticated/loading states

**`convex/lib/auth.ts`**: `getAuthUserId()` supports Convex `withIdentity` for test contexts.

## Code References

- `convex/auth.ts` — Better Auth server config, env vars, trusted origins
- `convex/auth.config.ts` — Auth config provider bridge
- `convex/convex.config.ts` — BetterAuth component registration
- `convex/http.ts` — HTTP route registration with CORS
- `convex/lib/auth.ts` — `getAuthUserId()` dual-strategy helper
- `convex/schema.ts:226-263` — userPreferences, billing, entitlements tables
- `packages/shared/src/auth-client.ts` — Shared Better Auth client
- `packages/shared/src/stores/auth.ts` — Reactive session/user stores
- `packages/ui/src/components/header/Header.svelte:43-46` — Logout handler
- `apps/web/src/hooks.server.ts` — Server-side token extraction
- `apps/web/src/lib/server/auth.ts` — App-level auth config (token-only)
- `apps/web/src/routes/api/auth/[...all]/+server.ts` — Auth API catch-all
- `apps/web/src/routes/login/+page.svelte` — Login UI
- `apps/web/src/routes/register/+page.svelte` — Register UI
- `apps/web/src/routes/+layout.svelte` — Auth client initialization
- `apps/web/src/app.d.ts` — Locals type with token

## Architecture Documentation

**Auth flow (production):**
1. User submits credentials → SvelteKit catch-all → Convex HTTP `/api/auth/*` → Better Auth processes
2. Better Auth stores session in Convex via adapter, sets cookie
3. Subsequent requests: SvelteKit hook extracts token from cookie → `event.locals.token`
4. Client-side: `authClient.useSession()` maintains reactive session state
5. Convex functions: `getAuthUserId(ctx)` reads session from Better Auth component

**Auth flow (tests):**
1. `withIdentity()` injects Convex native identity
2. `getAuthUserId(ctx)` reads identity via `ctx.auth.getUserIdentity()` — skips Better Auth

**Cross-app pattern:** Web and verifier apps share `packages/shared` auth client and stores but have independent SvelteKit hooks, server auth configs, and API catch-all routes. Trusted origins allow cross-origin auth between both apps.

**Guard pattern:** Client-side only via `$effect()` + `goto('/login')`. No server-side redirects or middleware-level protection.

## Open Questions

- No password reset flow found — is it implemented or planned?
- No email verification UI found — how does the user verify their email?
- Organization plugin configured but no org management UI found — is it used?
- All route guards are client-side — is server-side protection intentionally omitted?
