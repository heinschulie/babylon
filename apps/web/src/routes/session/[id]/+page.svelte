<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { Button } from '@babylon/ui/button';
	import * as Card from '@babylon/ui/card';
	import * as Dialog from '@babylon/ui/dialog';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';

	const client = useConvexClient();
	const sessionId = $derived(page.params.id as Id<'sessions'>);
	const sessionData = useQuery(api.phrases.listBySession, () => ({ sessionId }));

	// Derived values from the combined query
	const session = $derived(sessionData.data?.session);
	const phrases = $derived(sessionData.data?.phrases);

	let dialogOpen = $state(false);
	let english = $state('');
	let translation = $state('');
	let creating = $state(false);
	let verifying = $state(false);
	let error = $state('');

	// Verification state
	let verificationResult = $state<{
		verified: boolean;
		suggestedTranslation: string | null;
		similarity?: number;
		message: string;
	} | null>(null);
	let showVerification = $state(false);

	async function verifyTranslation() {
		if (!english.trim() || !translation.trim()) {
			error = 'Please enter both English and translation';
			return;
		}

		if (!session?.targetLanguage) {
			error = 'Session language not found';
			return;
		}

		verifying = true;
		error = '';
		verificationResult = null;

		try {
			const result = await client.action(api.translateNode.verifyTranslation, {
				english: english.trim(),
				userTranslation: translation.trim(),
				targetLanguage: session.targetLanguageCode ?? session.targetLanguage
			});
			verificationResult = result;
			showVerification = true;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to verify translation';
		} finally {
			verifying = false;
		}
	}

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
			resetForm();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to create phrase';
		} finally {
			creating = false;
		}
	}

	function useSuggestion() {
		if (verificationResult?.suggestedTranslation) {
			translation = verificationResult.suggestedTranslation;
			showVerification = false;
			verificationResult = null;
		}
	}

	function keepOriginal() {
		showVerification = false;
	}

	function resetForm() {
		english = '';
		translation = '';
		verificationResult = null;
		showVerification = false;
		error = '';
	}

	async function removePhrase(phraseId: Id<'phrases'>) {
		if (!confirm('Are you sure you want to delete this phrase?')) {
			return;
		}

		try {
			await client.mutation(api.phrases.remove, { id: phraseId });
		} catch (e) {
			console.error('Failed to delete phrase:', e);
		}
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<a href={resolve('/')} class="meta-text underline"
				>&larr; Back to sessions</a
			>
			<h1 class="mt-2 text-5xl sm:text-6xl">
				{#if session}
					{session.targetLanguage} Session
				{:else}
					Session Details
				{/if}
			</h1>
			{#if session}
				<p class="meta-text">{session.date}</p>
			{/if}
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
					<Dialog.Description>
						Enter an English phrase and your {session?.targetLanguage || 'target language'} translation.
					</Dialog.Description>
				</Dialog.Header>
				<div class="space-y-4 py-4">
					<div class="space-y-2">
						<Label for="english">English</Label>
						<Input id="english" placeholder="Enter English phrase" bind:value={english} />
					</div>
					<div class="space-y-2">
						<Label for="translation">Your Translation ({session?.targetLanguage || 'target'})</Label>
						<Input id="translation" placeholder="Enter your translation" bind:value={translation} />
					</div>

					{#if showVerification && verificationResult}
						<div class="rounded-lg border p-4 {verificationResult.verified ? 'border-green-500 bg-green-50 dark:bg-green-950' : 'border-orange-500 bg-orange-50 dark:bg-orange-950'}">
							<p class="text-sm font-medium {verificationResult.verified ? 'text-green-700 dark:text-green-300' : 'text-orange-700 dark:text-orange-300'}">
								{verificationResult.message}
							</p>
							{#if verificationResult.similarity !== undefined}
								<p class="mt-1 text-xs text-muted-foreground">
									Similarity: {verificationResult.similarity}%
								</p>
							{/if}
							{#if !verificationResult.verified && verificationResult.suggestedTranslation}
								<div class="mt-3 flex gap-2">
									<Button size="sm" variant="outline" onclick={useSuggestion}>
										Use Suggestion
									</Button>
									<Button size="sm" variant="ghost" onclick={keepOriginal}>
										Keep Mine
									</Button>
								</div>
							{/if}
						</div>
					{/if}

					{#if error}
						<p class="text-sm text-destructive">{error}</p>
					{/if}
				</div>
				<Dialog.Footer>
					<Button variant="outline" onclick={() => { dialogOpen = false; resetForm(); }}>Cancel</Button>
					{#if !showVerification}
						<Button
							variant="secondary"
							onclick={verifyTranslation}
							disabled={verifying || !english.trim() || !translation.trim()}
						>
							{verifying ? 'Checking...' : 'Check Spelling'}
						</Button>
					{/if}
					<Button onclick={createPhrase} disabled={creating || !english.trim() || !translation.trim()}>
						{creating ? 'Adding...' : 'Add Phrase'}
					</Button>
				</Dialog.Footer>
			</Dialog.Content>
		</Dialog.Root>
	</div>

	<div>
		<h2 class="text-4xl sm:text-5xl">Phrases</h2>
	</div>

	<div class="space-y-4">
		{#if sessionData.isLoading}
			<p class="text-muted-foreground">Loading phrases...</p>
		{:else if sessionData.error}
			<p class="text-destructive">Error loading phrases: {sessionData.error.message}</p>
		{:else if !phrases || phrases.length === 0}
			<p class="text-muted-foreground">No phrases yet. Add your first phrase!</p>
		{:else}
			{#each phrases as phrase (phrase._id)}
				<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
					<Card.Header class="flex flex-row items-start justify-between gap-3">
						<div>
							<Card.Title>{phrase.english}</Card.Title>
							<Card.Description class="text-primary">{phrase.translation}</Card.Description>
						</div>
						<Button
							variant="ghost"
							size="sm"
							class="text-destructive hover:text-destructive"
							onclick={() => removePhrase(phrase._id)}
						>
							Delete
						</Button>
					</Card.Header>
				</Card.Root>
			{/each}
		{/if}
	</div>
</div>
