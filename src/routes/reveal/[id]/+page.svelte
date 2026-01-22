<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../../convex/_generated/api';
	import type { Id } from '../../../../convex/_generated/dataModel';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';

	const phraseId = $derived(page.params.id as Id<'phrases'>);
	const phrase = useQuery(api.phrases.get, () => ({ id: phraseId }));

	let revealed = $state(false);

	function handleReveal() {
		revealed = true;
	}
</script>

<div class="container mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center p-4">
	<Card.Root class="w-full">
		<Card.Header class="text-center">
			<Card.Title class="text-2xl">Time to Recall!</Card.Title>
			<Card.Description>Can you remember the translation?</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-6 text-center">
			{#if phrase.isLoading}
				<p class="text-muted-foreground">Loading...</p>
			{:else if phrase.error || !phrase.data}
				<p class="text-destructive">Phrase not found</p>
			{:else}
				<div class="rounded-lg bg-muted p-6">
					<p class="text-sm text-muted-foreground">English</p>
					<p class="mt-2 text-xl font-semibold">{phrase.data.english}</p>
				</div>

				{#if revealed}
					<div class="rounded-lg border-2 border-primary bg-primary/5 p-6">
						<p class="text-sm text-muted-foreground">Translation</p>
						<p class="mt-2 text-xl font-semibold text-primary">{phrase.data.translation}</p>
					</div>
				{:else}
					<Button onclick={handleReveal} class="w-full" size="lg">Reveal Answer</Button>
				{/if}
			{/if}
		</Card.Content>
		<Card.Footer class="justify-center">
			<a href={resolve('/')} class="text-sm text-muted-foreground hover:underline"
				>Back to Sessions</a
			>
		</Card.Footer>
	</Card.Root>
</div>
