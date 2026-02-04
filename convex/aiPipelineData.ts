import { v } from 'convex/values';
import { internalQuery, internalMutation } from './_generated/server';

export const getAttemptById = internalQuery({
	args: { attemptId: v.id('attempts') },
	handler: async (ctx, { attemptId }) => {
		return await ctx.db.get(attemptId);
	}
});

export const getAudioAssetByAttempt = internalQuery({
	args: { attemptId: v.id('attempts') },
	handler: async (ctx, { attemptId }) => {
		return await ctx.db
			.query('audioAssets')
			.withIndex('by_attempt', (q) => q.eq('attemptId', attemptId))
			.unique();
	}
});

export const insertAiFeedback = internalMutation({
	args: {
		attemptId: v.id('attempts'),
		transcript: v.optional(v.string()),
		confidence: v.optional(v.number()),
		errorTags: v.optional(v.array(v.string())),
		score: v.optional(v.number()),
		feedbackText: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		await ctx.db.insert('aiFeedback', {
			attemptId: args.attemptId,
			transcript: args.transcript,
			confidence: args.confidence,
			errorTags: args.errorTags,
			score: args.score,
			feedbackText: args.feedbackText,
			createdAt: Date.now()
		});
	}
});

export const patchAttemptStatus = internalMutation({
	args: { attemptId: v.id('attempts'), status: v.string() },
	handler: async (ctx, { attemptId, status }) => {
		await ctx.db.patch(attemptId, { status });
	}
});
