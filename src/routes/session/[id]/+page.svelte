<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../../convex/_generated/api';
	import type { Id } from '../../../../convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';

	const sessionId = $derived(page.params.id as Id<'sessions'>);
	const phrases = useQuery(api.phrases.listBySession, () => ({ sessionId }));
</script>

<div class="container mx-auto max-w-4xl p-4">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<a href={resolve('/')} class="text-sm text-muted-foreground hover:underline"
				>&larr; Back to sessions</a
			>
			<h1 class="mt-2 text-2xl font-bold">Session Details</h1>
		</div>
		<Button>Add Phrase</Button>
	</div>

	<div class="mb-4">
		<h2 class="text-lg font-semibold">Phrases</h2>
	</div>

	<div class="space-y-4">
		{#if phrases.isLoading}
			<p class="text-muted-foreground">Loading phrases...</p>
		{:else if phrases.error}
			<p class="text-destructive">Error loading phrases: {phrases.error.message}</p>
		{:else if !phrases.data || phrases.data.length === 0}
			<p class="text-muted-foreground">No phrases yet. Add your first phrase!</p>
		{:else}
			{#each phrases.data as phrase (phrase._id)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{phrase.english}</Card.Title>
						<Card.Description>{phrase.translation}</Card.Description>
					</Card.Header>
				</Card.Root>
			{/each}
		{/if}
	</div>
</div>
