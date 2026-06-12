<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { Button } from '@babylon/ui/button';
	import { AudioRecorder, AttemptPlayer } from '@babylon/ui/audio';
	import { submitAttempt } from '$lib/practice/submitAttempt';
	import { fly } from 'svelte/transition';
	import * as m from '$lib/paraglide/messages.js';

	type Morpheme = { morpheme: string; gloss: string; role: string };
	type CoursePrompt = {
		_id: Id<'coursePrompts'>;
		english: string;
		translation: string;
		phonetic: string | null;
		morphemeBreakdown: Morpheme[];
		hasExemplar: boolean;
	};

	let {
		prompt,
		practiceSessionId,
		onComplete,
		onTrackSubmission
	}: {
		prompt: CoursePrompt;
		practiceSessionId?: Id<'practiceSessions'>;
		onComplete: () => void;
		onTrackSubmission?: (submission: Promise<unknown>) => void;
	} = $props();

	const client = useConvexClient();
	const recorder = new AudioRecorder();
	const chunkRecorder = new AudioRecorder();
	onDestroy(() => {
		recorder.destroy();
		chunkRecorder.destroy();
	});

	let stage = $state<'construct' | 'reveal' | 'decompose'>('construct');
	let submitting = $state(false);
	let submitError = $state('');
	let phraseId = $state<Id<'phrases'> | null>(null);
	let attemptId = $state<Id<'attempts'> | null>(null);
	let focusMorpheme = $state<string | null>(null);

	const exemplar = useQuery(api.courses.getPromptExemplarUrl, () =>
		prompt.hasExemplar ? { coursePromptId: prompt._id } : 'skip'
	);

	// Reactive AI feedback on the materialized phrase: the chip below the reveal
	// updates the moment the pipeline lands.
	const attempts = useQuery(api.attempts.listByPhrase, () =>
		phraseId ? { phraseId } : 'skip'
	);
	const currentAttempt = $derived(
		attemptId ? (attempts.data?.find((a) => a._id === attemptId) ?? null) : null
	);
	const aiReady = $derived(currentAttempt?.status === 'feedback_ready');
	const aiFailed = $derived(currentAttempt?.status === 'failed');
	const constructionErrors = $derived(
		(currentAttempt?.constructionErrors ?? []) as Array<{ morpheme: string; issue: string }>
	);
	const needsDecomposition = $derived(
		aiReady &&
			((currentAttempt?.aiPhraseAccuracy != null && currentAttempt.aiPhraseAccuracy <= 2) ||
				constructionErrors.length > 0)
	);
	const failingMorphemes = $derived(new Set(constructionErrors.map((e) => e.morpheme)));

	const recorderErrorMessage = $derived.by(() => {
		const code = recorder.errorCode ?? chunkRecorder.errorCode;
		switch (code) {
			case 'unsupported':
				return m.practice_browser_unsupported();
			case 'permission_denied':
				return m.practice_mic_permission_denied();
			case 'no_microphone':
				return m.practice_mic_not_found();
			case 'failed':
				return m.practice_record_failed();
			default:
				return '';
		}
	});
	const errorMessage = $derived(submitError || recorderErrorMessage);

	async function handleSubmit() {
		const blob = recorder.blob;
		if (!blob) return;
		submitting = true;
		submitError = '';

		try {
			const materializedId = await client.mutation(api.courses.materializePromptPhrase, {
				coursePromptId: prompt._id
			});
			phraseId = materializedId;

			const result = await submitAttempt({
				client,
				phraseId: materializedId,
				practiceSessionId,
				english: prompt.english,
				translation: prompt.translation,
				blob,
				durationMs: recorder.durationMs
			});
			attemptId = result.attemptId;
			onTrackSubmission?.(result.aiProcessing);
			stage = 'reveal';
		} catch (err) {
			submitError = err instanceof Error ? err.message : m.practice_submit_failed();
		} finally {
			submitting = false;
		}
	}

	function startDecomposition() {
		focusMorpheme = constructionErrors[0]?.morpheme ?? null;
		chunkRecorder.discard();
		stage = 'decompose';
	}

	function retryFullPhrase() {
		recorder.discard();
		chunkRecorder.discard();
		attemptId = null;
		submitError = '';
		stage = 'construct';
	}
</script>

