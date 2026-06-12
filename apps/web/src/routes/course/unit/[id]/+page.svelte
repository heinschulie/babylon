<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import { Button } from '@babylon/ui/button';
	import * as Card from '@babylon/ui/card';
	import CoursePromptCycle from '$lib/course/CoursePromptCycle.svelte';
	import * as m from '$lib/paraglide/messages.js';

	const client = useConvexClient();
	const unitId = $derived(page.params.id as Id<'units'>);
	const unitData = useQuery(api.courses.getUnit, () => ({ unitId }));

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});

	let stage = $state<'intro' | 'prompts' | 'done'>('intro');
	let promptIndex = $state(0);
	let practiceSessionId = $state<Id<'practiceSessions'> | null>(null);
	let initialized = $state(false);
	let finishing = $state(false);

	// Resume from server-side cursor once data arrives; skip intro when seen.
	$effect(() => {
		const data = unitData.data;
		if (!data || initialized) return;
		initialized = true;
		if (data.progress) {
			promptIndex = Math.min(data.progress.promptCursor, Math.max(data.prompts.length - 1, 0));
			if (data.progress.status === 'completed') {
				promptIndex = 0; // revisiting a completed unit starts fresh
			} else if (data.progress.introSeen && data.prompts.length > 0) {
				stage = 'prompts';
			}
		}
	});

	const prompts = $derived(unitData.data?.prompts ?? []);
	const currentPrompt = $derived(prompts[promptIndex] ?? null);

	async function startConstructing() {
		await client.mutation(api.courses.startUnit, { unitId, markIntroSeen: true });
		// Wrap the run in a practice session so score aggregates, history, and
		// Pro-tier human review notifications keep working.
		practiceSessionId = await client.mutation(api.practiceSessions.start, {});
		stage = 'prompts';
	}

	async function handlePromptComplete() {
		if (promptIndex + 1 < prompts.length) {
			promptIndex += 1;
			return;
		}
		finishing = true;
		try {
			await client.mutation(api.courses.completeUnit, { unitId });
			if (practiceSessionId) {
				await client.mutation(api.practiceSessions.end, { practiceSessionId });
			}
		} finally {
			finishing = false;
			stage = 'done';
		}
	}
</script>

{#if unitData.isLoading}
	<div class="page-shell page-shell--compact flex min-h-[80vh] items-center justify-center">
		<p class="meta-text">{m.state_loading()}</p>
	</div>
{:else if !unitData.data}
	<div class="page-shell page-shell--compact flex min-h-[80vh] items-center justify-center">
		<Card.Root class="w-full border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header class="text-center">
				<Card.Title>{m.course_unit_not_found()}</Card.Title>
			</Card.Header>
			<Card.Footer class="justify-center">
				<a href={resolve('/course')} class="meta-text underline">{m.course_back_to_map()}</a>
			</Card.Footer>
		</Card.Root>
	</div>
{:else}
	{@const unit = unitData.data.unit}
	<div class="page-shell page-shell--narrow page-stack">
		<header class="flex items-baseline justify-between gap-3">
			<div>
				<p class="info-kicker">{m.course_unit_n({ index: unit.index })}</p>
				<h1 class="text-4xl sm:text-5xl">{unit.title}</h1>
			</div>
			{#if stage === 'prompts'}
				<p class="meta-text whitespace-nowrap">
					{m.course_prompt_of({ position: promptIndex + 1, length: prompts.length })}
				</p>
			{/if}
		</header>

		{#if stage === 'intro'}
			<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
				<Card.Content class="page-stack">
					<div class="flex flex-wrap gap-2">
						{#each unit.handles as handle (handle.key)}
							<span class="border border-border/60 bg-background/70 px-3 py-1.5 text-sm" title={handle.gloss}>
								<span class="target-phrase font-bold">{handle.label}</span>
								<span class="meta-text ml-1">{handle.gloss}</span>
							</span>
						{/each}
					</div>
					<p class="whitespace-pre-wrap text-base leading-relaxed">{unit.introBody}</p>
					<p class="meta-text">{m.course_intro_reassurance()}</p>
				</Card.Content>
			</Card.Root>
			<Button onclick={startConstructing} size="lg" class="w-full" disabled={prompts.length === 0}>
				{m.course_start_constructing()}
			</Button>
		{:else if stage === 'prompts' && currentPrompt}
			{#key currentPrompt._id}
				<CoursePromptCycle
					prompt={currentPrompt}
					practiceSessionId={practiceSessionId ?? undefined}
					onComplete={handlePromptComplete}
				/>
			{/key}
			{#if finishing}
				<p class="meta-text text-center">{m.practice_ending()}</p>
			{/if}
		{:else if stage === 'done'}
			<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
				<Card.Header class="text-center">
					<Card.Title class="text-2xl">{m.course_unit_done_title()}</Card.Title>
					<Card.Description>{m.course_unit_done_body()}</Card.Description>
				</Card.Header>
				<Card.Footer class="justify-center gap-3">
					<Button onclick={() => goto(resolve('/course'))} size="lg">
						{m.course_back_to_map()}
					</Button>
				</Card.Footer>
			</Card.Root>
		{/if}
	</div>
{/if}
