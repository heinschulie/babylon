<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api, type Id } from '@babylon/convex';
	import { isAuthenticated, isLoading } from '@babylon/shared/stores/auth';
	import * as Card from '@babylon/ui/card';
	import { Button } from '@babylon/ui/button';
	import { Input } from '@babylon/ui/input';
	import { Label } from '@babylon/ui/label';
	import { Badge } from '@babylon/ui';
	import * as m from '$lib/paraglide/messages.js';

	const client = useConvexClient();

	const adminState = useQuery(api.admin.getMyAdminState, () => ($isAuthenticated ? {} : 'skip'));
	const isAdmin = $derived(adminState.data?.isAdmin ?? false);

	$effect(() => {
		if (!$isLoading && !$isAuthenticated) goto(resolve('/login'));
	});

	const courses = useQuery(api.courseAuthoring.listCourses, () => (isAdmin ? {} : 'skip'));
	const languages = useQuery(api.verifierAccess.listSupportedLanguages, () =>
		isAdmin ? {} : 'skip'
	);

	let selectedCourseId = $state<Id<'courses'> | null>(null);
	$effect(() => {
		if (!selectedCourseId && courses.data && courses.data.length > 0) {
			selectedCourseId = courses.data[0]._id;
		}
	});

	const courseDetail = useQuery(api.courseAuthoring.getCourseForEditing, () =>
		isAdmin && selectedCourseId ? { courseId: selectedCourseId } : 'skip'
	);

	// — create course —
	let newLanguageCode = $state('');
	let newTitle = $state('');
	let creating = $state(false);
	let createError = $state('');
	$effect(() => {
		if (!newLanguageCode && languages.data && languages.data.length > 0) {
			newLanguageCode = languages.data[0].code;
		}
	});

	async function createCourse() {
		if (!newTitle.trim() || !newLanguageCode || creating) return;
		creating = true;
		createError = '';
		try {
			const courseId = await client.mutation(api.courseAuthoring.createCourse, {
				languageCode: newLanguageCode,
				title: newTitle.trim()
			});
			newTitle = '';
			selectedCourseId = courseId;
		} catch (error) {
			createError = error instanceof Error ? error.message : String(error);
		} finally {
			creating = false;
		}
	}

	// — draft next unit —
	let guidance = $state('');
	let drafting = $state(false);
	let draftError = $state('');

	async function draftNextUnit() {
		if (!selectedCourseId || drafting) return;
		drafting = true;
		draftError = '';
		try {
			const { unitId } = await client.action(api.courseDrafting.draftNextUnit, {
				courseId: selectedCourseId,
				...(guidance.trim() ? { guidance: guidance.trim() } : {})
			});
			guidance = '';
			goto(resolve(`/curriculum/${unitId}`));
		} catch (error) {
			draftError = error instanceof Error ? error.message : String(error);
		} finally {
			drafting = false;
		}
	}

	// — publish course —
	let publishing = $state(false);
	let publishError = $state('');
	const hasPublishedUnit = $derived(
		(courseDetail.data?.units ?? []).some((u) => u.status === 'published')
	);

	async function publishCourse() {
		if (!selectedCourseId || publishing) return;
		publishing = true;
		publishError = '';
		try {
			await client.mutation(api.courseAuthoring.publishCourse, {
				courseId: selectedCourseId
			});
		} catch (error) {
			publishError = error instanceof Error ? error.message : String(error);
		} finally {
			publishing = false;
		}
	}

	function statusLabel(status: string) {
		return status === 'published' ? m.curriculum_status_published() : m.curriculum_status_draft();
	}
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header>
		<p class="info-kicker">{m.curriculum_kicker()}</p>
		<h1 class="text-5xl sm:text-6xl">{m.admin_curriculum_title()}</h1>
		<p class="meta-text mt-3 max-w-2xl">{m.admin_curriculum_desc()}</p>
	</header>

	{#if adminState.isLoading || $isLoading}
		<p class="meta-text">{m.state_loading()}</p>
	{:else if !isAdmin}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.admin_not_admin_title()}</Card.Title>
				<Card.Description>{m.admin_not_admin_body()}</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if courses.isLoading}
		<p class="meta-text">{m.state_loading()}</p>
	{:else if (courses.data ?? []).length === 0}
		<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
			<Card.Header>
				<Card.Title>{m.curriculum_create_title()}</Card.Title>
				<Card.Description>{m.curriculum_create_desc()}</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<p class="meta-text">{m.curriculum_courses_none()}</p>
				<div class="space-y-2">
					<Label for="course-language">{m.curriculum_language_label()}</Label>
					<select
						id="course-language"
						bind:value={newLanguageCode}
						class="w-full border border-input bg-background px-3 py-2.5 text-base"
					>
						{#each languages.data ?? [] as language (language.code)}
							<option value={language.code}>{language.displayName}</option>
						{/each}
					</select>
				</div>
				<div class="space-y-2">
					<Label for="course-title">{m.curriculum_title_label()}</Label>
					<Input
						id="course-title"
						bind:value={newTitle}
						placeholder={m.curriculum_title_placeholder()}
					/>
				</div>
				{#if createError}
					<p class="text-sm text-destructive">{createError}</p>
				{/if}
				<Button onclick={createCourse} disabled={creating || !newTitle.trim()}>
					{creating ? m.curriculum_creating() : m.curriculum_create_btn()}
				</Button>
			</Card.Content>
		</Card.Root>
	{:else}
		{#each courses.data ?? [] as course (course._id)}
			<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
				<Card.Header>
					<div class="flex flex-wrap items-center justify-between gap-2">
						<Card.Title>{course.title}</Card.Title>
						<Badge variant={course.status === 'published' ? 'default' : 'outline'}>
							{statusLabel(course.status)}
						</Badge>
					</div>
					<Card.Description>
						{course.languageCode} · {course.publishedUnitCount}/{course.unitCount}
					</Card.Description>
				</Card.Header>
				<Card.Content class="space-y-6">
					{#if selectedCourseId !== course._id}
						<Button variant="outline" onclick={() => (selectedCourseId = course._id)}>
							{m.curriculum_units_title()}
						</Button>
					{:else}
						<div class="space-y-3">
							<p class="info-kicker">{m.curriculum_units_title()}</p>
							{#if courseDetail.isLoading}
								<p class="meta-text">{m.state_loading()}</p>
							{:else if (courseDetail.data?.units ?? []).length === 0}
								<p class="meta-text">{m.curriculum_units_none()}</p>
							{:else}
								<ul class="space-y-2">
									{#each courseDetail.data?.units ?? [] as unit (unit._id)}
										<li>
											<a
												href={resolve(`/curriculum/${unit._id}`)}
												class="flex flex-wrap items-center justify-between gap-2 border border-border/60 px-3 py-2.5 hover:bg-muted/40"
											>
												<span class="flex items-center gap-3">
													<span class="meta-text">{unit.index}.</span>
													<span>{unit.title}</span>
												</span>
												<span class="flex items-center gap-2">
													<span class="meta-text">
														{m.curriculum_approved_count({
															approved: unit.approvedCount,
															total: unit.promptCount
														})}
													</span>
													<Badge variant={unit.status === 'published' ? 'default' : 'outline'}>
														{statusLabel(unit.status)}
													</Badge>
												</span>
											</a>
										</li>
									{/each}
								</ul>
							{/if}
						</div>

						<div class="space-y-2">
							<Label for="draft-guidance">{m.curriculum_guidance_label()}</Label>
							<textarea
								id="draft-guidance"
								bind:value={guidance}
								rows="2"
								placeholder={m.curriculum_guidance_placeholder()}
								class="w-full border border-input bg-background px-3 py-2.5 text-base"
							></textarea>
							{#if draftError}
								<p class="text-sm text-destructive">{draftError}</p>
							{/if}
							<div class="flex flex-wrap items-center gap-3">
								<Button onclick={draftNextUnit} disabled={drafting}>
									{drafting ? m.curriculum_drafting() : m.curriculum_draft_next()}
								</Button>
								<Button
									variant="outline"
									onclick={publishCourse}
									disabled={publishing || !hasPublishedUnit || course.status === 'published'}
								>
									{publishing ? m.curriculum_publishing() : m.curriculum_publish_course()}
								</Button>
								{#if !hasPublishedUnit}
									<span class="meta-text">{m.curriculum_publish_course_hint()}</span>
								{/if}
							</div>
							{#if publishError}
								<p class="text-sm text-destructive">{publishError}</p>
							{/if}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		{/each}
	{/if}
</div>
