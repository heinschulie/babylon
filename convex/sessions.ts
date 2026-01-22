import { v } from 'convex/values';
import { mutation, query, type QueryCtx, type MutationCtx } from './_generated/server';
import { authComponent } from './auth';

// Helper to get authenticated user ID
async function getAuthUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
	const user = await authComponent.getAuthUser(ctx);
	if (!user) {
		throw new Error('Not authenticated');
	}
	return user.id;
}

// List all sessions for the current user
export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		return await ctx.db
			.query('sessions')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.order('desc')
			.collect();
	}
});

// Get session by date for current user
export const getByDate = query({
	args: { date: v.string() },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		return await ctx.db
			.query('sessions')
			.withIndex('by_user_date', (q) => q.eq('userId', userId).eq('date', args.date))
			.unique();
	}
});

// Create a new session (returns existing if same date)
export const create = mutation({
	args: {
		date: v.string(),
		targetLanguage: v.string()
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);

		// Check for existing session on this date
		const existing = await ctx.db
			.query('sessions')
			.withIndex('by_user_date', (q) => q.eq('userId', userId).eq('date', args.date))
			.unique();

		if (existing) {
			return existing._id;
		}

		return await ctx.db.insert('sessions', {
			userId,
			date: args.date,
			targetLanguage: args.targetLanguage,
			createdAt: Date.now()
		});
	}
});

// Remove session and cascade delete all phrases
export const remove = mutation({
	args: { id: v.id('sessions') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const session = await ctx.db.get(args.id);

		if (!session) {
			throw new Error('Session not found');
		}

		if (session.userId !== userId) {
			throw new Error('Not authorized');
		}

		// Cascade delete phrases
		const phrases = await ctx.db
			.query('phrases')
			.withIndex('by_session', (q) => q.eq('sessionId', args.id))
			.collect();

		for (const phrase of phrases) {
			await ctx.db.delete(phrase._id);
		}

		await ctx.db.delete(args.id);
	}
});
