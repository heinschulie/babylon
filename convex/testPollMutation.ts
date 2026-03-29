import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const MOOD_BY_INDEX = ['chill', 'angry', 'happy'] as const;
const MAX_TAGS = 5;
const MAX_TAG_LENGTH = 20;

function deriveMood(optionIndex: number): string {
	return MOOD_BY_INDEX[Math.min(optionIndex, MOOD_BY_INDEX.length - 1)];
}

/** Validate + normalize tags in a single pass. Returns cleaned array or throws. */
function validateAndProcessTags(tags: string[]): string[] {
	if (tags.length > MAX_TAGS) {
		throw new Error(`Maximum ${MAX_TAGS} tags allowed`);
	}
	return tags.map(tag => {
		const trimmed = tag.trim();
		if (!trimmed) throw new Error('Tags must not be empty');
		if (trimmed.length > MAX_TAG_LENGTH) throw new Error('Tags must not exceed 20 characters');
		return trimmed;
	});
}

export const createPoll = mutation({
	args: {
		question: v.string(),
		options: v.array(v.string()),
		tags: v.optional(v.array(v.string())),
	},
	handler: async (ctx, { question, options, tags }) => {
		// Validate question is non-empty
		if (!question.trim()) {
			throw new Error('Question must not be empty');
		}

		// Validate at least 2 options
		if (options.length < 2) {
			throw new Error('Poll must have at least 2 options');
		}

		// Validate no empty options
		if (options.some(opt => !opt.trim())) {
			throw new Error('Options must not be empty');
		}

		const processedTags = tags ? validateAndProcessTags(tags) : undefined;

		return ctx.db.insert('testPollTable', {
			question,
			options,
			createdAt: Date.now(),
			...(processedTags && { tags: processedTags }),
		});
	},
});

export const listPolls = query({
	args: {},
	handler: async (ctx) => {
		return ctx.db
			.query('testPollTable')
			.withIndex('by_createdAt')
			.order('desc')
			.take(20);
	},
});

export const castVote = mutation({
	args: {
		pollId: v.id('testPollTable'),
		option: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, { pollId, option, userId }) => {
		const poll = await ctx.db.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		// Check if poll is closed
		if (poll.closedAt) {
			throw new Error('Poll is closed');
		}

		const optionIndex = poll.options.indexOf(option);
		if (optionIndex === -1) {
			throw new Error(`Invalid option: ${option}. Must be one of: ${poll.options.join(', ')}`);
		}

		return ctx.db.insert('testTable', {
			emoji: option,
			sentence: poll.question,
			mood: deriveMood(optionIndex),
			userId,
			pollId,
			createdAt: Date.now()
		});
	},
});

export const closePoll = mutation({
	args: {
		pollId: v.id('testPollTable'),
	},
	handler: async (ctx, { pollId }) => {
		const poll = await ctx.db.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		await ctx.db.patch(pollId, {
			closedAt: Date.now(),
		});

		return null;
	},
});

export const getPollResults = query({
	args: {
		pollId: v.id('testPollTable'),
	},
	handler: async (ctx, { pollId }) => {
		const votes = await ctx.db
			.query('testTable')
			.withIndex('by_pollId', (q) => q.eq('pollId', pollId))
			.collect();

		const counts = new Map<string, number>();
		for (const vote of votes) {
			counts.set(vote.emoji, (counts.get(vote.emoji) || 0) + 1);
		}

		return Array.from(counts.entries())
			.map(([option, count]) => ({ option, count }))
			.sort((a, b) => b.count - a.count);
	},
});
