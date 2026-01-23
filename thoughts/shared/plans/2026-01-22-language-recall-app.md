# Language Recall App Implementation Plan

## Overview

Build a PWA for language learning through random recall prompts. Users add learning sessions with phrases, then receive push notifications throughout the day asking them to recall translations. The app emphasizes repeated recall over repeated exposure.

## Current State Analysis

**Starting from scratch** - empty directory, no existing code.

**Tech Stack:**

- **Frontend**: SvelteKit + shadcn-svelte + Tailwind CSS
- **Backend/DB**: Convex
- **Auth**: BetterAuth with Convex adapter
- **Notifications**: Web Push API via service worker

## Desired End State

A working PWA where users can:

1. Register/login with username + password
2. Create learning sessions with dates
3. Add phrases to sessions (English + target language)
4. Receive 2-3 push notifications per phrase at random times during waking hours
5. Tap notification to see the answer in-app

**Verification**:

- Register, add session, add 3 phrases
- Receive ~6-9 notifications spread throughout configured hours
- Each notification shows English phrase, tapping reveals target language

## What We're NOT Doing

- Native mobile app (PWA only)
- Spaced repetition algorithms (simple random for MVP)
- Multiple languages per user (single target language)
- Audio pronunciation
- Progress tracking / statistics
- Social features
- Offline mode (requires connectivity)

## Implementation Approach

**Phase order**: Infrastructure → Auth → Data model → Core CRUD → Notifications → PWA setup

This order ensures each phase builds on stable foundations. Auth first because all data is user-scoped.

---

## Phase 1: Project Setup & Infrastructure

### Overview

Initialize SvelteKit project with Convex, Tailwind, and shadcn-svelte.

### Changes Required:

#### 1.1 Create SvelteKit Project

```bash
pnpm create svelte@latest babylon
# Select: Skeleton project, TypeScript, ESLint, Prettier
cd babylon
pnpm install
```

#### 1.2 Add Tailwind CSS

```bash
pnpm dlx sv add tailwindcss
```

#### 1.3 Initialize shadcn-svelte

```bash
pnpm dlx shadcn-svelte@latest init
# Select: Default style, base color (Slate), CSS variables
```

#### 1.4 Add Required shadcn Components

```bash
pnpm dlx shadcn-svelte@latest add button card input label form dialog alert
```

#### 1.5 Initialize Convex

```bash
pnpm add convex
pnpm convex init
```

Creates `convex/` directory with schema and functions.

#### 1.6 Configure Convex Client

**File**: `src/lib/convex.ts`

```typescript
import { ConvexClient } from 'convex/browser';

export const convex = new ConvexClient(import.meta.env.VITE_CONVEX_URL);
```

**File**: `src/routes/+layout.svelte`

```svelte
<script lang="ts">
	import '../app.css';
	import { setContext } from 'svelte';
	import { convex } from '$lib/convex';

	setContext('convex', convex);
</script>

<slot />
```

#### 1.7 Environment Variables

**File**: `.env.local`

```
VITE_CONVEX_URL=<your-convex-deployment-url>
BETTER_AUTH_SECRET=<generate-with-openssl-rand-base64-32>
```

### Success Criteria:

#### Automated Verification:

- [ ] `pnpm dev` starts without errors
- [ ] `pnpm build` completes successfully
- [ ] `pnpm convex dev` connects to Convex

#### Manual Verification:

- [ ] App loads in browser at localhost:5173
- [ ] shadcn Button component renders correctly

---

## Phase 2: Authentication with BetterAuth

### Overview

Implement username/password auth using BetterAuth with Convex adapter.

### Changes Required:

#### 2.1 Install Auth Dependencies

```bash
pnpm add better-auth @convex-dev/better-auth
```

#### 2.2 Configure Convex for BetterAuth

**File**: `convex/convex.config.ts`

```typescript
import { defineApp } from 'convex/server';
import betterAuth from '@convex-dev/better-auth/convex.config';

const app = defineApp();
app.use(betterAuth);
export default app;
```

#### 2.3 Auth Configuration

**File**: `convex/auth.ts`

```typescript
import { betterAuth } from 'better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { authComponent } from './auth.config';

export const createAuth = (ctx: any) => {
	return betterAuth({
		baseURL: process.env.SITE_URL!,
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: false
		},
		plugins: [convex({ authConfig: authComponent })]
	});
};

export { authComponent };
```

**File**: `convex/auth.config.ts`

```typescript
import { getAuthConfigProvider } from '@convex-dev/better-auth/auth-config';
import type { AuthConfig } from 'convex/server';

export default {
	providers: [getAuthConfigProvider()]
} satisfies AuthConfig;
```

#### 2.4 HTTP Routes for Auth

**File**: `convex/http.ts`

```typescript
import { httpRouter } from 'convex/server';
import { authComponent, createAuth } from './auth';

const http = httpRouter();
authComponent.registerRoutes(http, createAuth);
export default http;
```

#### 2.5 Client Auth Setup

**File**: `src/lib/auth-client.ts`

