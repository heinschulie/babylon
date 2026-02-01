<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useQuery } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { isAuthenticated, isLoading } from '$lib/stores/auth';

	const allPhrases = useQuery(api.phrases.listAllByUser, {});

	// If opened from a notification, this phrase should appear first
	const startPhraseId = $derived(page.url.searchParams.get('phrase'));

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) {
			goto(resolve('/login'));
		}
	});

	// Shuffle helper
	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	let queue: typeof allPhrases.data = $state([]);
	let currentIndex = $state(0);
	let userAttempt = $state('');
	let submitted = $state(false);
	let initialized = $state(false);

	// Initialize shuffled queue when data loads, placing the notification phrase first if present
	$effect(() => {
		if (allPhrases.data && allPhrases.data.length > 0 && !initialized) {
			const shuffled = shuffle(allPhrases.data);
			if (startPhraseId) {
				const idx = shuffled.findIndex((p) => p._id === startPhraseId);
				if (idx > 0) {
					const [target] = shuffled.splice(idx, 1);
					shuffled.unshift(target);
				}
			}
			queue = shuffled;
			currentIndex = 0;
			initialized = true;
		}
	});

	const currentPhrase = $derived(queue && queue.length > 0 ? queue[currentIndex] : null);

	function normalizeText(text: string): string {
		return text.toLowerCase().trim().replace(/[.,!?;:'"]/g, '');
	}

	const isCorrect = $derived(
		currentPhrase && submitted
			? normalizeText(userAttempt) === normalizeText(currentPhrase.translation)
			: false
	);

	function handleSubmit() {
		submitted = true;
	}

	function handleSkip() {
		submitted = true;
	}

	function handleNext() {
		let nextIndex = currentIndex + 1;
		if (nextIndex >= queue!.length) {
			// Re-shuffle and start again
			queue = shuffle(queue!);
			nextIndex = 0;
		}
		currentIndex = nextIndex;
		userAttempt = '';
		submitted = false;
	}

	let inputEl: HTMLInputElement | undefined = $state();

	// Auto-focus input when moving to next phrase
	$effect(() => {
		if (!submitted && inputEl) {
			inputEl.focus();
		}
	});
</script>

<div class="container mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center p-4">
	{#if allPhrases.isLoading}
		<p class="text-muted-foreground">Loading phrases...</p>
	{:else if !allPhrases.data || allPhrases.data.length === 0}
		<Card.Root class="w-full">
			<Card.Header class="text-center">
				<Card.Title class="text-2xl">No Phrases Yet</Card.Title>
				<Card.Description>Add some phrases in a learning session first.</Card.Description>
			</Card.Header>
			<Card.Footer class="justify-center">
				<a href={resolve('/')} class="text-sm text-muted-foreground hover:underline">
					Back to Sessions
				</a>
			</Card.Footer>
		</Card.Root>
	{:else if currentPhrase}
		<Card.Root class="w-full">
			<Card.Header class="text-center">
				<Card.Title class="text-2xl">Practice</Card.Title>
				<Card.Description>
					Translate to {currentPhrase.targetLanguage}
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6 text-center">
				<div class="rounded-lg bg-muted p-6">
					<p class="text-sm text-muted-foreground">English</p>
					<p class="mt-2 text-xl font-semibold">{currentPhrase.english}</p>
				</div>

				{#if !submitted}
					<div class="space-y-4 text-left">
						<Input
							placeholder="Type your translation..."
							bind:value={userAttempt}
							bind:ref={inputEl}
							onkeydown={(e) => e.key === 'Enter' && userAttempt.trim() && handleSubmit()}
						/>
						<div class="flex gap-2">
							<Button onclick={handleSubmit} class="flex-1" size="lg" disabled={!userAttempt.trim()}>
								Check
							</Button>
							<Button onclick={handleSkip} variant="outline" size="lg">
								Skip
							</Button>
						</div>
					</div>
				{:else}
					<div class="space-y-4">
						{#if userAttempt.trim()}
							<div class="rounded-lg border-2 p-4 {isCorrect ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-orange-500 bg-orange-50 dark:bg-orange-950'}">
								<p class="text-sm text-muted-foreground">Your Answer</p>
								<p class="mt-1 text-lg font-semibold">{userAttempt}</p>
								{#if isCorrect}
									<p class="mt-1 text-sm font-medium text-green-600 dark:text-green-400">Correct!</p>
								{/if}
							</div>
						{/if}
						{#if !isCorrect}
							<div class="rounded-lg border-2 border-primary bg-primary/5 p-4">
								<p class="text-sm text-muted-foreground">Correct Translation</p>
								<p class="mt-1 text-lg font-semibold text-primary">{currentPhrase.translation}</p>
							</div>
						{/if}
						<Button onclick={handleNext} class="w-full" size="lg">
							Next Phrase
						</Button>
					</div>
				{/if}
			</Card.Content>
			<Card.Footer class="justify-center">
				<a href={resolve('/')} class="text-sm text-muted-foreground hover:underline">
					Till later
				</a>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
