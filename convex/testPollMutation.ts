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
