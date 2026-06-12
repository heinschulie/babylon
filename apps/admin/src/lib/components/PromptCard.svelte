<script lang="ts">
	import { useConvexClient } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import * as Card from '@babylon/ui/card';
	import { Button } from '@babylon/ui/button';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';
	import { Badge } from '@babylon/ui';
	import * as m from '$lib/paraglide/messages.js';

	type Morpheme = { morpheme: string; gloss: string; role: string };
	type Handle = { key: string; label: string; gloss: string };
	type PromptData = {
		_id: Id<'coursePrompts'>;
		index: number;
		english: string;
		translation: string;
		phonetic: string | null;
		morphemeBreakdown: Morpheme[];
		usesHandles: string[];
		primaryHandleKey: string;
		status: string;
		hasExemplar: boolean;
	};

	let {
		prompt,
		handles,
		languageCode
	}: { prompt: PromptData; handles: Handle[]; languageCode: string } = $props();

	const client = useConvexClient();

	const isDraft = $derived(prompt.status === 'draft');

	// Editable copies, seeded once per card instance (cards are keyed by _id).
	// svelte-ignore state_referenced_locally
	let english = $state(prompt.english);
	// svelte-ignore state_referenced_locally
	let translation = $state(prompt.translation);
	// svelte-ignore state_referenced_locally
	let phonetic = $state(prompt.phonetic ?? '');
	// svelte-ignore state_referenced_locally
	let morphemes = $state<Morpheme[]>(prompt.morphemeBreakdown.map((row) => ({ ...row })));
	// svelte-ignore state_referenced_locally
	let usesHandles = $state<string[]>([...prompt.usesHandles]);
	// svelte-ignore state_referenced_locally
	let primaryHandleKey = $state(prompt.primaryHandleKey);

	let busy = $state('');
	let errorMessage = $state('');
	let savedFlash = $state(false);
	let verifyResult = $state<{
		verified: boolean;
		similarity?: number;
		message: string;
		suggestedTranslation?: string | null;
	} | null>(null);

	function toggleHandle(key: string) {
		if (!isDraft) return;
		if (usesHandles.includes(key)) {
			usesHandles = usesHandles.filter((k) => k !== key);
			if (primaryHandleKey === key) primaryHandleKey = usesHandles[0] ?? '';
		} else {
			usesHandles = [...usesHandles, key];
			if (!primaryHandleKey) primaryHandleKey = key;
		}
	}

	function addMorpheme() {
		morphemes = [...morphemes, { morpheme: '', gloss: '', role: '' }];
	}

	function removeMorpheme(rowIndex: number) {
		morphemes = morphemes.filter((_, i) => i !== rowIndex);
	}

	async function run(name: string, fn: () => Promise<void>) {
		if (busy) return;
		busy = name;
		errorMessage = '';
		try {
			await fn();
		} catch (error) {
			errorMessage = error instanceof Error ? error.message : String(error);
		} finally {
			busy = '';
		}
	}

	function save() {
		return run('save', async () => {
			await client.mutation(api.courseAuthoring.updatePrompt, {
				promptId: prompt._id,
				english: english.trim(),
				translation: translation.trim(),
				...(phonetic.trim() ? { phonetic: phonetic.trim() } : {}),
				morphemeBreakdown: morphemes,
				usesHandles,
				primaryHandleKey
			});
			savedFlash = true;
			setTimeout(() => (savedFlash = false), 2000);
		});
	}

	function verify() {
		return run('verify', async () => {
			verifyResult = null;
			verifyResult = await client.action(api.translateNode.verifyTranslation, {
				english: english.trim(),
				userTranslation: translation.trim(),
				targetLanguage: languageCode
			});
		});
	}

	function approve() {
		return run('approve', async () => {
			await client.mutation(api.courseAuthoring.approvePrompt, { promptId: prompt._id });
		});
	}

	function retire() {
		return run('retire', async () => {
			await client.mutation(api.courseAuthoring.retirePrompt, { promptId: prompt._id });
		});
	}

	function clone() {
		return run('clone', async () => {
			await client.mutation(api.courseAuthoring.clonePromptForEdit, { promptId: prompt._id });
		});
	}
</script>

