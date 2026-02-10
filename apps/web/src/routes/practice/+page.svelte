<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { isAuthenticated, isLoading } from '$lib/stores/auth';

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
	let submitted = $state(false);
	let initialized = $state(false);
	let recorder: MediaRecorder | null = $state(null);
	let recording = $state(false);
	let audioChunks: Blob[] = $state([]);
	let audioBlob: Blob | null = $state(null);
	let audioUrl: string | null = $state(null);
	let recordError = $state('');
	let processing = $state(false);
	let durationMs = $state(0);
	let feedbackText = $state<string | null>(null);
	let starting = $state(false);
	let ending = $state(false);
	let flaggingAttemptId = $state<string | null>(null);

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
			submitted = false;
			recording = false;
			recordError = '';
			feedbackText = null;
			audioChunks = [];
			audioBlob = null;
			audioUrl = null;
			durationMs = 0;
		}
	});

	const currentPhrase = $derived(queue && queue.length > 0 ? queue[currentIndex] : null);
	const attemptsQuery = useQuery(
		api.attempts.listByPhrase,
		() => (currentPhrase ? { phraseId: currentPhrase._id } : 'skip')
	);
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
		if (!audioBlob || !currentPhrase || !activePracticeSessionId) {
			return;
		}

		processing = true;
		recordError = '';
		feedbackText = null;

		try {
			const attemptId = await client.mutation(api.attempts.create, {
				phraseId: currentPhrase._id,
				practiceSessionId: activePracticeSessionId,
				durationMs
			});

			const uploadUrl = await client.mutation(api.audioUploads.generateUploadUrl, {});
			const uploadResponse = await fetch(uploadUrl, {
				method: 'POST',
				headers: { 'Content-Type': audioBlob.type || 'audio/webm' },
				body: audioBlob
			});

			if (!uploadResponse.ok) {
				throw new Error('Failed to upload audio.');
			}

			const uploadResult = await uploadResponse.json();
			const storageId = uploadResult.storageId as string;

			const audioAssetId = await client.mutation(api.audioAssets.create, {
				storageKey: storageId,
				contentType: audioBlob.type || 'audio/webm',
				phraseId: currentPhrase._id,
				attemptId,
				durationMs
			});

			await client.mutation(api.attempts.attachAudio, {
				attemptId,
				audioAssetId
			});

			const feedback = await client.action(api.aiPipeline.processAttempt, {
				attemptId,
				phraseId: currentPhrase._id,
				englishPrompt: currentPhrase.english,
				targetPhrase: currentPhrase.translation
			});

			feedbackText = feedback?.feedbackText ?? 'Feedback not available yet.';
			submitted = true;
		} catch (err) {
			recordError = err instanceof Error ? err.message : 'Failed to submit recording.';
		} finally {
			processing = false;
		}
	}

	function handleSkip() {
		submitted = true;
	}

	function handleNext() {
		let nextIndex = currentIndex + 1;
		if (nextIndex >= queue!.length) {
			queue = shuffle(queue!);
			nextIndex = 0;
		}
		currentIndex = nextIndex;
		submitted = false;
		recording = false;
		recordError = '';
		feedbackText = null;
		audioChunks = [];
		audioBlob = null;
		audioUrl = null;
		durationMs = 0;
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
		audioChunks = [];
		audioBlob = null;
		audioUrl = null;
		durationMs = 0;
		recordError = '';
	}

	async function flagHumanReview(attemptId: Id<'attempts'>) {
		flaggingAttemptId = attemptId;
		try {
			await client.mutation(api.humanReviews.flagAttemptReview, { attemptId });
		} catch (err) {
			recordError = err instanceof Error ? err.message : 'Failed to flag review.';
		} finally {
			flaggingAttemptId = null;
		}
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
							<li class="border border-border/60 bg-background/70 p-4">
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div class="space-y-1">
										<p class="font-semibold">
											{new Date(session.startedAt).toLocaleString()}
										</p>
										<p class="meta-text">
											Attempts: {session.attemptCount} • Phrases: {session.phraseCount}
										</p>
									</div>
									<a
										href={resolve(`/practice/session/${session._id}`)}
										class="info-kicker text-primary underline"
									>
										Open
									</a>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
{:else}
	<div class="page-shell page-shell--compact flex min-h-[80vh] flex-col items-center justify-center">
		{#if allPhrases.isLoading || activePracticeSession.isLoading}
			<p class="meta-text">Loading session...</p>
		{:else if !allPhrases.data || allPhrases.data.length === 0}
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
		{:else if currentPhrase}
			<Card.Root class="w-full border border-border/60 bg-background/85 backdrop-blur-sm">
				<Card.Header class="text-center">
					<p class="info-kicker">Phrase {queuePosition} of {queueLength}</p>
					<Card.Title class="text-3xl sm:text-4xl">Practice</Card.Title>
					<Card.Description>
						Session started {new Date(activePracticeSession.data?.startedAt ?? Date.now()).toLocaleTimeString()}
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-6 text-center">
					<div class="border border-border/60 bg-muted/60 p-5 sm:p-6">
						<p class="info-kicker">English Prompt</p>
						<p class="mt-2 text-xl font-semibold">{currentPhrase.english}</p>
					</div>

					{#if !submitted}
						<div class="space-y-4 text-left">
							<div class="border border-dashed border-border/70 bg-background/60 p-4">
								<p class="meta-text">
									Speak your {currentPhrase.targetLanguage} response
								</p>
								<div class="mt-3 flex flex-wrap gap-2">
									{#if !recording}
										<Button onclick={startRecording} size="lg">Start Recording</Button>
									{:else}
										<Button onclick={stopRecording} size="lg" variant="destructive">
											Stop Recording
										</Button>
									{/if}
									{#if audioUrl}
										<Button onclick={discardRecording} variant="outline">Discard</Button>
									{/if}
								</div>
								{#if recordError}
									<p class="mt-2 text-destructive">{recordError}</p>
								{/if}
								{#if audioUrl}
									<div class="mt-4 space-y-2">
										<p class="meta-text">
											Recorded: {formatDuration(durationMs)}
										</p>
										<audio controls src={audioUrl} class="audio-playback w-full"></audio>
									</div>
								{/if}
							</div>
							<div class="flex gap-2">
								<Button
									onclick={handleSubmit}
									class="flex-1"
									size="lg"
									disabled={!audioBlob || processing}
								>
									{processing ? 'Processing...' : 'Submit'}
								</Button>
								<Button onclick={handleSkip} variant="outline" size="lg">
									Skip
								</Button>
							</div>
						</div>
					{:else}
						<div class="space-y-4">
							<div class="border-2 border-primary bg-primary/6 p-4 text-left">
								<p class="info-kicker">AI Feedback</p>
								<p class="mt-1 text-lg font-semibold text-primary">
									{feedbackText ?? 'Feedback not available yet.'}
								</p>
							</div>
							{#if attemptsQuery.data && attemptsQuery.data.length > 0}
								<div class="border border-border/60 bg-card/40 p-4 text-left">
									<p class="info-kicker">
										Attempt History
									</p>
									<ul class="mt-4 space-y-3">
										{#each attemptsQuery.data.slice(0, 5) as attempt}
											<li class="space-y-3 border border-border/60 bg-background/60 p-4">
												<div class="flex flex-wrap items-center justify-between gap-2 text-[0.84rem] uppercase tracking-[0.1em]">
													<span class="meta-text">
														{new Date(attempt.createdAt).toLocaleString()}
													</span>
													<span>{attempt.status.replace('_', ' ')}</span>
												</div>
												{#if attempt.audioUrl}
													<div class="border border-border/50 bg-muted/60 p-3">
														<p class="info-kicker mb-2">
															Playback
														</p>
														<audio controls src={attempt.audioUrl} class="audio-playback w-full"></audio>
													</div>
												{/if}
												{#if attempt.feedbackText}
													<p class="meta-text">{attempt.feedbackText}</p>
												{/if}
												{#if attempt.humanReview?.initialReview}
													<div class="space-y-3 border border-border/50 bg-muted/40 p-3">
														<p class="info-kicker">
															Human Review {attempt.humanReview.status.replace('_', ' ')}
														</p>
														<p class="text-sm">
															Verifier: {attempt.humanReview.initialReview.verifierFirstName}
														</p>
														{#if attempt.humanReview.initialReview.audioUrl}
															<audio
																controls
																src={attempt.humanReview.initialReview.audioUrl}
																class="audio-playback w-full"
															></audio>
														{/if}
														{#if attempt.humanReview.status === 'completed' || attempt.humanReview.status === 'dispute_resolved'}
															<Button
																variant="outline"
																size="sm"
																disabled={flaggingAttemptId === attempt._id}
																onclick={() => flagHumanReview(attempt._id)}
															>
																{flaggingAttemptId === attempt._id ? 'Flagging...' : 'Flag Review'}
															</Button>
														{/if}
													</div>
												{/if}
											</li>
										{/each}
									</ul>
								</div>
							{/if}
							<div class="grid grid-cols-2 gap-2">
								<Button onclick={handleNext} size="lg">Next Phrase</Button>
								<Button onclick={endPracticeSession} variant="outline" size="lg" disabled={ending}>
									{ending ? 'Ending...' : 'End Session'}
								</Button>
							</div>
						</div>
					{/if}
				</Card.Content>
				<Card.Footer class="justify-center">
					<a href={resolve('/practice')} class="meta-text underline">
						Back to Sessions
					</a>
				</Card.Footer>
			</Card.Root>
		{/if}
	</div>
{/if}
