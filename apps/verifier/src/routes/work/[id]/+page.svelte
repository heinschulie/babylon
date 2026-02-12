<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import { Button } from '@babylon/ui/button';
	import * as m from '$lib/paraglide/messages.js';

	const client = useConvexClient();
	const requestId = $derived(page.params.id as Id<'humanReviewRequests'>);

	const currentClaim = useQuery(api.humanReviews.getCurrentClaim, () => ({
		languageCode: 'xh-ZA'
	}));

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});

	// If no active claim or claim doesn't match this route, redirect back
	$effect(() => {
		if (currentClaim.data === null && !currentClaim.isLoading) {
			goto(resolve('/work'));
		}
	});

	const claim = $derived(currentClaim.data);

	let claimTick = $state(Date.now());
	$effect(() => {
		const interval = setInterval(() => { claimTick = Date.now(); }, 1000);
		return () => clearInterval(interval);
	});

	const remainingMs = $derived(
		claim?.claimDeadlineAt ? Math.max(claim.claimDeadlineAt - claimTick, 0) : 0
	);

	function formatTimer(ms: number) {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
	}

	// Scores
	let scores = $state({
		soundAccuracy: 3,
		rhythmIntonation: 3,
		phraseAccuracy: 3
	});
	let aiAnalysisCorrect = $state<boolean | null>(null);

	// Recording
	let recorder: MediaRecorder | null = $state(null);
	let recording = $state(false);
	let audioChunks: Blob[] = $state([]);
	let exemplarAudioBlob: Blob | null = $state(null);
	let exemplarAudioUrl: string | null = $state(null);
	let exemplarDurationMs = $state(0);
	let recorderError = $state('');
	let submitting = $state(false);
	let releasing = $state(false);
	let error = $state<string | null>(null);

	const recorderMimeCandidates = [
		'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'
	];

	function getPreferredMime(): string {
		if (typeof MediaRecorder === 'undefined') return '';
		return recorderMimeCandidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? '';
	}

	async function startRecording() {
		recorderError = '';
		audioChunks = [];
		exemplarAudioBlob = null;
		exemplarAudioUrl = null;
		exemplarDurationMs = 0;

		if (!navigator.mediaDevices?.getUserMedia) {
			recorderError = m.claim_audio_unsupported();
			return;
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const mime = getPreferredMime();
			const mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
			recorder = mr;
			const startTime = Date.now();

			mr.ondataavailable = (e) => {
				if (e.data?.size > 0) audioChunks = [...audioChunks, e.data];
			};
			mr.onstop = () => {
				const blob = new Blob(audioChunks, { type: mr.mimeType || 'audio/webm' });
				exemplarAudioBlob = blob;
				exemplarAudioUrl = URL.createObjectURL(blob);
				exemplarDurationMs = Date.now() - startTime;
				stream.getTracks().forEach((t) => t.stop());
			};
			mr.start();
			recording = true;
		} catch (e) {
			recorderError = e instanceof Error ? e.message : m.claim_record_failed();
		}
	}

	function stopRecording() {
		if (recorder?.state === 'recording') {
			recorder.stop();
			recording = false;
		}
	}

	function discardRecording() {
		audioChunks = [];
		exemplarAudioBlob = null;
		exemplarAudioUrl = null;
		exemplarDurationMs = 0;
	}

	async function releaseClaim() {
		if (!claim) return;
		releasing = true;
		error = null;
		try {
			await client.mutation(api.humanReviews.releaseClaim, { requestId: claim.requestId });
			discardRecording();
			goto(resolve('/work'));
		} catch (e) {
			error = e instanceof Error ? e.message : m.claim_release_failed();
		} finally {
			releasing = false;
		}
	}

	async function submitReview() {
		if (!claim || !exemplarAudioBlob) return;
		submitting = true;
		error = null;

		try {
			const uploadUrl = await client.mutation(api.audioUploads.generateUploadUrlForVerifier, {});
			const res = await fetch(uploadUrl, {
				method: 'POST',
				headers: { 'Content-Type': exemplarAudioBlob.type || 'audio/webm' },
				body: exemplarAudioBlob
			});
			if (!res.ok) throw new Error(m.claim_upload_failed());
			const { storageId } = await res.json();

			const exemplarId = await client.mutation(api.audioAssets.create, {
				storageKey: storageId,
				contentType: exemplarAudioBlob.type || 'audio/webm',
				attemptId: claim.attemptId,
				durationMs: exemplarDurationMs
			});

			await client.mutation(api.humanReviews.submitReview, {
				requestId: claim.requestId,
				soundAccuracy: scores.soundAccuracy,
				rhythmIntonation: scores.rhythmIntonation,
				phraseAccuracy: scores.phraseAccuracy,
				aiAnalysisCorrect: aiAnalysisCorrect ?? undefined,
				exemplarAudioAssetId: exemplarId as Id<'audioAssets'>
			});

			discardRecording();
			// Try to claim next automatically
			const next = await client.mutation(api.humanReviews.claimNext, { languageCode: 'xh-ZA' });
			if (next) {
				goto(resolve(`/work/${next.requestId}`));
			} else {
				goto(resolve('/work'));
			}
		} catch (e) {
			error = e instanceof Error ? e.message : m.claim_submit_failed();
		} finally {
			submitting = false;
		}
	}

	const scoreLabels = [1, 2, 3, 4, 5];
