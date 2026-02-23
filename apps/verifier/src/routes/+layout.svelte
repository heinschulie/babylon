<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { setupConvex } from 'convex-svelte';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { CONVEX_URL } from '@babylon/shared/convex';
	import { authClient } from '@babylon/shared/auth-client';
	import { Header } from '@babylon/ui/header';
	import * as m from '$lib/paraglide/messages.js';
	import { getLocale, setLocale, isLocale } from '$lib/paraglide/runtime.js';
	import { useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { isAuthenticated } from '@babylon/shared/stores/auth';

	let { children } = $props();

	setupConvex(CONVEX_URL);

	createSvelteAuthClient({
		authClient,
		convexUrl: CONVEX_URL
	});

	const preferences = useQuery(api.preferences.get, () =>
		$isAuthenticated ? {} : 'skip'
	);

	let localeSynced = false;
	$effect(() => {
		if (preferences.data?.uiLocale && !localeSynced) {
			localeSynced = true;
			const saved = preferences.data.uiLocale;
			if (isLocale(saved) && saved !== getLocale()) {
				setLocale(saved);
			}
		}
	});

	let skinSynced = false;
	$effect(() => {
		if (preferences.data?.uiSkin && !skinSynced) {
			skinSynced = true;
			const saved = preferences.data.uiSkin;
			const current = document.documentElement.getAttribute('data-skin') ?? 'default';
			if (saved !== current) {
				if (saved === 'default') {
					document.documentElement.removeAttribute('data-skin');
				} else {
					document.documentElement.setAttribute('data-skin', saved);
				}
				localStorage.setItem('skin', saved);
			}
		}
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Header
	links={[
		{ label: m.nav_home(), href: '/' },
		{ label: m.nav_work(), href: '/work' }
	]}
	settingsLabel={m.nav_settings()}
	logoutLabel={m.nav_logout()}
	homeAriaLabel={m.aria_home()}
	profileAriaLabel={m.aria_profile_menu()}
/>
{@render children()}
