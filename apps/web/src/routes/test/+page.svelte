<script lang="ts">
	import * as Dialog from '@babylon/ui/dialog';
	import { useConvexClient, useQuery } from 'convex-svelte';
	import { api } from '@babylon/convex';

	let dialogOpen = $state(false);

	const client = useConvexClient();
	const recentEmojis = useQuery(api.testEmojiMutation.listRecentEmojis);

	type Mood = 'chill' | 'angry' | 'happy';

	// Mood color mapping for proper Tailwind class application
	const moodColors: Record<Mood, string> = {
		chill: 'bg-blue-100 text-blue-800',
		angry: 'bg-red-100 text-red-800',
		happy: 'bg-orange-100 text-orange-800'
	} as const;

	const moods: Mood[] = ['chill', 'angry', 'happy'] as const;

	// $derived computations for mood analysis
	const moodCounts = $derived(() => {
		if (!recentEmojis.data) return { chill: 0, angry: 0, happy: 0 } as Record<Mood, number>;

		return recentEmojis.data.reduce(
			(acc: Record<Mood, number>, entry: any) => {
				acc[entry.mood as Mood]++;
				return acc;
			},
			{ chill: 0, angry: 0, happy: 0 }
		);
	});

	const moodSummary = $derived(() => {
		const counts = moodCounts();
		return `${counts.chill} chill · ${counts.angry} angry · ${counts.happy} happy`;
	});

	function formatRelativeTime(timestamp: number): string {
		const now = Date.now();
		const diffMs = now - timestamp;
		const diffMinutes = Math.floor(diffMs / (1000 * 60));

		if (diffMinutes < 1) return "now";
		if (diffMinutes === 1) return "1 minute ago";
		return `${diffMinutes} minutes ago`;
	}

	async function handleEmojiClick(emoji: string, mood: Mood) {
		try {
			await client.mutation(api.testEmojiMutation.submitEmoji, { emoji, mood, userId: "test-user" });
			dialogOpen = false;
		} catch (error) {
			console.error('Failed to submit emoji:', error);
		}
	}
</script>

<div class="bg-[#E1261C] min-h-[100vh]">
	<button onclick={() => dialogOpen = true}>Test Emoji</button>

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

	<!-- Sentiment Timeline section -->
	<section>
		<h2>Sentiment Timeline</h2>
		{#if recentEmojis.isLoading}
			<div>Loading timeline...</div>
		{:else if !recentEmojis.data || recentEmojis.data.length === 0}
			<div>No emoji submissions yet</div>
		{:else}
			<div>{moodSummary()}</div>
			<div>
				{#each moods.filter((m) => moodCounts()[m] > 0) as mood}
					<span class="{moodColors[mood]} px-2 py-1 rounded mr-2">{mood} ({moodCounts()[mood]})</span>
				{/each}
			</div>

			<!-- Individual timeline entries -->
			<div>
				{#each recentEmojis.data as entry}
					<div class="flex items-center gap-2 mb-2">
						<span class="text-2xl">{entry.emoji}</span>
						<span class="{moodColors[entry.mood as keyof typeof moodColors]} px-2 py-1 rounded text-xs">
							{entry.mood}
						</span>
						<span class="text-sm text-gray-500">
							{formatRelativeTime(entry.createdAt)}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	</section>

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
