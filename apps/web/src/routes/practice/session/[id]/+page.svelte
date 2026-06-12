<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { Button } from '@babylon/ui/button';
	import AttemptReviewList from '$lib/components/AttemptReviewList.svelte';
	import * as m from '$lib/paraglide/messages.js';

	const client = useConvexClient();
	const practiceSessionId = $derived(page.params.id as Id<'practiceSessions'>);
	const sessionData = useQuery(api.attempts.listByPracticeSessionAsc, () => ({
		practiceSessionId
	}));

	let markedSeen = $state(false);

	$effect(() => {
		if (sessionData.data && !markedSeen) {
			const hasReview = sessionData.data.attempts.some((a) => a.humanReview?.initialReview);
			if (hasReview) {
				markedSeen = true;
				client.mutation(api.humanReviews.markFeedbackSeen, {
					practiceSessionId
				}).catch((err) => {
					console.error('Failed to mark feedback seen:', err);
					markedSeen = false;
				});
			}
		}
	});

	$effect(() => {
		if (page.url.hash === '#feedback') {
			requestAnimationFrame(() => {
				document.getElementById('feedback')?.scrollIntoView({ behavior: 'smooth' });
			});
		}
	});
</script>

<div class="page-shell page-shell--narrow page-stack">
	<div class="page-stack">
		<a href={resolve('/')} class="meta-text underline">&larr; {m.session_back()}</a>
		<h1 class="text-5xl sm:text-6xl">{m.session_review()}</h1>
		{#if sessionData.data}
			<p class="meta-text">
				{new Date(sessionData.data.practiceSession.startedAt).toLocaleString()}
				&middot; {m.session_attempt_count({ count: sessionData.data.attempts.length })}
			</p>
		{/if}
	</div>

	{#if sessionData.isLoading}
		<p class="meta-text">{m.session_loading()}</p>
	{:else if sessionData.error}
		<p class="text-destructive">{sessionData.error.message}</p>
	{:else if !sessionData.data}
		<p class="meta-text">{m.session_not_found()}</p>
	{:else}
		<AttemptReviewList attempts={sessionData.data.attempts} anchorFeedback />

		<Button onclick={() => history.back()} variant="outline" size="lg" class="w-full">
			{m.session_back_btn()}
		</Button>
	{/if}
</div>