```typescript
import { createAuthClient } from 'better-auth/svelte';

export const authClient = createAuthClient({
	baseURL: import.meta.env.VITE_CONVEX_SITE_URL
});
```

#### 2.6 Auth Store

**File**: `src/lib/stores/auth.ts`

```typescript
import { writable, derived } from 'svelte/store';
import { authClient } from '$lib/auth-client';

export const session = writable<any>(null);
export const user = derived(session, ($session) => $session?.user ?? null);
export const isAuthenticated = derived(user, ($user) => !!$user);

// Initialize session on load
authClient.getSession().then((s) => session.set(s));
```

#### 2.7 Login Page

**File**: `src/routes/login/+page.svelte`

```svelte
<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';

	let email = '';
	let password = '';
	let error = '';
	let loading = false;

	async function handleLogin() {
		loading = true;
		error = '';
		const { error: err } = await authClient.signIn.email({
			email,
			password
		});
		if (err) {
			error = err.message;
		} else {
			goto('/');
		}
		loading = false;
	}
</script>

<div class="flex min-h-screen items-center justify-center">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title>Login</Card.Title>
		</Card.Header>
		<Card.Content>
			<form on:submit|preventDefault={handleLogin} class="space-y-4">
				<div>
					<Label for="email">Email</Label>
					<Input id="email" type="email" bind:value={email} required />
				</div>
				<div>
					<Label for="password">Password</Label>
					<Input id="password" type="password" bind:value={password} required />
				</div>
				{#if error}
					<p class="text-sm text-red-500">{error}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? 'Logging in...' : 'Login'}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer>
			<a href="/register" class="text-sm text-muted-foreground">
				Don't have an account? Register
			</a>
		</Card.Footer>
	</Card.Root>
</div>
```

#### 2.8 Register Page

**File**: `src/routes/register/+page.svelte`

```svelte
<script lang="ts">
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Card from '$lib/components/ui/card';

	let name = '';
	let email = '';
	let password = '';
	let error = '';
	let loading = false;

	async function handleRegister() {
		loading = true;
		error = '';
		const { error: err } = await authClient.signUp.email({
			name,
			email,
			password
		});
		if (err) {
			error = err.message;
		} else {
			goto('/');
		}
		loading = false;
	}
</script>

<div class="flex min-h-screen items-center justify-center">
	<Card.Root class="w-full max-w-sm">
		<Card.Header>
			<Card.Title>Register</Card.Title>
		</Card.Header>
		<Card.Content>
			<form on:submit|preventDefault={handleRegister} class="space-y-4">
				<div>
					<Label for="name">Name</Label>
					<Input id="name" bind:value={name} required />
				</div>
				<div>
					<Label for="email">Email</Label>
					<Input id="email" type="email" bind:value={email} required />
				</div>
				<div>
					<Label for="password">Password</Label>
					<Input id="password" type="password" bind:value={password} required />
				</div>
				{#if error}
					<p class="text-sm text-red-500">{error}</p>
				{/if}
				<Button type="submit" class="w-full" disabled={loading}>
					{loading ? 'Creating account...' : 'Register'}
				</Button>
			</form>
		</Card.Content>
		<Card.Footer>
			<a href="/login" class="text-sm text-muted-foreground"> Already have an account? Login </a>
		</Card.Footer>
	</Card.Root>
</div>
```

#### 2.9 Auth Guard

**File**: `src/routes/+layout.ts`

```typescript
import { redirect } from '@sveltejs/kit';
import type { LayoutLoad } from './$types';

const publicRoutes = ['/login', '/register'];

export const load: LayoutLoad = async ({ url }) => {
	// Auth check will be handled client-side via store
	return {};
};
```

### Success Criteria:

#### Automated Verification:

- [ ] `pnpm build` succeeds
- [ ] `pnpm convex dev` shows auth tables created
- [ ] TypeScript types compile without errors

#### Manual Verification:

- [ ] Can register new user
- [ ] Can login with registered user
- [ ] Session persists on page refresh
- [ ] Logout works

---

## Phase 3: Data Model & Schema

### Overview

Define Convex schema for sessions, phrases, and notification preferences.

### Changes Required:

#### 3.1 Define Schema

**File**: `convex/schema.ts`

```typescript
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	// Learning sessions (one per day typically)
	sessions: defineTable({
		userId: v.string(),
		date: v.string(), // ISO date string YYYY-MM-DD
		targetLanguage: v.string(),
		createdAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_user_date', ['userId', 'date']),

	// Phrases within sessions
	phrases: defineTable({
		sessionId: v.id('sessions'),
		userId: v.string(),
		english: v.string(),
		translation: v.string(),
		createdAt: v.number()
	})
		.index('by_session', ['sessionId'])
		.index('by_user', ['userId']),

	// User preferences for notifications
	userPreferences: defineTable({
		userId: v.string(),
		quietHoursStart: v.number(), // Hour in 24h format (e.g., 22 for 10pm)
		quietHoursEnd: v.number(), // Hour in 24h format (e.g., 7 for 7am)
		notificationsPerPhrase: v.number(), // Default 2-3
		timezone: v.string(), // e.g., "Africa/Johannesburg"
		pushSubscription: v.optional(v.string()) // JSON stringified PushSubscription
	}).index('by_user', ['userId']),

	// Scheduled notifications (for tracking)
	scheduledNotifications: defineTable({
		userId: v.string(),
		phraseId: v.id('phrases'),
		scheduledFor: v.number(), // Unix timestamp
		sent: v.boolean(),
		scheduledJobId: v.optional(v.string())
	})
		.index('by_user_pending', ['userId', 'sent'])
		.index('by_scheduled_time', ['scheduledFor'])
});
```

