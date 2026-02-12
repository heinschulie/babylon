<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { Button } from '@babylon/ui/button';
	import * as Card from '@babylon/ui/card';
	import * as Dialog from '@babylon/ui/dialog';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';

	const client = useConvexClient();
	const phraseGroups = useQuery(api.phrases.listGroupedByCategory, {});
	const billingStatus = useQuery(api.billing.getStatus, {});
	const unseenFeedback = useQuery(api.humanReviews.getUnseenFeedback, {});

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) {
			goto(resolve('/login'));
		}
	});

	let dialogOpen = $state(false);
	let english = $state('');
	let translation = $state('');
	let creating = $state(false);
	let error = $state('');

	const minutesRemaining = $derived(
		billingStatus.data
			? Math.max(0, Math.round(billingStatus.data.minutesLimit - billingStatus.data.minutesUsed))
			: null
	);

	async function createPhrase() {
		if (!english.trim() || !translation.trim()) {
			error = 'Please enter both English and translation.';
			return;
		}

		creating = true;
		error = '';
		try {
			await client.mutation(api.phrases.createDirect, {
				english: english.trim(),
				translation: translation.trim(),
				languageCode: 'xh-ZA'
			});
			dialogOpen = false;
			english = '';
			translation = '';
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to add phrase';
		} finally {
			creating = false;
		}
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header class="page-stack">
		<div>
			<p class="info-kicker">Daily Practice Setup</p>
			<h1 class="text-5xl sm:text-6xl">Phrase Library</h1>
			<p class="meta-text mt-3 max-w-2xl">
				Store phrases once, then train in short bursts when you have a spare minute.
			</p>
		</div>
		<div>
			<Dialog.Root bind:open={dialogOpen}>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button {...props} variant="outline" class="w-full" size="lg">Add Phrase</Button>
					{/snippet}
				</Dialog.Trigger>
				<Dialog.Content>
					<Dialog.Header>
						<Dialog.Title>Add Phrase</Dialog.Title>
						<Dialog.Description>Target language: Xhosa (`xh-ZA`).</Dialog.Description>
					</Dialog.Header>
					<div class="space-y-4 py-4">
						<div class="space-y-2">
							<Label for="english">English phrase</Label>
							<Input id="english" bind:value={english} placeholder="e.g. Where is the taxi rank?" />
						</div>
						<div class="space-y-2">
							<Label for="translation">Your Xhosa phrase</Label>
							<Input id="translation" bind:value={translation} placeholder="Type your phrase..." />
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
	</header>

	{#if unseenFeedback.data?.practiceSessionId}
		<a
			href={resolve(`/practice/session/${unseenFeedback.data.practiceSessionId}#feedback`)}
			class="feedback-banner"
		>
			<div class="feedback-banner__content">
				<span class="feedback-banner__icon">
					<img src="/fire.gif" alt="" />
				</span>
				<span class="feedback-banner__text">
					Your verifier has reviewed your practice
				</span>
				<span class="feedback-banner__arrow">&rarr;</span>
			</div>
		</a>
	{/if}

	<section class="page-stack">
		{#if phraseGroups.isLoading}
			<p class="meta-text">Loading phrases...</p>
		{:else if phraseGroups.error}
			<p class="text-destructive">Error loading phrases: {phraseGroups.error.message}</p>
		{:else if !phraseGroups.data || phraseGroups.data.length === 0}
			<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
				<Card.Header>
					<Card.Title>No phrases yet</Card.Title>
					<Card.Description>Add your first phrase to start building your library.</Card.Description>
				</Card.Header>
			</Card.Root>
		{:else}
			<div class="space-y-4">
				{#each phraseGroups.data as group (group.key)}
					<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
						<Card.Header class="border-b border-border/50 pb-4">
							<Card.Title class="text-3xl sm:text-4xl">{group.label}</Card.Title>
							<Card.Description>{group.phrases.length} phrase(s)</Card.Description>
						</Card.Header>
						<Card.Content>
							<ul class="space-y-3">
								{#each group.phrases as phrase (phrase._id)}
									<li class="phrase-card border border-border/60 bg-background/70 p-4 sm:p-5">
										<p class="info-kicker">English</p>
										<p class="mt-2 text-xl font-semibold leading-tight sm:text-2xl">{phrase.english}</p>
										<p class="info-kicker mt-5">Xhosa</p>
										<p class="xhosa-phrase mt-2 font-black">
											{phrase.translation}
										</p>
									</li>
								{/each}
							</ul>
						</Card.Content>
					</Card.Root>
				{/each}
			</div>
		{/if}
	</section>
</div>

<!-- Practice FAB -->
{#if $isAuthenticated}
	<a href={resolve('/practice')} class="practice-fab" aria-label="Start practice">
		<span class="practice-fab__minutes">{minutesRemaining ?? '—'}</span>
		<span class="practice-fab__label">min</span>
	</a>
{/if}
