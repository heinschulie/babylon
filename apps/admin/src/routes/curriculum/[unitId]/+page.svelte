<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import * as Card from '@babylon/ui/card';
	import { Button } from '@babylon/ui/button';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';
	import { Badge } from '@babylon/ui';
	import PromptCard from '$lib/components/PromptCard.svelte';
	import * as m from '$lib/paraglide/messages.js';

	const client = useConvexClient();

	const adminState = useQuery(api.admin.getMyAdminState, () => ($isAuthenticated ? {} : 'skip'));
	const isAdmin = $derived(adminState.data?.isAdmin ?? false);

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});

	const unitId = $derived(page.params.unitId as Id<'units'>);

	const unitData = useQuery(api.courseAuthoring.getUnitForEditing, () =>
		isAdmin && unitId ? { unitId } : 'skip'
	);
	const courseDetail = useQuery(api.courseAuthoring.getCourseForEditing, () => {
		const courseId = unitData.data?.unit.courseId;
		return isAdmin && courseId ? { courseId } : 'skip';
	});
	const languageCode = $derived(courseDetail.data?.course.languageCode ?? '');

	// Editable unit fields, seeded once per unit.
	let title = $state('');
	let introBody = $state('');
	let seededUnitId = $state<string | null>(null);
	$effect(() => {
		const unit = unitData.data?.unit;
		if (unit && seededUnitId !== unit._id) {
			seededUnitId = unit._id;
			title = unit.title;
			introBody = unit.introBody;
		}
	});

	const unitHandles = $derived.by(() => {
		const data = unitData.data;
		if (!data) return [];
		return data.unit.handleKeys.map(
			(key) => data.handles.find((h) => h.key === key) ?? { key, label: key, gloss: '' }
		);
	});

	let saving = $state(false);
	let savedFlash = $state(false);
	let saveError = $state('');

	async function saveUnit() {
		if (saving) return;
		saving = true;
		saveError = '';
		try {
			await client.mutation(api.courseAuthoring.updateUnit, {
				unitId,
				title: title.trim(),
				introBody
			});
			savedFlash = true;
			setTimeout(() => (savedFlash = false), 2000);
		} catch (error) {
			saveError = error instanceof Error ? error.message : String(error);
		} finally {
			saving = false;
		}
	}

	let publishing = $state(false);
	let publishError = $state('');

	async function publishUnit() {
		if (publishing) return;
		publishing = true;
		publishError = '';
		try {
			await client.mutation(api.courseAuthoring.publishUnit, { unitId });
		} catch (error) {
			publishError = error instanceof Error ? error.message : String(error);
		} finally {
			publishing = false;
		}
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	{#if adminState.isLoading || $isLoading}
		<p class="meta-text">{m.state_loading()}</p>
	{:else if !isAdmin}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.admin_not_admin_title()}</Card.Title>
				<Card.Description>{m.admin_not_admin_body()}</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if unitData.isLoading}
		<p class="meta-text">{m.state_loading()}</p>
	{:else if !unitData.data}
		<p class="meta-text">{m.curriculum_unit_not_found()}</p>
		<a href={resolve('/curriculum')} class="text-sm underline">{m.curriculum_back()}</a>
	{:else}
		{@const unit = unitData.data.unit}
		<header class="page-stack">
			<div>
				<a href={resolve('/curriculum')} class="meta-text underline">{m.curriculum_back()}</a>
				<p class="info-kicker mt-3">{m.curriculum_unit_kicker({ index: unit.index })}</p>
				<div class="flex flex-wrap items-center gap-3">
					<h1 class="text-4xl sm:text-5xl">{title || unit.title}</h1>
					<Badge variant={unit.status === 'published' ? 'default' : 'outline'}>
						{unit.status === 'published'
							? m.curriculum_status_published()
							: m.curriculum_status_draft()}
					</Badge>
				</div>
			</div>
		</header>

		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Content class="space-y-4">
				<div class="space-y-2">
					<Label for="unit-title">{m.curriculum_unit_title_label()}</Label>
					<Input id="unit-title" bind:value={title} />
				</div>
				<div class="space-y-2">
					<Label for="unit-intro">{m.curriculum_unit_intro_label()}</Label>
					<textarea
						id="unit-intro"
						bind:value={introBody}
						rows="8"
						class="w-full border border-input bg-background px-3 py-2.5 text-base"
					></textarea>
				</div>
				{#if introBody}
					<div class="space-y-2">
						<p class="info-kicker">{m.curriculum_intro_preview()}</p>
						<p class="text-sm whitespace-pre-wrap">{introBody}</p>
					</div>
				{/if}
				{#if saveError}
					<p class="text-sm text-destructive">{saveError}</p>
				{/if}
				<div class="flex flex-wrap items-center gap-3">
					<Button onclick={saveUnit} disabled={saving}>
						{saving ? m.btn_saving() : savedFlash ? m.btn_saved() : m.curriculum_save_unit()}
					</Button>
					<Button
						variant="outline"
						onclick={publishUnit}
						disabled={publishing || unit.status === 'published'}
					>
						{publishing ? m.curriculum_publishing() : m.curriculum_publish_unit()}
					</Button>
				</div>
				{#if publishError}
					<p class="text-sm text-destructive">{publishError}</p>
				{/if}
			</Card.Content>
		</Card.Root>

		{#if unitHandles.length > 0}
			<div class="space-y-2">
				<p class="info-kicker">{m.curriculum_handles_title()}</p>
				<div class="flex flex-wrap gap-2">
					{#each unitHandles as handle (handle.key)}
						<span
							class="inline-flex flex-col border border-border/60 px-2.5 py-1.5"
							title={handle.gloss}
						>
							<span class="text-sm font-medium">{handle.label}</span>
							{#if handle.gloss}
								<span class="meta-text">{handle.gloss}</span>
							{/if}
						</span>
					{/each}
				</div>
			</div>
		{/if}

		<div class="space-y-4">
			<p class="info-kicker">{m.curriculum_prompts_title()}</p>
			{#each unitData.data.prompts as prompt (prompt._id)}
				<PromptCard {prompt} handles={unitData.data.handles} {languageCode} />
			{/each}
		</div>
	{/if}
</div>