#### 3.2 Push Schema to Convex

```bash
pnpm convex dev
```

### Success Criteria:

#### Automated Verification:

- [ ] `pnpm convex dev` succeeds without schema errors
- [ ] Schema shows in Convex dashboard

#### Manual Verification:

- [ ] Tables visible in Convex dashboard

---

## Phase 4: Core CRUD Operations

### Overview

Implement Convex functions for sessions, phrases, and preferences.

### Changes Required:

#### 4.1 Session Functions

**File**: `convex/sessions.ts`

```typescript
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return [];

		return await ctx.db
			.query('sessions')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.order('desc')
			.collect();
	}
});

export const getByDate = query({
	args: { date: v.string() },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return null;

		return await ctx.db
			.query('sessions')
			.withIndex('by_user_date', (q) => q.eq('userId', userId).eq('date', args.date))
			.first();
	}
});

export const create = mutation({
	args: {
		date: v.string(),
		targetLanguage: v.string()
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Not authenticated');

		// Check if session exists for this date
		const existing = await ctx.db
			.query('sessions')
			.withIndex('by_user_date', (q) => q.eq('userId', userId).eq('date', args.date))
			.first();

		if (existing) {
			return existing._id;
		}

		return await ctx.db.insert('sessions', {
			userId,
			date: args.date,
			targetLanguage: args.targetLanguage,
			createdAt: Date.now()
		});
	}
});

export const remove = mutation({
	args: { id: v.id('sessions') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Not authenticated');

		const session = await ctx.db.get(args.id);
		if (!session || session.userId !== userId) {
			throw new Error('Not found');
		}

		// Delete all phrases in session
		const phrases = await ctx.db
			.query('phrases')
			.withIndex('by_session', (q) => q.eq('sessionId', args.id))
			.collect();

		for (const phrase of phrases) {
			await ctx.db.delete(phrase._id);
		}

		await ctx.db.delete(args.id);
	}
});
```

#### 4.2 Phrase Functions

**File**: `convex/phrases.ts`

```typescript
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

export const listBySession = query({
	args: { sessionId: v.id('sessions') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return [];

		return await ctx.db
			.query('phrases')
			.withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
			.collect();
	}
});

export const create = mutation({
	args: {
		sessionId: v.id('sessions'),
		english: v.string(),
		translation: v.string()
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Not authenticated');

		// Verify session belongs to user
		const session = await ctx.db.get(args.sessionId);
		if (!session || session.userId !== userId) {
			throw new Error('Session not found');
		}

		return await ctx.db.insert('phrases', {
			sessionId: args.sessionId,
			userId,
			english: args.english,
			translation: args.translation,
			createdAt: Date.now()
		});
	}
});

export const update = mutation({
	args: {
		id: v.id('phrases'),
		english: v.string(),
		translation: v.string()
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Not authenticated');

		const phrase = await ctx.db.get(args.id);
		if (!phrase || phrase.userId !== userId) {
			throw new Error('Not found');
		}

		await ctx.db.patch(args.id, {
			english: args.english,
			translation: args.translation
		});
	}
});

export const remove = mutation({
	args: { id: v.id('phrases') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Not authenticated');

		const phrase = await ctx.db.get(args.id);
		if (!phrase || phrase.userId !== userId) {
			throw new Error('Not found');
		}

		await ctx.db.delete(args.id);
	}
});
```

#### 4.3 User Preferences Functions

**File**: `convex/preferences.ts`

```typescript
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from '@convex-dev/auth/server';

export const get = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return null;

		const prefs = await ctx.db
			.query('userPreferences')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.first();

		// Return defaults if no preferences set
		return (
			prefs ?? {
				userId,
				quietHoursStart: 22,
				quietHoursEnd: 7,
				notificationsPerPhrase: 3,
				timezone: 'Africa/Johannesburg',
				pushSubscription: null
			}
		);
	}
});

export const upsert = mutation({
	args: {
		quietHoursStart: v.optional(v.number()),
		quietHoursEnd: v.optional(v.number()),
		notificationsPerPhrase: v.optional(v.number()),
		timezone: v.optional(v.string()),
		pushSubscription: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Not authenticated');

		const existing = await ctx.db
			.query('userPreferences')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				...(args.quietHoursStart !== undefined && {
					quietHoursStart: args.quietHoursStart
				}),
				...(args.quietHoursEnd !== undefined && {
					quietHoursEnd: args.quietHoursEnd
				}),
				...(args.notificationsPerPhrase !== undefined && {
					notificationsPerPhrase: args.notificationsPerPhrase
				}),
				...(args.timezone !== undefined && { timezone: args.timezone }),
				...(args.pushSubscription !== undefined && {
					pushSubscription: args.pushSubscription
				})
			});
			return existing._id;
		}

		return await ctx.db.insert('userPreferences', {
			userId,
			quietHoursStart: args.quietHoursStart ?? 22,
			quietHoursEnd: args.quietHoursEnd ?? 7,
			notificationsPerPhrase: args.notificationsPerPhrase ?? 3,
			timezone: args.timezone ?? 'Africa/Johannesburg',
			pushSubscription: args.pushSubscription
		});
	}
});
```

