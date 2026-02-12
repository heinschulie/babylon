<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { Button } from '@babylon/ui/button';
	import * as Accordion from '@babylon/ui/accordion';
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

	function formatDuration(ms: number): string {
		if (!ms || !isFinite(ms)) return '0:00';
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	// Audio state keyed by attempt ID
	let reviewPlayers = $state<Record<string, {
		el: HTMLAudioElement | null;
		playing: boolean;
		progress: number;
		duration: number;
	}>>({});
	let verifierPlayers = $state<Record<string, {
		el: HTMLAudioElement | null;
		playing: boolean;
		progress: number;
		duration: number;
	}>>({});
	let playedVerifierClips = $state<Set<string>>(new Set());

	function toggleReviewPlayback(attemptId: string) {
		const p = reviewPlayers[attemptId];
		if (!p?.el) return;
		if (p.playing) { p.el.pause(); } else { p.el.play(); }
	}

	function toggleVerifierPlayback(attemptId: string) {
		const p = verifierPlayers[attemptId];
		if (!p?.el) return;
		if (p.playing) { p.el.pause(); } else { p.el.play(); }
	}

	function onReviewTimeUpdate(attemptId: string) {
		const p = reviewPlayers[attemptId];
		if (!p?.el || !p.el.duration || !isFinite(p.el.duration)) return;
		p.progress = p.el.currentTime / p.el.duration;
		if (!p.duration) p.duration = p.el.duration * 1000;
	}

	function onVerifierTimeUpdate(attemptId: string) {
		const p = verifierPlayers[attemptId];
		if (!p?.el || !p.el.duration || !isFinite(p.el.duration)) return;
		p.progress = p.el.currentTime / p.el.duration;
		if (!p.duration) p.duration = p.el.duration * 1000;
	}

	function onReviewPlayEnded(attemptId: string) {
		const p = reviewPlayers[attemptId];
		if (p) { p.playing = false; p.progress = 0; }
	}

	function onVerifierPlayEnded(attemptId: string) {
		const p = verifierPlayers[attemptId];
		if (p) { p.playing = false; p.progress = 0; }
		playedVerifierClips.add(attemptId);
		playedVerifierClips = new Set(playedVerifierClips);
	}

	const defaultPlayer = { el: null, playing: false, progress: 0, duration: 0 } as const;

	function rp(attemptId: string) {
		return reviewPlayers[attemptId] ?? defaultPlayer;
	}

	function vp(attemptId: string) {
		return verifierPlayers[attemptId] ?? defaultPlayer;
	}

	// Pre-seed player entries when attempts data arrives
	$effect(() => {
		const attempts = sessionData.data?.attempts;
		if (!attempts) return;
		for (const a of attempts) {
			if (a.audioUrl && !reviewPlayers[a._id]) {
				reviewPlayers[a._id] = { el: null, playing: false, progress: 0, duration: 0 };
			}
			if (a.humanReview?.initialReview?.audioUrl && !verifierPlayers[a._id]) {
				verifierPlayers[a._id] = { el: null, playing: false, progress: 0, duration: 0 };
			}
		}
	});

	function registerReviewAudio(attemptId: string, el: HTMLAudioElement) {
		if (!reviewPlayers[attemptId]) {
			reviewPlayers[attemptId] = { el: null, playing: false, progress: 0, duration: 0 };
		}
		reviewPlayers[attemptId].el = el;
		if (el.duration && isFinite(el.duration)) reviewPlayers[attemptId].duration = el.duration * 1000;
	}

	function registerVerifierAudio(attemptId: string, el: HTMLAudioElement) {
		if (!verifierPlayers[attemptId]) {
			verifierPlayers[attemptId] = { el: null, playing: false, progress: 0, duration: 0 };
		}
		verifierPlayers[attemptId].el = el;
		if (el.duration && isFinite(el.duration)) verifierPlayers[attemptId].duration = el.duration * 1000;
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<div class="page-stack">
		<a href={resolve('/practice')} class="meta-text underline">&larr; {m.session_back()}</a>
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
		<Accordion.Root type="single">
			{#each sessionData.data.attempts as attempt (attempt._id)}
				{@const hasVerifier = !!attempt.humanReview?.initialReview}
				{@const showFire = hasVerifier && attempt.humanReview?.initialReview?.audioUrl && !playedVerifierClips.has(attempt._id)}
				<Accordion.Item value={attempt._id}>
					<Accordion.Trigger class="practice-review-trigger">
						{#if showFire}
							<img src="/fire.gif" alt="" class="practice-review-fire" />
						{/if}
						<div class="practice-review-trigger__content">
							<p class="practice-review-phrase">{attempt.phraseTranslation}</p>
							<p class="meta-text">{attempt.phraseEnglish}</p>
						</div>
						{#if attempt.status === 'feedback_ready' && attempt.score != null}
							<div class="practice-review-trigger__scores">
								<span class="practice-review-score">{attempt.score}/5</span>
							</div>
						{:else if attempt.status === 'processing'}
							<span class="meta-text">{m.state_processing()}</span>
						{:else if attempt.status === 'failed'}
							<span class="text-destructive text-sm">{m.state_failed()}</span>
						{/if}
						{#if hasVerifier}
							<div class="practice-review-trigger__verifier-scores">
								<span class="practice-review-vscore" title={m.practice_score_sound()}>S{attempt.humanReview.initialReview.soundAccuracy}</span>
								<span class="practice-review-vscore" title={m.practice_score_rhythm()}>R{attempt.humanReview.initialReview.rhythmIntonation}</span>
								<span class="practice-review-vscore" title={m.practice_score_phrase()}>P{attempt.humanReview.initialReview.phraseAccuracy}</span>
							</div>
						{/if}
					</Accordion.Trigger>
					<Accordion.Content>
						<div class="practice-review-detail" id={attempt.humanReview?.initialReview ? 'feedback' : undefined}>
							{#if attempt.feedbackText}
								<div class="text-sm practice-review-feedback">
									{#each attempt.feedbackText.split('\n') as line}
										{#if line.trim()}<p>{line}</p>{/if}
									{/each}
								</div>
							{/if}
							{#if attempt.audioUrl}
								<div class="practice-review-detail__players">
									<div>
										<p class="info-kicker mb-1">{m.practice_your_recording()}</p>
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<div class="practice-player" onclick={() => toggleReviewPlayback(attempt._id)}>
											<div class="practice-player__fill" style="width: {(rp(attempt._id).progress) * 100}%"></div>
											<span class="practice-player__label">
												{rp(attempt._id).playing ? m.state_playing() : formatDuration(rp(attempt._id).duration)}
											</span>
										</div>
										<audio
											src={attempt.audioUrl}
											ontimeupdate={() => onReviewTimeUpdate(attempt._id)}
											onplay={() => { rp(attempt._id).playing = true; }}
											onpause={() => { rp(attempt._id).playing = false; }}
											onended={() => onReviewPlayEnded(attempt._id)}
											oncanplay={(e) => registerReviewAudio(attempt._id, e.currentTarget as HTMLAudioElement)}
										></audio>
									</div>
									{#if attempt.humanReview?.initialReview?.audioUrl}
										<div>
											<p class="info-kicker mb-1">{m.practice_verifier_example()}</p>
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div class="practice-player practice-player--verifier" onclick={() => toggleVerifierPlayback(attempt._id)}>
												<div class="practice-player__fill" style="width: {(vp(attempt._id).progress) * 100}%"></div>
												<span class="practice-player__label">
													{vp(attempt._id).playing ? m.state_playing() : formatDuration(vp(attempt._id).duration)}
												</span>
											</div>
											<audio
												src={attempt.humanReview.initialReview.audioUrl}
												ontimeupdate={() => onVerifierTimeUpdate(attempt._id)}
												onplay={() => { vp(attempt._id).playing = true; }}
												onpause={() => { vp(attempt._id).playing = false; }}
												onended={() => onVerifierPlayEnded(attempt._id)}
												oncanplay={(e) => registerVerifierAudio(attempt._id, e.currentTarget as HTMLAudioElement)}
											></audio>
										</div>
									{/if}
								</div>
							{/if}
						</div>
					</Accordion.Content>
				</Accordion.Item>
			{/each}
		</Accordion.Root>

		<Button onclick={() => history.back()} variant="outline" size="lg" class="w-full">
			{m.session_back_btn()}
		</Button>
	{/if}
</div>
