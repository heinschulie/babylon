import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const MAX_TAGS = 5;

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
		// Check if poll exists
		const poll = await ctx.db.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		// Validate and process tags
		const processedTags = validateAndProcessTags(tags);

		// Update the poll with new tags (set semantics - replace entire array)
		await ctx.db.patch(pollId, {
			tags: processedTags,
		});

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

		// Filter polls that have the specified tag
		const filteredPolls = allPolls.filter(poll =>
			poll.tags && poll.tags.includes(tag)
		);

		// Return first 20 results
		return filteredPolls.slice(0, 20);
	},
});

export const getPollTagCloud = query({
	args: {},
	handler: async (ctx) => {
		// Get all polls
		const allPolls = await ctx.db.query('testPollTable').collect();

		// Count tag occurrences
		const tagCounts = new Map<string, number>();

		for (const poll of allPolls) {
			if (poll.tags) {
				for (const tag of poll.tags) {
					tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
				}
			}
		}

		// Convert to array and sort by count descending
		return Array.from(tagCounts.entries())
			.map(([tag, count]) => ({ tag, count }))
			.sort((a, b) => b.count - a.count);
	},
});