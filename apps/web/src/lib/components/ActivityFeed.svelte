<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import * as Card from '@babylon/ui/card';
	import { Smile, BarChart3, Vote, Heart, Trophy } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { formatRelativeTime } from '$lib/format';

	const activityFeed = useQuery(api.testActivityFeed.getActivityFeed, {});

	type FilterType = 'all' | 'emoji' | 'poll' | 'reaction' | 'achievement';

	const tabs: { id: FilterType; label: () => string }[] = [
		{ id: 'all', label: () => m.test_filter_all() },
		{ id: 'emoji', label: () => m.test_filter_emojis() },
		{ id: 'poll', label: () => m.test_filter_polls() },
		{ id: 'reaction', label: () => m.test_filter_reactions() },
		{ id: 'achievement', label: () => m.test_filter_achievements() },
	];

	let selectedFilter = $state<FilterType>('all');

	type FeedEvent = NonNullable<typeof activityFeed.data>[number];

	let filtered = $derived.by(() => {
		const data = activityFeed.data;
		if (!data) return [];
		if (selectedFilter === 'all') return data;
		return data.filter((e) => {
			if (selectedFilter === 'emoji') return e.type === 'emoji' || e.type === 'vote';
			return e.type === selectedFilter;
		});
	});

	function getEventIcon(eventType: string) {
		switch (eventType) {
			case 'emoji': return Smile;
			case 'poll': return BarChart3;
			case 'vote': return Vote;
			case 'reaction': return Heart;
			case 'achievement': return Trophy;
			default: return Smile;
		}
	}

	function getEventDescription(event: FeedEvent): string {
		switch (event.type) {
			case 'emoji':
				return `${event.data.emoji} ${m.test_emoji_submitted()} (${event.data.mood})`;
			case 'poll':
				return `${m.test_new_poll()}: ${event.data.question}`;
			case 'vote':
				return `${m.test_vote_cast()}`;
			case 'reaction':
				return `${event.data.emoji} ${m.test_reaction_on()}`;
			case 'achievement':
				return `${m.test_achievement_unlocked()}: ${event.data.title}`;
			default:
				return 'Unknown activity';
		}
	}
</script>

<section class="p-4">
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.test_activity_feed_title()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="mb-3 flex gap-1 flex-wrap" role="tablist">
				{#each tabs as tab (tab.id)}
					<button
						role="tab"
						aria-selected={selectedFilter === tab.id}
						class="px-3 py-1 text-xs rounded-full border transition-colors {selectedFilter === tab.id
							? 'bg-gray-900 text-white border-gray-900'
							: 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}"
						onclick={() => (selectedFilter = tab.id)}
					>
						{tab.label()}
					</button>
				{/each}
			</div>

			{#if activityFeed.isLoading}
				<div class="text-sm text-gray-500">Loading activity...</div>
			{:else if filtered.length === 0}
				<div class="text-sm text-gray-500">{m.test_empty_filtered()}</div>
			{:else}
				<div class="max-h-96 overflow-y-auto space-y-3">
					{#each filtered as event (event.timestamp)}
						{@const Icon = getEventIcon(event.type)}
						<div class="flex items-center gap-3 p-2 border-b border-gray-100 last:border-b-0">
							<div class="flex-shrink-0">
								<Icon class="w-5 h-5 text-gray-600" />
							</div>
							<div class="flex-1 min-w-0">
								<div class="text-sm text-gray-900 truncate">
									{getEventDescription(event)}
								</div>
								<div class="text-xs text-gray-500">
									{formatRelativeTime(event.timestamp)}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</section>
