<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useQuery } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import * as Card from '$lib/components/ui/card';

	const practiceSessionId = $derived(page.params.id as Id<'practiceSessions'>);
	const sessionData = useQuery(api.attempts.listByPracticeSession, () => ({
		practiceSessionId
	}));
</script>

<div class="page-shell page-shell--narrow page-stack">
	<div class="page-stack">
		<a href={resolve('/practice')} class="meta-text underline"
			>&larr; Back to Practice Sessions</a
		>
		<h1 class="text-5xl sm:text-6xl">Practice Session Detail</h1>
	</div>

	{#if sessionData.isLoading}
		<p class="text-muted-foreground">Loading session...</p>
	{:else if sessionData.error}
		<p class="text-destructive">{sessionData.error.message}</p>
	{:else if !sessionData.data}
		<p class="text-muted-foreground">Session not found.</p>
	{:else}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Content>
				<p class="text-sm">
					Started: {new Date(sessionData.data.practiceSession.startedAt).toLocaleString()}
				</p>
				<p class="meta-text">
					Ended:
					{sessionData.data.practiceSession.endedAt
						? new Date(sessionData.data.practiceSession.endedAt).toLocaleString()
						: 'Still active'}
				</p>
				<p class="meta-text">
					Total attempts: {sessionData.data.attempts.length}
				</p>
			</Card.Content>
		</Card.Root>

		<ul class="space-y-3">
			{#each sessionData.data.attempts as attempt}
				<li class="border border-border/60 bg-background/70 p-4">
					<p class="meta-text">{new Date(attempt.createdAt).toLocaleString()}</p>
					<p class="mt-1 font-semibold">{attempt.phraseEnglish}</p>
					<p class="meta-text text-primary">{attempt.phraseTranslation}</p>

					{#if attempt.audioUrl}
						<div class="mt-2">
							<p class="info-kicker mb-1">Learner Audio</p>
							<audio controls src={attempt.audioUrl} class="audio-playback w-full"></audio>
						</div>
					{/if}

					{#if attempt.feedbackText}
						<p class="meta-text mt-2">{attempt.feedbackText}</p>
					{/if}

					{#if attempt.humanReview?.initialReview}
						<div class="mt-3 border border-border/50 bg-muted/40 p-3 text-sm">
							<p class="font-semibold">
								Verifier: {attempt.humanReview.initialReview.verifierFirstName}
							</p>
							<p class="meta-text mt-1">
								Sound {attempt.humanReview.initialReview.soundAccuracy}/5 • Rhythm
								{attempt.humanReview.initialReview.rhythmIntonation}/5 • Phrase
								{attempt.humanReview.initialReview.phraseAccuracy}/5
							</p>
							{#if attempt.humanReview.initialReview.audioUrl}
								<div class="mt-2">
									<p class="info-kicker mb-1">Verifier Example</p>
									<audio
										controls
										src={attempt.humanReview.initialReview.audioUrl}
										class="audio-playback w-full"
									></audio>
								</div>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
