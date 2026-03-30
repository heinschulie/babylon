import { query } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';

const FEED_LIMIT = 30;

type FeedEvent = {
	type: 'emoji' | 'vote' | 'poll' | 'reaction' | 'achievement';
	timestamp: number;
	data: Record<string, unknown>;
};

function mapTestEntry(entry: Doc<'testTable'>): FeedEvent {
	if (entry.parentId && !entry.pollId) {
		return {
			type: 'reaction',
			timestamp: entry.createdAt,
			data: { emoji: entry.emoji, mood: entry.mood, userId: entry.userId, parentId: entry.parentId },
		};
	}
	if (entry.pollId) {
		return {
			type: 'vote',
			timestamp: entry.createdAt,
			data: { emoji: entry.emoji, mood: entry.mood, pollId: entry.pollId },
		};
	}
	return {
		type: 'emoji',
		timestamp: entry.createdAt,
		data: { emoji: entry.emoji, mood: entry.mood, userId: entry.userId },
	};
}

function mapPollEntry(entry: Doc<'testPollTable'>): FeedEvent {
	return {
		type: 'poll',
		timestamp: entry.createdAt,
		data: { question: entry.question, optionCount: entry.options.length },
	};
}

function mapAchievementEntry(entry: Doc<'testAchievementTable'>): FeedEvent {
	return {
		type: 'achievement',
		timestamp: entry.unlockedAt,
		data: { type: entry.type, title: entry.title, userId: entry.userId },
	};
}

export const getActivityFeed = query({
	args: {
		filterType: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const [testEntries, pollEntries, achievementEntries] = await Promise.all([
			ctx.db.query('testTable').withIndex('by_createdAt').order('desc').take(FEED_LIMIT),
			ctx.db.query('testPollTable').withIndex('by_createdAt').order('desc').take(FEED_LIMIT),
			ctx.db.query('testAchievementTable').order('desc').take(FEED_LIMIT),
		]);

		const allEvents: FeedEvent[] = [
			...testEntries.map(mapTestEntry),
			...pollEntries.map(mapPollEntry),
			...achievementEntries.map(mapAchievementEntry),
		];
		allEvents.sort((a, b) => b.timestamp - a.timestamp);

		const filtered = args.filterType
			? allEvents.filter((e) => e.type === args.filterType)
			: allEvents;

		return filtered.slice(0, FEED_LIMIT);
	},
});
