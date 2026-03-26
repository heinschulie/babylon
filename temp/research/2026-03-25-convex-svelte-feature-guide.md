---
date: 2026-03-25T14:00:00+02:00
researcher: Claude
git_commit: 4a209d8
branch: hein/feature/issue-61
repository: babylon
topic: 'How Babylon works with Convex + Svelte and how to build new features'
tags: [research, codebase, convex, sveltekit, feature-development]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: Convex + SvelteKit Full-Stack Feature Guide

## Research Question

Build a full understanding of how this codebase works with Convex and Svelte and how to build new features using the stack.

## Summary

Babylon is a language-learning platform built as a Bun monorepo with SvelteKit 2 (Svelte 5) frontends and a Convex serverless backend. The architecture follows a reactive data flow: Convex queries auto-subscribe to DB changes and push updates to the frontend via `convex-svelte` bindings, while mutations and actions handle writes and long-running tasks. Auth uses Better Auth with a Convex database adapter. The monorepo shares code via `@babylon/shared` (auth, stores, Convex client), `@babylon/ui` (shadcn-svelte components), and `@babylon/convex` (type exports).

---

## How to Build a New Feature (Step-by-Step)

### Step 1: Define the Schema

**File:** `convex/schema.ts`

Add a new table with typed fields, indexes, and optional fields:

```typescript
myFeature: defineTable({
  userId: v.string(),
  title: v.string(),
  status: v.union(v.literal('draft'), v.literal('active')),
  metadata: v.optional(v.string()),
})
  .index('by_user', ['userId'])
  .index('by_status', ['status']),
```

Run `npx convex dev --once` to push schema changes.

### Step 2: Write Convex Functions

**File:** `convex/myFeature.ts`

```typescript
import { query, mutation, internalMutation } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from './lib/auth';

// QUERY — read-only, auto-subscribing
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return ctx.db.query('myFeature')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
  },
});

// MUTATION — write operations
export const create = mutation({
  args: { title: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    return ctx.db.insert('myFeature', {
      userId,
      title: args.title,
      status: 'draft',
    });
  },
});

// INTERNAL MUTATION — only callable from other Convex functions
export const _processInternal = internalMutation({
  args: { id: v.id('myFeature') },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: 'active' });
  },
});
```

**Patterns used across the codebase:**
- All user-facing functions call `getAuthUserId(ctx)` first
- Ownership checks: verify `doc.userId === userId` before mutations
- Validators: `v.id('tableName')` for foreign keys, `v.union(v.literal(...))` for enums
- Scheduler: `ctx.scheduler.runAfter(0, internal.module.fn, args)` for async work
- Actions (`'use node'`): for external API calls (Whisper, Claude, PayFast)

### Step 3: Add i18n Strings

**Files:** `apps/web/messages/en.json` and `apps/web/messages/xh.json`

```json
// en.json
{ "my_feature_title": "My Feature", "my_feature_create": "Create" }

// xh.json
{ "my_feature_title": "[TODO] My Feature", "my_feature_create": "[TODO] Create" }
```

For shared strings (nav, buttons): use `packages/shared/messages/`.

### Step 4: Create the SvelteKit Route

**File:** `apps/web/src/routes/my-feature/+page.svelte`

```svelte
<script lang="ts">
  import { useConvexClient, useQuery } from 'convex-svelte';
  import { api } from '@babylon/convex';
  import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
  import { goto } from '$app/navigation';
  import * as m from '$lib/paraglide/messages.js';
  import { Button } from '@babylon/ui';

  const client = useConvexClient();
  const items = useQuery(api.myFeature.list, {});

  // Auth guard
  $effect(() => {
    if (!$isLoading && !$isAuthenticated) goto('/login');
  });

  // Local state (Svelte 5 runes)
  let title = $state('');
  let creating = $state(false);

  // Derived values
  const itemCount = $derived(items.data?.length ?? 0);

  async function handleCreate() {
    creating = true;
    try {
      await client.mutation(api.myFeature.create, { title: title.trim() });
      title = '';
    } finally {
      creating = false;
    }
  }
</script>

<h1>{m.my_feature_title()}</h1>

{#if items.isLoading}
  <p>Loading...</p>
{:else if items.data}
  <p>{itemCount} items</p>
  {#each items.data as item}
    <p>{item.title} — {item.status}</p>
  {/each}
{/if}

<input bind:value={title} />
<Button onclick={handleCreate} disabled={creating}>
  {m.my_feature_create()}
</Button>
```

### Step 5: Write Tests

**File:** `convex/myFeature.test.ts`

