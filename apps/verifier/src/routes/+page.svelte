<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import * as Card from '@babylon/ui/card';

	const client = useConvexClient();
	const verifierState = useQuery(api.verifierAccess.getMyVerifierState, {});
	const queueSignal = useQuery(api.humanReviews.getQueueSignal, () => ({
		languageCode: 'xh-ZA'
	}));

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});

	const pendingCount = $derived(queueSignal.data?.pendingCount ?? 0);
	const canReview = $derived(
		!!verifierState.data?.languages.find(
			(l) => l.languageCode === 'xh-ZA' && l.active
		)
	);

	let claiming = $state(false);

	async function autoAssign() {
		if (!canReview || claiming) return;
		claiming = true;
		try {
			const assignment = await client.mutation(api.humanReviews.claimNext, {
				languageCode: 'xh-ZA'
			});
			if (assignment) {
				goto(resolve(`/work/${assignment.requestId}`));
			}
		} finally {
			claiming = false;
		}
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header class="page-stack">
		<div>
			<p class="info-kicker">Verification Guide</p>
			<h1 class="text-5xl sm:text-6xl">Recall Verifier</h1>
			<p class="meta-text mt-3 max-w-2xl">
				Your reviews shape how learners hear and correct themselves. Read the guidance below before you begin.
			</p>
		</div>
	</header>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>Approach Every Recording Fresh</Card.Title>
			<Card.Description>You don't need a teaching background — just a fair ear and a clear method.</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="space-y-2">
				<p class="info-kicker">Listen First, Score Second</p>
				<p class="text-sm">Play the learner's recording fully at least once before touching any score. Snap judgements drift over time.</p>
			</div>
			<div class="space-y-2">
				<p class="info-kicker">Be Consistent, Not Lenient</p>
				<p class="text-sm">A 3 means "understood with effort." A 5 means a native speaker wouldn't blink. Anchor each session to these markers and you'll stay calibrated across hundreds of reviews.</p>
			</div>
			<div class="space-y-2">
				<p class="info-kicker">Be Empathetic, Not Generous</p>
				<p class="text-sm">Learners improve fastest from honest scores paired with a good exemplar recording. A generous 5 today robs them of progress tomorrow.</p>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>Scoring Dimensions</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="space-y-2">
				<p class="info-kicker">Sound Accuracy</p>
				<p class="text-sm">Are the individual sounds (clicks, vowels, consonants) correctly produced? Ignore rhythm and word choice — focus only on the raw phonetics.</p>
			</div>
			<div class="space-y-2">
				<p class="info-kicker">Rhythm & Intonation</p>
				<p class="text-sm">Does the phrase flow naturally? Stress, pauses, and pitch patterns matter here. A learner might pronounce every sound right but still sound robotic.</p>
			</div>
			<div class="space-y-2">
				<p class="info-kicker">Phrase Accuracy</p>
				<p class="text-sm">Did the learner say the right words in the right order? Dropped or substituted words lower this score even if individual sounds are perfect.</p>
			</div>
			<div class="space-y-2">
				<p class="info-kicker">AI Analysis</p>
				<p class="text-sm">Our AI provides a transcript and feedback for every recording. Mark whether the AI's analysis is correct or incorrect — this helps us improve the system.</p>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>The Exemplar Recording</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-sm">After scoring, record yourself saying the phrase correctly. This exemplar is sent back to the learner alongside your scores so they can hear what they're aiming for.</p>
		</Card.Content>
	</Card.Root>
</div>

<!-- Verification FAB -->
{#if $isAuthenticated && canReview}
	<button
		class="practice-fab"
		aria-label="Start verification"
		onclick={autoAssign}
		disabled={pendingCount === 0 || claiming}
		class:practice-fab--disabled={pendingCount === 0}
	>
		<span class="practice-fab__minutes">{pendingCount}</span>
		<span class="practice-fab__label">{pendingCount === 1 ? 'item' : 'items'}</span>
	</button>
{/if}
