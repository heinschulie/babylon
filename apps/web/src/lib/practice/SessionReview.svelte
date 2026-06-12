<script lang="ts">
	import { Button } from '@babylon/ui/button';
	import AttemptReviewList from '$lib/components/AttemptReviewList.svelte';
	import * as m from '$lib/paraglide/messages.js';
	import type { ComponentProps } from 'svelte';

	type Attempt = ComponentProps<typeof AttemptReviewList>['attempts'][number];

	let {
		attempts,
		attemptsLoading,
		pendingSubmissions,
		ending,
		onNewSession,
		onFinish
	}: {
		attempts: Attempt[] | null;
		attemptsLoading: boolean;
		pendingSubmissions: number;
		ending: boolean;
		onNewSession: () => void;
		onFinish: () => void;
	} = $props();
</script>

<div class="page-shell page-shell--narrow page-stack">
	<div class="page-stack">
		<h1 class="text-5xl sm:text-6xl">{m.practice_review_title()}</h1>
		<p class="meta-text">
			{#if pendingSubmissions > 0}
				{m.practice_processing_count({ count: pendingSubmissions })}
			{:else}
				{m.practice_all_received()}
			{/if}
		</p>
	</div>

	{#if attemptsLoading}
		<p class="meta-text">{m.practice_loading_results()}</p>
	{:else if attempts}
		<AttemptReviewList {attempts} />

		<div class="grid grid-cols-2 gap-2">
			<Button onclick={onNewSession} size="lg">
				{m.practice_new_session()}
			</Button>
			<Button onclick={onFinish} variant="outline" size="lg" disabled={ending}>
				{ending ? m.practice_ending() : m.practice_finish()}
			</Button>
		</div>
	{/if}
</div>
