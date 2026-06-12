<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import * as Card from '@babylon/ui/card';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import PracticeHome from '$lib/practice/PracticeHome.svelte';
	import PracticeSession from '$lib/practice/PracticeSession.svelte';
	import SessionReview from '$lib/practice/SessionReview.svelte';
	import * as m from '$lib/paraglide/messages.js';

	const client = useConvexClient();
	const allPhrases = useQuery(api.phrases.listAllByUser, {});
	const practiceSessions = useQuery(api.practiceSessions.list, {});
	const streak = useQuery(api.practiceSessions.getStreak, {});

	const activePracticeSessionId = $derived(
		(page.url.searchParams.get('run') as Id<'practiceSessions'> | null) ?? null
	);
	const activePracticeSession = useQuery(
		api.practiceSessions.get,
		() => (activePracticeSessionId ? { practiceSessionId: activePracticeSessionId } : 'skip')
	);
	const sessionAttempts = useQuery(
		api.attempts.listByPracticeSessionAsc,
		() => (activePracticeSessionId ? { practiceSessionId: activePracticeSessionId } : 'skip')
	);

	// Backup to the server-side guard in hooks.server.ts (e.g. expired session).
	$effect(() => {
		if (!$isLoading && !$isAuthenticated) {
			goto(resolve('/login'));
		}
	});

	let sessionDone = $state(false);
	let pendingSubmissions = $state(0);
	let starting = $state(false);
	let ending = $state(false);

	// Leaving the active session (URL change) always exits the review state.
	$effect(() => {
		if (!activePracticeSessionId) {
			sessionDone = false;
		}
	});

	function trackSubmission(submission: Promise<unknown>) {
		pendingSubmissions++;
		submission.finally(() => {
			pendingSubmissions--;
		});
	}

	async function startPracticeSession() {
		starting = true;
		try {
			const practiceSessionId = await client.mutation(api.practiceSessions.start, {});
			sessionDone = false;
			const practiceUrl = new URL(resolve('/'), window.location.origin);
			practiceUrl.searchParams.set('run', practiceSessionId);
			await goto(`${practiceUrl.pathname}${practiceUrl.search}`);
		} finally {
			starting = false;
		}
	}

	async function endPracticeSession() {
		if (!activePracticeSessionId) return;
		ending = true;
		try {
			await client.mutation(api.practiceSessions.end, {
				practiceSessionId: activePracticeSessionId
			});
			await goto(resolve('/'));
		} finally {
			ending = false;
		}
	}
</script>

{#if !activePracticeSessionId}
	<PracticeHome
		phraseCount={allPhrases.data?.length ?? 0}
		streak={streak.data?.streak ?? null}
		sessions={practiceSessions.data ?? []}
		sessionsLoading={practiceSessions.isLoading}
		{starting}
		onStart={startPracticeSession}
	/>
{:else if allPhrases.isLoading || activePracticeSession.isLoading}
	<div class="page-shell page-shell--compact flex min-h-[80vh] items-center justify-center">
		<p class="meta-text">{m.practice_loading_session()}</p>
	</div>
{:else if !allPhrases.data || allPhrases.data.length === 0}
	<div class="page-shell page-shell--compact flex min-h-[80vh] items-center justify-center">
		<Card.Root class="w-full border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header class="text-center">
				<Card.Title class="text-2xl">{m.practice_no_phrases_title()}</Card.Title>
				<Card.Description>{m.practice_no_phrases_body()}</Card.Description>
			</Card.Header>
			<Card.Footer class="justify-center">
				<a href={resolve('/library')} class="meta-text underline">
					{m.practice_back_library()}
				</a>
			</Card.Footer>
		</Card.Root>
	</div>
{:else if sessionDone}
	<SessionReview
		attempts={sessionAttempts.data?.attempts ?? null}
		attemptsLoading={sessionAttempts.isLoading}
		{pendingSubmissions}
		{ending}
		onNewSession={startPracticeSession}
		onFinish={endPracticeSession}
	/>
{:else}
	<PracticeSession
		phrases={allPhrases.data}
		practiceSessionId={activePracticeSessionId}
		startedAt={activePracticeSession.data?.startedAt ?? Date.now()}
		onDone={() => (sessionDone = true)}
		onTrackSubmission={trackSubmission}
		onEnd={endPracticeSession}
		{ending}
	/>
{/if}
