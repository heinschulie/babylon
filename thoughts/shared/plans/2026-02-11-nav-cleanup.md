# Top Nav Cleanup — Implementation Plan

## Overview

Replace the stacked header (brand title + nav rail + logout button) with a clean single-row top nav bar: app icon slot (left), nav links (center), profile dropdown with logout (right).

## Current State

- `Header.svelte` renders "Daily Language Recall" kicker + "Recall" title, then a rail with Library/Practice/Settings links and a standalone Logout button
- CSS in `recall.css:177-288` styles the stacked layout
- No `DropdownMenu` component exists yet; `bits-ui` is installed and shadcn-svelte is configured

## Desired End State

Single horizontal nav bar:

```
[ icon slot ]   [ Library | Practice | Settings ]   [ avatar ▾ ]
                                                       └─ Logout
```

- Entire bar hidden when unauthenticated (same as now)
- Icon slot: empty placeholder link to `/` (ready for future logo)
- Nav links: same routes, same active-state logic
- Profile dropdown: generic avatar icon button → dropdown with "Logout" item
- Mobile: nav links stay horizontally scrollable, icon + avatar stay pinned

## What We're NOT Doing

- Adding a real app logo/icon asset
- User name/email display in dropdown
- Additional dropdown items beyond Logout
- Changing any routes or page content

## Phase 1: Add DropdownMenu Component

### Overview

Generate the shadcn-svelte `dropdown-menu` component so we can use it for the profile dropdown.

### Changes Required:

#### 1.1 Generate dropdown-menu via CLI

Run from `apps/web/`:

```bash
npx shadcn-svelte@latest add dropdown-menu
```

This will scaffold files into `src/lib/components/ui/dropdown-menu/` using the existing `components.json` config.

### Success Criteria:

#### Automated Verification:

- [x] `apps/web/src/lib/components/ui/dropdown-menu/index.ts` exists
- [x] Build passes: `cd apps/web && bun run build`

---

## Phase 2: Rewrite Header Component

### Overview

Replace the stacked brand + rail layout with a single-row nav bar containing icon slot, nav links, and profile dropdown.

### Changes Required:

#### 2.1 `apps/web/src/lib/components/Header.svelte`

Replace entire file. New structure:

```svelte
<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '$lib/auth-client';
	import { isAuthenticated } from '$lib/stores/auth';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';

	async function handleLogout() {
		await authClient.signOut();
		goto(resolve('/login'));
	}

	function isActive(path: '/' | '/practice' | '/settings'): boolean {
		const resolved = resolve(path);
		return page.url.pathname === resolved || page.url.pathname.startsWith(`${resolved}/`);
	}
</script>

{#if $isAuthenticated}
	<header class="app-header">
		<div class="app-header__bar">
			<!-- Icon slot (left) -->
			<a href={resolve('/')} class="app-header__icon" aria-label="Home">
				<span class="app-header__icon-placeholder"></span>
			</a>

			<!-- Nav links (center) -->
			<nav class="app-header__nav" aria-label="Primary">
				<a
					href={resolve('/')}
					class="app-header__link"
					data-active={isActive('/')}
				>
					Library
				</a>
				<a
					href={resolve('/practice')}
					class="app-header__link"
					data-active={isActive('/practice')}
				>
					Practice
				</a>
				<a
					href={resolve('/settings')}
					class="app-header__link"
					data-active={isActive('/settings')}
				>
					Settings
				</a>
			</nav>

			<!-- Profile dropdown (right) -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="app-header__avatar" aria-label="Profile menu">
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="8" r="4"/>
						<path d="M20 21a8 8 0 0 0-16 0"/>
					</svg>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" sideOffset={8}>
					<DropdownMenu.Item onclick={handleLogout}>
						Logout
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</header>
{/if}
```

Key changes:
- Entire `<header>` wrapped in `{#if $isAuthenticated}` (moves from inner rail to whole element)
- Removed: `page-shell` wrapper, `__stack`, `__top`, `__brand`, `__rail`, `__title`, kicker text, `Button` import
- Added: `DropdownMenu` import, `__bar` single-row container, `__icon` slot, `__avatar` trigger
- Nav links unchanged (same routes, same `isActive` logic)

#### 2.2 `packages/shared/src/styles/recall.css` — Header section (lines 177-288)

Replace the header CSS block (`.app-header` through the `@media` block ending at line 288) with:

```css
.app-header {
	border-bottom: 1px solid var(--theme-header-border);
	background: color-mix(in oklab, var(--theme-header-surface) 95%, transparent);
	backdrop-filter: blur(10px);
}

.app-header__bar {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	max-width: 48rem;
	margin-inline: auto;
	padding: 0.5rem var(--page-inline);
}

.app-header__icon {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 2rem;
	height: 2rem;
	flex-shrink: 0;
	color: var(--theme-header-ink);
}

.app-header__icon-placeholder {
	display: block;
	width: 1.5rem;
	height: 1.5rem;
	border: 2px solid currentColor;
	opacity: 0.5;
}

.app-header__nav {
	display: flex;
	gap: 0.28rem;
	overflow-x: auto;
	white-space: nowrap;
	scrollbar-width: none;
	flex: 1;
	justify-content: center;
}

.app-header__nav::-webkit-scrollbar {
	display: none;
}

.app-header__link {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	padding: 0.54rem 0.88rem;
	font-size: 0.8rem;
	text-transform: uppercase;
	letter-spacing: 0.12em;
	color: color-mix(in oklab, var(--theme-header-ink) 82%, transparent);
	border: 1px solid transparent;
	transition: color 160ms ease, border-color 160ms ease, background-color 160ms ease;
}

.app-header__link:hover {
	color: var(--theme-header-ink);
}

.app-header__link[data-active='true'] {
	background: var(--primary);
	color: var(--primary-foreground);
	border-color: color-mix(in oklab, var(--primary) 85%, black 15%);
}

.app-header__avatar {
	display: flex;
	align-items: center;
	justify-content: center;
	width: 2rem;
	height: 2rem;
	flex-shrink: 0;
	color: var(--theme-header-ink);
	background: none;
	border: 1px solid var(--theme-header-border);
	cursor: pointer;
	transition: border-color 160ms ease;
}

.app-header__avatar:hover {
	border-color: var(--theme-header-ink);
}
```

Removed classes: `__stack`, `__top`, `__brand`, `__title`, `__rail`, `__action`, `__cta` and mobile overrides for those.

### Success Criteria:

#### Automated Verification:

- [x] Build passes: `cd apps/web && bun run build`
- [x] No TypeScript errors: `cd apps/web && bun run check`

#### Manual Verification:

- [ ] Nav bar shows as single horizontal row: icon | links | avatar
- [ ] "Daily Language Recall" and "Recall" text gone
- [ ] Library/Practice/Settings links work with correct active states
- [ ] Profile dropdown opens on avatar click, shows "Logout"
- [ ] Logout works (clears session, redirects to /login)
- [ ] Nav bar fully hidden when logged out
- [ ] Mobile: nav scrollable, icon + avatar stay pinned

## References

- Header component: `apps/web/src/lib/components/Header.svelte`
- Header CSS: `packages/shared/src/styles/recall.css:177-288`
- shadcn-svelte config: `apps/web/components.json`
