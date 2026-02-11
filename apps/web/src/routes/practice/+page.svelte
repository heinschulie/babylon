<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { Button } from '$lib/components/ui/button';
	import * as Accordion from '$lib/components/ui/accordion';
	import * as Card from '$lib/components/ui/card';
	import { isAuthenticated, isLoading } from '$lib/stores/auth';
	import { fly } from 'svelte/transition';

	function relativeTime(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes} Minute${minutes === 1 ? '' : 's'} Ago`;

		const date = new Date(timestamp);
		const today = new Date();
		const yesterday = new Date(today);
		yesterday.setDate(yesterday.getDate() - 1);

		if (date.toDateString() === today.toDateString()) return 'Earlier Today';
		if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
		if (days < 7) return `${days} Days Ago`;
		if (days < 30) return `${Math.floor(days / 7)} Week${Math.floor(days / 7) === 1 ? '' : 's'} Ago`;
		return date.toLocaleDateString();
	}

	const client = useConvexClient();
	const allPhrases = useQuery(api.phrases.listAllByUser, {});
	const practiceSessions = useQuery(api.practiceSessions.list, {});

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

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) {
			goto(resolve('/login'));
		}
	});

	function shuffle<T>(arr: T[]): T[] {
		const a = [...arr];
		for (let i = a.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	let queue: typeof allPhrases.data = $state([]);
	let currentIndex = $state(0);
	const queueModes = ['once', 'shuffle', 'repeat'] as const;
	type QueueMode = (typeof queueModes)[number];
	let queueMode = $state<QueueMode>('once');

	function cycleQueueMode() {
		const nextIndex = (queueModes.indexOf(queueMode) + 1) % queueModes.length;
		queueMode = queueModes[nextIndex];
		if (queueMode === 'shuffle') {
			queue = shuffle(queue!);
		}
	}
	let sessionDone = $state(false);
	let pendingSubmissions = $state(0);
	let initialized = $state(false);
	let recorder: MediaRecorder | null = $state(null);
	let recording = $state(false);
	let audioChunks: Blob[] = $state([]);
	let audioBlob: Blob | null = $state(null);
	let audioUrl: string | null = $state(null);
	let recordError = $state('');
	let processing = $state(false);
	let durationMs = $state(0);
	let starting = $state(false);
	let ending = $state(false);

	// Review screen audio state — keyed by attempt ID
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
		if (!p?.el || !p.el.duration) return;
		p.progress = p.el.currentTime / p.el.duration;
	}

	function onVerifierTimeUpdate(attemptId: string) {
		const p = verifierPlayers[attemptId];
		if (!p?.el || !p.el.duration) return;
		p.progress = p.el.currentTime / p.el.duration;
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
		const attempts = sessionAttempts.data?.attempts;
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
		if (el.duration && !isNaN(el.duration)) reviewPlayers[attemptId].duration = el.duration * 1000;
	}

	function registerVerifierAudio(attemptId: string, el: HTMLAudioElement) {
		if (!verifierPlayers[attemptId]) {
			verifierPlayers[attemptId] = { el: null, playing: false, progress: 0, duration: 0 };
		}
		verifierPlayers[attemptId].el = el;
		if (el.duration && !isNaN(el.duration)) verifierPlayers[attemptId].duration = el.duration * 1000;
	}
	let playerEl: HTMLAudioElement | null = $state(null);
	let playing = $state(false);
	let playProgress = $state(0);

	$effect(() => {
		if (activePracticeSessionId && allPhrases.data && allPhrases.data.length > 0 && !initialized) {
			queue = shuffle(allPhrases.data);
			currentIndex = 0;
			initialized = true;
		}
		if (!activePracticeSessionId && initialized) {
			initialized = false;
			queue = [];
			currentIndex = 0;
			sessionDone = false;
			pendingSubmissions = 0;
			recording = false;
			recordError = '';
			audioChunks = [];
			audioBlob = null;
			audioUrl = null;
			durationMs = 0;
		}
	});

	const currentPhrase = $derived(queue && queue.length > 0 ? queue[currentIndex] : null);
	const queueLength = $derived(queue?.length ?? 0);
	const queuePosition = $derived(currentPhrase ? currentIndex + 1 : 0);

	function formatDuration(ms: number): string {
		if (!ms) return '0:00';
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	const recorderMimeCandidates = [
		'audio/webm;codecs=opus',
		'audio/webm',
		'audio/mp4',
		'audio/ogg;codecs=opus'
	];

	function getPreferredRecorderMimeType(): string {
		if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
			return '';
		}
		return recorderMimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? '';
	}

	async function startPracticeSession() {
		starting = true;
		try {
			const practiceSessionId = await client.mutation(api.practiceSessions.start, {});
			const practiceUrl = new URL(resolve('/practice'), window.location.origin);
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
			await goto(resolve('/practice'));
		} finally {
			ending = false;
		}
	}

	async function handleSubmit() {
		if (!audioBlob || !currentPhrase || !activePracticeSessionId) return;

		processing = true;
		recordError = '';

		try {
			const phraseSnapshot = { ...currentPhrase };
			const blobSnapshot = audioBlob;
			const durationSnapshot = durationMs;

			// 1. Create attempt + upload audio (must be sync — need IDs)
			const attemptId = await client.mutation(api.attempts.create, {
				phraseId: phraseSnapshot._id,
				practiceSessionId: activePracticeSessionId,
				durationMs: durationSnapshot
			});

			const uploadUrl = await client.mutation(api.audioUploads.generateUploadUrl, {});
			const uploadResponse = await fetch(uploadUrl, {
				method: 'POST',
				headers: { 'Content-Type': blobSnapshot.type || 'audio/webm' },
				body: blobSnapshot
			});

			if (!uploadResponse.ok) throw new Error('Failed to upload audio.');

			const uploadResult = await uploadResponse.json();
			const storageId = uploadResult.storageId as string;

			const audioAssetId = await client.mutation(api.audioAssets.create, {
				storageKey: storageId,
				contentType: blobSnapshot.type || 'audio/webm',
				phraseId: phraseSnapshot._id,
				attemptId,
				durationMs: durationSnapshot
			});

			await client.mutation(api.attempts.attachAudio, {
				attemptId,
				audioAssetId
			});

			// 2. Fire-and-forget AI processing
			pendingSubmissions++;
			client.action(api.aiPipeline.processAttempt, {
				attemptId,
				phraseId: phraseSnapshot._id,
				englishPrompt: phraseSnapshot.english,
				targetPhrase: phraseSnapshot.translation
			}).finally(() => {
				pendingSubmissions--;
			});

			// 3. Immediately advance
			advanceToNext();
		} catch (err) {
			recordError = err instanceof Error ? err.message : 'Failed to submit recording.';
		} finally {
			processing = false;
		}
	}

	function advanceToNext() {
		const nextIndex = currentIndex + 1;

		if (nextIndex >= queue!.length) {
			if (queueMode === 'once') {
				sessionDone = true;
				resetRecordingState();
				return;
			} else if (queueMode === 'shuffle') {
				queue = shuffle(queue!);
				currentIndex = 0;
			} else {
				// repeat — restart from 0 without reshuffle
				currentIndex = 0;
			}
		} else {
			currentIndex = nextIndex;
		}

		resetRecordingState();
	}

	function resetRecordingState() {
		recording = false;
		recordError = '';
		audioChunks = [];
		audioBlob = null;
		audioUrl = null;
		durationMs = 0;
		if (playerEl) {
			playerEl.pause();
			playerEl = null;
		}
		playing = false;
		playProgress = 0;
	}

	function handleSkip() {
		advanceToNext();
	}

	async function startRecording() {
		recordError = '';
		audioChunks = [];
		audioBlob = null;
		audioUrl = null;
		durationMs = 0;

		if (!navigator.mediaDevices?.getUserMedia) {
			recordError = 'Audio recording not supported in this browser.';
			return;
		}

		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			const preferredMimeType = getPreferredRecorderMimeType();
			const mediaRecorder = preferredMimeType
				? new MediaRecorder(stream, { mimeType: preferredMimeType })
				: new MediaRecorder(stream);
			recorder = mediaRecorder;

			const startTime = Date.now();

			mediaRecorder.ondataavailable = (event) => {
				if (event.data && event.data.size > 0) {
					audioChunks = [...audioChunks, event.data];
				}
			};

			mediaRecorder.onstop = () => {
				const blobMimeType = mediaRecorder.mimeType || audioChunks[0]?.type || 'audio/webm';
				const blob = new Blob(audioChunks, { type: blobMimeType });
				audioBlob = blob;
				audioUrl = URL.createObjectURL(blob);
				durationMs = Date.now() - startTime;
				stream.getTracks().forEach((track) => track.stop());
			};

			mediaRecorder.start();
			recording = true;
		} catch (err) {
			recordError = err instanceof Error ? err.message : 'Failed to start recording.';
		}
	}

	function stopRecording() {
		if (!recorder || recorder.state !== 'recording') {
			return;
		}
		recorder.stop();
		recording = false;
	}

	function discardRecording() {
		if (playerEl) {
			playerEl.pause();
			playerEl = null;
		}
		playing = false;
		playProgress = 0;
		audioChunks = [];
		audioBlob = null;
		audioUrl = null;
		durationMs = 0;
		recordError = '';
	}

	function togglePlayback() {
		if (!playerEl) return;
		if (playing) {
			playerEl.pause();
		} else {
			playerEl.play();
		}
	}

	function onTimeUpdate() {
		if (!playerEl || !playerEl.duration) return;
		playProgress = playerEl.currentTime / playerEl.duration;
	}

	function onPlayEnded() {
		playing = false;
		playProgress = 0;
	}

</script>

{#if !activePracticeSessionId}
	<div class="page-shell page-shell--narrow page-stack">
		<header class="page-stack">
			<div>
				<p class="info-kicker">On-the-Go Mode</p>
				<h1 class="text-5xl sm:text-6xl">Practice Sessions</h1>
				<p class="meta-text mt-3">
					Start a short run now, review details later. Primary action first, history second.
				</p>
			</div>
			<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
				<Card.Content>
					<div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
						<div class="space-y-2">
							<p class="info-kicker">Quick Start</p>
							<p class="text-xl font-semibold">
								{allPhrases.data?.length ?? 0} phrases ready to train
							</p>
							<p class="meta-text">Best results come from 5-10 minute daily sessions.</p>
						</div>
						<Button
							onclick={startPracticeSession}
							disabled={starting || !allPhrases.data || allPhrases.data.length === 0}
							size="lg"
							class="w-full sm:w-auto"
						>
							{starting ? 'Starting...' : 'Start Session'}
						</Button>
					</div>
				</Card.Content>
			</Card.Root>
		</header>

		{#if !allPhrases.data || allPhrases.data.length === 0}
			<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
				<Card.Header>
					<Card.Title>No phrases yet</Card.Title>
					<Card.Description>Add phrases first, then come back to start practicing.</Card.Description>
				</Card.Header>
				<Card.Footer>
					<a href={resolve('/')} class="meta-text underline">Go to Phrase Library</a>
				</Card.Footer>
			</Card.Root>
		{/if}

		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>Recent Sessions</Card.Title>
				<Card.Description>Open prior sessions to replay attempts and review corrections.</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if practiceSessions.isLoading}
					<p class="meta-text">Loading sessions...</p>
				{:else if !practiceSessions.data || practiceSessions.data.length === 0}
					<p class="meta-text">No practice sessions yet.</p>
				{:else}
					<ul class="space-y-3">
						{#each practiceSessions.data as session}
							<li>
								<a
									href={resolve(`/practice/session/${session._id}`)}
									class="flex items-center justify-between border border-border/60 bg-background/70 p-4 transition-colors hover:bg-background/90"
								>
									<span class="font-semibold">{relativeTime(session.startedAt)}</span>
									<span class="meta-text">{session.phraseCount} phrase{session.phraseCount === 1 ? '' : 's'}</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
{:else}
	{#if allPhrases.isLoading || activePracticeSession.isLoading}
		<div class="page-shell page-shell--compact flex min-h-[80vh] items-center justify-center">
			<p class="meta-text">Loading session...</p>
		</div>
	{:else if !allPhrases.data || allPhrases.data.length === 0}
		<div class="page-shell page-shell--compact flex min-h-[80vh] items-center justify-center">
			<Card.Root class="w-full border border-border/60 bg-background/85 backdrop-blur-sm">
				<Card.Header class="text-center">
					<Card.Title class="text-2xl">No Phrases Yet</Card.Title>
					<Card.Description>Add phrases in your phrase library first.</Card.Description>
				</Card.Header>
				<Card.Footer class="justify-center">
					<a href={resolve('/')} class="meta-text underline">
						Back to Phrase Library
					</a>
				</Card.Footer>
			</Card.Root>
		</div>
	{:else if sessionDone}
		<div class="page-shell page-shell--narrow page-stack">
			<div class="page-stack">
				<h1 class="text-5xl sm:text-6xl">Session Review</h1>
				<p class="meta-text">
					{#if pendingSubmissions > 0}
						Processing {pendingSubmissions} recording{pendingSubmissions === 1 ? '' : 's'}...
					{:else}
						All feedback received.
					{/if}
				</p>
			</div>

			{#if sessionAttempts.isLoading}
				<p class="meta-text">Loading results...</p>
			{:else if sessionAttempts.data}
				<Accordion.Root type="single">
					{#each sessionAttempts.data.attempts as attempt (attempt._id)}
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
									<span class="meta-text">Processing...</span>
								{:else if attempt.status === 'failed'}
									<span class="text-destructive text-sm">Failed</span>
								{/if}
								{#if hasVerifier}
									<div class="practice-review-trigger__verifier-scores">
										<span class="practice-review-vscore" title="Sound">S{attempt.humanReview.initialReview.soundAccuracy}</span>
										<span class="practice-review-vscore" title="Rhythm">R{attempt.humanReview.initialReview.rhythmIntonation}</span>
										<span class="practice-review-vscore" title="Phrase">P{attempt.humanReview.initialReview.phraseAccuracy}</span>
									</div>
								{/if}
							</Accordion.Trigger>
							<Accordion.Content>
								<div class="practice-review-detail">
									{#if attempt.feedbackText}
										<p class="text-sm">{attempt.feedbackText}</p>
									{/if}
									{#if attempt.audioUrl}
										<div>
											<p class="info-kicker mb-1">Your Recording</p>
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div class="practice-player" onclick={() => toggleReviewPlayback(attempt._id)}>
												<div class="practice-player__fill" style="width: {(rp(attempt._id).progress) * 100}%"></div>
												<span class="practice-player__label">
													{rp(attempt._id).playing ? 'Playing...' : formatDuration(rp(attempt._id).duration)}
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
									{/if}
									{#if attempt.humanReview?.initialReview?.audioUrl}
										<div>
											<p class="info-kicker mb-1">Verifier Example</p>
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_static_element_interactions -->
											<div class="practice-player practice-player--verifier" onclick={() => toggleVerifierPlayback(attempt._id)}>
												<div class="practice-player__fill" style="width: {(vp(attempt._id).progress) * 100}%"></div>
												<span class="practice-player__label">
													{vp(attempt._id).playing ? 'Playing...' : formatDuration(vp(attempt._id).duration)}
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
							</Accordion.Content>
						</Accordion.Item>
					{/each}
				</Accordion.Root>

				<div class="grid grid-cols-2 gap-2">
					<Button onclick={() => { sessionDone = false; initialized = false; startPracticeSession(); }} size="lg">
						New Session
					</Button>
					<Button onclick={endPracticeSession} variant="outline" size="lg" disabled={ending}>
						{ending ? 'Ending...' : 'Finish'}
					</Button>
				</div>
			{/if}
		</div>
	{:else if currentPhrase}
		<div class="practice-session">
			<!-- Top: session info + mode toggle -->
			<div class="practice-session__header">
				<div class="practice-session__header-info">
					<p class="info-kicker">Phrase {queuePosition} of {queueLength}</p>
					<p class="meta-text">
						Session started {new Date(activePracticeSession.data?.startedAt ?? Date.now()).toLocaleTimeString()}
					</p>
				</div>
				<div class="practice-session__header-mode">
					<button
						class="practice-mode-btn active"
						onclick={cycleQueueMode}
						aria-label="Queue mode: {queueMode}"
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
			<div class="practice-session__phrase">
				{#key currentIndex}
					<div
						class="phrase-card text-center"
						in:fly={{ x: 200, duration: 320 }}
						out:fly={{ x: -200, duration: 320 }}
					>
						<p class="xhosa-phrase font-black">{currentPhrase.english}</p>
					</div>
				{/key}
			</div>

			<!-- Bottom: controls -->
			<div class="practice-session__controls">
				{#if recordError}
					<p class="text-destructive text-sm">{recordError}</p>
				{/if}

				{#if audioUrl}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="practice-player" onclick={togglePlayback}>
						<div class="practice-player__fill" style="width: {playProgress * 100}%"></div>
						<span class="practice-player__label">
							{playing ? 'Playing...' : formatDuration(durationMs)}
						</span>
					</div>
					<audio
						bind:this={playerEl}
						src={audioUrl}
						ontimeupdate={onTimeUpdate}
						onplay={() => (playing = true)}
						onpause={() => (playing = false)}
						onended={onPlayEnded}
					></audio>
				{:else if recording}
					<Button onclick={stopRecording} size="lg" class="practice-record-btn w-full">
						Stop Recording
					</Button>
				{:else}
					<Button onclick={startRecording} size="lg" class="practice-record-btn w-full">
						Start Recording
					</Button>
				{/if}

				<div class="flex gap-2">
					<Button onclick={handleSubmit} class="flex-1" size="lg" disabled={!audioBlob || processing}>
						{processing ? 'Uploading...' : 'Submit'}
					</Button>
					{#if audioUrl}
						<Button onclick={discardRecording} variant="outline" size="lg">Discard</Button>
					{:else}
						<Button onclick={handleSkip} variant="outline" size="lg">Skip</Button>
					{/if}
				</div>

				<button class="meta-text underline text-center" onclick={endPracticeSession}>
					{ending ? 'Ending...' : 'End Session'}
				</button>
			</div>
		</div>
	{/if}
{/if}
