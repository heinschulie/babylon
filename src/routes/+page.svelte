<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '../../convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';

	const sessions = useQuery(api.sessions.list, {});
</script>

<div class="container mx-auto max-w-4xl p-4">
	<div class="mb-6 flex items-center justify-between">
		<h1 class="text-2xl font-bold">Learning Sessions</h1>
		<Button>New Session</Button>
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
