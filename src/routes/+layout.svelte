<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { setupConvex } from 'convex-svelte';
	import { createSvelteAuthClient } from '@mmailaender/convex-better-auth-svelte/svelte';
	import { CONVEX_URL } from '$lib/convex';
	import { authClient } from '$lib/auth-client';
	import Header from '$lib/components/Header.svelte';

	let { children } = $props();

	// setupConvex creates the Convex client and stores it in context
	setupConvex(CONVEX_URL);

	// createSvelteAuthClient will get the client from context and set up auth
	createSvelteAuthClient({
		authClient,
		convexUrl: CONVEX_URL
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Header />
{@render children()}
