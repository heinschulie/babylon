<script lang="ts">
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { useQuery } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import * as Card from '@babylon/ui/card';
	import { Button } from '@babylon/ui/button';
	import CoursePromptCycle from '$lib/course/CoursePromptCycle.svelte';
	import * as m from '$lib/paraglide/messages.js';

	const coursePromptId = $derived(
		(page.url.searchParams.get('prompt') as Id<'coursePrompts'> | null) ?? null
	);
	const prompt = useQuery(api.courses.getReviewPrompt, () =>
		coursePromptId ? { coursePromptId } : 'skip'
	);

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});

	let done = $state(false);
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header>
		<p class="info-kicker">{m.course_review_kicker()}</p>
		<h1 class="text-4xl sm:text-5xl">{m.course_review_title()}</h1>
	</header>

	{#if !coursePromptId || (!prompt.isLoading && !prompt.data)}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.course_review_unavailable()}</Card.Title>
			</Card.Header>
			<Card.Footer>
				<a href={resolve('/')} class="meta-text underline">{m.session_back()}</a>
			</Card.Footer>
		</Card.Root>
	{:else if prompt.isLoading}
		<p class="meta-text">{m.state_loading()}</p>
	{:else if prompt.data && !done}
		<CoursePromptCycle prompt={prompt.data} onComplete={() => (done = true)} />
	{:else if done}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header class="text-center">
				<Card.Title class="text-2xl">{m.course_review_done_title()}</Card.Title>
				<Card.Description>{m.course_review_done_body()}</Card.Description>
			</Card.Header>
			<Card.Footer class="justify-center">
				<Button onclick={() => goto(resolve('/'))} size="lg">{m.course_back_home()}</Button>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
