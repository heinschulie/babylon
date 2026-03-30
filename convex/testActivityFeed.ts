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
		filterType: v.optional(
			v.union(
				v.literal('emoji'),
				v.literal('vote'),
				v.literal('poll'),
				v.literal('reaction'),
				v.literal('achievement'),
			),
		),
	},
	handler: async (ctx, { filterType }) => {
		// testTable rows produce 3 event types; skip the table only when filtering to an unrelated type
		const testTableTypes: Set<FeedEventType> = new Set(['emoji', 'vote', 'reaction']);
		const needsTestTable = !filterType || testTableTypes.has(filterType);
		const needsPolls = !filterType || filterType === 'poll';
		const needsAchievements = !filterType || filterType === 'achievement';

		const [testEntries, pollEntries, achievementEntries] = await Promise.all([
			needsTestTable
				? ctx.db.query('testTable').withIndex('by_createdAt').order('desc').take(FEED_LIMIT)
				: [],
			needsPolls
				? ctx.db.query('testPollTable').withIndex('by_createdAt').order('desc').take(FEED_LIMIT)
				: [],
			needsAchievements
				? ctx.db.query('testAchievementTable').order('desc').take(FEED_LIMIT)
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