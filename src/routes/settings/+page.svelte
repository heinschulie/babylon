<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
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
		<Card.Content>
			<p class="text-muted-foreground">Settings form will be displayed here.</p>
		</Card.Content>
		<Card.Footer>
			<Button>Save Settings</Button>
		</Card.Footer>
	</Card.Root>
</div>
