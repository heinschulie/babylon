<script lang="ts">
	import { onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import * as Card from '@babylon/ui/card';
	import { Button } from '@babylon/ui/button';
	import { AudioRecorder, AttemptPlayer } from '@babylon/ui/audio';
	import * as m from '$lib/paraglide/messages.js';
	import { activeLanguageCode, hasActiveLanguage } from '$lib/activeLanguage';

	const client = useConvexClient();
	const verifierState = useQuery(api.verifierAccess.getMyVerifierState, {});
	const languageCode = $derived(activeLanguageCode(verifierState.data?.languages));
	const canRecord = $derived(hasActiveLanguage(verifierState.data?.languages));

	const prompts = useQuery(api.courseAuthoring.listPromptsNeedingExemplar, () =>
		canRecord ? { languageCode } : 'skip'
	);

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});

	const recorder = new AudioRecorder();
	onDestroy(() => recorder.destroy());

	let activePromptId = $state<Id<'coursePrompts'> | null>(null);
	let saving = $state(false);
	let error = $state('');

	const recorderErrorMessage = $derived.by(() => {
		switch (recorder.errorCode) {
			case 'unsupported':
				return m.claim_audio_unsupported();
			case 'permission_denied':
				return m.exemplars_mic_permission_denied();
			case 'no_microphone':
				return m.exemplars_mic_not_found();
			case 'failed':
				return m.claim_record_failed();
			default:
				return '';
		}
	});

	async function startRecording(promptId: Id<'coursePrompts'>) {
		error = '';
		recorder.discard();
		activePromptId = promptId;
		await recorder.start();
	}

	function discardRecording() {
		recorder.discard();
		activePromptId = null;
	}

	async function saveExemplar(promptId: Id<'coursePrompts'>) {
		const blob = recorder.blob;
		if (!blob) return;
		saving = true;
		error = '';
		try {
			const uploadUrl = await client.mutation(api.audioUploads.generateUploadUrlForVerifier, {});
			const res = await fetch(uploadUrl, {
				method: 'POST',
				headers: { 'Content-Type': blob.type || 'audio/webm' },
				body: blob
			});
			if (!res.ok) throw new Error(m.claim_upload_failed());
			const { storageId } = await res.json();

			const audioAssetId = await client.mutation(api.audioAssets.create, {
				storageKey: storageId,
				contentType: blob.type || 'audio/webm',
				durationMs: recorder.durationMs
			});

			await client.mutation(api.courseAuthoring.setPromptExemplar, {
				coursePromptId: promptId,
				audioAssetId: audioAssetId as Id<'audioAssets'>
			});

			discardRecording();
		} catch (e) {
			error = e instanceof Error ? e.message : m.exemplars_save_failed();
		} finally {
			saving = false;
		}
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header class="page-stack">
		<div>
			<p class="info-kicker">{m.exemplars_kicker()}</p>
			<h1 class="text-5xl sm:text-6xl">{m.exemplars_title()}</h1>
			<p class="meta-text mt-3">
				{m.exemplars_desc()}
			</p>
		</div>
	</header>

	{#if !canRecord}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.work_not_activated()}</Card.Title>
				<Card.Description>{m.work_not_activated_desc()}</Card.Description>
			</Card.Header>
			<Card.Footer>
				<a href={resolve('/settings')} class="meta-text underline">{m.work_go_settings()}</a>
			</Card.Footer>
		</Card.Root>
	{:else if prompts.isLoading}
		<p class="meta-text">{m.exemplars_loading()}</p>
	{:else if !prompts.data || prompts.data.length === 0}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.exemplars_empty_title()}</Card.Title>
				<Card.Description>{m.exemplars_empty_desc()}</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.exemplars_pending_title()}</Card.Title>
				<Card.Description>{m.exemplars_pending_desc()}</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if error}
					<p class="text-destructive mb-3 text-sm">{error}</p>
				{/if}
				{#if recorderErrorMessage}
					<p class="text-destructive mb-3 text-sm">{recorderErrorMessage}</p>
				{/if}
				<ul class="space-y-3">
					{#each prompts.data as prompt (prompt._id)}
						<li class="border border-border/60 bg-background/70 p-4">
							<div class="space-y-3">
								<div>
									<p class="target-phrase font-black">{prompt.translation}</p>
									<p class="meta-text">{prompt.english}</p>
									{#if prompt.phonetic}
										<p class="meta-text italic">{prompt.phonetic}</p>
									{/if}
								</div>

								{#if activePromptId === prompt._id && recorder.url}
									<AttemptPlayer
										src={recorder.url}
										variant="verifier"
										playingLabel={m.state_playing()}
										fallbackDurationMs={recorder.durationMs}
									/>
									<div class="flex gap-2">
										<Button
											onclick={() => saveExemplar(prompt._id)}
											disabled={saving}
											class="flex-1"
										>
											{saving ? m.exemplars_saving() : m.exemplars_save()}
										</Button>
										<Button onclick={discardRecording} variant="outline" disabled={saving}>
											{m.btn_discard()}
										</Button>
									</div>
								{:else if activePromptId === prompt._id && recorder.recording}
									<Button onclick={() => recorder.stop()} class="w-full">
										{m.exemplars_stop()}
									</Button>
								{:else}
									<Button
										onclick={() => startRecording(prompt._id)}
										variant="outline"
										class="w-full"
										disabled={recorder.recording || saving}
									>
										{m.exemplars_record()}
									</Button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
