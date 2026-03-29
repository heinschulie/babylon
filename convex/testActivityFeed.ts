import { query } from './_generated/server';

export const getActivityFeed = query({
	args: {},
	handler: async (ctx) => {
		// Fetch recent entries from both tables
		const testTableEntries = await ctx.db
			.query('testTable')
			.withIndex('by_createdAt')
			.order('desc')
			.take(30);

		const testPollEntries = await ctx.db
			.query('testPollTable')
			.withIndex('by_createdAt')
			.order('desc')
			.take(30);

		// Map to activity feed events
		const emojiEvents = testTableEntries.map((entry) => ({
			type: entry.pollId ? ('vote' as const) : ('emoji' as const),
			timestamp: entry.createdAt,
			data: {
				emoji: entry.emoji,
				mood: entry.mood,
				...(entry.pollId ? { pollId: entry.pollId } : { userId: entry.userId }),
			},
		}));

		const pollEvents = testPollEntries.map((entry) => ({
			type: 'poll' as const,
			timestamp: entry.createdAt,
			data: {
				question: entry.question,
				optionCount: entry.options.length,
			},
		}));

		// Merge, sort by timestamp desc, and limit to 30
		const allEvents = [...emojiEvents, ...pollEvents];
		allEvents.sort((a, b) => b.timestamp - a.timestamp);

		return allEvents.slice(0, 30);
	},
});