### Success Criteria:

#### Automated Verification:

- [ ] `pnpm convex dev` shows functions deployed
- [ ] TypeScript compiles without errors

#### Manual Verification:

- [ ] Can create session via Convex dashboard
- [ ] Can add phrase to session
- [ ] Queries return correct data

---

## Phase 5: Frontend UI

### Overview

Build the main app UI with sessions list, session detail, and phrase management.

### Changes Required:

#### 5.1 Home Page (Sessions List)

**File**: `src/routes/+page.svelte`

```svelte
<script lang="ts">
	import { useQuery, useMutation } from 'convex/svelte';
	import { api } from '../../convex/_generated/api';
	import { isAuthenticated } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	$: if (!$isAuthenticated) goto('/login');

	const sessions = useQuery(api.sessions.list, {});
	const createSession = useMutation(api.sessions.create);

	let showNewSession = false;
	let newDate = new Date().toISOString().split('T')[0];
	let targetLanguage = 'Xhosa';

	async function handleCreateSession() {
		await createSession({ date: newDate, targetLanguage });
		showNewSession = false;
	}
</script>

<div class="container mx-auto max-w-2xl p-4">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold">Learning Sessions</h1>
		<Button on:click={() => (showNewSession = true)}>New Session</Button>
	</div>

	{#if $sessions?.length === 0}
		<Card.Root>
			<Card.Content class="py-8 text-center text-muted-foreground">
				No sessions yet. Create your first one!
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="space-y-3">
			{#each $sessions ?? [] as session}
				<Card.Root
					class="cursor-pointer hover:bg-accent"
					on:click={() => goto(`/session/${session._id}`)}
				>
					<Card.Content class="flex items-center justify-between py-4">
						<div>
							<p class="font-medium">{session.date}</p>
							<p class="text-sm text-muted-foreground">
								{session.targetLanguage}
							</p>
						</div>
						<span class="text-muted-foreground">→</span>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={showNewSession}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>New Session</Dialog.Title>
		</Dialog.Header>
		<form on:submit|preventDefault={handleCreateSession} class="space-y-4">
			<div>
				<Label for="date">Date</Label>
				<Input id="date" type="date" bind:value={newDate} required />
			</div>
			<div>
				<Label for="language">Target Language</Label>
				<Input id="language" bind:value={targetLanguage} required />
			</div>
			<Dialog.Footer>
				<Button type="submit">Create</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

#### 5.2 Session Detail Page

**File**: `src/routes/session/[id]/+page.svelte`

```svelte
<script lang="ts">
	import { page } from '$app/stores';
	import { useQuery, useMutation } from 'convex/svelte';
	import { api } from '../../../../convex/_generated/api';
	import type { Id } from '../../../../convex/_generated/dataModel';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	$: sessionId = $page.params.id as Id<'sessions'>;

	const phrases = useQuery(api.phrases.listBySession, { sessionId });
	const createPhrase = useMutation(api.phrases.create);
	const removePhrase = useMutation(api.phrases.remove);

	let showAddPhrase = false;
	let english = '';
	let translation = '';

	async function handleAddPhrase() {
		await createPhrase({ sessionId, english, translation });
		english = '';
		translation = '';
		showAddPhrase = false;
	}

	async function handleDelete(id: Id<'phrases'>) {
		if (confirm('Delete this phrase?')) {
			await removePhrase({ id });
		}
	}
</script>

