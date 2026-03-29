import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const MAX_TAGS = 5;
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

/** Validate + normalize tags in a single pass. Returns cleaned array or throws. */
function validateAndProcessTags(tags: string[]): string[] {
	if (tags.length > MAX_TAGS) {
		throw new Error(`Maximum ${MAX_TAGS} tags allowed`);
	}
	return tags.map(tag => {
		const trimmed = tag.trim();
		if (!trimmed) throw new Error('Tags must not be empty');
		return trimmed;
	});
}

export const tagPoll = mutation({
	args: {
		pollId: v.id('testPollTable'),
		tags: v.array(v.string()),
	},
	handler: async (ctx, { pollId, tags }) => {
		const poll = await ctx.db.get(pollId);
		if (!poll) throw new Error('Poll not found');

		await ctx.db.patch(pollId, { tags: validateAndProcessTags(tags) });
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