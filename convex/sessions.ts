import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';
import { requireSupportedLanguage } from './lib/languages';

// Get a single session by ID
export const get = query({
	args: { id: v.id('sessions') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const session = await ctx.db.get(args.id);

		if (!session || session.userId !== userId) {
			return null;
		}

		return session;
	}
});

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
		targetLanguage: v.optional(v.string()),
		targetLanguageCode: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const languageInput = args.targetLanguageCode ?? args.targetLanguage ?? '';
		const language = requireSupportedLanguage(languageInput);

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
			targetLanguage: language.displayName,
			targetLanguageCode: language.bcp47,
			targetLanguageIso639_1: language.iso639_1,
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