<div class="container mx-auto max-w-2xl p-4">
	<div class="mb-6">
		<Button variant="ghost" on:click={() => goto('/')}>← Back</Button>
	</div>

	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold">Phrases</h1>
		<Button on:click={() => (showAddPhrase = true)}>Add Phrase</Button>
	</div>

	{#if $phrases?.length === 0}
		<Card.Root>
			<Card.Content class="py-8 text-center text-muted-foreground">
				No phrases yet. Add your first one!
			</Card.Content>
		</Card.Root>
	{:else}
		<div class="space-y-3">
			{#each $phrases ?? [] as phrase}
				<Card.Root>
					<Card.Content class="py-4">
						<p class="font-medium">{phrase.english}</p>
						<p class="text-muted-foreground">{phrase.translation}</p>
						<Button
							variant="ghost"
							size="sm"
							class="mt-2 text-destructive"
							on:click={() => handleDelete(phrase._id)}
						>
							Delete
						</Button>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>

<Dialog.Root bind:open={showAddPhrase}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Add Phrase</Dialog.Title>
		</Dialog.Header>
		<form on:submit|preventDefault={handleAddPhrase} class="space-y-4">
			<div>
				<Label for="english">English</Label>
				<Input id="english" bind:value={english} placeholder="Here is a dog" required />
			</div>
			<div>
				<Label for="translation">Translation</Label>
				<Input id="translation" bind:value={translation} placeholder="Nanku inja" required />
			</div>
			<Dialog.Footer>
				<Button type="submit">Add</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
```

#### 5.3 Settings Page

**File**: `src/routes/settings/+page.svelte`

```svelte
<script lang="ts">
	import { useQuery, useMutation } from 'convex/svelte';
	import { api } from '../../../convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { goto } from '$app/navigation';
	import { requestNotificationPermission } from '$lib/notifications';

	const preferences = useQuery(api.preferences.get, {});
	const updatePreferences = useMutation(api.preferences.upsert);

	let quietStart = 22;
	let quietEnd = 7;
	let perPhrase = 3;
	let timezone = 'Africa/Johannesburg';
	let notificationsEnabled = false;

	$: if ($preferences) {
		quietStart = $preferences.quietHoursStart;
		quietEnd = $preferences.quietHoursEnd;
		perPhrase = $preferences.notificationsPerPhrase;
		timezone = $preferences.timezone;
		notificationsEnabled = !!$preferences.pushSubscription;
	}

	async function handleSave() {
		await updatePreferences({
			quietHoursStart: quietStart,
			quietHoursEnd: quietEnd,
			notificationsPerPhrase: perPhrase,
			timezone
		});
	}

	async function enableNotifications() {
		const subscription = await requestNotificationPermission();
		if (subscription) {
			await updatePreferences({
				pushSubscription: JSON.stringify(subscription)
			});
			notificationsEnabled = true;
		}
	}
</script>

<div class="container mx-auto max-w-2xl p-4">
	<div class="mb-6">
		<Button variant="ghost" on:click={() => goto('/')}>← Back</Button>
	</div>

	<h1 class="mb-6 text-2xl font-bold">Settings</h1>

	<Card.Root>
		<Card.Header>
			<Card.Title>Notification Preferences</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="grid grid-cols-2 gap-4">
				<div>
					<Label for="quietStart">Quiet hours start</Label>
					<Input id="quietStart" type="number" min="0" max="23" bind:value={quietStart} />
				</div>
				<div>
					<Label for="quietEnd">Quiet hours end</Label>
					<Input id="quietEnd" type="number" min="0" max="23" bind:value={quietEnd} />
				</div>
			</div>
			<div>
				<Label for="perPhrase">Notifications per phrase</Label>
				<Input id="perPhrase" type="number" min="1" max="5" bind:value={perPhrase} />
			</div>
			<div>
				<Label for="timezone">Timezone</Label>
				<Input id="timezone" bind:value={timezone} />
			</div>
		</Card.Content>
		<Card.Footer class="flex-col gap-2">
			<Button on:click={handleSave} class="w-full">Save Preferences</Button>
			{#if !notificationsEnabled}
				<Button variant="outline" on:click={enableNotifications} class="w-full">
					Enable Notifications
				</Button>
			{:else}
				<p class="text-sm text-muted-foreground">Notifications enabled</p>
			{/if}
		</Card.Footer>
	</Card.Root>
</div>
```

#### 5.4 Navigation Header

**File**: `src/lib/components/Header.svelte`

```svelte
<script lang="ts">
	import { isAuthenticated, session } from '$lib/stores/auth';
	import { authClient } from '$lib/auth-client';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';

	async function logout() {
		await authClient.signOut();
		session.set(null);
		goto('/login');
	}
</script>

{#if $isAuthenticated}
	<header class="border-b">
		<div class="container mx-auto flex max-w-2xl items-center justify-between p-4">
			<a href="/" class="text-lg font-bold">Recall</a>
			<div class="flex gap-2">
				<Button variant="ghost" size="sm" on:click={() => goto('/settings')}>Settings</Button>
				<Button variant="ghost" size="sm" on:click={logout}>Logout</Button>
			</div>
		</div>
	</header>
{/if}
```

Update layout to include header:

**File**: `src/routes/+layout.svelte`

```svelte
<script lang="ts">
	import '../app.css';
	import { setContext } from 'svelte';
	import { convex } from '$lib/convex';
	import Header from '$lib/components/Header.svelte';

	setContext('convex', convex);
</script>

<Header />
<slot />
```

### Success Criteria:

#### Automated Verification:

- [ ] `pnpm build` succeeds
- [ ] TypeScript compiles without errors
- [ ] `pnpm check` passes

#### Manual Verification:

- [ ] Can view sessions list
- [ ] Can create new session
- [ ] Can view session phrases
- [ ] Can add/delete phrases
- [ ] Can update settings
- [ ] Navigation works correctly

---

## Phase 6: Push Notifications & Scheduling

### Overview

Implement web push notifications with service worker and Convex scheduling.

### Changes Required:

#### 6.1 Generate VAPID Keys

```bash
pnpm add web-push
npx web-push generate-vapid-keys
```

Add to environment:

```
VITE_VAPID_PUBLIC_KEY=<your-public-key>
VAPID_PRIVATE_KEY=<your-private-key>
```

#### 6.2 Service Worker

**File**: `static/sw.js`

```javascript
self.addEventListener('push', (event) => {
	const data = event.data?.json() ?? {};

	event.waitUntil(
		self.registration.showNotification(data.title ?? 'Recall', {
			body: data.body ?? 'Time to practice!',
			icon: '/icon-192.png',
			badge: '/badge-72.png',
			data: {
				phraseId: data.phraseId,
				url: data.url ?? '/'
			},
			requireInteraction: true
		})
	);
});

self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	const url = event.notification.data?.url ?? '/';

	event.waitUntil(
		clients.matchAll({ type: 'window' }).then((windowClients) => {
			for (const client of windowClients) {
				if (client.url === url && 'focus' in client) {
					return client.focus();
				}
			}
			return clients.openWindow(url);
		})
	);
});
```

#### 6.3 Client Notification Helper

**File**: `src/lib/notifications.ts`

```typescript
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export async function requestNotificationPermission(): Promise<PushSubscription | null> {
	if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
		console.error('Push notifications not supported');
		return null;
	}

	const permission = await Notification.requestPermission();
	if (permission !== 'granted') {
		console.log('Notification permission denied');
		return null;
	}

	const registration = await navigator.serviceWorker.register('/sw.js');
	await navigator.serviceWorker.ready;

	const subscription = await registration.pushManager.subscribe({
		userVisibleOnly: true,
		applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
	});

	return subscription;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = window.atob(base64);
	const outputArray = new Uint8Array(rawData.length);
	for (let i = 0; i < rawData.length; ++i) {
		outputArray[i] = rawData.charCodeAt(i);
	}
	return outputArray;
}
```

#### 6.4 Notification Scheduling (Convex)

**File**: `convex/notifications.ts`

```typescript
import { v } from 'convex/values';
import { internalMutation, internalAction, mutation } from './_generated/server';
import { internal } from './_generated/api';

// Called when phrases are added to schedule notifications
export const scheduleForPhrase = internalMutation({
	args: {
		phraseId: v.id('phrases'),
		userId: v.string()
	},
	handler: async (ctx, args) => {
		const prefs = await ctx.db
			.query('userPreferences')
			.withIndex('by_user', (q) => q.eq('userId', args.userId))
			.first();

		const count = prefs?.notificationsPerPhrase ?? 3;
		const quietStart = prefs?.quietHoursStart ?? 22;
		const quietEnd = prefs?.quietHoursEnd ?? 7;

		// Generate random times for today
		const now = Date.now();
		const times = generateRandomTimes(count, quietStart, quietEnd);

		for (const time of times) {
			if (time > now) {
				const jobId = await ctx.scheduler.runAt(time, internal.notifications.send, {
					phraseId: args.phraseId,
					userId: args.userId
				});

				await ctx.db.insert('scheduledNotifications', {
					userId: args.userId,
					phraseId: args.phraseId,
					scheduledFor: time,
					sent: false,
					scheduledJobId: jobId.toString()
				});
			}
		}
	}
});

function generateRandomTimes(count: number, quietStart: number, quietEnd: number): number[] {
	const times: number[] = [];
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	// Available hours (excluding quiet hours)
	const availableHours: number[] = [];
	for (let h = 0; h < 24; h++) {
		if (quietStart > quietEnd) {
			// Quiet hours wrap midnight (e.g., 22-7)
			if (h >= quietEnd && h < quietStart) {
				availableHours.push(h);
			}
		} else {
			// Quiet hours don't wrap (e.g., 0-6)
			if (h < quietStart || h >= quietEnd) {
				availableHours.push(h);
			}
		}
	}

	for (let i = 0; i < count; i++) {
		const hour = availableHours[Math.floor(Math.random() * availableHours.length)];
		const minute = Math.floor(Math.random() * 60);
		const time = new Date(today);
		time.setHours(hour, minute, 0, 0);
		times.push(time.getTime());
	}

	return times.sort((a, b) => a - b);
}

// Action to send push notification
export const send = internalAction({
	args: {
		phraseId: v.id('phrases'),
		userId: v.string()
	},
	handler: async (ctx, args) => {
		// Get phrase
		const phrase = await ctx.runQuery(internal.phrases.getById, {
			id: args.phraseId
		});
		if (!phrase) return;

		// Get user's push subscription
		const prefs = await ctx.runQuery(internal.preferences.getByUserId, {
			userId: args.userId
		});
		if (!prefs?.pushSubscription) return;

		const subscription = JSON.parse(prefs.pushSubscription);

		// Get session for language name
		const session = await ctx.runQuery(internal.sessions.getById, {
			id: phrase.sessionId
		});

		// Send push notification
		const webPush = require('web-push');
		webPush.setVapidDetails(
			'mailto:your-email@example.com',
			process.env.VITE_VAPID_PUBLIC_KEY,
			process.env.VAPID_PRIVATE_KEY
		);

		try {
			await webPush.sendNotification(
				subscription,
				JSON.stringify({
					title: 'Recall Practice',
					body: `How do you say "${phrase.english}" in ${session?.targetLanguage ?? 'the target language'}?`,
					phraseId: args.phraseId,
					url: `/reveal/${args.phraseId}`
				})
			);

			// Mark as sent
			await ctx.runMutation(internal.notifications.markSent, {
				phraseId: args.phraseId,
				userId: args.userId
			});
		} catch (error) {
			console.error('Push notification failed:', error);
		}
	}
});

export const markSent = internalMutation({
	args: {
		phraseId: v.id('phrases'),
		userId: v.string()
	},
	handler: async (ctx, args) => {
		const notification = await ctx.db
			.query('scheduledNotifications')
			.withIndex('by_user_pending', (q) => q.eq('userId', args.userId).eq('sent', false))
			.filter((q) => q.eq(q.field('phraseId'), args.phraseId))
			.first();

		if (notification) {
			await ctx.db.patch(notification._id, { sent: true });
		}
	}
});
```

#### 6.5 Internal Queries for Notifications

**File**: `convex/phrases.ts` (add internal query)

```typescript
import { internalQuery } from './_generated/server';

export const getById = internalQuery({
	args: { id: v.id('phrases') },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	}
});
```

**File**: `convex/sessions.ts` (add internal query)

```typescript
import { internalQuery } from './_generated/server';