```typescript
import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('myFeature', () => {
  it('creates and lists items', async () => {
    const t = convexTest(schema, modules);
    const asUser = t.withIdentity({ subject: 'user1' });

    await asUser.mutation(api.myFeature.create, { title: 'Test' });
    const items = await asUser.query(api.myFeature.list, {});
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Test');
  });

  it('isolates by user', async () => {
    const t = convexTest(schema, modules);
    const user1 = t.withIdentity({ subject: 'user1' });
    const user2 = t.withIdentity({ subject: 'user2' });

    await user1.mutation(api.myFeature.create, { title: 'Mine' });
    const items = await user2.query(api.myFeature.list, {});
    expect(items).toHaveLength(0);
  });
});
```

Run: `bun run test` (Vitest). Convex tests use `edge-runtime` environment.

---

## Detailed Architecture

### Monorepo Structure

```
apps/web/              — Learner SvelteKit app
apps/verifier/         — Verifier SvelteKit app
packages/shared/       — Auth client, stores, Convex client, i18n messages
packages/ui/           — shadcn-svelte components (no i18n, props only)
packages/convex/       — Re-exports: api, DataModel, Doc, Id types
convex/                — Backend: schema, functions, lib/
```

**Workspace deps:** apps depend on all packages. UI peer-depends on shared.

### Convex Backend (convex/)

#### Schema (convex/schema.ts)
15 tables covering: sessions, phrases, userPhrases (FSRS), audioAssets, attempts, practiceSessions, verifierProfiles, verifierLanguageMemberships, humanReviewRequests, humanReviews, humanReviewFlags, aiFeedback, aiCalibration, userPreferences, billing tables.

#### Function Types
| Type | Import | Use Case | Example |
|------|--------|----------|---------|
| `query` | `_generated/server` | Read-only, auto-subscribing | `phrases.listAllByUser` |
| `mutation` | `_generated/server` | DB writes | `phrases.createDirect` |
| `action` | `_generated/server` | External APIs, `'use node'` | `aiPipeline.processAttempt` |
| `internalMutation` | `_generated/server` | Scheduler callbacks, cross-fn | `notifications.scheduleForPhrase` |
| `internalQuery` | `_generated/server` | Internal data access | `billingSubscriptions.getForWebhook` |

#### Helper Libraries (convex/lib/)
| File | Purpose |
|------|---------|
| `auth.ts` | `getAuthUserId()` — dual-mode (native identity for tests, BetterAuth for prod) |
| `billing.ts` | Entitlement checks, quota enforcement, usage tracking |
| `languages.ts` | Language validation, normalization (9 supported languages) |
| `phraseCategories.ts` | 16 categories, keyword-based inference |
| `safeErrors.ts` | Client-safe error wrapping |
| `payfast.ts` | PayFast payment integration |

#### State Machines
- **Attempt:** queued → processing → feedback_ready | failed
- **ReviewRequest:** pending → claimed → completed | escalated
- **BillingSubscription:** pending → active | past_due | canceled

#### Cron Jobs (convex/crons.ts)
- Daily at 06:00 UTC: `internal.notifications.rescheduleDaily`

#### HTTP Routes (convex/http.ts)
- BetterAuth routes (auto-registered)
- `/webhooks/payfast` — PayFast payment webhook

### SvelteKit Frontend

#### Client Initialization (apps/web/src/routes/+layout.svelte)
```
setupConvex(CONVEX_URL)        — line 16
createSvelteAuthClient()       — line 18-21
useQuery(api.preferences.get)  — line 23 (skip if not auth'd)
```

#### Data Fetching Patterns
| Pattern | Code | Notes |
|---------|------|-------|
| Simple query | `useQuery(api.fn, {})` | Always subscribes |
| Conditional | `useQuery(api.fn, () => cond ? args : 'skip')` | Skips when null |
| Mutation | `client.mutation(api.fn, args)` | Awaitable, returns result |
| Action | `client.action(api.fn, args)` | Fire-and-forget for async |

#### Query Result Shape
```typescript
{ data: T | undefined, isLoading: boolean, error: Error | undefined, isStale: boolean }
```

#### Svelte 5 Runes Usage
| Rune | Usage |
|------|-------|
| `$state` | Local component state (forms, UI toggles) |
| `$derived` | Computed values from query data |
| `$effect` | Side effects (auth guards, data sync, DOM updates) |
| `$props` | Component props with destructuring |

#### Auth Flow
1. Login/Register → `authClient.signIn.email()` / `authClient.signUp.email()`
2. Session stored in Convex via BetterAuth adapter
3. Reactive stores: `session`, `isAuthenticated`, `isLoading`, `user` (from `@babylon/shared/stores/auth`)
4. Route protection: `$effect` checking `$isAuthenticated`
5. Server-side: `hooks.server.ts` extracts token into `event.locals.token`
6. API handler: `apps/web/src/routes/api/auth/[...all]/+server.ts`

