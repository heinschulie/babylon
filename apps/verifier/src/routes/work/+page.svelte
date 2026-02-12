<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import * as Card from '@babylon/ui/card';

	const client = useConvexClient();
	const verifierState = useQuery(api.verifierAccess.getMyVerifierState, {});
	const pendingItems = useQuery(api.humanReviews.listPendingForLanguage, () => ({
		languageCode: 'xh-ZA'
	}));
	const currentClaim = useQuery(api.humanReviews.getCurrentClaim, () => ({
		languageCode: 'xh-ZA'
	}));
	const queueSignal = useQuery(api.humanReviews.getQueueSignal, () => ({
		languageCode: 'xh-ZA'
	}));

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});

	// If verifier already holds a claim, redirect to that session
	$effect(() => {
		if (currentClaim.data) {
			goto(resolve(`/work/${currentClaim.data.requestId}`));
		}
	});

	const canReview = $derived(
		!!verifierState.data?.languages.find(
			(l) => l.languageCode === 'xh-ZA' && l.active
		)
	);

	let claiming = $state<string | null>(null);

	async function claimItem(requestId: string) {
		claiming = requestId;
		try {
			const assignment = await client.mutation(api.humanReviews.claimNext, {
				languageCode: 'xh-ZA'
			});
			if (assignment) {
				goto(resolve(`/work/${assignment.requestId}`));
			}
		} finally {
			claiming = null;
		}
	}

	function relativeTime(timestamp: number): string {
		const diff = Date.now() - timestamp;
		const minutes = Math.floor(diff / 60000);
		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		const hours = Math.floor(diff / 3600000);
		if (hours < 24) return `${hours}h ago`;
		return `${Math.floor(diff / 86400000)}d ago`;
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header class="page-stack">
		<div>
			<p class="info-kicker">First Come, First Serve</p>
			<h1 class="text-5xl sm:text-6xl">Available Work</h1>
			<p class="meta-text mt-3">
				Pick a learner attempt from the queue. Once you claim it, you have 5 minutes to complete your review.
			</p>
		</div>
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Content>
				<div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
					<div class="space-y-2">
						<p class="info-kicker">Queue Status</p>
						<p class="text-xl font-semibold">
							{queueSignal.data?.pendingCount ?? 0} pending review{(queueSignal.data?.pendingCount ?? 0) === 1 ? '' : 's'}
						</p>
						<p class="meta-text">Claim any item below to begin.</p>
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	</header>

	{#if !canReview}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>Not Activated</Card.Title>
				<Card.Description>Go to Settings to activate your verifier profile for this language.</Card.Description>
			</Card.Header>
			<Card.Footer>
				<a href={resolve('/settings')} class="meta-text underline">Go to Settings</a>
			</Card.Footer>
		</Card.Root>
	{:else if pendingItems.isLoading}
		<p class="meta-text">Loading queue...</p>
	{:else if !pendingItems.data || pendingItems.data.length === 0}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>Queue Empty</Card.Title>
				<Card.Description>No learner attempts need review right now. Check back soon.</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>Pending Reviews</Card.Title>
				<Card.Description>Tap an item to claim and begin reviewing.</Card.Description>
			</Card.Header>
			<Card.Content>
				<ul class="space-y-3">
					{#each pendingItems.data as item (item.requestId)}
						<li>
							<button
								class="flex w-full items-center justify-between border border-border/60 bg-background/70 p-4 text-left transition-colors hover:bg-background/90"
								onclick={() => claimItem(item.requestId)}
								disabled={!!claiming}
							>
								<div>
									<p class="font-semibold">{item.phrase?.english ?? 'Unknown phrase'}</p>
									<p class="meta-text text-primary">{item.phrase?.translation ?? ''}</p>
								</div>
								<div class="flex items-center gap-3">
									{#if item.phase === 'dispute'}
										<span class="info-kicker text-orange-600">Dispute</span>
									{/if}
									<span class="meta-text">{relativeTime(item.createdAt)}</span>
								</div>
							</button>
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
