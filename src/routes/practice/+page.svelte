<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useQuery, useConvexClient } from 'convex-svelte';
	import { api } from '../../../convex/_generated/api';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { isAuthenticated, isLoading } from '$lib/stores/auth';

	const client = useConvexClient();
	const allPhrases = useQuery(api.phrases.listAllByUser, {});

	// If opened from a notification, this phrase should appear first
	const startPhraseId = $derived(page.url.searchParams.get('phrase'));

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) {
			goto(resolve('/login'));
		}
	});

	// Shuffle helper
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
	const isDev = import.meta.env.DEV;

	// Initialize shuffled queue when data loads, placing the notification phrase first if present
	$effect(() => {
		if (allPhrases.data && allPhrases.data.length > 0 && !initialized) {
			const shuffled = shuffle(allPhrases.data);
			if (startPhraseId) {
				const idx = shuffled.findIndex((p) => p._id === startPhraseId);
				if (idx > 0) {
					const [target] = shuffled.splice(idx, 1);
					shuffled.unshift(target);
				}
			}
			queue = shuffled;
			currentIndex = 0;
			initialized = true;
		}
	});

	const currentPhrase = $derived(queue && queue.length > 0 ? queue[currentIndex] : null);
	const attemptsQuery = useQuery(
		api.attempts.listByPhrase,
		() => (currentPhrase ? { phraseId: currentPhrase._id } : 'skip')
	);

	function formatDuration(ms: number): string {
		if (!ms) return '0:00';
		const totalSeconds = Math.floor(ms / 1000);
		const minutes = Math.floor(totalSeconds / 60);
		const seconds = totalSeconds % 60;
		return `${minutes}:${seconds.toString().padStart(2, '0')}`;
	}

	async function handleSubmit() {
		if (!audioBlob || !currentPhrase) {
			return;
		}

		processing = true;
		recordError = '';
		feedbackText = null;

		try {
			const attemptId = await client.mutation(api.attempts.create, {
				phraseId: currentPhrase._id,
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
			// Re-shuffle and start again
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
			const mediaRecorder = new MediaRecorder(stream);
			recorder = mediaRecorder;

			const startTime = Date.now();

			mediaRecorder.ondataavailable = (event) => {
				if (event.data && event.data.size > 0) {
					audioChunks = [...audioChunks, event.data];
				}
			};

			mediaRecorder.onstop = () => {
				const blob = new Blob(audioChunks, { type: 'audio/webm' });
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
</script>

<div class="container mx-auto flex min-h-[80vh] max-w-md flex-col items-center justify-center p-4">
	{#if allPhrases.isLoading}
		<p class="text-muted-foreground">Loading phrases...</p>
	{:else if !allPhrases.data || allPhrases.data.length === 0}
		<Card.Root class="w-full">
			<Card.Header class="text-center">
				<Card.Title class="text-2xl">No Phrases Yet</Card.Title>
				<Card.Description>Add some phrases in a learning session first.</Card.Description>
			</Card.Header>
			<Card.Footer class="justify-center">
				<a href={resolve('/')} class="text-sm text-muted-foreground hover:underline">
					Back to Sessions
				</a>
			</Card.Footer>
		</Card.Root>
	{:else if currentPhrase}
		<Card.Root class="w-full">
			<Card.Header class="text-center">
				<Card.Title class="text-2xl">Practice</Card.Title>
				<Card.Description>
					Translate to {currentPhrase.targetLanguage}
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6 text-center">
				<div class="rounded-lg bg-muted p-6">
					<p class="text-sm text-muted-foreground">English</p>
					<p class="mt-2 text-xl font-semibold">{currentPhrase.english}</p>
				</div>

				{#if !submitted}
					<div class="space-y-4 text-left">
						<div class="rounded-lg border border-dashed p-4">
							<p class="text-sm text-muted-foreground">Speak your Xhosa response</p>
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
								<p class="mt-2 text-sm text-destructive">{recordError}</p>
							{/if}
							{#if audioUrl}
								<div class="mt-4 space-y-2">
									<p class="text-sm text-muted-foreground">
										Recorded: {formatDuration(durationMs)}
									</p>
									<audio controls src={audioUrl} class="w-full" />
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
						<div class="rounded-lg border-2 border-primary bg-primary/5 p-4">
							<p class="text-sm text-muted-foreground">AI Feedback</p>
							<p class="mt-1 text-lg font-semibold text-primary">
								{feedbackText ?? 'Feedback not available yet.'}
							</p>
						</div>
						{#if attemptsQuery.data && attemptsQuery.data.length > 0}
							<div class="border border-border/60 bg-card/40 p-4">
								<p class="text-lg font-semibold uppercase tracking-[0.18em] text-muted-foreground">
									Attempt History
								</p>
								<ul class="mt-4 space-y-3 text-sm">
									{#each attemptsQuery.data.slice(0, 5) as attempt}
										<li class="space-y-3 border border-border/60 bg-background/60 p-4">
											<div class="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.12em]">
												<span class="text-muted-foreground">
													{new Date(attempt.createdAt).toLocaleString()}
												</span>
												<span
													class={`${
														attempt.status === 'feedback_ready'
															? 'text-primary'
															: attempt.status === 'processing'
																? 'text-orange-500'
																: attempt.status === 'failed'
																	? 'text-destructive'
																	: 'text-muted-foreground'
													}`}
												>
													{attempt.status.replace('_', ' ')}
												</span>
											</div>
											{#if attempt.audioUrl}
												<div class="border border-border/50 bg-muted/60 p-3">
													<p class="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-muted-foreground">
														Playback
													</p>
													<audio controls src={attempt.audioUrl} class="audio-playback w-full" />
												</div>
											{/if}
											{#if attempt.feedbackText}
												<p class="text-xs text-muted-foreground">{attempt.feedbackText}</p>
											{/if}
											{#if isDev}
												<div class="border border-border/50 bg-muted/40 p-3 text-[0.7rem] text-muted-foreground">
													<p class="font-semibold uppercase tracking-[0.16em] text-foreground/70">
														Dev Debug
													</p>
													<p class="mt-2">
														<span class="font-semibold text-foreground/70">Transcript:</span>
														{attempt.transcript ?? '—'}
													</p>
													<p class="mt-1">
														<span class="font-semibold text-foreground/70">Confidence:</span>
														{attempt.confidence ?? '—'}
													</p>
													<p class="mt-1">
														<span class="font-semibold text-foreground/70">Score:</span>
														{attempt.score ?? '—'}
													</p>
													<p class="mt-1">
														<span class="font-semibold text-foreground/70">Error Tags:</span>
														{attempt.errorTags?.join(', ') ?? '—'}
													</p>
												</div>
											{/if}
										</li>
									{/each}
								</ul>
							</div>
						{/if}
						<Button onclick={handleNext} class="w-full" size="lg">
							Next Phrase
						</Button>
					</div>
				{/if}
			</Card.Content>
			<Card.Footer class="justify-center">
				<a href={resolve('/')} class="text-sm text-muted-foreground hover:underline">
					Till later
				</a>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
