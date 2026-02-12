# Shared UI + Verifier App Rebuild — Implementation Plan

## Overview

Deduplicate all shared code into `@babylon/ui` and `@babylon/shared`, then rebuild the verifier app with proper page structure, shared Header, new scoring UX, and AI analysis scoring — all styled consistently with the web app.

## Current State

- Both apps copy-paste 7 UI component dirs, utils, stores, providers, auth, and config
- Verifier is a single monolithic `+page.svelte` with everything (onboarding, queue stats, claim panel, scoring, recording)
- `buildAssignment` in `humanReviews.ts` doesn't include AI feedback — verifiers can't score it yet
- `submitReview` mutation only accepts 3 audio scores — no AI correctness field
- `@babylon/ui` and `@babylon/shared` exist as empty placeholders

## Desired End State

1. `@babylon/ui` exports all shadcn-svelte components + shared Header (configurable via props/snippets)
2. `@babylon/shared` exports `utils.ts`, `auth-client.ts`, `convex.ts`, `stores/auth.ts`, `providers/*`, `notifications.ts`
3. Both apps consume these packages via `workspace:*` — zero duplicated lib code
4. Verifier has 4 routes: `/` (landing), `/work` (session list), `/work/[id]` (verification session), `/settings`
5. Header uses web app's pattern with configurable nav links and profile dropdown
6. Scoring UI: 5 yellow square buttons per audio category + 2 buttons (Correct/Incorrect) for AI analysis
7. Convex backend includes `aiAnalysisCorrect` boolean in review submission + AI feedback in assignment data

## What We're NOT Doing

- Shared login/register route-level components (minor text diffs — not worth abstraction overhead)
- Shared SvelteKit config files (must live at app root)
- Moving `server/auth.ts` to shared (uses `$env/dynamic/private` — keep per-app)
- `@sveltejs/package` build step for `@babylon/ui` (all apps are SvelteKit, so direct source imports via `"svelte"` export condition work, and the Vite + Svelte plugin in each consuming app handles compilation)
- FSRS/spaced-repetition for verifier
- Full verifier stats dashboard (future work, just total + today count for now)

---

## Phase 1: `@babylon/shared` — Move Utilities & Stores

### Overview

Move all non-Svelte-component code from `apps/web/src/lib/` into `packages/shared/src/`, update exports, update imports in both apps.

### Changes Required

#### 1.1 `packages/shared/package.json`

**File**: `packages/shared/package.json`
**Changes**: Add proper exports, dependencies, peer dependencies.

```json
{
  "name": "@babylon/shared",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "exports": {
    "./styles/*": "./src/styles/*",
    "./utils": "./src/utils.ts",
    "./auth-client": "./src/auth-client.ts",
    "./convex": "./src/convex.ts",
    "./stores/auth": "./src/stores/auth.ts",
    "./notifications": "./src/notifications.ts",
    "./providers": "./src/providers/index.ts",
    "./providers/*": "./src/providers/*.ts"
  },
  "dependencies": {
    "clsx": "^2.1.1",
    "tailwind-merge": "^3.4.0",
    "better-auth": "^1.4.9",
    "@convex-dev/better-auth": "^0.10.10",
    "convex": "^1.31.6"
  },
  "peerDependencies": {
    "svelte": "^5.0.0"
  }
}
```

#### 1.2 Move files from `apps/web/src/lib/` to `packages/shared/src/`

Copy these files (content identical in both apps):

| Source | Destination |
|--------|-------------|
| `apps/web/src/lib/utils.ts` | `packages/shared/src/utils.ts` |
| `apps/web/src/lib/auth-client.ts` | `packages/shared/src/auth-client.ts` |
| `apps/web/src/lib/convex.ts` | `packages/shared/src/convex.ts` |
| `apps/web/src/lib/stores/auth.ts` | `packages/shared/src/stores/auth.ts` |
| `apps/web/src/lib/notifications.ts` | `packages/shared/src/notifications.ts` |
| `apps/web/src/lib/providers/index.ts` | `packages/shared/src/providers/index.ts` |
| `apps/web/src/lib/providers/stt.ts` | `packages/shared/src/providers/stt.ts` |
| `apps/web/src/lib/providers/llm.ts` | `packages/shared/src/providers/llm.ts` |
| `apps/web/src/lib/providers/tts.ts` | `packages/shared/src/providers/tts.ts` |

#### 1.3 Fix internal import paths in shared package

`auth-client.ts` — no changes needed (imports from `better-auth/svelte`, `@convex-dev/better-auth/client/plugins`, `better-auth/client/plugins` — all external).

`stores/auth.ts` — update import:
```typescript
// Before
import { authClient } from '$lib/auth-client';
// After
import { authClient } from '../auth-client';
```

`notifications.ts` — no changes needed (uses `import.meta.env.VITE_VAPID_PUBLIC_KEY`).

`convex.ts` — no changes needed (uses `$env/static/public` — SvelteKit-specific but all consumers are SvelteKit).

#### 1.4 Update imports in both apps

In `apps/web/` and `apps/verifier/`, add dependency:
```json
"dependencies": {
  "@babylon/shared": "workspace:*"
}
```

Then update all imports across both apps:

```typescript
// Before
import { cn } from '$lib/utils';
// After
import { cn } from '@babylon/shared/utils';

// Before
import { authClient } from '$lib/auth-client';
// After
import { authClient } from '@babylon/shared/auth-client';

// Before
import { CONVEX_URL } from '$lib/convex';
// After
import { CONVEX_URL } from '@babylon/shared/convex';

// Before
import { isAuthenticated, isLoading } from '$lib/stores/auth';
// After
import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';

// Before
import { requestNotificationPermission } from '$lib/notifications';
// After
import { requestNotificationPermission } from '@babylon/shared/notifications';
```

#### 1.5 Delete duplicated files from both apps

Remove from **both** `apps/web/src/lib/` and `apps/verifier/src/lib/`:
- `utils.ts`
- `auth-client.ts`
- `convex.ts`
- `stores/auth.ts` (keep `stores/auth.test.ts` in web, update its imports)
- `notifications.ts`
- `providers/` (entire directory)

#### 1.6 Update `app.css` to use package import

