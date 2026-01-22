<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { setContext } from 'svelte';
	import { setupConvex } from 'convex-svelte';
	import { CONVEX_URL, convexClient } from '$lib/convex';
	import Header from '$lib/components/Header.svelte';

	let { children } = $props();

	setupConvex(CONVEX_URL);
	setContext('convex', convexClient);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Header />
{@render children()}
