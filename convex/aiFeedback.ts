import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';

export const create = mutation({
	args: {
		attemptId: v.id('attempts'),
		transcript: v.optional(v.string()),
		confidence: v.optional(v.number()),
		errorTags: v.optional(v.array(v.string())),
		score: v.optional(v.number()),
		feedbackText: v.optional(v.string()),
		ttsAudioUrl: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt || attempt.userId !== userId) {
			throw new Error('Attempt not found or not authorized');
		}

		const feedbackId = await ctx.db.insert('aiFeedback', {
			attemptId: args.attemptId,
			transcript: args.transcript,
			confidence: args.confidence,
			errorTags: args.errorTags,
			score: args.score,
			feedbackText: args.feedbackText,
			ttsAudioUrl: args.ttsAudioUrl,
			createdAt: Date.now()
		});

		await ctx.db.patch(args.attemptId, { status: 'feedback_ready' });

		return feedbackId;
	}
});

export const getByAttempt = query({
	args: { attemptId: v.id('attempts') },
	handler: async (ctx, { attemptId }) => {
		const userId = await getAuthUserId(ctx);
		const attempt = await ctx.db.get(attemptId);
		if (!attempt || attempt.userId !== userId) {
			return null;
		}

		return await ctx.db
			.query('aiFeedback')
			.withIndex('by_attempt', (q) => q.eq('attemptId', attemptId))
			.unique();
	}
});
