<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../../convex/_generated/api';
	import type { Id } from '../../../../convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	const client = useConvexClient();
	const sessionId = $derived(page.params.id as Id<'sessions'>);
	const phrases = useQuery(api.phrases.listBySession, () => ({ sessionId }));

	let dialogOpen = $state(false);
	let english = $state('');
	let translation = $state('');
	let creating = $state(false);
	let error = $state('');

	async function createPhrase() {
		if (!english.trim() || !translation.trim()) {
			error = 'Please enter both English and translation';
			return;
		}

		creating = true;
		error = '';

		try {
			await client.mutation(api.phrases.create, {
				sessionId,
				english: english.trim(),
				translation: translation.trim()
			});
			dialogOpen = false;
			english = '';
			translation = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create phrase';
		} finally {
			creating = false;
		}
	}
</script>

<div class="container mx-auto max-w-4xl p-4">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<a href={resolve('/')} class="text-sm text-muted-foreground hover:underline"
				>&larr; Back to sessions</a
			>
			<h1 class="mt-2 text-2xl font-bold">Session Details</h1>
		</div>
		<Dialog.Root bind:open={dialogOpen}>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button {...props}>Add Phrase</Button>
				{/snippet}
			</Dialog.Trigger>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>Add New Phrase</Dialog.Title>
					<Dialog.Description>Enter a phrase and its translation.</Dialog.Description>
				</Dialog.Header>
				<div class="space-y-4 py-4">
					<div class="space-y-2">
						<Label for="english">English</Label>
						<Input id="english" placeholder="Enter English phrase" bind:value={english} />
					</div>
					<div class="space-y-2">
						<Label for="translation">Translation</Label>
						<Input id="translation" placeholder="Enter translation" bind:value={translation} />
					</div>
					{#if error}
						<p class="text-sm text-destructive">{error}</p>
					{/if}
				</div>
				<Dialog.Footer>
					<Button variant="outline" onclick={() => (dialogOpen = false)}>Cancel</Button>
					<Button onclick={createPhrase} disabled={creating}>
						{creating ? 'Adding...' : 'Add Phrase'}
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
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
