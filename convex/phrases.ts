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

// List phrases for a session
export const listBySession = query({
	args: { sessionId: v.id('sessions') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);

		// Verify session ownership
		const session = await ctx.db.get(args.sessionId);
		if (!session || session.userId !== userId) {
			throw new Error('Session not found or not authorized');
		}

		return await ctx.db
			.query('phrases')
			.withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
			.order('desc')
			.collect();
	}
});

// Create a phrase in a session
export const create = mutation({
	args: {
		sessionId: v.id('sessions'),
		english: v.string(),
		translation: v.string()
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);

		// Verify session ownership
		const session = await ctx.db.get(args.sessionId);
		if (!session) {
			throw new Error('Session not found');
		}
		if (session.userId !== userId) {
			throw new Error('Not authorized to add phrases to this session');
		}

		return await ctx.db.insert('phrases', {
			sessionId: args.sessionId,
			userId,
			english: args.english,
			translation: args.translation,
			createdAt: Date.now()
		});
	}
});

// Update a phrase
export const update = mutation({
	args: {
		id: v.id('phrases'),
		english: v.optional(v.string()),
		translation: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const phrase = await ctx.db.get(args.id);

		if (!phrase) {
			throw new Error('Phrase not found');
		}

		if (phrase.userId !== userId) {
			throw new Error('Not authorized');
		}

		await ctx.db.patch(args.id, {
			...(args.english !== undefined && { english: args.english }),
			...(args.translation !== undefined && { translation: args.translation })
		});
	}
});

// Remove a phrase
export const remove = mutation({
	args: { id: v.id('phrases') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const phrase = await ctx.db.get(args.id);

		if (!phrase) {
			throw new Error('Phrase not found');
		}

		if (phrase.userId !== userId) {
			throw new Error('Not authorized');
		}

		await ctx.db.delete(args.id);
	}
});
