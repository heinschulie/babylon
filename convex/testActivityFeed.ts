import { query } from './_generated/server';
import type { Doc } from './_generated/dataModel';

const FEED_LIMIT = 30;

type FeedEvent = {
	type: 'emoji' | 'vote' | 'poll';
	timestamp: number;
	data: Record<string, unknown>;
};

function mapTestEntry(entry: Doc<'testTable'>): FeedEvent {
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

export const getActivityFeed = query({
	args: {},
	handler: async (ctx) => {
		const [testEntries, pollEntries] = await Promise.all([
			ctx.db.query('testTable').withIndex('by_createdAt').order('desc').take(FEED_LIMIT),
			ctx.db.query('testPollTable').withIndex('by_createdAt').order('desc').take(FEED_LIMIT),
		]);

		const allEvents = [
			...testEntries.map(mapTestEntry),
			...pollEntries.map(mapPollEntry),
		];
		allEvents.sort((a, b) => b.timestamp - a.timestamp);

		return allEvents.slice(0, FEED_LIMIT);
	},
});