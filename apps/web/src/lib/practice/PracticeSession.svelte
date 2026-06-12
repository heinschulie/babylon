<script lang="ts">
	import { onDestroy } from 'svelte';
	import { useConvexClient } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { Button } from '@babylon/ui/button';
	import { AudioRecorder, AttemptPlayer } from '@babylon/ui/audio';
	import { submitAttempt } from '$lib/practice/submitAttempt';
	import { fly } from 'svelte/transition';
	import * as m from '$lib/paraglide/messages.js';

	type Phrase = {
		_id: Id<'phrases'>;
		english: string;
		translation: string;
	};

	let {
		phrases,
		practiceSessionId,
		startedAt,
		onDone,
		onTrackSubmission,
		onEnd,
		ending
	}: {
		phrases: Phrase[];
		practiceSessionId: Id<'practiceSessions'>;
		startedAt: number;
		onDone: () => void;
		/** Parent counts in-flight AI submissions across the session/review transition. */
		onTrackSubmission: (submission: Promise<unknown>) => void;
		onEnd: () => void;
		ending: boolean;
	} = $props();

	const client = useConvexClient();
	const recorder = new AudioRecorder();
	onDestroy(() => recorder.destroy());

	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	// Queue state lives for exactly as long as this component is mounted,
	// i.e. one active practice run. The phrase list is intentionally snapshotted
	// at session start so live query updates can't reshuffle a run in progress.
	// svelte-ignore state_referenced_locally
	let queue = $state<Phrase[]>(shuffle(phrases));
	let currentIndex = $state(0);
	const queueModes = ['once', 'shuffle', 'repeat'] as const;
	type QueueMode = (typeof queueModes)[number];
	let queueMode = $state<QueueMode>('once');
	let processing = $state(false);
	let submitError = $state('');

	const currentPhrase = $derived(queue.length > 0 ? queue[currentIndex] : null);

	const recorderErrorMessage = $derived.by(() => {
		switch (recorder.errorCode) {
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

	function cycleQueueMode() {
		const nextIndex = (queueModes.indexOf(queueMode) + 1) % queueModes.length;
		queueMode = queueModes[nextIndex];
		if (queueMode === 'shuffle') {
			queue = shuffle(queue);
		}
	}

	function advanceToNext() {
		const nextIndex = currentIndex + 1;

		if (nextIndex >= queue.length) {
			if (queueMode === 'once') {
				recorder.discard();
				onDone();
				return;
			}
			if (queueMode === 'shuffle') {
				queue = shuffle(queue);
			}
			currentIndex = 0;
		} else {
			currentIndex = nextIndex;
		}

		submitError = '';
		recorder.discard();
	}

	async function handleSubmit() {
		const blob = recorder.blob;
		const phrase = currentPhrase;
		if (!blob || !phrase) return;

		processing = true;
		submitError = '';

		try {
			const { aiProcessing } = await submitAttempt({
				client,
				phraseId: phrase._id,
				practiceSessionId,
				english: phrase.english,
				translation: phrase.translation,
				blob,
				durationMs: recorder.durationMs
			});
			onTrackSubmission(aiProcessing);
			advanceToNext();
		} catch (err) {
			submitError = err instanceof Error ? err.message : m.practice_submit_failed();
		} finally {
			processing = false;
		}
	}

	const errorMessage = $derived(submitError || recorderErrorMessage);
</script>

<div class="practice-session">
	<!-- Top: session info + mode toggle -->
	<div class="practice-session__header">
		<div class="practice-session__header-info">
			<p class="info-kicker">
				{m.practice_phrase_of({ position: currentPhrase ? currentIndex + 1 : 0, length: queue.length })}
			</p>
			<p class="meta-text">
				{m.practice_session_started({ time: new Date(startedAt).toLocaleTimeString() })}
			</p>
		</div>
		<div class="practice-session__header-mode">
			<button
				class="practice-mode-btn active"
				onclick={cycleQueueMode}
				aria-label={m.practice_queue_mode({ mode: queueMode })}
			>
				{#if queueMode === 'once'}
					1x
				{:else if queueMode === 'shuffle'}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.7l-.327-.517"/></svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
				{/if}
			</button>
		</div>
	</div>

	<!-- Center: phrase area -->
	{#if currentPhrase}
		<div class="practice-session__phrase">
			{#key currentIndex}
				<div
					class="phrase-card text-center"
					in:fly={{ x: 200, duration: 320 }}
					out:fly={{ x: -200, duration: 320 }}
				>
					<p class="target-phrase font-black">{currentPhrase.english}</p>
				</div>
			{/key}
		</div>
	{/if}

	<!-- Bottom: controls -->
	<div class="practice-session__controls">
		{#if errorMessage}
			<p class="text-destructive text-sm" role="alert">{errorMessage}</p>
		{/if}

		{#if recorder.url}
			<AttemptPlayer
				src={recorder.url}
				playingLabel={m.state_playing()}
				label={m.course_play_your_recording()}
				fallbackDurationMs={recorder.durationMs}
			/>
		{:else if recorder.recording}
			<Button onclick={() => recorder.stop()} size="lg" class="practice-record-btn w-full">
				{m.practice_stop_recording()}
			</Button>
		{:else}
			<Button onclick={() => recorder.start()} size="lg" class="practice-record-btn w-full">
				{m.practice_start_recording()}
			</Button>
		{/if}

		<div class="flex gap-2">
			<Button
				onclick={handleSubmit}
				class="flex-1"
				size="lg"
				disabled={!recorder.hasRecording || processing}
			>
				{processing ? m.practice_uploading() : m.btn_submit()}
			</Button>
			{#if recorder.url}
				<Button onclick={() => recorder.discard()} variant="outline" size="lg">{m.btn_discard()}</Button>
			{:else}
				<Button onclick={advanceToNext} variant="outline" size="lg">{m.btn_skip()}</Button>
			{/if}
		</div>

		<button class="meta-text underline text-center" onclick={onEnd}>
			{ending ? m.practice_ending() : m.practice_end_session()}
		</button>
	</div>
</div>