export const getById = internalQuery({
	args: { id: v.id('sessions') },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	}
});
```

**File**: `convex/preferences.ts` (add internal query)

```typescript
import { internalQuery } from './_generated/server';

export const getByUserId = internalQuery({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		return await ctx.db
			.query('userPreferences')
			.withIndex('by_user', (q) => q.eq('userId', args.userId))
			.first();
	}
});
```

#### 6.6 Hook Phrase Creation to Scheduling

Update `convex/phrases.ts` create mutation:

```typescript
import { internal } from './_generated/api';

export const create = mutation({
	args: {
		sessionId: v.id('sessions'),
		english: v.string(),
		translation: v.string()
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new Error('Not authenticated');

		const session = await ctx.db.get(args.sessionId);
		if (!session || session.userId !== userId) {
			throw new Error('Session not found');
		}

		const phraseId = await ctx.db.insert('phrases', {
			sessionId: args.sessionId,
			userId,
			english: args.english,
			translation: args.translation,
			createdAt: Date.now()
		});

		// Schedule notifications for this phrase
		await ctx.scheduler.runAfter(0, internal.notifications.scheduleForPhrase, {
			phraseId,
			userId
		});

		return phraseId;
	}
});
```

#### 6.7 Reveal Page

**File**: `src/routes/reveal/[id]/+page.svelte`

```svelte
<script lang="ts">
	import { page } from '$app/stores';
	import { useQuery } from 'convex/svelte';
	import { api } from '../../../../convex/_generated/api';
	import type { Id } from '../../../../convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { goto } from '$app/navigation';

	$: phraseId = $page.params.id as Id<'phrases'>;

	// We need a query to get single phrase
	// For now, show placeholder

	let revealed = false;
