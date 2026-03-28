import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const createPoll = mutation({
	args: {
		question: v.string(),
		options: v.array(v.string()),
	},
	handler: async (ctx, { question, options }) => {
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

		return ctx.db.insert('testPollTable', {
			question,
			options,
			createdAt: Date.now(),
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
		// Validate pollId exists
		const poll = await ctx.db.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		// Validate option is in poll's options array
		const optionIndex = poll.options.indexOf(option);
		if (optionIndex === -1) {
			throw new Error(`Invalid option: ${option}. Must be one of: ${poll.options.join(', ')}`);
		}

		// Derive mood from option index
		let mood: string;
		if (optionIndex === 0) {
			mood = 'chill';
		} else if (optionIndex === 1) {
			mood = 'angry';
		} else {
			mood = 'happy';
		}

		// Insert into testTable
		return ctx.db.insert('testTable', {
			emoji: option,
			sentence: poll.question,
			mood,
			userId,
			pollId,
			createdAt: Date.now()
		});
	},
});

export const getPollResults = query({
	args: {
		pollId: v.id('testPollTable'),
	},
	handler: async (ctx, { pollId }) => {
		// Fetch all votes for this poll
		const votes = await ctx.db
			.query('testTable')
			.filter((q) => q.eq(q.field('pollId'), pollId))
			.collect();

		// Group by emoji (option) and count
		const counts = new Map<string, number>();
		for (const vote of votes) {
			const current = counts.get(vote.emoji) || 0;
			counts.set(vote.emoji, current + 1);
		}

		// Convert to array and sort by count descending
		return Array.from(counts.entries())
			.map(([option, count]) => ({ option, count }))
			.sort((a, b) => b.count - a.count);
	},
});
