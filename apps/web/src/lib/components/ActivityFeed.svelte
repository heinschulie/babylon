<script lang="ts">
	import { useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';
	import * as Card from '@babylon/ui/card';
	import { Smile, BarChart3, Vote, Reply, Trophy } from '@lucide/svelte';
	import * as m from '$lib/paraglide/messages.js';
	import { formatRelativeTime } from '$lib/format';

	let { filterType = $bindable<string | undefined>(undefined) }: { filterType?: string | undefined } = $props();

	const activityFeed = useQuery(api.testActivityFeed.getActivityFeed, () => ({
		filterType,
	}));

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
				return `${event.data.emoji} reacted`;
			case 'achievement':
				return `🏆 ${event.data.title} unlocked`;
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
			{#if activityFeed.isLoading}
				<div class="text-sm text-gray-500">Loading activity...</div>
			{:else if !activityFeed.data || activityFeed.data.length === 0}
				<div class="text-sm text-gray-500">{m.test_no_activity()}</div>
			{:else}
				<div class="max-h-96 overflow-y-auto space-y-3">
					{#each activityFeed.data as event, i (i)}
						{#if event.type === 'reaction'}
							<div class="flex items-center gap-3 p-2 pl-6 border-b border-gray-100 last:border-b-0 bg-gray-50 rounded">
								<div class="flex-shrink-0">
									<Reply class="w-5 h-5 text-blue-500" />
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
						{:else if event.type === 'achievement'}
							<div class="flex items-center gap-3 p-2 border-b border-gray-100 last:border-b-0 bg-yellow-50 rounded">
								<div class="flex-shrink-0">
									<Trophy class="w-5 h-5 text-yellow-600" />
								</div>
								<div class="flex-1 min-w-0">
									<div class="text-sm font-semibold text-gray-900 truncate">
										{getEventDescription(event)}
									</div>
									<div class="text-xs text-gray-500">
										{formatRelativeTime(event.timestamp)}
									</div>
								</div>
							</div>
						{:else}
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
						{/if}
					{/each}
				</div>
			{/if}
		</Card.Content>
	</Card.Root>
</section>
