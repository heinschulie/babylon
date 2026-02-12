<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authClient } from '@babylon/shared/auth-client';
	import { isAuthenticated } from '@babylon/shared/stores/auth';
	import * as DropdownMenu from '../dropdown-menu';

	interface NavLink {
		label: string;
		href: string;
	}

	interface Props {
		links?: NavLink[];
		settingsHref?: string;
		settingsLabel?: string;
		logoutLabel?: string;
		homeAriaLabel?: string;
		profileAriaLabel?: string;
	}

	let {
		links = [],
		settingsHref = '/settings',
		settingsLabel = 'Settings',
		logoutLabel = 'Logout',
		homeAriaLabel = 'Home',
		profileAriaLabel = 'Profile menu'
	}: Props = $props();

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const r = resolve as (...args: any[]) => string;

	async function handleLogout() {
		await authClient.signOut();
		goto(r('/login'));
	}

	function isActive(path: string): boolean {
		const resolved = r(path);
		return page.url.pathname === resolved || page.url.pathname.startsWith(`${resolved}/`);
	}
</script>

{#if $isAuthenticated}
	<header class="app-header">
		<div class="app-header__bar">
			<a href={r('/')} class="app-header__icon" aria-label={homeAriaLabel}>
				<span class="app-header__icon-placeholder"></span>
			</a>

			<nav class="app-header__nav">
				{#each links as link}
					<a
						href={r(link.href)}
						class="app-header__link"
						data-active={isActive(link.href)}
					>
						{link.label}
					</a>
				{/each}
			</nav>

			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="app-header__avatar" aria-label={profileAriaLabel}>
					<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<circle cx="12" cy="8" r="4"/>
						<path d="M20 21a8 8 0 0 0-16 0"/>
					</svg>
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end" sideOffset={8}>
					<DropdownMenu.Item onclick={() => goto(r(settingsHref))}>
						{settingsLabel}
					</DropdownMenu.Item>
					<DropdownMenu.Separator />
					<DropdownMenu.Item onclick={handleLogout}>
						{logoutLabel}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</header>
{/if}
