import { v } from 'convex/values';
import { query } from './_generated/server';
import type { Doc } from './_generated/dataModel';

const FEED_LIMIT = 30;

type FeedEventType = 'emoji' | 'vote' | 'poll' | 'reaction' | 'achievement';

type FeedEvent = {
	type: FeedEventType;
	timestamp: number;
	data: Record<string, unknown>;
};

function mapTestEntry(entry: Doc<'testTable'>): FeedEvent {
	if (entry.parentId) {
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
	handler: async (ctx, { filterType }) => {
		const shouldInclude = (type: FeedEventType) => !filterType || filterType === type;

		const [testEntries, pollEntries, achievementEntries] = await Promise.all([
			shouldInclude('emoji') || shouldInclude('vote') || shouldInclude('reaction')
				? ctx.db.query('testTable').withIndex('by_createdAt').order('desc').take(FEED_LIMIT)
				: [],
			shouldInclude('poll')
				? ctx.db.query('testPollTable').withIndex('by_createdAt').order('desc').take(FEED_LIMIT)
				: [],
			shouldInclude('achievement')
				? ctx.db.query('testAchievementTable').withIndex('by_userId').order('desc').take(FEED_LIMIT)
				: [],
		]);

		let allEvents: FeedEvent[] = [
			...testEntries.map(mapTestEntry),
			...pollEntries.map(mapPollEntry),
			...achievementEntries.map(mapAchievementEntry),
		];

		if (filterType) {
			allEvents = allEvents.filter((e) => e.type === filterType);
		}

		allEvents.sort((a, b) => b.timestamp - a.timestamp);

		return allEvents.slice(0, FEED_LIMIT);
	},
});