</script>

<div class="container mx-auto flex min-h-screen max-w-2xl items-center justify-center p-4">
	<Card.Root class="w-full">
		<Card.Header>
			<Card.Title>Do you remember?</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<p class="text-lg">How do you say this in the target language?</p>

			{#if !revealed}
				<Button on:click={() => (revealed = true)} class="w-full">Reveal Answer</Button>
			{:else}
				<div class="rounded-lg bg-muted p-4">
					<p class="text-lg font-medium">Answer will appear here</p>
				</div>
				<Button variant="outline" on:click={() => goto('/')} class="w-full">
					Back to Sessions
				</Button>
			{/if}
		</Card.Content>
	</Card.Root>
</div>
```

### Success Criteria:

#### Automated Verification:

- [ ] `pnpm build` succeeds
- [ ] Service worker registers without errors
- [ ] Convex functions deploy successfully

#### Manual Verification:

- [ ] Can enable notifications (permission prompt appears)
- [ ] Adding phrase schedules notifications (check Convex dashboard)
- [ ] Receive notification at scheduled time
- [ ] Tapping notification opens reveal page

---

## Phase 7: PWA Configuration

### Overview

Configure manifest and icons for installable PWA.

### Changes Required:

#### 7.1 Web App Manifest

**File**: `static/manifest.json`

```json
{
	"name": "Recall - Language Learning",
	"short_name": "Recall",
	"description": "Learn languages through random recall prompts",
	"start_url": "/",
	"display": "standalone",
	"background_color": "#ffffff",
	"theme_color": "#000000",
	"icons": [
		{
			"src": "/icon-192.png",
			"sizes": "192x192",
			"type": "image/png"
		},
		{
			"src": "/icon-512.png",
			"sizes": "512x512",
			"type": "image/png"
		}
	]
}
```

#### 7.2 Add Manifest to HTML

**File**: `src/app.html`

```html
<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<link rel="icon" href="%sveltekit.assets%/favicon.png" />
		<link rel="manifest" href="/manifest.json" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<meta name="theme-color" content="#000000" />
		<meta name="apple-mobile-web-app-capable" content="yes" />
		<meta name="apple-mobile-web-app-status-bar-style" content="black" />
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		<div style="display: contents">%sveltekit.body%</div>
	</body>
</html>
```

#### 7.3 Create Placeholder Icons

Create simple placeholder icons (192x192 and 512x512 PNG files) or use a tool to generate them.

### Success Criteria:

#### Automated Verification:

- [ ] `pnpm build` succeeds
- [ ] Manifest accessible at `/manifest.json`

#### Manual Verification:

- [ ] Chrome shows "Install app" option
- [ ] iOS Safari shows "Add to Home Screen" option
- [ ] Installed PWA opens in standalone mode

---

## Phase 8: Testing

### Overview

Add tests for critical functionality.

### Changes Required:

#### 8.1 Install Testing Dependencies

```bash
pnpm add -D vitest @testing-library/svelte jsdom
```

#### 8.2 Vitest Config

**File**: `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		environment: 'jsdom'
	}
});
```

#### 8.3 Convex Function Tests

**File**: `convex/sessions.test.ts`

```typescript
import { convexTest } from 'convex-test';
import { expect, test, describe } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

