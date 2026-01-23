# Cross-Origin Auth Cookie Fix - SvelteKit Server Approach

## Overview

Fix session persistence failure in local development by adopting the community-recommended `@mmailaender/convex-better-auth-svelte` package, which provides proper SvelteKit integration with server-side auth handling.

## Current State Analysis

**The Problem:**

- Auth API calls succeed (login/register work)
- Session cookies set by `*.convex.site` cannot be accessed from `localhost`
- Browser security prevents cross-origin cookie sharing
- Result: User appears logged in momentarily, then session lost on refresh

**Current Configuration:**

- `convex/auth.ts` - Basic better-auth setup without SvelteKit integration
- `src/lib/auth-client.ts` - Direct client-side auth (SPA-style)
- `src/lib/stores/auth.ts` - Manual session store management
- No server hooks or API routes for auth
- Convex files in `convex/` (need to stay there)

## Desired End State

- Auth requests proxied through SvelteKit server (same-origin)
- Sessions persist across page refreshes
- Server-side token extraction for SSR compatibility
- Clean integration with `@mmailaender/convex-better-auth-svelte`

### Verification:

1. Register new user → stays logged in after refresh
2. Login existing user → stays logged in after refresh
3. Logout → session cleared
4. Protected routes work correctly

## What We're NOT Doing

- Not moving Convex files to `src/convex/` (keep current structure)
- Not changing database schema
- Not modifying Convex backend auth logic significantly

---

## Phase 1: Install Dependencies

### Overview

Add the community SvelteKit adapter package.

### Changes Required:

#### 1.1 Install Package

```bash
pnpm add @mmailaender/convex-better-auth-svelte
```

**Note:** The package requires `better-auth@1.4.9` - current version is `^1.4.9` which should be compatible.

### Success Criteria:

#### Automated:

- [ ] Package installs without errors: `pnpm install`
- [ ] No peer dependency warnings for better-auth version

---

## Phase 2: Add SvelteKit Server Infrastructure

### Overview

Add server hooks and API route handler for auth requests.

### Changes Required:

#### 2.1 Create Auth API Route Handler

**File**: `src/routes/api/auth/[...all]/+server.ts` (new file)
**Purpose**: Proxy auth requests through SvelteKit server to Convex

```typescript
import { createSvelteKitHandler } from '@mmailaender/convex-better-auth-svelte/sveltekit';

export const { GET, POST } = createSvelteKitHandler();
```

#### 2.2 Create Server Hooks

**File**: `src/hooks.server.ts` (new file)
**Purpose**: Extract auth token from cookies on each request

```typescript
import type { Handle } from '@sveltejs/kit';
import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { createAuth } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.token = await getToken(createAuth, event.cookies);
	return resolve(event);
};
```

#### 2.3 Create Server-Side Auth Helper

**File**: `src/lib/server/auth.ts` (new file)
**Purpose**: Re-export createAuth for server-side use

```typescript
// Re-export createAuth from convex for server-side token extraction
// This requires importing the convex auth module

import { betterAuth } from 'better-auth';

const siteUrl = process.env.SITE_URL || 'http://localhost:5173';

// Minimal auth config for token extraction (cookies only)
// The actual auth logic runs on Convex
export const createAuth = () => {
	return betterAuth({
		baseURL: siteUrl,
		// Minimal config - just need cookie parsing
		emailAndPassword: { enabled: true }
	});
};
```

#### 2.4 Update App Types

**File**: `src/app.d.ts`
**Changes**: Add token to Locals interface

```typescript
// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			token: string | undefined;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
```

### Success Criteria:

#### Automated:

- [ ] TypeScript compiles: `pnpm run check`
- [ ] Dev server starts: `pnpm run dev`

#### Manual:

- [ ] No errors in terminal on startup

---

## Phase 3: Update Client-Side Auth

### Overview

Replace manual auth client setup with the SvelteKit adapter's client integration.

### Changes Required:

#### 3.1 Update Auth Client

**File**: `src/lib/auth-client.ts`
**Changes**: Keep simple, remove baseURL (requests go to local API route)

```typescript
import { createAuthClient } from 'better-auth/svelte';
import { convexClient } from '@convex-dev/better-auth/client/plugins';

export const authClient = createAuthClient({
	plugins: [convexClient()]
});
```

#### 3.2 Update Root Layout

**File**: `src/routes/+layout.svelte`
**Changes**: Add SvelteKit auth client initialization

```svelte
<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { setContext } from 'svelte';
	import { setupConvex } from 'convex-svelte';
	import { CONVEX_URL, convexClient } from '$lib/convex';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { authClient } from '$lib/auth-client';
	import Header from '$lib/components/Header.svelte';

	let { children } = $props();

	setupConvex(CONVEX_URL);
	setContext('convex', convexClient);
	createSvelteAuthClient({ authClient });
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Header />
{@render children()}
```

#### 3.3 Update Auth Store

**File**: `src/lib/stores/auth.ts`
**Changes**: Use the adapter's `useAuth` hook

