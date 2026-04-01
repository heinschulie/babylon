<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import * as Card from '@babylon/ui/card';
	import { Smile, BarChart3, Vote, Heart, Trophy } from '@lucide/svelte';
	import type { Component } from 'svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { formatRelativeTime } from '$lib/format';

	const activityFeed = useQuery(api.testActivityFeed.getActivityFeed, {});

	type FeedEvent = NonNullable<typeof activityFeed.data>[number];
	type EventType = FeedEvent['type'];
	type FilterType = 'all' | 'emoji' | 'poll' | 'reaction' | 'achievement';

	/** Central registry: add a new event type here and everything (icon, description, filtering) just works. */
	const EVENT_TYPE_CONFIG: Record<EventType, {
		icon: Component;
		describe: (e: FeedEvent) => string;
		filterGroup: FilterType;
	}> = {
		emoji: {
			icon: Smile,
			describe: (e) => `${e.data.emoji} ${m.test_emoji_submitted()} (${e.data.mood})`,
			filterGroup: 'emoji',
		},
		vote: {
			icon: Vote,
			describe: () => `${m.test_vote_cast()}`,
			filterGroup: 'emoji',
		},
		poll: {
			icon: BarChart3,
			describe: (e) => `${m.test_new_poll()}: ${e.data.question}`,
			filterGroup: 'poll',
		},
		reaction: {
			icon: Heart,
			describe: (e) => `${e.data.emoji} ${m.test_reaction_on()}`,
			filterGroup: 'reaction',
		},
		achievement: {
			icon: Trophy,
			describe: (e) => `${m.test_achievement_unlocked()}: ${e.data.title}`,
			filterGroup: 'achievement',
		},
	};

	const tabs: { id: FilterType; label: () => string }[] = [
		{ id: 'all', label: () => m.test_filter_all() },
		{ id: 'emoji', label: () => m.test_filter_emojis() },
		{ id: 'poll', label: () => m.test_filter_polls() },
		{ id: 'reaction', label: () => m.test_filter_reactions() },
		{ id: 'achievement', label: () => m.test_filter_achievements() },
	];

	let selectedFilter = $state<FilterType>('all');

	let filtered = $derived.by(() => {
		const data = activityFeed.data;
		if (!data) return [];
		if (selectedFilter === 'all') return data;
		return data.filter((e) => EVENT_TYPE_CONFIG[e.type].filterGroup === selectedFilter);
	});

	function getEventIcon(eventType: EventType) {
		return EVENT_TYPE_CONFIG[eventType]?.icon ?? Smile;
	}

	function getEventDescription(event: FeedEvent): string {
		return EVENT_TYPE_CONFIG[event.type]?.describe(event) ?? 'Unknown activity';
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
					{#each filtered as event, i (`${event.timestamp}_${event.type}_${i}`)}
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
