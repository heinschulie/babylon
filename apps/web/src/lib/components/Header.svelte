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

	function isActive(path: '/' | '/practice'): boolean {
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
					<DropdownMenu.Item onclick={() => goto(resolve('/settings'))}>
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
