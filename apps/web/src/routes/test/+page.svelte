<script lang="ts">
	import * as Dialog from '@babylon/ui/dialog';
	import * as Card from '@babylon/ui/card';
	import { Button } from '@babylon/ui/button';
	import { Badge } from '@babylon/ui';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import type { Id } from '@babylon/convex';
	import { api } from '@babylon/convex';
	import * as m from '$lib/paraglide/messages.js';
	import { Flame, Pin } from '@lucide/svelte';
	import { formatRelativeTime } from '$lib/format';
	import ActivityFeed from '$lib/components/ActivityFeed.svelte';
	import AchievementCard from '$lib/components/AchievementCard.svelte';
	import MoodHeatmap from '$lib/components/MoodHeatmap.svelte';
	import { toast, Toaster } from 'sonner';
	import { browser } from '$app/environment';

	let dialogOpen = $state(false);
	let pollQuestion = $state('');
	let pollOptions = $state(['', '']);
	let pollTagsInput = $state('');
	let pollExpiryMinutes = $state('');
	let activeMoodFilter = $state<string | null>(null);
	let activeTagFilter = $state<string | null>(null);
	let reactionPickerOpen = $state<Id<'testTable'> | null>(null);
	let now = $state(Date.now());

	const client = useConvexClient();
	const recentEmojis = useQuery(api.testEmojiMutation.listRecentEmojis);
	const leaderboardData = useQuery(api.testEmojiMutation.getEmojiLeaderboard, () => ({
		mood: activeMoodFilter ?? undefined
	}));
	const polls = useQuery(
		(() => activeTagFilter ? api.testPollTags.listPollsByTag : api.testPollMutation.listPolls) as any,
		() => activeTagFilter ? { tag: activeTagFilter } : undefined
	);
	const tagCloud = useQuery(api.testPollTags.getPollTagCloud, {});
	const userStreak = useQuery(api.testEmojiMutation.getUserStreak, { userId: 'test-user' });
	const achievements = useQuery(api.testAchievements.getUserAchievements, { userId: 'test-user' });
	const activePollsCount = useQuery(api.testPollMutation.getActivePollsCount, {});

	// Track achievement count for toast notifications
	let previousCount = $state(0);

	// Watch for new achievements and show toast
	$effect(() => {
		if (achievements.data && achievements.data.length > previousCount) {
			// Only show toast if we have more achievements than before
			if (previousCount > 0) {
				const newAchievement = achievements.data[0]; // Achievements are sorted newest first
				toast('Achievement Unlocked!', {
					description: newAchievement.title
				});
			}
			previousCount = achievements.data.length;
		}
	});

	// Update current time every second for countdown
	$effect(() => {
		const interval = setInterval(() => {
			now = Date.now();
		}, 1000);

		return () => clearInterval(interval);
	});

	type Mood = 'chill' | 'angry' | 'happy';

	const moods: Mood[] = ['chill', 'angry', 'happy'] as const;

	// $derived computations for mood analysis
	const moodCounts = $derived.by(() => {
		if (!recentEmojis.data) return { chill: 0, angry: 0, happy: 0 } as Record<Mood, number>;

		return recentEmojis.data.reduce(
			(acc: Record<Mood, number>, entry: any) => {
				acc[entry.mood as Mood]++;
				return acc;
			},
			{ chill: 0, angry: 0, happy: 0 }
		);
	});

	const filteredEmojis = $derived.by(() => {
		if (!recentEmojis.data) return [];
		if (!activeMoodFilter) return recentEmojis.data;
		return recentEmojis.data.filter((e: any) => e.mood === activeMoodFilter);
	});

	function toggleMoodFilter(mood: string | null) {
		activeMoodFilter = activeMoodFilter === mood ? null : mood;
	}

	function handleTagClick(tag: string) {
		activeTagFilter = tag;
	}

	function handleClearFilter() {
		activeTagFilter = null;
	}

	const moodSummary = $derived.by(() => {
		const counts = moodCounts;
		return `${counts.chill} chill · ${counts.angry} angry · ${counts.happy} happy`;
	});

	const tagCloudWithSizes = $derived.by(() => {
		if (!tagCloud.data || tagCloud.data.length === 0) return [];

		const maxCount = Math.max(...tagCloud.data.map(t => t.count));
		const minFontSize = 0.75;
		const maxFontSize = 2.0;
		const fontSizeRange = maxFontSize - minFontSize;

		return tagCloud.data.map(tagData => ({
			...tagData,
			fontSize: minFontSize + (tagData.count / maxCount) * fontSizeRange
		}));
	});

	async function handleEmojiClick(emoji: string, mood: Mood) {
		try {
			await client.mutation(api.testEmojiMutation.submitEmoji, { emoji, mood, userId: "test-user" });
			dialogOpen = false;
		} catch (error) {
			console.error('Failed to submit emoji:', error);
		}
	}

	async function handleCreatePoll() {
		try {
			const nonEmptyOptions = pollOptions.filter(opt => opt.trim());
			const tags = pollTagsInput.trim()
				? pollTagsInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
				: undefined;
			const expiresAt = pollExpiryMinutes.trim()
				? Date.now() + (parseInt(pollExpiryMinutes) * 60 * 1000)
				: undefined;

			await client.mutation(api.testPollMutation.createPoll, {
				question: pollQuestion,
				options: nonEmptyOptions,
				tags,
				expiresAt
			});
			// Reset form
			pollQuestion = '';
			pollOptions = ['', ''];
			pollTagsInput = '';
			pollExpiryMinutes = '';
		} catch (error) {
			console.error('Failed to create poll:', error);
		}
	}

	function addPollOption() {
		pollOptions = [...pollOptions, ''];
	}

	async function handleVoteClick(pollId: Id<'testPollTable'>, option: string) {
		try {
			await client.mutation(api.testPollMutation.castVote, {
				pollId,
				option,
				userId: "test-user"
			});
		} catch (error) {
			console.error('Failed to cast vote:', error);
		}
	}

	async function handleClosePoll(pollId: Id<'testPollTable'>) {
		try {
			await client.mutation(api.testPollMutation.closePoll, { pollId });
		} catch (error) {
			console.error('Failed to close poll:', error);
		}
	}

	async function handleReaction(parentId: Id<'testTable'>, emoji: string) {
		try {
			await client.mutation(api.testReactions.addReaction, {
				parentId,
				emoji,
				userId: 'test-user'
			});
		} catch (error) {
			console.error('Failed to add reaction:', error);
		}
	}

	async function handleTogglePin(id: Id<'testTable'>) {
		try {
			await client.mutation(api.testEmojiMutation.togglePin, { id });
		} catch (error) {
			console.error('Failed to toggle pin:', error);
		}
	}

	function formatTimeRemaining(expiresAt: number): string {
		const remaining = Math.max(0, expiresAt - now);
		if (remaining <= 0) return 'Expired';

		const seconds = Math.floor(remaining / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);

		if (hours > 0) {
			return `${hours}h ${minutes % 60}m`;
		} else if (minutes > 0) {
			return `${minutes}m ${seconds % 60}s`;
		} else {
			return `${seconds}s`;
		}
	}