<div class="page-stack">
	{#if stage === 'construct'}
		<div in:fly={{ x: 120, duration: 280 }}>
			<p class="info-kicker">{m.course_construct_kicker()}</p>
			<p class="target-phrase font-black text-center my-8">{prompt.english}</p>
			<p class="meta-text text-center">{m.course_construct_hint()}</p>
		</div>

		{#if errorMessage}
			<p class="text-destructive text-sm">{errorMessage}</p>
		{/if}

		{#if recorder.url}
			<AttemptPlayer
				src={recorder.url}
				playingLabel={m.state_playing()}
				fallbackDurationMs={recorder.durationMs}
			/>
			<div class="flex gap-2">
				<Button onclick={handleSubmit} class="flex-1" size="lg" disabled={submitting}>
					{submitting ? m.practice_uploading() : m.btn_submit()}
				</Button>
				<Button onclick={() => recorder.discard()} variant="outline" size="lg">
					{m.btn_discard()}
				</Button>
			</div>
		{:else if recorder.recording}
			<Button onclick={() => recorder.stop()} size="lg" class="practice-record-btn w-full">
				{m.practice_stop_recording()}
			</Button>
		{:else}
			<Button onclick={() => recorder.start()} size="lg" class="practice-record-btn w-full">
				{m.practice_start_recording()}
			</Button>
		{/if}
	{:else if stage === 'reveal'}
		<div in:fly={{ x: 120, duration: 280 }} class="page-stack">
			<div>
				<p class="info-kicker">{m.course_reveal_kicker()}</p>
				<p class="target-phrase font-black text-center mt-6">{prompt.translation}</p>
				{#if prompt.phonetic}
					<p class="meta-text text-center mt-2">{prompt.phonetic}</p>
				{/if}
				<p class="meta-text text-center mt-1">{prompt.english}</p>
			</div>

			{#if exemplar.data}
				<div>
					<p class="info-kicker mb-1">{m.course_exemplar_label()}</p>
					<AttemptPlayer
						src={exemplar.data}
						variant="verifier"
						playingLabel={m.state_playing()}
						label={m.course_play_exemplar()}
					/>
				</div>
			{/if}

			{#if recorder.url}
				<div>
					<p class="info-kicker mb-1">{m.practice_your_recording()}</p>
					<AttemptPlayer
						src={recorder.url}
						playingLabel={m.state_playing()}
						label={m.course_play_your_recording()}
						fallbackDurationMs={recorder.durationMs}
					/>
				</div>
			{/if}

			<!-- AI construction check chip -->
			{#if aiFailed}
				<p class="text-destructive text-sm">{m.state_failed()}</p>
			{:else if aiReady && currentAttempt}
				<div class="flex items-center gap-3 flex-wrap">
					{#if currentAttempt.aiSoundAccuracy != null}
						<div class="practice-review-trigger__scores" role="status">
							<span class="practice-review-score">{m.practice_score_sound()} {currentAttempt.aiSoundAccuracy}</span>
							<span class="practice-review-score">{m.practice_score_rhythm()} {currentAttempt.aiRhythmIntonation}</span>
							<span class="practice-review-score">{m.practice_score_phrase()} {currentAttempt.aiPhraseAccuracy}</span>
						</div>
					{/if}
					{#if needsDecomposition}
						<span class="meta-text">{m.course_lets_break_down()}</span>
					{/if}
				</div>
				{#if currentAttempt.feedbackText}
					<p class="text-sm">{currentAttempt.feedbackText}</p>
				{/if}
			{:else if attemptId}
				<p class="meta-text" role="status" aria-live="polite">{m.course_ai_checking()}</p>
			{/if}

			<div class="flex gap-2">
				{#if needsDecomposition}
					<Button onclick={startDecomposition} class="flex-1" size="lg">
						{m.course_break_it_down()}
					</Button>
					<Button onclick={onComplete} variant="outline" size="lg">{m.course_next()}</Button>
				{:else}
					<Button onclick={onComplete} class="flex-1" size="lg">{m.course_next()}</Button>
				{/if}
			</div>
		</div>
	{:else}
		<!-- Decomposition: isolate the failing piece, practice it, rebuild. -->
		<div in:fly={{ x: 120, duration: 280 }} class="page-stack">
			<div>
				<p class="info-kicker">{m.course_decompose_kicker()}</p>
				<p class="meta-text mt-1">{m.course_decompose_hint()}</p>
			</div>

			<div class="flex flex-wrap gap-2">
				{#each prompt.morphemeBreakdown as piece (piece.morpheme)}
					<button
						class="border px-3 py-2 text-left transition-colors {failingMorphemes.has(piece.morpheme)
							? 'border-destructive bg-destructive/10'
							: 'border-border/60 bg-background/70'} {focusMorpheme === piece.morpheme
							? 'ring-2 ring-primary'
							: ''}"
						onclick={() => (focusMorpheme = piece.morpheme)}
					>
						<span class="target-phrase text-lg font-bold">{piece.morpheme}</span>
						<span class="meta-text block">{piece.gloss}</span>
					</button>
				{/each}
			</div>

			{#each constructionErrors as error (error.morpheme)}
				<p class="text-sm">
					<span class="target-phrase font-bold">{error.morpheme}</span>
					<span class="meta-text"> — {error.issue}</span>
				</p>
			{/each}

			{#if focusMorpheme}
				<div class="border border-border/60 bg-background/70 p-4 page-stack">
					<p class="info-kicker">{m.course_practice_piece({ piece: focusMorpheme })}</p>
					{#if chunkRecorder.url}
						<AttemptPlayer
							src={chunkRecorder.url}
							playingLabel={m.state_playing()}
							fallbackDurationMs={chunkRecorder.durationMs}
						/>
						<Button onclick={() => chunkRecorder.discard()} variant="outline" size="lg">
							{m.btn_discard()}
						</Button>
					{:else if chunkRecorder.recording}
						<Button onclick={() => chunkRecorder.stop()} size="lg" class="practice-record-btn w-full">
							{m.practice_stop_recording()}
						</Button>
					{:else}
						<Button onclick={() => chunkRecorder.start()} size="lg" class="practice-record-btn w-full">
							{m.practice_start_recording()}
						</Button>
					{/if}
				</div>
			{/if}

			<Button onclick={retryFullPhrase} class="w-full" size="lg">
				{m.course_try_full_phrase()}
			</Button>
		</div>
	{/if}
</div>