describe('sessions', () => {
	test('create and list sessions', async () => {
		const t = convexTest(schema);

		// Mock authenticated user
		const asUser = t.withIdentity({ subject: 'user123' });

		// Create session
		const sessionId = await asUser.mutation(api.sessions.create, {
			date: '2026-01-22',
			targetLanguage: 'Xhosa'
		});

		expect(sessionId).toBeDefined();

		// List sessions
		const sessions = await asUser.query(api.sessions.list, {});
		expect(sessions).toHaveLength(1);
		expect(sessions[0].date).toBe('2026-01-22');
	});

	test('duplicate date returns existing session', async () => {
		const t = convexTest(schema);
		const asUser = t.withIdentity({ subject: 'user123' });

		const id1 = await asUser.mutation(api.sessions.create, {
			date: '2026-01-22',
			targetLanguage: 'Xhosa'
		});

		const id2 = await asUser.mutation(api.sessions.create, {
			date: '2026-01-22',
			targetLanguage: 'Xhosa'
		});

		expect(id1).toBe(id2);
	});
});
```

#### 8.4 Phrase Tests

**File**: `convex/phrases.test.ts`

```typescript
import { convexTest } from 'convex-test';
import { expect, test, describe } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

describe('phrases', () => {
	test('create and list phrases', async () => {
		const t = convexTest(schema);
		const asUser = t.withIdentity({ subject: 'user123' });

		const sessionId = await asUser.mutation(api.sessions.create, {
			date: '2026-01-22',
			targetLanguage: 'Xhosa'
		});

		await asUser.mutation(api.phrases.create, {
			sessionId,
			english: 'Here is a dog',
			translation: 'Nanku inja'
		});

		const phrases = await asUser.query(api.phrases.listBySession, { sessionId });
		expect(phrases).toHaveLength(1);
		expect(phrases[0].english).toBe('Here is a dog');
	});

	test("cannot create phrase for other user's session", async () => {
		const t = convexTest(schema);
		const user1 = t.withIdentity({ subject: 'user1' });
		const user2 = t.withIdentity({ subject: 'user2' });

		const sessionId = await user1.mutation(api.sessions.create, {
			date: '2026-01-22',
			targetLanguage: 'Xhosa'
		});

		await expect(
			user2.mutation(api.phrases.create, {
				sessionId,
				english: 'Hello',
				translation: 'Molo'
			})
		).rejects.toThrow('Session not found');
	});
});
```

#### 8.5 Add Test Script

**File**: `package.json` (add script)

```json
{
	"scripts": {
		"test": "vitest",
		"test:run": "vitest run"
	}
}
```

### Success Criteria:

#### Automated Verification:

- [ ] `pnpm test:run` passes all tests

#### Manual Verification:

- [ ] Test output shows expected results

---

## Testing Strategy

### Unit Tests:

- Session CRUD operations
- Phrase CRUD operations
- User authorization checks
- Notification scheduling logic

### Integration Tests:

- Full auth flow (register → login → session management)
- Phrase creation triggers notification scheduling

### Manual Testing Steps:

1. Register new user
2. Login with credentials
3. Create session for today
4. Add 3 phrases
5. Check Convex dashboard for scheduled notifications
6. Wait for notification (or manually trigger)
7. Tap notification, verify reveal page works
8. Test on iOS (install as PWA first)

## Performance Considerations

- Convex handles real-time updates efficiently
- Notification scheduling batched per phrase
- PWA caches static assets for fast loads
- 1M scheduled function limit is sufficient for thousands of users

## Migration Notes

N/A - greenfield project

## References

- [Convex Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions)
- [BetterAuth Convex Integration](https://labs.convex.dev/better-auth)
- [shadcn-svelte Components](https://www.shadcn-svelte.com/docs/components)
- [Web Push Notifications](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Tutorials/js13kGames/Re-engageable_Notifications_Push)
