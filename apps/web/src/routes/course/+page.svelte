<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import * as Card from '@babylon/ui/card';
	import { COURSE_LANGUAGE_CODE } from '$lib/course/language';
	import * as m from '$lib/paraglide/messages.js';

	const courseState = useQuery(api.courses.getMyCourseState, {
		languageCode: COURSE_LANGUAGE_CODE
	});
	const capabilities = useQuery(api.courses.getMyCapabilities, {
		languageCode: COURSE_LANGUAGE_CODE
	});

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header>
		<a href={resolve('/')} class="meta-text underline">&larr; {m.session_back()}</a>
		<p class="info-kicker mt-3">{m.course_kicker()}</p>
		<h1 class="text-5xl sm:text-6xl">{courseState.data?.course.title ?? m.course_title()}</h1>
		{#if capabilities.data}
			<p class="meta-text mt-2">
				{m.course_handles_progress({
					owned: capabilities.data.ownedCount,
					total: capabilities.data.totalHandles
				})}
			</p>
		{/if}
	</header>

	{#if courseState.isLoading}
		<p class="meta-text">{m.state_loading()}</p>
	{:else if !courseState.data}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.course_none_title()}</Card.Title>
				<Card.Description>{m.course_none_body()}</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else}
		<ul class="space-y-3">
			{#each courseState.data.units as unit (unit._id)}
				<li>
					{#if unit.state === 'locked'}
						<div class="flex items-center justify-between border border-border/40 bg-background/40 p-4 opacity-60">
							<div>
								<p class="info-kicker">{m.course_unit_n({ index: unit.index })}</p>
								<p class="font-semibold">{unit.title}</p>
							</div>
							<span class="meta-text">{m.course_locked()}</span>
						</div>
					{:else}
						<a
							href={resolve(`/course/unit/${unit._id}`)}
							class="flex items-center justify-between border border-border/60 bg-background/70 p-4 transition-colors hover:bg-background/90"
						>
							<div>
								<p class="info-kicker">{m.course_unit_n({ index: unit.index })}</p>
								<p class="font-semibold">{unit.title}</p>
							</div>
							<span class="meta-text">
								{unit.state === 'completed' ? m.course_completed() : m.course_continue()}
							</span>
						</a>
					{/if}
				</li>
			{/each}
		</ul>

		{#if capabilities.data && capabilities.data.handles.some((h) => h.status)}
			<div>
				<p class="info-kicker mb-2">{m.course_capabilities_title()}</p>
				<div class="flex flex-wrap gap-2">
					{#each capabilities.data.handles.filter((h) => h.status) as handle (handle.key)}
						<span
							class="border px-3 py-1.5 text-sm {handle.status === 'owned'
								? 'border-primary bg-primary/10 font-semibold'
								: 'border-border/60 bg-background/70'}"
							title={handle.gloss}
						>
							{handle.label}
						</span>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</div>