Both apps currently use relative path:
```css
@import '../../../packages/shared/src/styles/recall.css';
```

Keep this as-is for now — CSS `@import` with package specifiers in Tailwind v4 is still flaky. Relative path works reliably.

### Success Criteria

#### Automated:
- [x] `bun install` succeeds
- [x] `turbo run build --filter=@babylon/web` succeeds
- [x] `turbo run build --filter=@babylon/verifier` succeeds
- [x] `turbo run check` succeeds
- [x] `turbo run test:run` passes

#### Manual:
- [ ] Web app works identically — login, library, practice, settings
- [ ] Verifier app works identically — login, queue, scoring

---

## Phase 2: `@babylon/ui` — Shared Svelte Components

### Overview

Move all shadcn-svelte UI components into `packages/ui/`, add a shared configurable Header. Both apps consume via `@babylon/ui`.

### Changes Required

#### 2.1 `packages/ui/package.json`

```json
{
  "name": "@babylon/ui",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "svelte": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./button": "./src/components/button/index.ts",
    "./card": "./src/components/card/index.ts",
    "./dialog": "./src/components/dialog/index.ts",
    "./input": "./src/components/input/index.ts",
    "./label": "./src/components/label/index.ts",
    "./accordion": "./src/components/accordion/index.ts",
    "./alert": "./src/components/alert/index.ts",
    "./dropdown-menu": "./src/components/dropdown-menu/index.ts",
    "./header": "./src/components/header/index.ts"
  },
  "dependencies": {
    "bits-ui": "^2.15.4",
    "tailwind-variants": "^3.2.2",
    "@lucide/svelte": "^0.561.0"
  },
  "peerDependencies": {
    "svelte": "^5.0.0",
    "@babylon/shared": "workspace:*"
  }
}
```

Note: Direct source exports (no `@sveltejs/package` build). SvelteKit's Vite plugin compiles `.svelte` files from node_modules when they have the `"svelte"` export condition.

#### 2.2 Move UI components

Copy from `apps/web/src/lib/components/ui/` to `packages/ui/src/components/`:

- `accordion/` (5 files)
- `alert/` (4 files)
- `button/` (2 files)
- `card/` (8 files)
- `dialog/` (11 files)
- `dropdown-menu/` (all files)
- `input/` (2 files)
- `label/` (2 files)

#### 2.3 Fix imports within UI components

All components import `cn` from `$lib/utils`. Update to:
```typescript
import { cn } from '@babylon/shared/utils';
```

Also update type imports:
```typescript
import type { WithoutChildren, WithoutChildrenOrChild, WithElementRef } from '@babylon/shared/utils';
```

#### 2.4 Create shared Header component

**File**: `packages/ui/src/components/header/Header.svelte`

The web Header uses a different structure than what the verifier needs. Design a configurable Header that accepts nav links and profile menu items via snippets.

```svelte
<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { authClient } from '@babylon/shared/auth-client';
  import { isAuthenticated } from '@babylon/shared/stores/auth';
  import * as DropdownMenu from '../dropdown-menu';
  import { type Snippet } from 'svelte';

  interface NavLink {
    label: string;
    href: string;
  }

  interface Props {
    links?: NavLink[];
    settingsHref?: string;
  }

  let { links = [], settingsHref = '/settings' }: Props = $props();

  async function handleLogout() {
    await authClient.signOut();
    goto(resolve('/login'));
  }

  function isActive(path: string): boolean {
    const resolved = resolve(path);
    return page.url.pathname === resolved || page.url.pathname.startsWith(`${resolved}/`);
  }
</script>

{#if $isAuthenticated}
  <header class="app-header">
    <div class="app-header__bar">
      <a href={resolve('/')} class="app-header__icon" aria-label="Home">
        <span class="app-header__icon-placeholder"></span>
      </a>

      <nav class="app-header__nav" aria-label="Primary">
        {#each links as link}
          <a
            href={resolve(link.href)}
            class="app-header__link"
            data-active={isActive(link.href)}
          >
            {link.label}
          </a>
        {/each}
      </nav>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger class="app-header__avatar" aria-label="Profile menu">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M20 21a8 8 0 0 0-16 0"/>
          </svg>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" sideOffset={8}>
          <DropdownMenu.Item onclick={() => goto(resolve(settingsHref))}>
            Settings
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item onclick={handleLogout}>
            Logout
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    </div>
  </header>
{/if}
```

#### 2.5 Create barrel export

**File**: `packages/ui/src/index.ts`

```typescript
// Components
export * from './components/button';
export * from './components/card';
export * from './components/dialog';
export * from './components/input';
export * from './components/label';
export * from './components/accordion';
export * from './components/alert';
export * from './components/dropdown-menu';
export { default as Header } from './components/header/Header.svelte';
```

**File**: `packages/ui/src/components/header/index.ts`
```typescript
export { default as Header } from './Header.svelte';
```

#### 2.6 Update imports in both apps

Add dependency to both apps:
```json
"dependencies": {
  "@babylon/ui": "workspace:*"
}
```

Update all component imports:
```typescript
// Before
import { Button } from '$lib/components/ui/button';
import * as Card from '$lib/components/ui/card';
import * as Dialog from '$lib/components/ui/dialog';
import { Input } from '$lib/components/ui/input';
import { Label } from '$lib/components/ui/label';
import * as Accordion from '$lib/components/ui/accordion';
import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
import Header from '$lib/components/Header.svelte';

// After
import { Button } from '@babylon/ui/button';
import * as Card from '@babylon/ui/card';
import * as Dialog from '@babylon/ui/dialog';
import { Input } from '@babylon/ui/input';
import { Label } from '@babylon/ui/label';
import * as Accordion from '@babylon/ui/accordion';
import * as DropdownMenu from '@babylon/ui/dropdown-menu';
import { Header } from '@babylon/ui/header';
```

#### 2.7 Update app layouts to use shared Header

**`apps/web/src/routes/+layout.svelte`**:
```svelte
<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import { setupConvex } from 'convex-svelte';
  import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
  import { CONVEX_URL } from '@babylon/shared/convex';
  import { authClient } from '@babylon/shared/auth-client';
  import { Header } from '@babylon/ui/header';

  let { children } = $props();

  setupConvex(CONVEX_URL);
  createSvelteAuthClient({ authClient, convexUrl: CONVEX_URL });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<Header
  links={[
    { label: 'Library', href: '/' },
    { label: 'Practice', href: '/practice' }
  ]}
/>
{@render children()}
```