</script>

<div class="bg-[#E1261C] min-h-[100vh]">
	<!-- Sonner Toast Provider -->
	{#if browser}
		<Toaster />
	{/if}

	<div class="flex items-center gap-3 p-4">
		<button onclick={() => dialogOpen = true}>Test Emoji</button>

		<!-- Streak Badge -->
		{#if userStreak.data && userStreak.data.streak >= 1}
			<div class="flex items-center gap-1 bg-orange-100 text-orange-800 px-3 py-1 rounded-full">
				<Flame size={16} />
				<span class="text-sm font-medium">{userStreak.data.streak}</span>
				<span class="text-sm">{m.test_streak_label()}</span>
			</div>
		{/if}
	</div>

	<Dialog.Root open={dialogOpen} onOpenChange={(open) => dialogOpen = open}>
		<Dialog.Content>
			<Dialog.Title>Choose an Emoji</Dialog.Title>
			<div class="flex gap-4">
				<button class="text-4xl" onclick={() => handleEmojiClick('😎', 'chill')}>😎</button>
				<button class="text-4xl" onclick={() => handleEmojiClick('💩', 'angry')}>💩</button>
				<button class="text-4xl" onclick={() => handleEmojiClick('🔥', 'happy')}>🔥</button>
			</div>
		</Dialog.Content>
	</Dialog.Root>

	<!-- Poll Creation and List section -->
	<section class="p-4">
		<Card.Root>
			<Card.Header>
				<Card.Title>Create a Poll</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-4">
				<!-- Question Input -->
				<div class="space-y-2">
					<label for="question" class="text-sm font-medium">Question</label>
					<input
						id="question"
						type="text"
						placeholder="What is your question?"
						bind:value={pollQuestion}
						class="w-full px-3 py-2 border border-gray-300 rounded"
					/>
				</div>

				<!-- Options List -->
				<div class="space-y-2">
					<label for="option-0" class="text-sm font-medium">Options</label>
					<div class="space-y-2">
						{#each pollOptions as option, index (index)}
							<input
								id={`option-${index}`}
								type="text"
								placeholder={`Option ${index + 1}`}
								bind:value={pollOptions[index]}
								class="w-full px-3 py-2 border border-gray-300 rounded"
							/>
						{/each}
					</div>
					<button onclick={addPollOption} class="px-3 py-2 bg-gray-200 rounded text-sm">
						+ Add Option
					</button>
				</div>

				<!-- Tags Input -->
				<div class="space-y-2">
					<label for="tags" class="text-sm font-medium">{m.test_tags_label()}</label>
					<input
						id="tags"
						type="text"
						placeholder={m.test_tags_placeholder()}
						bind:value={pollTagsInput}
						class="w-full px-3 py-2 border border-gray-300 rounded"
					/>
				</div>

				<!-- Expiry Duration Input -->
				<div class="space-y-2">
					<label for="expiry" class="text-sm font-medium">{m.test_poll_add_expiry()}</label>
					<input
						id="expiry"
						type="number"
						placeholder="Minutes (optional)"
						bind:value={pollExpiryMinutes}
						class="w-full px-3 py-2 border border-gray-300 rounded"
						min="1"
					/>
				</div>

				<!-- Submit Button -->
				<button onclick={handleCreatePoll} class="w-full px-4 py-2 bg-blue-600 text-white rounded">
					Create Poll
				</button>
			</Card.Content>
		</Card.Root>

		<!-- Poll List -->
		<div class="mt-6">
			<div class="flex items-center gap-3 mb-4">
				<h3 class="text-lg font-semibold">Recent Polls</h3>
				{#if activePollsCount.data !== undefined}
					<Badge variant="outline">
						{activePollsCount.data} active
					</Badge>
				{/if}
				{#if activeTagFilter !== null}
					<Button variant="outline" size="sm" onclick={handleClearFilter}>
						{m.test_clear_tag_filter()}
					</Button>
				{/if}
			</div>
			{#if polls.isLoading}
				<div>Loading polls...</div>
			{:else if !polls.data || polls.data.length === 0}
				<div>No polls exist</div>
			{:else}
				<div class="space-y-3">
					{#each polls.data as poll (poll._id)}
						{@const pollResults = useQuery(api.testPollMutation.getPollResults, { pollId: poll._id })}
						<Card.Root>
							<Card.Header>
								<div class="flex items-center justify-between">
									<Card.Title>{poll.question}</Card.Title>
									<!-- Countdown badge -->
									{#if poll.expiresAt && !poll.closedAt}
										{@const remaining = poll.expiresAt - now}
										{#if remaining > 0}
											<Badge variant="outline" class="ml-2">
												{m.test_poll_expires_in({time: formatTimeRemaining(poll.expiresAt)})}
											</Badge>
										{/if}
									{/if}
								</div>
								<!-- Tags display -->
								{#if poll.tags && poll.tags.length > 0}
									<div class="flex flex-wrap gap-1 mt-2">
										{#each poll.tags as tag (tag)}
											<button onclick={() => handleTagClick(tag)}>
												<Badge variant="secondary">{tag}</Badge>
											</button>
										{/each}
									</div>
								{/if}
							</Card.Header>
							<Card.Content>
								<ol class="list-decimal list-inside space-y-1">
									{#each poll.options as option}
										<li class="text-sm">{option}</li>
									{/each}
								</ol>

								<!-- Vote buttons (hidden when poll is closed or expired) -->
								{@const isExpired = poll.expiresAt && poll.expiresAt < now}
								{#if !poll.closedAt && !isExpired}
									<div class="mt-4 flex flex-wrap gap-2">
										{#each poll.options as option}
											<Button onclick={() => handleVoteClick(poll._id, option)}>{option}</Button>
										{/each}
									</div>

									<!-- Close button (open polls only) -->
									<div class="mt-3">
										<Button variant="outline" size="sm" onclick={() => handleClosePoll(poll._id)}>
											{m.test_poll_close()}
										</Button>
									</div>
								{/if}

								<!-- Closed/Expired badge -->
								{#if poll.closedAt}
									<div class="mt-3">
										<Badge variant="secondary">
											{m.test_poll_closed()}
										</Badge>
									</div>
								{:else if isExpired}
									<div class="mt-3">
										<Badge variant="secondary">
											{m.test_poll_expired()}
										</Badge>
									</div>
								{/if}

								<!-- Bar chart results -->
								<div class="mt-6">
									<h4 class="text-sm font-medium mb-3">Poll Results - Bar Chart</h4>
									{#if pollResults.isLoading}
										<div class="text-sm text-gray-500">Loading results...</div>
									{:else if pollResults.data}
									{@const maxCount = Math.max(...pollResults.data.map(r => r.count))}
										<div class="space-y-2">
											{#each pollResults.data as result}
												<div class="flex items-center gap-3">
													<span class="text-sm w-20 truncate">{result.option}</span>
													<div class="flex-1 bg-gray-200 h-4 rounded">
														<div class="bg-blue-500 h-4 rounded" style="width: {result.count > 0 ? (result.count / maxCount) * 100 : 2}%"></div>
													</div>
													<span class="text-sm text-gray-600 w-8">{result.count}</span>
												</div>
											{/each}
										</div>
									{:else}
										<div class="text-sm text-gray-500">No votes yet</div>
									{/if}
								</div>
								<div class="mt-2 text-sm text-gray-600 flex justify-between items-center">
									<div>
										{#if pollResults.isLoading}
											<span>Loading votes...</span>
										{:else if pollResults.data}
											{@const totalVotes = pollResults.data.reduce((sum, result) => sum + result.count, 0)}
											<span>{totalVotes} total vote{totalVotes !== 1 ? 's' : ''}</span>
										{:else}
											<span>0 total votes</span>
										{/if}
									</div>
									<div class="text-gray-500">
										{formatRelativeTime(poll.createdAt)}
									</div>
								</div>
							</Card.Content>
						</Card.Root>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Tag Cloud -->
		<div class="mt-8">
			<h3 class="text-lg font-semibold mb-4">{m.test_tag_cloud_title()}</h3>
			{#if tagCloud.isLoading}
				<div>Loading tag cloud...</div>
			{:else if !tagCloudWithSizes || tagCloudWithSizes.length === 0}
				<div class="text-gray-500">{m.test_no_tags_yet()}</div>
			{:else}
				<div class="flex flex-wrap gap-3">
					{#each tagCloudWithSizes as tagData}
						<button
							onclick={() => handleTagClick(tagData.tag)}
							class="hover:bg-gray-100 px-2 py-1 rounded transition-colors"
							style="font-size: {tagData.fontSize}rem"
						>
							<span class="font-medium text-blue-600">{tagData.tag}</span>
							<span class="text-gray-500 text-sm ml-1">({tagData.count})</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- Mood Filter Buttons -->
	<section class="p-4">
		<div class="flex gap-2 mb-4">
			<Button
				variant={activeMoodFilter === null ? 'default' : 'ghost'}
				onclick={() => toggleMoodFilter(null)}
			>All</Button>
			{#each moods as mood}
				<Button
					variant={activeMoodFilter === mood ? 'default' : 'ghost'}
					onclick={() => toggleMoodFilter(mood)}
				>{mood}</Button>
			{/each}
		</div>
	</section>

	<!-- Emoji Leaderboard section -->
	<section class="p-4">
		<h2>Emoji Leaderboard</h2>
		{#if leaderboardData.isLoading}
			<div>Loading leaderboard...</div>
		{:else if !leaderboardData.data || leaderboardData.data.length === 0}
			<div>No emoji data available</div>
		{:else}
			<ol class="list-decimal list-inside space-y-1">
				{#each leaderboardData.data as entry}
					<li>
						<span class="text-2xl">{entry.emoji}</span>
						<span class="ml-2 text-sm text-gray-600">{entry.count}</span>
					</li>
				{/each}
			</ol>
		{/if}
	</section>

	<!-- Mood Heatmap section -->
	<MoodHeatmap />

	<!-- Sentiment Timeline section -->
	<section>
		<h2>Sentiment Timeline</h2>
		{#if recentEmojis.isLoading}
			<div>Loading timeline...</div>
		{:else if !recentEmojis.data || recentEmojis.data.length === 0}
			<div>No emoji submissions yet</div>
		{:else}
			<div>{moodSummary}</div>
			<div class="flex flex-wrap gap-2">
				{#each moods.filter((m) => moodCounts[m] > 0) as mood (mood)}
					<Badge variant="secondary">{mood} ({moodCounts[mood]})</Badge>
				{/each}
			</div>

			<!-- Individual timeline entries (filtered by activeMoodFilter) -->
			<div>
				{#each filteredEmojis as entry (entry._id)}
					{@const reactionCounts = useQuery(api.testReactions.getReactionCounts, { parentId: entry._id })}
					<div class="mb-4 {entry.pinned ? 'border border-yellow-300 bg-yellow-50 rounded-lg p-3' : ''}">
						<div class="flex items-center gap-2 mb-2">
							<div class="flex items-center gap-1">
								<span class="text-2xl">{entry.emoji}</span>
								{#if entry.pinned}
									<Pin size={14} class="text-yellow-600 fill-current" />
								{/if}
							</div>
							<Badge variant="secondary">{entry.mood}</Badge>
							<span class="text-sm text-gray-500">
								{formatRelativeTime(entry.createdAt)}
							</span>
							<div class="relative">
								<Button
									variant="ghost"
									size="sm"
									data-testid="reaction-button"
									onclick={() => reactionPickerOpen = reactionPickerOpen === entry._id ? null : entry._id}
								>
									React
								</Button>
								{#if reactionPickerOpen === entry._id}
									<div class="absolute top-8 left-0 bg-white border border-gray-200 rounded shadow-lg p-2 flex gap-2 z-10">
										<button
											class="text-2xl hover:bg-gray-100 p-1 rounded"
											onclick={() => { handleReaction(entry._id, '😎'); reactionPickerOpen = null; }}
										>😎</button>
										<button
											class="text-2xl hover:bg-gray-100 p-1 rounded"
											onclick={() => { handleReaction(entry._id, '💩'); reactionPickerOpen = null; }}
										>💩</button>
										<button
											class="text-2xl hover:bg-gray-100 p-1 rounded"
											onclick={() => { handleReaction(entry._id, '🔥'); reactionPickerOpen = null; }}
										>🔥</button>
									</div>
								{/if}
							</div>
							<Button
								variant="ghost"
								size="sm"
								data-testid="pin-button"
								onclick={() => handleTogglePin(entry._id)}
								class={entry.pinned ? 'text-yellow-600' : 'text-gray-500'}
								title={entry.pinned ? m.test_unpin_emoji() : m.test_pin_emoji()}
							>
								<Pin size={16} class={entry.pinned ? 'fill-current' : ''} />
								{entry.pinned ? m.test_unpin_emoji() : m.test_pin_emoji()}
							</Button>
						</div>
						<!-- Reaction count badges -->
						{#if reactionCounts.data && reactionCounts.data.length > 0}
							<div class="flex gap-1 ml-8">
								{#each reactionCounts.data as reaction (reaction.emoji)}
									<Badge variant="outline" class="text-sm">
										{reaction.emoji} {reaction.count}
									</Badge>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Achievements section -->
	<section class="p-4">
		<h2 class="text-xl font-semibold mb-4">{m.test_achievements_title()}</h2>
		{#if achievements.isLoading}
			<div>Loading achievements...</div>
		{:else if !achievements.data || achievements.data.length === 0}
			<p class="text-gray-600">{m.test_no_achievements()}</p>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each achievements.data as achievement (achievement._id)}
					<AchievementCard {achievement} />
				{/each}
			</div>
		{/if}
	</section>

	<!-- Activity Feed section -->
	<ActivityFeed />

	<h1 class="text-[150px]">christ on a pogostick</h1>

	<!-- Row 1: 3 images -->
	<div class="grid grid-cols-3 gap-4 p-4">
		<figure>
			<img src="https://picsum.photos/1600/900?random=1" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>sunset over mountains</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=2" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>ocean waves crashing</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=3" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>forest path winding</figcaption>
		</figure>
	</div>

	<!-- Row 2: 5 images -->
	<div class="grid grid-cols-5 gap-4 p-4">
		<figure>
			<img src="https://picsum.photos/1600/900?random=4" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>city lights at night</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=5" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>desert sand dunes</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=6" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>lake reflection mirror</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=7" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>snow covered peaks</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=8" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>meadow wildflowers blooming</figcaption>
		</figure>
	</div>

	<!-- Row 3: 7 images -->
	<div class="grid grid-cols-7 gap-4 p-4">
		<figure>
			<img src="https://picsum.photos/1600/900?random=9" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>coastal cliff edge</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=10" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>autumn leaves falling</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=11" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>bridge spanning river</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=12" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>garden stone pathway</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=13" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>clouds forming patterns</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=14" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>village morning mist</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=15" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>starlit sky above</figcaption>
		</figure>
	</div>

	<!-- Row 4: 9 images -->
	<div class="grid grid-cols-9 gap-4 p-4">
		<figure>
			<img src="https://picsum.photos/1600/900?random=16" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>ancient stone arch</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=17" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>morning dew drops</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=18" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>rolling green hills</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=19" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>crystal clear stream</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=20" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>butterfly garden blooms</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=21" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>lighthouse beacon shining</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=22" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>canyon red rocks</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=23" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>peaceful zen garden</figcaption>
		</figure>
		<figure>
			<img src="https://picsum.photos/1600/900?random=24" alt="Random image from picsum.photos" class="w-full aspect-video object-cover" />
			<figcaption>golden wheat fields</figcaption>
		</figure>
	</div>

	<!-- Full-width image section -->
	<div class="p-4">
		<img src="https://picsum.photos/1920/1080?random=25" alt="Random image from picsum.photos" class="w-full" />
	</div>

</div>
