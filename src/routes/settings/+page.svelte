<script lang="ts">
	import { resolve } from '$app/paths';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	const client = useConvexClient();
	const preferences = useQuery(api.preferences.get, {});

	let quietStart = $state(22);
	let quietEnd = $state(8);
	let perPhrase = $state(3);
	let saving = $state(false);
	let saved = $state(false);

	$effect(() => {
		if (preferences.data) {
			quietStart = preferences.data.quietHoursStart;
			quietEnd = preferences.data.quietHoursEnd;
			perPhrase = preferences.data.notificationsPerPhrase;
		}
	});

	async function handleSave() {
		saving = true;
		saved = false;

		try {
			await updatePreferences();
			saved = true;
			setTimeout(() => (saved = false), 2000);
		} catch (e) {
			console.error('Failed to save preferences:', e);
		} finally {
			saving = false;
		}
	}

	async function updatePreferences() {
		await client.mutation(api.preferences.upsert, {
			quietHoursStart: quietStart,
			quietHoursEnd: quietEnd,
			notificationsPerPhrase: perPhrase
		});
	}
</script>

<div class="container mx-auto max-w-4xl p-4">
	<div class="mb-6">
		<a href={resolve('/')} class="text-sm text-muted-foreground hover:underline"
			>&larr; Back to sessions</a
		>
		<h1 class="mt-2 text-2xl font-bold">Settings</h1>
	</div>

	<Card.Root>
		<Card.Header>
			<Card.Title>Notification Preferences</Card.Title>
			<Card.Description>Configure when and how you receive reminders.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			{#if preferences.isLoading}
				<p class="text-muted-foreground">Loading preferences...</p>
			{:else if preferences.error}
				<p class="text-destructive">Error loading preferences</p>
			{:else}
				<div class="grid grid-cols-2 gap-4">
					<div class="space-y-2">
						<Label for="quietStart">Quiet Hours Start</Label>
						<Input
							id="quietStart"
							type="number"
							min="0"
							max="23"
							bind:value={quietStart}
							placeholder="22"
						/>
						<p class="text-xs text-muted-foreground">Hour (0-23) when quiet hours begin</p>
					</div>
					<div class="space-y-2">
						<Label for="quietEnd">Quiet Hours End</Label>
						<Input
							id="quietEnd"
							type="number"
							min="0"
							max="23"
							bind:value={quietEnd}
							placeholder="8"
						/>
						<p class="text-xs text-muted-foreground">Hour (0-23) when quiet hours end</p>
					</div>
				</div>
				<div class="space-y-2">
					<Label for="perPhrase">Notifications Per Phrase</Label>
					<Input
						id="perPhrase"
						type="number"
						min="1"
						max="10"
						bind:value={perPhrase}
						placeholder="3"
					/>
					<p class="text-xs text-muted-foreground">
						Number of reminder notifications per phrase per day
					</p>
				</div>
			{/if}
		</Card.Content>
		<Card.Footer class="flex items-center gap-4">
			<Button onclick={handleSave} disabled={preferences.isLoading || saving}>
				{saving ? 'Saving...' : 'Save Settings'}
			</Button>
			{#if saved}
				<span class="text-sm text-green-600">Saved!</span>
			{/if}
		</Card.Footer>
	</Card.Root>
</div>