**`apps/verifier/src/routes/+layout.svelte`**:
```svelte
<script lang="ts">
  import '../app.css';
  import favicon from '$lib/assets/favicon.svg';
  import { setupConvex } from 'convex-svelte';
  import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
  import { CONVEX_URL } from '@babylon/shared/convex';
  import { authClient } from '@babylon/shared/auth-client';
  import { Header } from '@babylon/ui/header';

  let { children } = $props();

  setupConvex(CONVEX_URL);
  createSvelteAuthClient({ authClient, convexUrl: CONVEX_URL });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<Header
  links={[
    { label: 'Home', href: '/' },
    { label: 'Work', href: '/work' }
  ]}
/>
{@render children()}
```

#### 2.8 Delete duplicated components from both apps

Remove from **both** `apps/web/src/lib/components/` and `apps/verifier/src/lib/components/`:
- `ui/` (entire directory)
- `Header.svelte`

#### 2.9 Add `@source` to `recall.css` for Tailwind scanning

**File**: `packages/shared/src/styles/recall.css`

Add after the Tailwind imports (line 3):
```css
@source "../../ui/src/**/*.{svelte,ts,js}";
```

This tells Tailwind to scan `packages/ui/src/` for utility classes.

### Success Criteria

#### Automated:
- [x] `bun install` succeeds
- [x] `turbo run build` succeeds (both apps)
- [x] `turbo run check` succeeds
- [x] `turbo run test:run` passes

#### Manual:
- [ ] Web header shows Library + Practice links + profile dropdown with Settings/Logout
- [ ] Verifier header shows Home + Work links + profile dropdown with Settings/Logout
- [ ] All UI components render identically to before

**Pause here for manual verification before Phase 3.**

---

## Phase 3: Convex Backend — Add AI Feedback to Assignments + AI Correctness Scoring

### Overview

Extend `buildAssignment` to include AI feedback data. Add `aiAnalysisCorrect` field to `submitReview`. Create query for verifier stats.

### Changes Required

#### 3.1 Extend `buildAssignment` to include AI feedback

**File**: `convex/humanReviews.ts` — `buildAssignment` function (line 111)

After fetching `learnerAudio` (line 118), also fetch AI feedback:

```typescript
// Add after line 118:
const aiFeedback = await ctx.db
  .query('aiFeedback')
  .withIndex('by_attempt', (q: any) => q.eq('attemptId', request.attemptId))
  .unique();
```

Add to return object (after `learnerAttempt`):

```typescript
aiFeedback: aiFeedback
  ? {
      transcript: aiFeedback.transcript ?? null,
      confidence: aiFeedback.confidence ?? null,
      score: aiFeedback.score ?? null,
      feedbackText: aiFeedback.feedbackText ?? null,
      errorTags: aiFeedback.errorTags ?? []
    }
  : null,
```

#### 3.2 Add `aiAnalysisCorrect` to `submitReview`

**File**: `convex/humanReviews.ts` — `submitReview` mutation (line 368)

Add to args:
```typescript
aiAnalysisCorrect: v.optional(v.boolean())
```

Pass through to `humanReviews` insert (where `soundAccuracy`, `rhythmIntonation`, `phraseAccuracy` are written).

#### 3.3 Add `aiAnalysisCorrect` to `humanReviews` schema

**File**: `convex/schema.ts` — `humanReviews` table (line 150)

Add field:
```typescript
aiAnalysisCorrect: v.optional(v.boolean()),
```

#### 3.4 Create verifier stats query

**File**: `convex/verifierAccess.ts`

Add new query `getMyStats`:

```typescript
export const getMyStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const allReviews = await ctx.db
      .query('humanReviews')
      .withIndex('by_verifier_created', (q) => q.eq('verifierUserId', userId))
      .collect();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const todayCount = allReviews.filter((r) => r.createdAt >= todayMs).length;

    return {
      totalReviews: allReviews.length,
      todayReviews: todayCount
    };
  }
});
```

#### 3.5 Create query for listing pending review requests (for work page)

**File**: `convex/humanReviews.ts`

Add new query `listPendingForLanguage`:

```typescript
export const listPendingForLanguage = query({
  args: { languageCode: v.string() },
  handler: async (ctx, { languageCode }) => {
    const userId = await getAuthUserId(ctx);
    await assertVerifierLanguageAccess(ctx, userId, languageCode);

    const pending = await ctx.db
      .query('humanReviewRequests')
      .withIndex('by_language_status_priority', (q) =>
        q.eq('languageCode', languageCode).eq('status', 'pending')
      )
      .take(50);

    const results = [];
    for (const request of pending) {
      const phrase = await ctx.db.get(request.phraseId);
      results.push({
        requestId: request._id,
        attemptId: request.attemptId,
        phraseId: request.phraseId,
        phase: request.phase,
        priorityAt: request.priorityAt,
        slaDueAt: request.slaDueAt,
        createdAt: request.createdAt,
        phrase: phrase
          ? { english: phrase.english, translation: phrase.translation }
          : null
      });
    }
    return results;
  }
});
```

### Success Criteria

#### Automated:
- [x] `bunx convex dev` starts without schema errors
- [x] `turbo run build` succeeds
- [x] `turbo run test:run` passes

#### Manual:
- [ ] Existing verifier queue still works with current UI
- [ ] `buildAssignment` returns `aiFeedback` field when available

**Pause here for manual verification before Phase 4.**

---

## Phase 4: Verifier App — New Route Structure + Pages

### Overview

Restructure verifier from single-page into multi-route app with: landing page (`/`), settings (`/settings`), work list (`/work`), and verification session (`/work/[id]`).

### Changes Required

#### 4.1 New route structure

```
apps/verifier/src/routes/
├── +layout.svelte          # Shared Header with Home + Work links (already done in Phase 2)
├── +page.svelte            # Landing/intro page (NEW)
├── settings/
│   └── +page.svelte        # Settings page (NEW)
├── work/
│   ├── +page.svelte        # Available sessions list (NEW)
│   └── [id]/
│       └── +page.svelte    # Active verification session (NEW)
├── login/+page.svelte      # Keep as-is
├── register/+page.svelte   # Keep as-is
└── api/auth/[...all]/+server.ts  # Keep as-is
```