#### UI Components (@babylon/ui)
- Built on shadcn-svelte (bits-ui headless components)
- Available: Button, Card, Input, Label, Accordion, Alert, Dropdown, Header
- **No internal i18n** — pass translated strings as props
- Svelte 5 pattern: `let { ref, class: className, children } = $props()`

### Testing

#### Vitest Configuration
- Convex tests: `edge-runtime` environment
- Svelte tests: `jsdom` environment
- Include: `src/**/*.test.ts` + `../../convex/**/*.test.ts`
- `convex-test` must be inlined in server deps

#### Convex Testing Patterns
- `convexTest(schema, modules)` — isolated test environment
- `t.withIdentity({ subject: 'userId' })` — auth simulation
- `t.run(async (ctx) => { ... })` — raw DB operations for seeding
- `t.query()`, `t.mutation()`, `t.action()` — execute functions

#### Existing Tests
| File | Coverage |
|------|----------|
| `convex/phrases.test.ts` | CRUD, auth, cross-user isolation |
| `convex/attempts.test.ts` | Creation, billing check, aggregate counting |
| `convex/sessions.test.ts` | Create, list, cross-user isolation |
| `convex/aiPipeline.test.ts` | Action idempotency, env mocking |
| `convex/notifications.test.ts` | Pure function unit tests |
| `apps/web/src/lib/stores/auth.test.ts` | Svelte store derivation |

---

## Code References

### Backend
- `convex/schema.ts` — Full schema (15 tables, indexes, validators)
- `convex/phrases.ts:102-147` — `createDirect` mutation (canonical mutation pattern)
- `convex/attempts.ts:45-74` — `create` mutation (billing check + aggregates)
- `convex/aiPipeline.ts:39-81` — `processAttempt` action (external API calls)
- `convex/practiceSessions.ts:45-84` — `start`/`end` mutations (session lifecycle)
- `convex/preferences.ts:14-113` — `get`/`upsert` (query + partial-update mutation)
- `convex/lib/auth.ts:1-27` — `getAuthUserId()` (dual-mode identity)
- `convex/lib/billing.ts` — Entitlement + quota helpers
- `convex/crons.ts:1-12` — Daily notification reschedule
- `convex/http.ts:1-16` — HTTP router (auth + webhooks)

### Frontend
- `apps/web/src/routes/+layout.svelte:1-78` — Root layout (Convex + auth + i18n init)
- `apps/web/src/routes/+page.svelte:36-51` — Query patterns (useQuery, skip, derived)
- `apps/web/src/routes/+page.svelte:236-313` — Mutation + action patterns
- `apps/web/src/routes/library/+page.svelte:36-56` — Create phrase form
- `apps/web/src/routes/settings/+page.svelte:13-199` — Settings (prefs, billing, i18n, avatar)
- `apps/web/src/routes/login/+page.svelte` — Auth sign-in
- `apps/web/src/routes/api/auth/[...all]/+server.ts` — Auth API handler

### Shared
- `packages/shared/src/auth-client.ts:1-7` — BetterAuth client setup
- `packages/shared/src/stores/auth.ts:1-25` — Reactive auth stores
- `packages/shared/src/convex.ts:1-12` — ConvexClient initialization
- `packages/convex/src/index.ts` — Type re-exports (api, Id, Doc)
- `packages/ui/src/components/header/Header.svelte` — Auth-aware header (i18n via props)

### Tests
- `convex/phrases.test.ts:1-333` — Comprehensive convex-test example
- `convex/attempts.test.ts:1-110` — Seeding helpers + aggregate tests
- `apps/web/vitest.config.ts:1-24` — Dual-environment test config

---

## Architecture Documentation

### Key Patterns
1. **Reactive subscriptions**: `useQuery` auto-subscribes to Convex DB changes — no manual refetch needed
2. **Auth-first**: Every public function starts with `getAuthUserId(ctx)`, throws if unauthenticated
3. **Ownership isolation**: All queries filter by `userId`, mutations verify ownership before writes
4. **Scheduler for async**: Zero-delay `ctx.scheduler.runAfter(0, ...)` for notifications, translations, verifier alerts
5. **Actions for external calls**: Whisper, Claude, PayFast — all wrapped in `'use node'` actions
6. **i18n via props**: UI components accept translated strings, apps inject via Paraglide `m.key()`
7. **Dual-mode auth**: `getAuthUserId` supports both native identity (tests) and BetterAuth (prod)
8. **Cache maps**: Result builders use `Map`-based caches to avoid N+1 queries (see `attempts.ts:20-100`)

### Conventions
- TypeScript strict mode everywhere
- Svelte 5 runes only (no legacy `let` reactivity)
- All user-facing strings through Paraglide
- CSS class `target-phrase` for styled phrase text
- Convex-first: no REST/GraphQL layer

## Open Questions

None — this covers the full stack end-to-end.
