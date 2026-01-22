<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components/ui/button';
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
		<p class="text-muted-foreground">No phrases yet. Add your first phrase!</p>
	</div>
</div>
