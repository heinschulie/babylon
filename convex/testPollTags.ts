import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { validateAndNormalizeTags } from './lib/tags';

const PAGE_SIZE = 20;

/** Flatten + count tag occurrences across polls, sorted by count desc. */
function countTags(polls: Array<{ tags?: string[] }>): Array<{ tag: string; count: number }> {
	const counts = new Map<string, number>();
	for (const { tags } of polls) {
		for (const tag of tags ?? []) {
			counts.set(tag, (counts.get(tag) || 0) + 1);
		}
	}
	return Array.from(counts, ([tag, count]) => ({ tag, count }))
		.sort((a, b) => b.count - a.count);
}

export const tagPoll = mutation({
	args: {
		pollId: v.id('testPollTable'),
		tags: v.array(v.string()),
	},
	handler: async (ctx, { pollId, tags }) => {
		const poll = await ctx.db.get(pollId);
		if (!poll) throw new Error('Poll not found');

		await ctx.db.patch(pollId, { tags: validateAndNormalizeTags(tags) });
		return null;
	},
});

export const listPollsByTag = query({
	args: {
		tag: v.string(),
	},
	handler: async (ctx, { tag }) => {
		const allPolls = await ctx.db
			.query('testPollTable')
			.withIndex('by_createdAt')
			.order('desc')
			.collect();

		return allPolls
			.filter(poll => (poll.tags ?? []).includes(tag))
			.slice(0, PAGE_SIZE);
	},
});

export const getPollTagCloud = query({
	args: {},
	handler: async (ctx) => {
		const allPolls = await ctx.db.query('testPollTable').collect();
		return countTags(allPolls);
	},
});