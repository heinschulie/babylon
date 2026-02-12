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

	createSvelteAuthClient({
		authClient,
		convexUrl: CONVEX_URL
	});
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
