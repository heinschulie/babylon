<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '@babylon/ui/button';
	import * as Card from '@babylon/ui/card';
	import type { Id } from '@babylon/convex';
	import * as m from '$lib/paraglide/messages.js';

	type UnitState = {
		_id: Id<'units'>;
		index: number;
		title: string;
		state: 'completed' | 'available' | 'locked';
	};

	let {
		courseTitle,
		units,
		continueUnitId,
		ownedCount,
		introducedCount,
		totalHandles,
		recentHandles,
		phraseCount,
		starting,
		onStartFreePractice
	}: {
		courseTitle: string;
		units: UnitState[];
		continueUnitId: Id<'units'> | null;
		ownedCount: number;
		introducedCount: number;
		totalHandles: number;
		recentHandles: Array<{ key: string; label: string; gloss: string; status: string | null }>;
		phraseCount: number;
		starting: boolean;
		onStartFreePractice: () => void;
	} = $props();

	const continueUnit = $derived(units.find((unit) => unit._id === continueUnitId) ?? null);
	const completedCount = $derived(units.filter((unit) => unit.state === 'completed').length);
</script>

<div class="page-shell page-shell--narrow page-stack">
	<header class="page-stack">
		<div>
			<p class="info-kicker">{m.course_home_kicker()}</p>
			<h1 class="text-5xl sm:text-6xl">{courseTitle}</h1>
		</div>

		<!-- Capability inventory: what you can build, not how many days you showed up. -->
		<div class="streak-display">
			<span class="streak-display__number">{ownedCount}</span>
			<span class="streak-display__days">{m.course_home_handles_owned()}</span>
			<span class="streak-display__label">
				{m.course_home_handles_detail({ introduced: introducedCount, total: totalHandles })}
			</span>
		</div>

		<Card.Root class="border border-border/60 bg-card">
			<Card.Content>
				<div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
					<div class="space-y-2">
						<p class="info-kicker">
							{continueUnit
								? m.course_unit_n({ index: continueUnit.index })
								: m.course_home_kicker()}
						</p>
						<p class="text-xl font-semibold">
							{continueUnit ? continueUnit.title : m.course_home_all_done({ count: completedCount })}
						</p>
						<p class="meta-text">{m.course_home_tip()}</p>
					</div>
					{#if continueUnit}
						<Button href={resolve(`/course/unit/${continueUnit._id}`)} size="lg" class="w-full sm:w-auto">
							{m.course_continue()}
						</Button>
					{:else}
						<Button href={resolve('/course')} size="lg" class="w-full sm:w-auto">
							{m.course_back_to_map()}
						</Button>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>
	</header>

	{#if recentHandles.length > 0}
		<div>
			<p class="info-kicker mb-2">{m.course_capabilities_title()}</p>
			<div class="flex flex-wrap gap-2">
				{#each recentHandles as handle (handle.key)}
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
			<a href={resolve('/course')} class="meta-text underline mt-2 inline-block">
				{m.course_home_view_map()}
			</a>
		</div>
	{/if}

	<Card.Root class="border border-border/60 bg-card">
		<Card.Content>
			<div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
				<div class="space-y-2">
					<p class="info-kicker">{m.course_home_free_practice_kicker()}</p>
					<p class="text-xl font-semibold">{m.practice_ready({ count: phraseCount })}</p>
					<p class="meta-text">{m.course_home_free_practice_desc()}</p>
				</div>
				<Button
					onclick={onStartFreePractice}
					disabled={starting || phraseCount === 0}
					variant="outline"
					size="lg"
					class="w-full sm:w-auto"
				>
					{starting ? m.practice_starting() : m.practice_start()}
				</Button>
			</div>
		</Card.Content>
	</Card.Root>

	<div class="grid gap-3 sm:grid-cols-2">
		<a
			href={resolve('/library')}
			class="border border-border/60 bg-background/70 p-4 transition-colors hover:bg-background/90"
		>
			<p class="info-kicker">{m.nav_library()}</p>
			<p class="meta-text">{m.course_home_library_desc()}</p>
		</a>
		<a
			href={resolve('/vocabulary')}
			class="border border-border/60 bg-background/70 p-4 transition-colors hover:bg-background/90"
		>
			<p class="info-kicker">{m.practice_vocab_kicker()}</p>
			<p class="meta-text">{m.practice_vocab_desc()}</p>
		</a>
	</div>
</div>
