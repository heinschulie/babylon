<script lang="ts">
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	const client = useConvexClient();
	const sessions = useQuery(api.sessions.list, {});

	let dialogOpen = $state(false);
	let targetLanguage = $state('');
	let creating = $state(false);
	let error = $state('');

	async function createSession() {
		if (!targetLanguage.trim()) {
			error = 'Please enter a target language';
			return;
		}

		creating = true;
		error = '';

		try {
			const date = new Date().toISOString().split('T')[0];
			await client.mutation(api.sessions.create, { date, targetLanguage: targetLanguage.trim() });
			dialogOpen = false;
			targetLanguage = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create session';
		} finally {
			creating = false;
		}
	}
</script>

<div class="container mx-auto max-w-4xl p-4">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold">Learning Sessions</h1>
		<Dialog.Root bind:open={dialogOpen}>
			<Dialog.Trigger>
				{#snippet child({ props })}
					<Button {...props}>New Session</Button>
				{/snippet}
			</Dialog.Trigger>
			<Dialog.Content>
				<Dialog.Header>
					<Dialog.Title>New Learning Session</Dialog.Title>
					<Dialog.Description>Create a new session to practice vocabulary.</Dialog.Description>
				</Dialog.Header>
				<div class="space-y-4 py-4">
					<div class="space-y-2">
						<Label for="targetLanguage">Target Language</Label>
						<Input
							id="targetLanguage"
							placeholder="e.g., Spanish, French, German"
							bind:value={targetLanguage}
						/>
					</div>
					{#if error}
						<p class="text-sm text-destructive">{error}</p>
					{/if}
				</div>
				<Dialog.Footer>
					<Button variant="outline" onclick={() => (dialogOpen = false)}>Cancel</Button>
					<Button onclick={createSession} disabled={creating}>
						{creating ? 'Creating...' : 'Create Session'}
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	</div>

	<div class="space-y-4">
		{#if sessions.isLoading}
			<p class="text-muted-foreground">Loading sessions...</p>
		{:else if sessions.error}
			<p class="text-destructive">Error loading sessions: {sessions.error.message}</p>
		{:else if !sessions.data || sessions.data.length === 0}
			<p class="text-muted-foreground">No sessions yet. Create your first learning session!</p>
		{:else}
			{#each sessions.data as session (session._id)}
				<Card.Root>
					<Card.Header>
						<Card.Title>{session.date}</Card.Title>
						<Card.Description>{session.targetLanguage}</Card.Description>
					</Card.Header>
				</Card.Root>
			{/each}
		{/if}
	</div>
</div>