<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
	<Card.Header>
		<div class="flex flex-wrap items-center justify-between gap-2">
			<Card.Title class="flex items-center gap-3">
				<span class="meta-text">{prompt.index + 1}.</span>
				<span class="target-phrase">{translation}</span>
			</Card.Title>
			<div class="flex items-center gap-2">
				<Badge variant="outline">
					{prompt.hasExemplar ? m.curriculum_exemplar_yes() : m.curriculum_exemplar_no()}
				</Badge>
				<Badge variant={prompt.status === 'approved' ? 'default' : 'outline'}>
					{prompt.status === 'approved'
						? m.curriculum_status_approved()
						: m.curriculum_status_draft()}
				</Badge>
			</div>
		</div>
		{#if !isDraft}
			<Card.Description>{m.curriculum_immutable_hint()}</Card.Description>
		{/if}
	</Card.Header>
	<Card.Content class="space-y-4">
		{#if isDraft}
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="space-y-2">
					<Label for={`english-${prompt._id}`}>{m.curriculum_prompt_english()}</Label>
					<Input id={`english-${prompt._id}`} bind:value={english} />
				</div>
				<div class="space-y-2">
					<Label for={`translation-${prompt._id}`}>{m.curriculum_prompt_translation()}</Label>
					<Input id={`translation-${prompt._id}`} bind:value={translation} />
				</div>
			</div>
			<div class="space-y-2">
				<Label for={`phonetic-${prompt._id}`}>{m.curriculum_prompt_phonetic()}</Label>
				<Input id={`phonetic-${prompt._id}`} bind:value={phonetic} />
			</div>

			<div class="space-y-2">
				<p class="info-kicker">{m.curriculum_morphemes_title()}</p>
				{#each morphemes as row, rowIndex (rowIndex)}
					<div class="flex flex-wrap items-center gap-2">
						<Input
							class="min-w-24 flex-1"
							bind:value={row.morpheme}
							placeholder={m.curriculum_morpheme_label()}
						/>
						<Input
							class="min-w-24 flex-1"
							bind:value={row.gloss}
							placeholder={m.curriculum_gloss_label()}
						/>
						<Input
							class="min-w-24 flex-1"
							bind:value={row.role}
							placeholder={m.curriculum_role_label()}
						/>
						<Button variant="ghost" size="sm" onclick={() => removeMorpheme(rowIndex)}>
							{m.curriculum_remove_row()}
						</Button>
					</div>
				{/each}
				<Button variant="outline" size="sm" onclick={addMorpheme}>
					{m.curriculum_add_row()}
				</Button>
			</div>

			<div class="space-y-2">
				<p class="info-kicker">{m.curriculum_uses_handles()}</p>
				<div class="flex flex-wrap gap-2">
					{#each handles as handle (handle.key)}
						<button
							type="button"
							class="border px-2.5 py-1 text-xs font-medium {usesHandles.includes(handle.key)
								? 'border-primary bg-primary text-primary-foreground'
								: 'border-border/60 text-muted-foreground'}"
							title={handle.gloss}
							onclick={() => toggleHandle(handle.key)}
						>
							{handle.label}
						</button>
					{/each}
				</div>
			</div>

			<div class="space-y-2">
				<Label for={`primary-${prompt._id}`}>{m.curriculum_primary_handle()}</Label>
				<select
					id={`primary-${prompt._id}`}
					bind:value={primaryHandleKey}
					class="w-full border border-input bg-background px-3 py-2.5 text-base"
				>
					{#each usesHandles as key (key)}
						<option value={key}>{handles.find((h) => h.key === key)?.label ?? key}</option>
					{/each}
				</select>
			</div>
		{:else}
			<div class="space-y-1">
				<p class="text-sm">{prompt.english}</p>
				{#if prompt.phonetic}
					<p class="meta-text">{prompt.phonetic}</p>
				{/if}
				{#if prompt.morphemeBreakdown.length > 0}
					<p class="meta-text">
						{prompt.morphemeBreakdown.map((row) => `${row.morpheme} (${row.gloss})`).join(' · ')}
					</p>
				{/if}
				<div class="flex flex-wrap gap-2 pt-1">
					{#each prompt.usesHandles as key (key)}
						<Badge variant={key === prompt.primaryHandleKey ? 'default' : 'outline'}>
							{handles.find((h) => h.key === key)?.label ?? key}
						</Badge>
					{/each}
				</div>
			</div>
		{/if}

		{#if verifyResult}
			<p class="text-sm {verifyResult.verified ? '' : 'text-destructive'}">
				{#if verifyResult.similarity !== undefined}
					{m.curriculum_similarity({ similarity: verifyResult.similarity })} —
				{/if}
				{verifyResult.message}
			</p>
		{/if}
		{#if errorMessage}
			<p class="text-sm text-destructive">{errorMessage}</p>
		{/if}

		<div class="flex flex-wrap gap-2">
			{#if isDraft}
				<Button size="sm" onclick={save} disabled={!!busy}>
					{busy === 'save' ? m.btn_saving() : savedFlash ? m.btn_saved() : m.curriculum_save_prompt()}
				</Button>
				<Button size="sm" variant="outline" onclick={approve} disabled={!!busy}>
					{m.curriculum_approve_btn()}
				</Button>
			{:else}
				<Button size="sm" variant="outline" onclick={clone} disabled={!!busy}>
					{m.curriculum_clone_btn()}
				</Button>
			{/if}
			<Button size="sm" variant="outline" onclick={verify} disabled={!!busy}>
				{busy === 'verify' ? m.curriculum_verifying() : m.curriculum_verify_btn()}
			</Button>
			<Button size="sm" variant="destructive" onclick={retire} disabled={!!busy}>
				{m.curriculum_retire_btn()}
			</Button>
		</div>
	</Card.Content>
</Card.Root>
