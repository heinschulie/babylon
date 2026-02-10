<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '$lib/stores/auth';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	const client = useConvexClient();
	const supportedLanguages = useQuery(api.verifierAccess.listSupportedLanguages, {});
	const verifierState = useQuery(api.verifierAccess.getMyVerifierState, {});

	let selectedLanguage = $state('xh-ZA');
	let onboardingFirstName = $state('');
	let onboardingImageUrl = $state('');
	let onboardingSaving = $state(false);
	let queueMessage = $state<string | null>(null);
	let queueError = $state<string | null>(null);
	let claimTick = $state(Date.now());
	let lastAutoClaimSignal = $state('');
	let claiming = $state(false);
	let releasing = $state(false);
	let submitting = $state(false);

	let scores = $state({
		soundAccuracy: 3,
		rhythmIntonation: 3,
		phraseAccuracy: 3
	});

	let recorder: MediaRecorder | null = $state(null);
	let recording = $state(false);
	let audioChunks: Blob[] = $state([]);
	let exemplarAudioBlob: Blob | null = $state(null);
	let exemplarAudioUrl: string | null = $state(null);
	let exemplarDurationMs = $state(0);
	let recorderError = $state('');

	const currentClaim = useQuery(api.humanReviews.getCurrentClaim, () => ({
		languageCode: selectedLanguage
	}));
	const queueSignal = useQuery(api.humanReviews.getQueueSignal, () => ({
		languageCode: selectedLanguage
	}));
	const escalated = useQuery(api.humanReviews.listEscalated, () => ({
		languageCode: selectedLanguage
	}));

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) {
			goto(resolve('/login'));
		}
	});

	$effect(() => {
		const interval = setInterval(() => {
			claimTick = Date.now();
		}, 1000);
		return () => clearInterval(interval);
	});

	const canReviewLanguage = $derived(
		!!verifierState.data?.languages.find(
			(language) => language.languageCode === selectedLanguage && language.active
		)
	);

	const activeClaim = $derived(currentClaim.data ?? null);
	const remainingMs = $derived(
		activeClaim?.claimDeadlineAt ? Math.max(activeClaim.claimDeadlineAt - claimTick, 0) : 0
	);
	const pendingCount = $derived(queueSignal.data?.pendingCount ?? 0);

	function formatTimer(ms: number) {
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

	const timerText = $derived(formatTimer(remainingMs));

	$effect(() => {
		if (!canReviewLanguage || activeClaim || claiming) {
			return;
		}
		if (!queueSignal.data || queueSignal.data.pendingCount === 0) {
			return;
		}
		const signal = `${queueSignal.data.languageCode}:${queueSignal.data.oldestPendingId ?? 'none'}:${queueSignal.data.pendingCount}`;
		if (signal === lastAutoClaimSignal) {
			return;
		}
		lastAutoClaimSignal = signal;
		void claimNext(true);
	});

	async function saveOnboarding() {
		if (!onboardingFirstName.trim()) {
			queueError = 'Please enter a first name.';
			return;
		}

		onboardingSaving = true;
		queueError = null;
		try {
			await client.mutation(api.verifierAccess.upsertMyProfile, {
				firstName: onboardingFirstName.trim(),
				profileImageUrl: onboardingImageUrl.trim() || undefined
			});
			await client.mutation(api.verifierAccess.setMyLanguageActive, {
				languageCode: selectedLanguage,
				active: true
			});
			queueMessage = 'Verifier profile activated.';
		} catch (error) {
			queueError = error instanceof Error ? error.message : 'Failed to activate verifier profile.';
		} finally {
			onboardingSaving = false;
		}
	}

	async function claimNext(silent = false) {
		claiming = true;
		if (!silent) {
			queueMessage = null;
			queueError = null;
		}
		try {
			const assignment = await client.mutation(api.humanReviews.claimNext, {
				languageCode: selectedLanguage
			});
			if (assignment) {
				lastAutoClaimSignal = '';
			}
			if (!assignment && !silent) {
				queueMessage = 'No pending learner attempts right now.';
			}
		} catch (error) {
			if (!silent) {
				queueError = error instanceof Error ? error.message : 'Unable to claim next request.';
			}
		} finally {
			claiming = false;
		}
	}

	async function releaseClaim() {
		if (!activeClaim) return;
		releasing = true;
		queueError = null;
		try {
			await client.mutation(api.humanReviews.releaseClaim, {
				requestId: activeClaim.requestId
			});
			lastAutoClaimSignal = '';
			discardRecording();
			queueMessage = 'Claim released back to the top of queue.';
		} catch (error) {
			queueError = error instanceof Error ? error.message : 'Failed to release claim.';
		} finally {
			releasing = false;
		}
	}

	async function startRecording() {
		recorderError = '';
		audioChunks = [];
		exemplarAudioBlob = null;
		exemplarAudioUrl = null;
		exemplarDurationMs = 0;

		if (!navigator.mediaDevices?.getUserMedia) {
			recorderError = 'Audio recording not supported in this browser.';
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
				exemplarAudioBlob = blob;
				exemplarAudioUrl = URL.createObjectURL(blob);
				exemplarDurationMs = Date.now() - startTime;
				stream.getTracks().forEach((track) => track.stop());
			};

			mediaRecorder.start();
			recording = true;
		} catch (error) {
			recorderError = error instanceof Error ? error.message : 'Failed to start recording.';
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
		exemplarAudioBlob = null;
		exemplarAudioUrl = null;
		exemplarDurationMs = 0;
	}

	async function submitReview() {
		if (!activeClaim || !exemplarAudioBlob) {
			return;
		}
		submitting = true;
		queueError = null;
		queueMessage = null;

		try {
			const uploadUrl = await client.mutation(api.audioUploads.generateUploadUrlForVerifier, {});
			const uploadResponse = await fetch(uploadUrl, {
				method: 'POST',
				headers: { 'Content-Type': exemplarAudioBlob.type || 'audio/webm' },
				body: exemplarAudioBlob
			});
			if (!uploadResponse.ok) {
				throw new Error('Failed to upload exemplar audio.');
			}
			const uploadResult = await uploadResponse.json();
			const storageId = uploadResult.storageId as string;

			const exemplarAudioAssetId = await client.mutation(api.audioAssets.create, {
				storageKey: storageId,
				contentType: exemplarAudioBlob.type || 'audio/webm',
				attemptId: activeClaim.attemptId,
				durationMs: exemplarDurationMs
			});

			await client.mutation(api.humanReviews.submitReview, {
				requestId: activeClaim.requestId,
				soundAccuracy: scores.soundAccuracy,
				rhythmIntonation: scores.rhythmIntonation,
				phraseAccuracy: scores.phraseAccuracy,
				exemplarAudioAssetId: exemplarAudioAssetId as Id<'audioAssets'>
			});

			queueMessage = 'Review submitted.';
			discardRecording();
			await claimNext();
		} catch (error) {
			queueError = error instanceof Error ? error.message : 'Failed to submit review.';
		} finally {
			submitting = false;
		}
	}
</script>

<div class="page-shell page-shell--compact page-stack">
	<header class="page-stack">
		<div>
			<p class="info-kicker">Two-Minute Review Cycles</p>
			<h1 class="text-5xl sm:text-6xl">Verifier Queue</h1>
			<p class="meta-text mt-3">Claim quickly, score clearly, and keep learner feedback moving.</p>
		</div>
	</header>

	{#if queueError}
		<div class="border border-destructive/50 bg-destructive/10 p-3 text-destructive">{queueError}</div>
	{/if}
	{#if queueMessage}
		<div class="border border-primary/40 bg-primary/10 p-3 text-primary">{queueMessage}</div>
	{/if}

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Content>
			<div class="grid gap-4 sm:grid-cols-3">
				<div>
					<p class="info-kicker">Pending</p>
					<p class="mt-2 text-4xl font-display">{pendingCount}</p>
				</div>
				<div>
					<p class="info-kicker">Escalated</p>
					<p class="mt-2 text-4xl font-display">{escalated.data?.length ?? 0}</p>
				</div>
				<div>
					<p class="info-kicker">Current Claim</p>
					<p class="mt-2 text-lg font-semibold">{activeClaim ? timerText : 'Idle'}</p>
					<p class="meta-text mt-1">{activeClaim ? 'Time remaining' : 'Ready for auto-assign'}</p>
				</div>
			</div>
		</Card.Content>
	</Card.Root>

	<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
		<Card.Header>
			<Card.Title>Language Team</Card.Title>
		</Card.Header>
		<Card.Content class="space-y-3">
			<div class="space-y-2">
				<Label for="languageCode">Language</Label>
				<select
					id="languageCode"
					class="w-full border border-input bg-background px-3 py-2.5 text-base"
					bind:value={selectedLanguage}
				>
					{#if supportedLanguages.data}
						{#each supportedLanguages.data.filter((language) => language.code === 'xh-ZA') as language}
							<option value={language.code}>{language.displayName} ({language.code})</option>
						{/each}
					{/if}
				</select>
			</div>
			{#if verifierState.data?.profile}
				<p class="meta-text">Active verifier: {verifierState.data.profile.firstName}</p>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if !verifierState.data?.profile || !canReviewLanguage}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>Activate Verifier Access</Card.Title>
				<Card.Description>Set your visible identity and join this language team.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<div class="space-y-2">
					<Label for="firstName">First Name</Label>
					<Input id="firstName" bind:value={onboardingFirstName} placeholder="e.g. Lwazi" />
				</div>
				<div class="space-y-2">
					<Label for="profileImage">Profile Image URL (optional)</Label>
					<Input id="profileImage" bind:value={onboardingImageUrl} placeholder="https://..." />
				</div>
				<Button class="w-full" onclick={saveOnboarding} disabled={onboardingSaving}>
					{onboardingSaving ? 'Saving...' : 'Activate'}
				</Button>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>Queue Control</Card.Title>
				<Card.Description>Auto-assign the next learner attempt when you are ready.</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-3">
				<Button class="w-full" onclick={() => claimNext(false)} disabled={claiming || !!activeClaim} size="lg">
					{claiming ? 'Claiming...' : activeClaim ? 'Claim Active' : 'Auto-Assign Next'}
				</Button>
				{#if activeClaim}
					<div class="border border-orange-500/50 bg-orange-500/10 p-3 text-orange-700">
						Timer: {timerText}
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if activeClaim}
			<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
				<Card.Header>
					<Card.Title>{activeClaim.phase === 'dispute' ? 'Dispute Review' : 'Learner Attempt'}</Card.Title>
					<Card.Description>Claim ID: {activeClaim.requestId}</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-4">
					<div class="border border-border/50 bg-muted/40 p-3">
						<p class="info-kicker">Phrase</p>
						<p class="mt-1 font-semibold">{activeClaim.phrase?.english}</p>
						<p class="meta-text text-primary">{activeClaim.phrase?.translation}</p>
					</div>

					{#if activeClaim.learnerAttempt.audioUrl}
						<div class="border border-border/50 bg-muted/30 p-3">
							<p class="info-kicker mb-2">Learner Audio</p>
							<audio controls src={activeClaim.learnerAttempt.audioUrl} class="audio-playback w-full"></audio>
						</div>
					{/if}

					{#if activeClaim.phase === 'dispute' && activeClaim.originalReview}
						<div class="border border-border/50 bg-background/70 p-3">
							<p class="info-kicker">Original Review</p>
							<p class="mt-1 font-semibold">{activeClaim.originalReview.verifierFirstName}</p>
							<p class="meta-text">
								Sound {activeClaim.originalReview.soundAccuracy}/5
								• Rhythm {activeClaim.originalReview.rhythmIntonation}/5
								• Phrase {activeClaim.originalReview.phraseAccuracy}/5
							</p>
							<p class="meta-text mt-2">
								Additional checks complete: {activeClaim.disputeProgress?.completed ?? 0}/2
							</p>
						</div>
					{/if}

					<div class="grid grid-cols-1 gap-3">
						<div class="space-y-2">
							<Label for="scoreSound">Sound Accuracy (1-5)</Label>
							<Input id="scoreSound" type="number" min="1" max="5" bind:value={scores.soundAccuracy} />
						</div>
						<div class="space-y-2">
							<Label for="scoreRhythm">Rhythm & Intonation (1-5)</Label>
							<Input id="scoreRhythm" type="number" min="1" max="5" bind:value={scores.rhythmIntonation} />
						</div>
						<div class="space-y-2">
							<Label for="scorePhrase">Phrase Accuracy (1-5)</Label>
							<Input id="scorePhrase" type="number" min="1" max="5" bind:value={scores.phraseAccuracy} />
						</div>
					</div>

					<div class="border border-dashed p-3">
						<p class="meta-text">Record exemplar pronunciation</p>
						<div class="mt-3 flex flex-wrap gap-2">
							{#if !recording}
								<Button size="sm" onclick={startRecording}>Start Recording</Button>
							{:else}
								<Button size="sm" variant="destructive" onclick={stopRecording}>Stop Recording</Button>
							{/if}
							{#if exemplarAudioUrl}
								<Button size="sm" variant="outline" onclick={discardRecording}>Discard</Button>
							{/if}
						</div>
						{#if recorderError}
							<p class="mt-2 text-destructive">{recorderError}</p>
						{/if}
						{#if exemplarAudioUrl}
							<div class="mt-3 space-y-2">
								<p class="meta-text">
									Duration: {Math.floor(exemplarDurationMs / 1000)}s
								</p>
								<audio controls src={exemplarAudioUrl} class="audio-playback w-full"></audio>
							</div>
						{/if}
					</div>

					<div class="grid grid-cols-2 gap-2">
						<Button variant="outline" onclick={releaseClaim} disabled={releasing || submitting}>
							{releasing ? 'Releasing...' : 'Release'}
						</Button>
						<Button onclick={submitReview} disabled={submitting || !exemplarAudioBlob || remainingMs <= 0}>
							{submitting ? 'Submitting...' : 'Submit Review'}
						</Button>
					</div>
				</Card.Content>
			</Card.Root>
		{/if}
	{/if}
</div>
