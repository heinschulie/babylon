import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';

// Register an uploaded audio asset (storageKey is provider-specific)
export const create = mutation({
	args: {
		storageKey: v.string(),
		contentType: v.string(),
		phraseId: v.optional(v.id('phrases')),
		attemptId: v.optional(v.id('attempts')),
		durationMs: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);

		return await ctx.db.insert('audioAssets', {
			userId,
			storageKey: args.storageKey,
			contentType: args.contentType,
			phraseId: args.phraseId,
			attemptId: args.attemptId,
			durationMs: args.durationMs,
			createdAt: Date.now()
		});
	}
});

// List audio assets for a phrase
export const listByPhrase = query({
	args: { phraseId: v.id('phrases') },
	handler: async (ctx, { phraseId }) => {
		const userId = await getAuthUserId(ctx);
		return await ctx.db
			.query('audioAssets')
			.withIndex('by_phrase', (q) => q.eq('phraseId', phraseId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.order('desc')
			.collect();
	}
});