```typescript
import { derived } from 'svelte/store';
import { authClient } from '$lib/auth-client';

// Session store from better-auth - provides reactive session data
export const session = authClient.useSession();

// Derived store for auth state checks
export const isAuthenticated = derived(session, ($session) => {
	return $session.data !== null && $session.data !== undefined;
});

// Loading state for UI feedback
export const isLoading = derived(session, ($session) => {
	return $session.isPending;
});

// Current user data (null if not authenticated)
export const user = derived(session, ($session) => {
	return $session.data?.user ?? null;
});
```

### Success Criteria:

#### Automated:

- [ ] TypeScript compiles: `pnpm run check`
- [ ] Build succeeds: `pnpm run build`

#### Manual:

- [ ] App loads without console errors

---

## Phase 4: Update Environment Variables

### Overview

Ensure environment variables are correctly set for the server-side flow.

### Changes Required:

#### 4.1 Update .env

**File**: `.env`
**Changes**: Add/verify PUBLIC\_ prefixed variables for SvelteKit

```bash
# Convex deployment URL (for client queries/mutations)
VITE_CONVEX_URL=https://disciplined-spider-126.convex.cloud

# Convex HTTP site URL (for auth API routes)
VITE_CONVEX_SITE_URL=https://disciplined-spider-126.convex.site

# Public versions for SvelteKit server
PUBLIC_CONVEX_URL=https://disciplined-spider-126.convex.cloud
PUBLIC_CONVEX_SITE_URL=https://disciplined-spider-126.convex.site

# Site URL for auth callbacks (local dev)
SITE_URL=http://localhost:5173

# VAPID keys for web push notifications
VITE_VAPID_PUBLIC_KEY=BEhG39Gj3JqJXTWbHrsyFxmfGlsgfduJnphnUZkQtD-l02HMF7zTkvuKJxe2ubk1vmZcnBydFA-gnc7VFCqcKkU
VAPID_PRIVATE_KEY=rEGU67jJLEFSfxg8NRh8mdYIvrfBTZoFK7yvZUCEQFc
```

### Success Criteria:

#### Automated:

- [ ] Dev server starts without missing env errors

---

## Phase 5: Update Convex Backend

### Overview

Ensure the Convex backend is configured for the server-side flow.

### Changes Required:

#### 5.1 Update HTTP Routes

**File**: `convex/http.ts`
**Changes**: Use `cors: true` for proper CORS handling

```typescript
import { httpRouter } from 'convex/server';
import { authComponent, createAuth } from './auth';

const http = httpRouter();
authComponent.registerRoutes(http, createAuth, { cors: true });

export default http;
```

#### 5.2 Verify Auth Config

**File**: `convex/auth.ts`
**Changes**: Ensure trustedOrigins includes localhost

```typescript
import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth';
import { components } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import authConfig from './auth.config';

const siteUrl = process.env.SITE_URL!;

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	return betterAuth({
		baseURL: siteUrl,
		trustedOrigins: ['http://localhost:5173', 'http://localhost:5178'],
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false
		},
		plugins: [convex({ authConfig })]
	});
};
```

### Success Criteria:

#### Automated:

- [ ] Convex push succeeds: `npx convex dev`

---

## Phase 6: End-to-End Verification

### Manual Testing Steps:

1. **Fresh Registration**
   - Clear browser cookies/localStorage for localhost
   - Navigate to `/register`
   - Create new account
   - Verify redirected to home, user shown in header
   - **Refresh page** → user should remain logged in

2. **Login Flow**
   - Logout → navigate to `/login`
   - Login with existing credentials
   - Refresh → user should remain logged in

3. **Session Persistence**
   - Close browser tab
   - Open new tab to `localhost:5173`
   - User should still be logged in

4. **Logout**
   - Click logout
   - Verify redirected to login
   - Try accessing home → should show logged-out state

### Success Criteria:

#### Manual:

- [ ] Registration persists across refresh
- [ ] Login persists across refresh
- [ ] Session survives tab close/reopen
- [ ] Logout clears session completely

---

## File Summary

### New Files:

- `src/routes/api/auth/[...all]/+server.ts` - Auth API route handler
- `src/hooks.server.ts` - Server hooks for token extraction
- `src/lib/server/auth.ts` - Server-side auth helper

### Modified Files:

- `src/app.d.ts` - Add Locals.token type
- `src/lib/auth-client.ts` - Remove baseURL
- `src/routes/+layout.svelte` - Add createSvelteAuthClient
- `src/lib/stores/auth.ts` - Minor cleanup (optional)
- `convex/http.ts` - Change to `cors: true`
- `.env` - Add PUBLIC\_ prefixed variables

### Unchanged Files:

- `convex/auth.ts` - Keep current config
- `convex.json` - Keep `convex/` path

---

## Rollback Plan

1. Remove `@mmailaender/convex-better-auth-svelte` package
2. Delete new files:
   - `src/routes/api/auth/[...all]/+server.ts`
   - `src/hooks.server.ts`
   - `src/lib/server/auth.ts`
3. Restore original files from git:
   - `src/app.d.ts`
   - `src/lib/auth-client.ts`
   - `src/routes/+layout.svelte`
   - `convex/http.ts`

## References

- [Convex + Better Auth SvelteKit Guide](https://labs.convex.dev/better-auth/framework-guides/sveltekit)
- [@mmailaender/convex-better-auth-svelte](https://github.com/mmailaender/convex-better-auth-svelte)
- [Better Auth Cookies Documentation](https://www.better-auth.com/docs/concepts/cookies)