#### 4.2 Landing page — `apps/verifier/src/routes/+page.svelte`

Styled like the web app's library page. Guidance content for verifiers. FAB for auto-assign.

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { useConvexClient, useQuery } from 'convex-svelte';
  import { api } from '@babylon/convex';
  import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
  import * as Card from '@babylon/ui/card';
  import { Button } from '@babylon/ui/button';

  const client = useConvexClient();
  const verifierState = useQuery(api.verifierAccess.getMyVerifierState, {});
  const queueSignal = useQuery(api.humanReviews.getQueueSignal, () => ({
    languageCode: 'xh-ZA'
  }));

  $effect(() => {
    if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
  });

  const pendingCount = $derived(queueSignal.data?.pendingCount ?? 0);
  const canReview = $derived(
    !!verifierState.data?.languages.find(
      (l) => l.languageCode === 'xh-ZA' && l.active
    )
  );

  let claiming = $state(false);

  async function autoAssign() {
    if (!canReview || claiming) return;
    claiming = true;
    try {
      const assignment = await client.mutation(api.humanReviews.claimNext, {
        languageCode: 'xh-ZA'
      });
      if (assignment) {
        goto(resolve(`/work/${assignment.requestId}`));
      }
    } finally {
      claiming = false;
    }
  }
</script>

<div class="page-shell page-shell--narrow page-stack">
  <header class="page-stack">
    <div>
      <p class="info-kicker">Verification Guide</p>
      <h1 class="text-5xl sm:text-6xl">Recall Verifier</h1>
      <p class="meta-text mt-3 max-w-2xl">
        Your reviews shape how learners hear and correct themselves. Read the guidance below before you begin.
      </p>
    </div>
  </header>

  <Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
    <Card.Header>
      <Card.Title>Approach Every Recording Fresh</Card.Title>
      <Card.Description>You don't need a teaching background — just a fair ear and a clear method.</Card.Description>
    </Card.Header>
    <Card.Content class="space-y-4">
      <div class="space-y-2">
        <p class="info-kicker">Listen First, Score Second</p>
        <p class="text-sm">Play the learner's recording fully at least once before touching any score. Snap judgements drift over time.</p>
      </div>
      <div class="space-y-2">
        <p class="info-kicker">Be Consistent, Not Lenient</p>
        <p class="text-sm">A 3 means "understood with effort." A 5 means a native speaker wouldn't blink. Anchor each session to these markers and you'll stay calibrated across hundreds of reviews.</p>
      </div>
      <div class="space-y-2">
        <p class="info-kicker">Be Empathetic, Not Generous</p>
        <p class="text-sm">Learners improve fastest from honest scores paired with a good exemplar recording. A generous 5 today robs them of progress tomorrow.</p>
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
    <Card.Header>
      <Card.Title>Scoring Dimensions</Card.Title>
    </Card.Header>
    <Card.Content class="space-y-4">
      <div class="space-y-2">
        <p class="info-kicker">Sound Accuracy</p>
        <p class="text-sm">Are the individual sounds (clicks, vowels, consonants) correctly produced? Ignore rhythm and word choice — focus only on the raw phonetics.</p>
      </div>
      <div class="space-y-2">
        <p class="info-kicker">Rhythm & Intonation</p>
        <p class="text-sm">Does the phrase flow naturally? Stress, pauses, and pitch patterns matter here. A learner might pronounce every sound right but still sound robotic.</p>
      </div>
      <div class="space-y-2">
        <p class="info-kicker">Phrase Accuracy</p>
        <p class="text-sm">Did the learner say the right words in the right order? Dropped or substituted words lower this score even if individual sounds are perfect.</p>
      </div>
      <div class="space-y-2">
        <p class="info-kicker">AI Analysis</p>
        <p class="text-sm">Our AI provides a transcript and feedback for every recording. Mark whether the AI's analysis is correct or incorrect — this helps us improve the system.</p>
      </div>
    </Card.Content>
  </Card.Root>

  <Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
    <Card.Header>
      <Card.Title>The Exemplar Recording</Card.Title>
    </Card.Header>
    <Card.Content>
      <p class="text-sm">After scoring, record yourself saying the phrase correctly. This exemplar is sent back to the learner alongside your scores so they can hear what they're aiming for.</p>
    </Card.Content>
  </Card.Root>
</div>

