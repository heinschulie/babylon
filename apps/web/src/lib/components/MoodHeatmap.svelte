<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import * as m from '$lib/paraglide/messages.js';

	// Fetch heatmap data
	const heatmapData = useQuery(api.testMoodHeatmap.getWeekHeatmap, {});

	type Mood = 'chill' | 'angry' | 'happy';
	const moods: Mood[] = ['chill', 'angry', 'happy'];

	// Color mapping (same as test page)
	const moodColors = {
		chill: 'bg-blue-500',
		angry: 'bg-red-500',
		happy: 'bg-green-500'
	} as const;

	// Generate last 7 days for grid columns
	const weekDates = $derived.by(() => {
		const dates = [];
		const today = new Date();
		for (let i = 6; i >= 0; i--) {
			const date = new Date(today);
			date.setDate(today.getDate() - i);
			dates.push(date.toISOString().slice(0, 10));
		}
		return dates;
	});

	// Transform data into a map for easy lookup
	const dataMap = $derived.by(() => {
		if (!heatmapData.data) return new Map<string, number>();
		const map = new Map<string, number>();
		for (const entry of heatmapData.data) {
			const key = `${entry.date}-${entry.mood}`;
			map.set(key, entry.count);
		}
		return map;
	});

	// Get count for specific date+mood combination
	function getCount(date: string, mood: Mood): number {
		return dataMap.get(`${date}-${mood}`) ?? 0;
	}

	// Calculate opacity based on count (0-1 scale)
	function getOpacity(count: number): number {
		if (count === 0) return 0;
		// Scale: count 1 = 0.3, higher counts = higher opacity, max 1.0
		return Math.min(0.3 + (count - 1) * 0.2, 1.0);
	}
</script>

<section class="p-4">
	<h2 class="text-xl font-semibold mb-4">{m.test_mood_heatmap_title()}</h2>

	{#if heatmapData.isLoading}
		<div>Loading heatmap...</div>
	{:else if !heatmapData.data || heatmapData.data.length === 0}
		<p class="text-gray-600">{m.test_mood_heatmap_empty()}</p>
	{:else}
		<!-- Heatmap grid: 7 columns (days) x 3 rows (moods) -->
		<div class="grid grid-cols-7 gap-1">
			{#each moods as mood (mood)}
				{#each weekDates as date (date)}
					{@const count = getCount(date, mood)}
					{@const opacity = getOpacity(count)}
					<div
						class="w-8 h-8 rounded border border-gray-200 {moodColors[mood]}"
						style="opacity: {opacity}"
						title="{date} - {mood}: {count}"
					>
					</div>
				{/each}
			{/each}
		</div>

		<!-- Legend -->
		<div class="mt-4 flex gap-4 text-sm">
			{#each moods as mood (mood)}
				<div class="flex items-center gap-1">
					<div class="w-4 h-4 rounded {moodColors[mood]}"></div>
					<span>{mood}</span>
				</div>
			{/each}
		</div>
	{/if}
</section>