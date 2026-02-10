<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useQuery } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	const phraseId = $derived(page.params.id as Id<'phrases'>);
	const phrase = useQuery(api.phrases.get, () => ({ id: phraseId }));

	let userAttempt = $state('');
	let submitted = $state(false);
	let revealed = $state(false);

	function handleSubmit() {
		submitted = true;
	}

	function handleReveal() {
		revealed = true;
	}

	function normalizeText(text: string): string {
		return text.toLowerCase().trim().replace(/[.,!?;:'"]/g, '');
	}

	const isCorrect = $derived(
		phrase.data && submitted
			? normalizeText(userAttempt) === normalizeText(phrase.data.translation)
			: false
	);
</script>

<div class="page-shell page-shell--compact flex min-h-[80vh] flex-col items-center justify-center">
	<Card.Root class="w-full border border-border/60 bg-background/85 backdrop-blur-sm">
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
				<div class="border border-border/60 bg-muted/60 p-6">
					<p class="info-kicker">English</p>
					<p class="mt-2 text-xl font-semibold">{phrase.data.english}</p>
				</div>

				{#if !submitted}
					<!-- Step 1: User attempts translation -->
					<div class="space-y-4 text-left">
						<div class="space-y-2">
							<Label for="attempt">Your Translation</Label>
							<Input
								id="attempt"
								placeholder="Type your translation..."
								bind:value={userAttempt}
								onkeydown={(e) => e.key === 'Enter' && userAttempt.trim() && handleSubmit()}
							/>
						</div>
						<div class="flex gap-2">
							<Button onclick={handleSubmit} class="flex-1" size="lg" disabled={!userAttempt.trim()}>
								Check Answer
							</Button>
							<Button onclick={() => { submitted = true; revealed = true; }} variant="outline" size="lg">
								Skip
							</Button>
						</div>
					</div>
				{:else if !revealed}
					<!-- Step 2: Show user's attempt and option to reveal -->
					<div class="space-y-4">
						<div class="border-2 p-6 {isCorrect ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-orange-500 bg-orange-50 dark:bg-orange-950'}">
							<p class="info-kicker">Your Answer</p>
							<p class="mt-2 text-xl font-semibold">{userAttempt || '(skipped)'}</p>
							{#if isCorrect}
								<p class="mt-2 text-sm font-medium text-green-600 dark:text-green-400">Correct!</p>
							{:else}
								<p class="mt-2 text-sm text-orange-600 dark:text-orange-400">Let's see the correct answer...</p>
							{/if}
						</div>
						<Button onclick={handleReveal} class="w-full" size="lg">
							{isCorrect ? 'See Translation' : 'Reveal Correct Answer'}
						</Button>
					</div>
				{:else}
					<!-- Step 3: Show both user's attempt and correct answer -->
					<div class="space-y-4">
						{#if userAttempt}
							<div class="rounded-lg border-2 p-6 {isCorrect ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-orange-500 bg-orange-50 dark:bg-orange-950'}">
								<p class="info-kicker">Your Answer</p>
								<p class="mt-2 text-xl font-semibold">{userAttempt}</p>
								{#if isCorrect}
									<p class="mt-2 text-sm font-medium text-green-600 dark:text-green-400">Correct!</p>
								{/if}
							</div>
						{/if}
						<div class="border-2 border-primary bg-primary/5 p-6">
							<p class="info-kicker">Correct Translation</p>
							<p class="mt-2 text-xl font-semibold text-primary">{phrase.data.translation}</p>
						</div>
					</div>
				{/if}
			{/if}
		</Card.Content>
		<Card.Footer class="justify-center">
			<a href={resolve('/')} class="meta-text underline"
				>Back to Sessions</a
			>
		</Card.Footer>
	</Card.Root>
</div>