<!-- Verification FAB -->
{#if $isAuthenticated && canReview}
  <button
    class="practice-fab"
    aria-label="Start verification"
    onclick={autoAssign}
    disabled={pendingCount === 0 || claiming}
    class:practice-fab--disabled={pendingCount === 0}
  >
    <span class="practice-fab__minutes">{pendingCount}</span>
    <span class="practice-fab__label">{pendingCount === 1 ? 'item' : 'items'}</span>
  </button>
{/if}
```

#### 4.3 Add CSS for disabled FAB state

**File**: `packages/shared/src/styles/recall.css`

Add after existing `.practice-fab` block:

```css
.practice-fab--disabled {
  opacity: 0.35;
  pointer-events: none;
}

.practice-fab:disabled {
  opacity: 0.35;
  pointer-events: none;
}
```

#### 4.4 Settings page — `apps/verifier/src/routes/settings/+page.svelte`

Styled like web's settings page. Houses language team config + verifier stats callout.

```svelte
<script lang="ts">
  import { resolve } from '$app/paths';
  import { goto } from '$app/navigation';
  import { useConvexClient, useQuery } from 'convex-svelte';
  import { api } from '@babylon/convex';
  import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
  import { Button } from '@babylon/ui/button';
  import * as Card from '@babylon/ui/card';
  import { Input } from '@babylon/ui/input';
  import { Label } from '@babylon/ui/label';

  const client = useConvexClient();
  const verifierState = useQuery(api.verifierAccess.getMyVerifierState, {});
  const supportedLanguages = useQuery(api.verifierAccess.listSupportedLanguages, {});
  const verifierStats = useQuery(api.verifierAccess.getMyStats, {});

  let selectedLanguage = $state('xh-ZA');
  let onboardingFirstName = $state('');
  let onboardingImageUrl = $state('');
  let saving = $state(false);
  let error = $state<string | null>(null);
  let message = $state<string | null>(null);

  $effect(() => {
    if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
  });

  const canReview = $derived(
    !!verifierState.data?.languages.find(
      (l) => l.languageCode === selectedLanguage && l.active
    )
  );

  async function saveOnboarding() {
    if (!onboardingFirstName.trim()) {
      error = 'Please enter a first name.';
      return;
    }
    saving = true;
    error = null;
    try {
      await client.mutation(api.verifierAccess.upsertMyProfile, {
        firstName: onboardingFirstName.trim(),
        profileImageUrl: onboardingImageUrl.trim() || undefined
      });
      await client.mutation(api.verifierAccess.setMyLanguageActive, {
        languageCode: selectedLanguage,
        active: true
      });
      message = 'Verifier profile activated.';
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to save.';
    } finally {
      saving = false;
    }
  }
</script>

<div class="page-shell page-shell--narrow page-stack">
  <div class="page-stack">
    <a href={resolve('/')} class="meta-text underline">&larr; Back home</a>
    <p class="info-kicker">Verifier Configuration</p>
    <h1 class="text-5xl sm:text-6xl">Settings</h1>
  </div>

  <!-- Stats callout -->
  <div class="border border-primary/40 bg-primary/10 p-4">
    <div class="grid grid-cols-2 gap-4">
      <div>
        <p class="info-kicker">Total Verifications</p>
        <p class="mt-2 text-4xl font-display">{verifierStats.data?.totalReviews ?? 0}</p>
      </div>
      <div>
        <p class="info-kicker">Today</p>
        <p class="mt-2 text-4xl font-display">{verifierStats.data?.todayReviews ?? 0}</p>
      </div>
    </div>
  </div>

  {#if error}
    <div class="border border-destructive/50 bg-destructive/10 p-3 text-destructive">{error}</div>
  {/if}
  {#if message}
    <div class="border border-primary/40 bg-primary/10 p-3 text-primary">{message}</div>
  {/if}

  <Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
    <Card.Header>
      <Card.Title>Language Team</Card.Title>
    </Card.Header>
    <Card.Content class="space-y-3">
      <div class="space-y-2">
        <Label for="languageCode">Language</Label>
        <select
          id="languageCode"
          class="w-full border border-input bg-background px-3 py-2.5 text-base"
          bind:value={selectedLanguage}
        >
          {#if supportedLanguages.data}
            {#each supportedLanguages.data.filter((l) => l.code === 'xh-ZA') as language}
              <option value={language.code}>{language.displayName} ({language.code})</option>
            {/each}
          {/if}
        </select>
      </div>
      {#if verifierState.data?.profile}
        <p class="meta-text">Active verifier: {verifierState.data.profile.firstName}</p>
      {/if}
    </Card.Content>
  </Card.Root>

  {#if !verifierState.data?.profile || !canReview}
    <Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
      <Card.Header>
        <Card.Title>Activate Verifier Access</Card.Title>
        <Card.Description>Set your visible identity and join this language team.</Card.Description>
      </Card.Header>
      <Card.Content class="space-y-3">
        <div class="space-y-2">
          <Label for="firstName">First Name</Label>
          <Input id="firstName" bind:value={onboardingFirstName} placeholder="e.g. Lwazi" />
        </div>
        <div class="space-y-2">
          <Label for="profileImage">Profile Image URL (optional)</Label>
          <Input id="profileImage" bind:value={onboardingImageUrl} placeholder="https://..." />
        </div>
        <Button class="w-full" onclick={saveOnboarding} disabled={saving}>
          {saving ? 'Saving...' : 'Activate'}
        </Button>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
```

#### 4.5 Work list page — `apps/verifier/src/routes/work/+page.svelte`

Styled like web's practice page. Shows pending items as a list. First-come-first-serve — verifier clicks to claim and enters session.

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { useConvexClient, useQuery } from 'convex-svelte';
  import { api } from '@babylon/convex';
  import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
  import * as Card from '@babylon/ui/card';
  import { Button } from '@babylon/ui/button';

  const client = useConvexClient();
  const verifierState = useQuery(api.verifierAccess.getMyVerifierState, {});
  const pendingItems = useQuery(api.humanReviews.listPendingForLanguage, () => ({
    languageCode: 'xh-ZA'
  }));
  const currentClaim = useQuery(api.humanReviews.getCurrentClaim, () => ({
    languageCode: 'xh-ZA'
  }));
  const queueSignal = useQuery(api.humanReviews.getQueueSignal, () => ({
    languageCode: 'xh-ZA'
  }));

  $effect(() => {
    if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
  });

  // If verifier already holds a claim, redirect to that session
  $effect(() => {
    if (currentClaim.data) {
      goto(resolve(`/work/${currentClaim.data.requestId}`));
    }
  });

  const canReview = $derived(
    !!verifierState.data?.languages.find(
      (l) => l.languageCode === 'xh-ZA' && l.active
    )
  );

  let claiming = $state<string | null>(null);

  async function claimItem(requestId: string) {
    // For first-come-first-serve, we use claimNext which grabs the highest priority
    // But the user clicked a specific item — we claim next and hope it's the same one
    // (Race condition is acceptable — they get whatever is next)
    claiming = requestId;
    try {
      const assignment = await client.mutation(api.humanReviews.claimNext, {
        languageCode: 'xh-ZA'
      });
      if (assignment) {
        goto(resolve(`/work/${assignment.requestId}`));
      }
    } finally {
      claiming = null;
    }
  }

  function relativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
  }
</script>

<div class="page-shell page-shell--narrow page-stack">
  <header class="page-stack">
    <div>
      <p class="info-kicker">First Come, First Serve</p>
      <h1 class="text-5xl sm:text-6xl">Available Work</h1>
      <p class="meta-text mt-3">
        Pick a learner attempt from the queue. Once you claim it, you have 5 minutes to complete your review.
      </p>
    </div>
    <Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
      <Card.Content>
        <div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div class="space-y-2">
            <p class="info-kicker">Queue Status</p>
            <p class="text-xl font-semibold">
              {queueSignal.data?.pendingCount ?? 0} pending review{(queueSignal.data?.pendingCount ?? 0) === 1 ? '' : 's'}
            </p>
            <p class="meta-text">Claim any item below to begin.</p>
          </div>
        </div>
      </Card.Content>
    </Card.Root>
  </header>

  {#if !canReview}
    <Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
      <Card.Header>
        <Card.Title>Not Activated</Card.Title>
        <Card.Description>Go to Settings to activate your verifier profile for this language.</Card.Description>
      </Card.Header>
      <Card.Footer>
        <a href={resolve('/settings')} class="meta-text underline">Go to Settings</a>
      </Card.Footer>
    </Card.Root>
  {:else if pendingItems.isLoading}
    <p class="meta-text">Loading queue...</p>
  {:else if !pendingItems.data || pendingItems.data.length === 0}
    <Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
      <Card.Header>
        <Card.Title>Queue Empty</Card.Title>
        <Card.Description>No learner attempts need review right now. Check back soon.</Card.Description>
      </Card.Header>
    </Card.Root>
  {:else}
    <Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
      <Card.Header>
        <Card.Title>Pending Reviews</Card.Title>
        <Card.Description>Tap an item to claim and begin reviewing.</Card.Description>
      </Card.Header>
      <Card.Content>
        <ul class="space-y-3">
          {#each pendingItems.data as item (item.requestId)}
            <li>
              <button
                class="flex w-full items-center justify-between border border-border/60 bg-background/70 p-4 text-left transition-colors hover:bg-background/90"
                onclick={() => claimItem(item.requestId)}
                disabled={!!claiming}
              >
                <div>
                  <p class="font-semibold">{item.phrase?.english ?? 'Unknown phrase'}</p>
                  <p class="meta-text text-primary">{item.phrase?.translation ?? ''}</p>
                </div>
                <div class="flex items-center gap-3">
                  {#if item.phase === 'dispute'}
                    <span class="info-kicker text-orange-600">Dispute</span>
                  {/if}
                  <span class="meta-text">{relativeTime(item.createdAt)}</span>
                </div>
              </button>
            </li>
          {/each}
        </ul>
      </Card.Content>
    </Card.Root>
  {/if}
</div>
```

#### 4.6 Verification session page — `apps/verifier/src/routes/work/[id]/+page.svelte`

Full-page session experience like the learner's practice page. Session info on top, media and scoring below. Five yellow square score buttons per category. Two buttons for AI analysis.

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { useConvexClient, useQuery } from 'convex-svelte';
  import { api, type Id } from '@babylon/convex';
  import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
  import { Button } from '@babylon/ui/button';

  const client = useConvexClient();
  const requestId = $derived(page.params.id as Id<'humanReviewRequests'>);

  const currentClaim = useQuery(api.humanReviews.getCurrentClaim, () => ({
    languageCode: 'xh-ZA'
  }));

  $effect(() => {
    if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
  });

  // If no active claim or claim doesn't match this route, redirect back
  $effect(() => {
    if (currentClaim.data === null && !currentClaim.isLoading) {
      goto(resolve('/work'));
    }
  });

  const claim = $derived(currentClaim.data);

  let claimTick = $state(Date.now());
  $effect(() => {
    const interval = setInterval(() => { claimTick = Date.now(); }, 1000);
    return () => clearInterval(interval);
  });

  const remainingMs = $derived(
    claim?.claimDeadlineAt ? Math.max(claim.claimDeadlineAt - claimTick, 0) : 0
  );

  function formatTimer(ms: number) {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  }

  // Scores
  let scores = $state({
    soundAccuracy: 3,
    rhythmIntonation: 3,
    phraseAccuracy: 3
  });
  let aiAnalysisCorrect = $state<boolean | null>(null);

  // Recording
  let recorder: MediaRecorder | null = $state(null);
  let recording = $state(false);
  let audioChunks: Blob[] = $state([]);
  let exemplarAudioBlob: Blob | null = $state(null);
  let exemplarAudioUrl: string | null = $state(null);
  let exemplarDurationMs = $state(0);
  let recorderError = $state('');
  let submitting = $state(false);
  let releasing = $state(false);
  let error = $state<string | null>(null);

  const recorderMimeCandidates = [
    'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'
  ];

  function getPreferredMime(): string {
    if (typeof MediaRecorder === 'undefined') return '';
    return recorderMimeCandidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? '';
  }

  async function startRecording() {
    recorderError = '';
    audioChunks = [];
    exemplarAudioBlob = null;
    exemplarAudioUrl = null;
    exemplarDurationMs = 0;

    if (!navigator.mediaDevices?.getUserMedia) {
      recorderError = 'Audio recording not supported.';
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = getPreferredMime();
      const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder = mr;
      const startTime = Date.now();

      mr.ondataavailable = (e) => {
        if (e.data?.size > 0) audioChunks = [...audioChunks, e.data];
      };
      mr.onstop = () => {
        const blob = new Blob(audioChunks, { type: mr.mimeType || 'audio/webm' });
        exemplarAudioBlob = blob;
        exemplarAudioUrl = URL.createObjectURL(blob);
        exemplarDurationMs = Date.now() - startTime;
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      recording = true;
    } catch (e) {
      recorderError = e instanceof Error ? e.message : 'Failed to start recording.';
    }
  }

  function stopRecording() {
    if (recorder?.state === 'recording') {
      recorder.stop();
      recording = false;
    }
  }

  function discardRecording() {
    audioChunks = [];
    exemplarAudioBlob = null;
    exemplarAudioUrl = null;
    exemplarDurationMs = 0;
  }

  async function releaseClaim() {
    if (!claim) return;
    releasing = true;
    error = null;
    try {
      await client.mutation(api.humanReviews.releaseClaim, { requestId: claim.requestId });
      discardRecording();
      goto(resolve('/work'));
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to release.';
    } finally {
      releasing = false;
    }
  }

  async function submitReview() {
    if (!claim || !exemplarAudioBlob) return;
    submitting = true;
    error = null;

    try {
      const uploadUrl = await client.mutation(api.audioUploads.generateUploadUrlForVerifier, {});
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': exemplarAudioBlob.type || 'audio/webm' },
        body: exemplarAudioBlob
      });
      if (!res.ok) throw new Error('Failed to upload exemplar audio.');
      const { storageId } = await res.json();

      const exemplarId = await client.mutation(api.audioAssets.create, {
        storageKey: storageId,
        contentType: exemplarAudioBlob.type || 'audio/webm',
        attemptId: claim.attemptId,
        durationMs: exemplarDurationMs
      });

      await client.mutation(api.humanReviews.submitReview, {
        requestId: claim.requestId,
        soundAccuracy: scores.soundAccuracy,
        rhythmIntonation: scores.rhythmIntonation,
        phraseAccuracy: scores.phraseAccuracy,
        aiAnalysisCorrect: aiAnalysisCorrect ?? undefined,
        exemplarAudioAssetId: exemplarId as Id<'audioAssets'>
      });

      discardRecording();
      // Try to claim next automatically
      const next = await client.mutation(api.humanReviews.claimNext, { languageCode: 'xh-ZA' });
      if (next) {
        goto(resolve(`/work/${next.requestId}`));
      } else {
        goto(resolve('/work'));
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to submit review.';
    } finally {
      submitting = false;
    }
  }

  const scoreLabels = [1, 2, 3, 4, 5];
</script>

{#if !claim}
  <div class="page-shell page-shell--compact flex min-h-[80vh] items-center justify-center">
    <p class="meta-text">Loading claim...</p>
  </div>
{:else}
  <div class="practice-session">
    <!-- Top: session info -->
    <div class="practice-session__header">
      <div class="practice-session__header-info">
        <p class="info-kicker">
          {claim.phase === 'dispute' ? 'Dispute Review' : 'Learner Attempt'}
        </p>
        <p class="meta-text">
          Time remaining: {formatTimer(remainingMs)}
        </p>
      </div>
    </div>

    <!-- Center: phrase + content -->
    <div class="practice-session__phrase" style="overflow-y: auto;">
      <div class="w-full space-y-6 px-4">
        <!-- Phrase display -->
        <div class="text-center">
          <p class="info-kicker">English</p>
          <p class="mt-1 text-xl font-semibold sm:text-2xl">{claim.phrase?.english}</p>
          <p class="xhosa-phrase mt-3 font-black">{claim.phrase?.translation}</p>
        </div>

        <!-- Learner audio -->
        {#if claim.learnerAttempt.audioUrl}
          <div class="border border-border/50 bg-muted/30 p-3">
            <p class="info-kicker mb-2">Learner Audio</p>
            <audio controls src={claim.learnerAttempt.audioUrl} class="w-full"></audio>
          </div>
        {/if}

        <!-- Audio Scoring: 5 yellow square buttons per dimension -->
        <div class="space-y-4">
          <p class="info-kicker">Audio Scoring</p>

          <div class="space-y-3">
            <p class="text-sm font-medium">Sound Accuracy</p>
            <div class="flex gap-2">
              {#each scoreLabels as n}
                <button
                  class="flex h-11 w-11 items-center justify-center text-lg font-bold transition-colors"
                  class:bg-yellow-400={scores.soundAccuracy !== n}
                  class:text-yellow-900={scores.soundAccuracy !== n}
                  class:bg-primary={scores.soundAccuracy === n}
                  class:text-primary-foreground={scores.soundAccuracy === n}
                  onclick={() => (scores.soundAccuracy = n)}
                >
                  {n}
                </button>
              {/each}
            </div>
          </div>

          <div class="space-y-3">
            <p class="text-sm font-medium">Rhythm & Intonation</p>
            <div class="flex gap-2">
              {#each scoreLabels as n}
                <button
                  class="flex h-11 w-11 items-center justify-center text-lg font-bold transition-colors"
                  class:bg-yellow-400={scores.rhythmIntonation !== n}
                  class:text-yellow-900={scores.rhythmIntonation !== n}
                  class:bg-primary={scores.rhythmIntonation === n}
                  class:text-primary-foreground={scores.rhythmIntonation === n}
                  onclick={() => (scores.rhythmIntonation = n)}
                >
                  {n}
                </button>
              {/each}
            </div>
          </div>

          <div class="space-y-3">
            <p class="text-sm font-medium">Phrase Accuracy</p>
            <div class="flex gap-2">
              {#each scoreLabels as n}
                <button
                  class="flex h-11 w-11 items-center justify-center text-lg font-bold transition-colors"
                  class:bg-yellow-400={scores.phraseAccuracy !== n}
                  class:text-yellow-900={scores.phraseAccuracy !== n}
                  class:bg-primary={scores.phraseAccuracy === n}
                  class:text-primary-foreground={scores.phraseAccuracy === n}
                  onclick={() => (scores.phraseAccuracy = n)}
                >
                  {n}
                </button>
              {/each}
            </div>
          </div>
        </div>

        <!-- AI Analysis section -->
        {#if claim.aiFeedback}
          <div class="space-y-4">
            <p class="info-kicker">AI Analysis</p>
            <div class="border border-border/50 bg-muted/30 p-3 space-y-2">
              {#if claim.aiFeedback.transcript}
                <div>
                  <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Transcript</p>
                  <p class="text-sm mt-1">{claim.aiFeedback.transcript}</p>
                </div>
              {/if}
              {#if claim.aiFeedback.feedbackText}
                <div>
                  <p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">Feedback</p>
                  <p class="text-sm mt-1">{claim.aiFeedback.feedbackText}</p>
                </div>
              {/if}
              {#if claim.aiFeedback.score != null}
                <p class="text-sm">AI Score: {claim.aiFeedback.score}/5</p>
              {/if}
            </div>

            <div class="space-y-2">
              <p class="text-sm font-medium">Is this analysis correct?</p>
              <div class="flex gap-2">
                <button
                  class="flex-1 py-2.5 text-sm font-bold transition-colors border"
                  class:bg-destructive={aiAnalysisCorrect === false}
                  class:text-destructive-foreground={aiAnalysisCorrect === false}
                  class:border-destructive={aiAnalysisCorrect === false}
                  class:bg-transparent={aiAnalysisCorrect !== false}
                  class:border-border={aiAnalysisCorrect !== false}
                  onclick={() => (aiAnalysisCorrect = false)}
                >
                  Incorrect
                </button>
                <button
                  class="flex-1 py-2.5 text-sm font-bold transition-colors border"
                  class:bg-primary={aiAnalysisCorrect === true}
                  class:text-primary-foreground={aiAnalysisCorrect === true}
                  class:border-primary={aiAnalysisCorrect === true}
                  class:bg-transparent={aiAnalysisCorrect !== true}
                  class:border-border={aiAnalysisCorrect !== true}
                  onclick={() => (aiAnalysisCorrect = true)}
                >
                  Correct
                </button>
              </div>
            </div>
          </div>
        {/if}

        <!-- Dispute context -->
        {#if claim.phase === 'dispute' && claim.originalReview}
          <div class="border border-orange-500/50 bg-orange-500/10 p-3">
            <p class="info-kicker">Original Review by {claim.originalReview.verifierFirstName}</p>
            <p class="meta-text mt-1">
              Sound {claim.originalReview.soundAccuracy}/5
              • Rhythm {claim.originalReview.rhythmIntonation}/5
              • Phrase {claim.originalReview.phraseAccuracy}/5
            </p>
            <p class="meta-text mt-1">
              Dispute checks: {claim.disputeProgress?.completed ?? 0}/2
            </p>
          </div>
        {/if}
      </div>
    </div>

    <!-- Bottom: recording + actions -->
    <div class="practice-session__controls">
      {#if recorderError}
        <p class="text-destructive text-sm">{recorderError}</p>
      {/if}
      {#if error}
        <p class="text-destructive text-sm">{error}</p>
      {/if}

      <!-- Exemplar recording -->
      <div class="space-y-2">
        <p class="info-kicker">Record Exemplar</p>
        {#if exemplarAudioUrl}
          <audio controls src={exemplarAudioUrl} class="w-full"></audio>
          <Button onclick={discardRecording} variant="outline" size="sm" class="w-full">Discard Recording</Button>
        {:else if recording}
          <Button onclick={stopRecording} size="lg" class="practice-record-btn w-full">
            Stop Recording
          </Button>
        {:else}
          <Button onclick={startRecording} size="lg" class="practice-record-btn w-full">
            Record Exemplar
          </Button>
        {/if}
      </div>

      <div class="grid grid-cols-2 gap-2">
        <Button variant="outline" onclick={releaseClaim} disabled={releasing || submitting}>
          {releasing ? 'Releasing...' : 'Release'}
        </Button>
        <Button onclick={submitReview} disabled={submitting || !exemplarAudioBlob || remainingMs <= 0}>
          {submitting ? 'Submitting...' : 'Submit'}
        </Button>
      </div>
    </div>
  </div>
{/if}
```

### Success Criteria

#### Automated:
- [x] `turbo run build` succeeds
- [x] `turbo run check` succeeds

#### Manual:
- [ ] Landing page (`/`) shows verifier guidance content + FAB with pending count
- [ ] FAB disabled + dimmed when queue empty, navigates to `/work/{id}` when clicked
- [ ] Settings page shows language team config, onboarding form, stats callout (total + today)
- [ ] Work page (`/work`) shows list of pending items, click claims and navigates to session
- [ ] Session page (`/work/[id]`) shows phrase, learner audio, scoring UI, AI feedback, recording, submit
- [ ] 5 yellow square score buttons per category, selected button shows primary color
- [ ] AI analysis section shows transcript + feedback + Correct/Incorrect buttons
- [ ] After submit, auto-claims next and navigates to it (or back to `/work` if empty)
- [ ] Header shows "Home" and "Work" links with active states, profile dropdown with Settings/Logout

**Pause here for manual verification.**

---

## Phase 5: Cleanup + Turbo Config

### Changes Required

#### 5.1 Update `turbo.json` dev task

Add `dependsOn: ["^dev"]` so package dev tasks run before app dev tasks (future-proofing for when we add `svelte-package --watch`):

```json
"dev": {
  "cache": false,
  "persistent": true,
  "dependsOn": ["^dev"]
}
```

#### 5.2 Add Tailwind `@source` for all packages

Already handled in Phase 2 (2.9). Verify both apps pick up utility classes from shared packages.

#### 5.3 Remove stale verifier files

- Delete old `apps/verifier/src/lib/components/Header.svelte`
- Delete old `apps/verifier/src/lib/components/ui/` (entire dir)
- Delete old `apps/verifier/src/lib/utils.ts`, `auth-client.ts`, `convex.ts`, `stores/auth.ts`, `notifications.ts`, `providers/`

#### 5.4 Run `bun install` to regenerate lockfile

```bash
bun install
```

### Success Criteria

#### Automated:
- [x] `bun install` clean
- [x] `turbo run build` succeeds
- [x] `turbo run check` succeeds
- [x] `turbo run test:run` passes
- [x] No orphan imports to `$lib/utils`, `$lib/auth-client`, `$lib/convex`, `$lib/stores/auth`, `$lib/notifications`, `$lib/providers`, `$lib/components/ui/`, or `$lib/components/Header.svelte` in either app

#### Manual:
- [ ] Full end-to-end test of web app (login, library, practice, settings)
- [ ] Full end-to-end test of verifier app (login, landing, work list, claim, score, submit, settings)

---

## Testing Strategy

### Automated Tests
- Existing `auth.test.ts` in web — update imports to `@babylon/shared`
- No new unit tests needed for UI component moves (they're visual)

### Manual Testing
- Each phase has a manual verification gate
- Web app regression: login flow, phrase library, practice session, settings
- Verifier app: full flow from landing → claim → score → submit → auto-claim next

---

## Migration Notes

- No database migrations needed
- Schema addition (`aiAnalysisCorrect` on `humanReviews`) is optional field — backwards compatible
- New Convex queries (`getMyStats`, `listPendingForLanguage`) are additive — no breaking changes
- `claimNext` return value already includes `requestId` — used for navigation in verifier

## References

- Research: `thoughts/shared/research/2026-02-12-shared-ui-monorepo-strategy.md`
- Web app patterns: `apps/web/src/routes/` (library, practice, settings)
- Convex schema: `convex/schema.ts`
- Human review system: `convex/humanReviews.ts`
