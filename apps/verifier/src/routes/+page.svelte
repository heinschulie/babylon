<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import * as Card from '@babylon/ui/card';
	import * as m from '$lib/paraglide/messages.js';

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
			<p class="info-kicker">{m.verifier_guide_kicker()}</p>
			<h1 class="text-5xl sm:text-6xl">{m.verifier_guide_title()}</h1>
			<p class="meta-text mt-3 max-w-2xl">
				{m.verifier_guide_desc()}
			</p>
		</div>
	</header>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>{m.verifier_approach_title()}</Card.Title>
			<Card.Description>{m.verifier_approach_desc()}</Card.Description>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="space-y-2">
				<p class="info-kicker">{m.verifier_listen_title()}</p>
				<p class="text-sm">{m.verifier_listen_desc()}</p>
			</div>
			<div class="space-y-2">
				<p class="info-kicker">{m.verifier_consistent_title()}</p>
				<p class="text-sm">{m.verifier_consistent_desc()}</p>
			</div>
			<div class="space-y-2">
				<p class="info-kicker">{m.verifier_empathetic_title()}</p>
				<p class="text-sm">{m.verifier_empathetic_desc()}</p>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>{m.verifier_scoring_title()}</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-4">
			<div class="space-y-2">
				<p class="info-kicker">{m.verifier_sound_title()}</p>
				<p class="text-sm">{m.verifier_sound_desc()}</p>
			</div>
			<div class="space-y-2">
				<p class="info-kicker">{m.verifier_rhythm_title()}</p>
				<p class="text-sm">{m.verifier_rhythm_desc()}</p>
			</div>
			<div class="space-y-2">
				<p class="info-kicker">{m.verifier_phrase_title()}</p>
				<p class="text-sm">{m.verifier_phrase_desc()}</p>
			</div>
			<div class="space-y-2">
				<p class="info-kicker">{m.verifier_ai_title()}</p>
				<p class="text-sm">{m.verifier_ai_desc()}</p>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>{m.verifier_exemplar_title()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<p class="text-sm">{m.verifier_exemplar_desc()}</p>
		</Card.Content>
	</Card.Root>
</div>

<!-- Verification FAB -->
{#if $isAuthenticated && canReview}
	<button
		class="practice-fab"
		aria-label={m.verifier_fab_label()}
		onclick={autoAssign}
		disabled={pendingCount === 0 || claiming}
		class:practice-fab--disabled={pendingCount === 0}
	>
		<span class="practice-fab__minutes">{pendingCount}</span>
		<span class="practice-fab__label">{pendingCount === 1 ? m.verifier_fab_item() : m.verifier_fab_items()}</span>
	</button>
{/if}