</script>

{#if !claim}
	<div class="page-shell page-shell--compact flex min-h-[80vh] items-center justify-center">
		<p class="meta-text">{m.claim_loading()}</p>
	</div>
{:else}
	<div class="practice-session">
		<!-- Top: session info -->
		<div class="practice-session__header">
			<div class="practice-session__header-info">
				<p class="info-kicker">
					{claim.phase === 'dispute' ? m.claim_dispute_review() : m.claim_learner_attempt()}
				</p>
				<p class="meta-text">
					{m.claim_time_remaining({ time: formatTimer(remainingMs) })}
				</p>
			</div>
		</div>

		<!-- Center: phrase + content -->
		<div class="practice-session__phrase" style="overflow-y: auto;">
			<div class="w-full space-y-6 px-4">
				<!-- Phrase display -->
				<div class="text-center">
					<p class="info-kicker">English</p>
					<p class="mt-1 text-xl font-semibold sm:text-2xl">{claim.phrase?.english}</p>
					<p class="target-phrase mt-3 font-black">{claim.phrase?.translation}</p>
				</div>

				<!-- Learner audio -->
				{#if claim.learnerAttempt.audioUrl}
					<div class="border border-border/50 bg-muted/30 p-3">
						<p class="info-kicker mb-2">{m.claim_learner_audio()}</p>
						<audio controls src={claim.learnerAttempt.audioUrl} class="w-full"></audio>
					</div>
				{/if}

				<!-- Audio Scoring: 5 yellow square buttons per dimension -->
				<div class="space-y-4">
					<p class="info-kicker">{m.claim_scoring_title()}</p>

					<div class="space-y-3">
						<p class="text-sm font-medium">{m.claim_sound_accuracy()}</p>
						<div class="flex gap-2">
							{#each scoreLabels as n}
								<button
									class="flex h-11 w-11 items-center justify-center text-lg font-bold transition-colors"
									class:bg-yellow-400={scores.soundAccuracy !== n}
									class:text-yellow-900={scores.soundAccuracy !== n}
									class:bg-primary={scores.soundAccuracy === n}
									class:text-primary-foreground={scores.soundAccuracy === n}
									onclick={() => (scores.soundAccuracy = n)}
								>
									{n}
								</button>
							{/each}
						</div>
					</div>

					<div class="space-y-3">
						<p class="text-sm font-medium">{m.claim_rhythm_intonation()}</p>
						<div class="flex gap-2">
							{#each scoreLabels as n}
								<button
									class="flex h-11 w-11 items-center justify-center text-lg font-bold transition-colors"
									class:bg-yellow-400={scores.rhythmIntonation !== n}
									class:text-yellow-900={scores.rhythmIntonation !== n}
									class:bg-primary={scores.rhythmIntonation === n}
									class:text-primary-foreground={scores.rhythmIntonation === n}
									onclick={() => (scores.rhythmIntonation = n)}
								>
									{n}
								</button>
							{/each}
						</div>
					</div>

					<div class="space-y-3">
						<p class="text-sm font-medium">{m.claim_phrase_accuracy()}</p>
						<div class="flex gap-2">
							{#each scoreLabels as n}
								<button
									class="flex h-11 w-11 items-center justify-center text-lg font-bold transition-colors"
									class:bg-yellow-400={scores.phraseAccuracy !== n}
									class:text-yellow-900={scores.phraseAccuracy !== n}
									class:bg-primary={scores.phraseAccuracy === n}
									class:text-primary-foreground={scores.phraseAccuracy === n}
									onclick={() => (scores.phraseAccuracy = n)}
								>
									{n}
								</button>
							{/each}
						</div>
					</div>
				</div>

				<!-- AI Analysis section -->
				{#if claim.aiFeedback}
					<div class="space-y-4">
						<p class="info-kicker">{m.claim_ai_title()}</p>
						<div class="border border-border/50 bg-muted/30 p-3 space-y-2">
							{#if claim.aiFeedback.transcript}
								<div>
									<p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{m.claim_transcript()}</p>
									<p class="text-sm mt-1">{claim.aiFeedback.transcript}</p>
								</div>
							{/if}
							{#if claim.aiFeedback.feedbackText}
								<div>
									<p class="text-xs font-medium uppercase tracking-wider text-muted-foreground">{m.claim_feedback()}</p>
									<p class="text-sm mt-1">{claim.aiFeedback.feedbackText}</p>
								</div>
							{/if}
							{#if claim.aiFeedback.score != null}
								<p class="text-sm">{m.claim_ai_score({ score: claim.aiFeedback.score })}</p>
							{/if}
						</div>

						<div class="space-y-2">
							<p class="text-sm font-medium">{m.claim_ai_correct_q()}</p>
							<div class="flex gap-2">
								<button
									class="flex-1 py-2.5 text-sm font-bold transition-colors border"
									class:bg-destructive={aiAnalysisCorrect === false}
									class:text-destructive-foreground={aiAnalysisCorrect === false}
									class:border-destructive={aiAnalysisCorrect === false}
									class:bg-transparent={aiAnalysisCorrect !== false}
									class:border-border={aiAnalysisCorrect !== false}
									onclick={() => (aiAnalysisCorrect = false)}
								>
									{m.claim_ai_incorrect()}
								</button>
								<button
									class="flex-1 py-2.5 text-sm font-bold transition-colors border"
									class:bg-primary={aiAnalysisCorrect === true}
									class:text-primary-foreground={aiAnalysisCorrect === true}
									class:border-primary={aiAnalysisCorrect === true}
									class:bg-transparent={aiAnalysisCorrect !== true}
									class:border-border={aiAnalysisCorrect !== true}
									onclick={() => (aiAnalysisCorrect = true)}
								>
									{m.claim_ai_correct()}
								</button>
							</div>
						</div>
					</div>
				{/if}

				<!-- Dispute context -->
				{#if claim.phase === 'dispute' && claim.originalReview}
					<div class="border border-orange-500/50 bg-orange-500/10 p-3">
						<p class="info-kicker">{m.claim_original_review({ name: claim.originalReview.verifierFirstName })}</p>
						<p class="meta-text mt-1">
							{m.claim_original_scores({ sound: claim.originalReview.soundAccuracy, rhythm: claim.originalReview.rhythmIntonation, phrase: claim.originalReview.phraseAccuracy })}
						</p>
						<p class="meta-text mt-1">
							{m.claim_dispute_progress({ completed: claim.disputeProgress?.completed ?? 0 })}
						</p>
					</div>
				{/if}
			</div>
		</div>

		<!-- Bottom: recording + actions -->
		<div class="practice-session__controls">
			{#if recorderError}
				<p class="text-destructive text-sm">{recorderError}</p>
			{/if}
			{#if error}
				<p class="text-destructive text-sm">{error}</p>
			{/if}

			<!-- Exemplar recording -->
			<div class="space-y-2">
				<p class="info-kicker">{m.claim_record_exemplar()}</p>
				{#if exemplarAudioUrl}
					<audio controls src={exemplarAudioUrl} class="w-full"></audio>
					<Button onclick={discardRecording} variant="outline" size="sm" class="w-full">{m.claim_discard_recording()}</Button>
				{:else if recording}
					<Button onclick={stopRecording} size="lg" class="practice-record-btn w-full">
						{m.claim_stop_recording()}
					</Button>
				{:else}
					<Button onclick={startRecording} size="lg" class="practice-record-btn w-full">
						{m.claim_record_exemplar()}
					</Button>
				{/if}
			</div>

			<div class="grid grid-cols-2 gap-2">
				<Button variant="outline" onclick={releaseClaim} disabled={releasing || submitting}>
					{releasing ? m.btn_releasing() : m.btn_release()}
				</Button>
				<Button onclick={submitReview} disabled={submitting || !exemplarAudioBlob || remainingMs <= 0}>
					{submitting ? m.btn_submitting() : m.btn_submit()}
				</Button>
			</div>
		</div>
	</div>
{/if}
