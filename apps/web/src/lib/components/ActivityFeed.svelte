<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import * as Card from '@babylon/ui/card';
	import { Button } from '@babylon/ui/button';
	import { Smile, BarChart3, Vote, Reply, Trophy } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { formatRelativeTime } from '$lib/format';

	type FilterType = 'all' | 'emoji' | 'poll' | 'vote' | 'reaction' | 'achievement';

	let activeFilter = $state<FilterType>('all');

	const activityFeed = useQuery(api.testActivityFeed.getActivityFeed, () => ({
		filterType: activeFilter === 'all' ? undefined : activeFilter,
	}));

	const filterTabs: { value: FilterType; label: () => string }[] = [
		{ value: 'all', label: () => m.test_filter_all() },
		{ value: 'emoji', label: () => m.test_filter_emojis() },
		{ value: 'poll', label: () => m.test_filter_polls() },
		{ value: 'vote', label: () => m.test_filter_votes() },
		{ value: 'reaction', label: () => m.test_filter_reactions() },
		{ value: 'achievement', label: () => m.test_filter_achievements() },
	];

	function getEventIcon(eventType: string) {
		switch (eventType) {
			case 'emoji': return Smile;
			case 'poll': return BarChart3;
			case 'vote': return Vote;
			case 'reaction': return Reply;
			case 'achievement': return Trophy;
			default: return Smile;
		}
	}

	type FeedEvent = NonNullable<typeof activityFeed.data>[number];

	function getEventDescription(event: FeedEvent): string {
		switch (event.type) {
			case 'emoji':
				return `${event.data.emoji} ${m.test_emoji_submitted()} (${event.data.mood})`;
			case 'poll':
				return `${m.test_new_poll()}: ${event.data.question}`;
			case 'vote':
				return `${m.test_vote_cast()}`;
			case 'reaction':
				return `${event.data.emoji} ${m.test_reaction_to()} (${event.data.mood})`;
			case 'achievement':
				return `${event.data.title} ${m.test_achievement_unlocked()}`;
			default:
				return 'Unknown activity';
		}
	}

	function getEventRowClass(eventType: string): string {
		switch (eventType) {
			case 'reaction': return 'bg-gray-50 border-l-4 border-blue-300';
			case 'achievement': return 'bg-yellow-50 border-l-4 border-yellow-400';
			default: return '';
		}
	}
</script>

<section class="p-4">
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.test_activity_feed_title()}</Card.Title>
			<div class="flex flex-wrap gap-2 mt-2">
				{#each filterTabs as tab (tab.value)}
					<Button
						variant={activeFilter === tab.value ? 'default' : 'outline'}
						size="sm"
						onclick={() => activeFilter = tab.value}
					>
						{tab.label()}
					</Button>
				{/each}
			</div>
		</Card.Header>
		<Card.Content>
			{#if activityFeed.isLoading}
				<div class="text-sm text-gray-500">Loading activity...</div>
			{:else if !activityFeed.data || activityFeed.data.length === 0}
				<div class="text-sm text-gray-500">{m.test_no_activity()}</div>
			{:else}
				<div class="max-h-96 overflow-y-auto space-y-3">
					{#each activityFeed.data as event, i (i)}
						{@const Icon = getEventIcon(event.type)}
						<div class="flex items-center gap-3 p-2 border-b border-gray-100 last:border-b-0 {getEventRowClass(event.type)}">
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
