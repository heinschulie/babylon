import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId } from './lib/auth';

// Get a single phrase by ID
export const get = query({
	args: { id: v.id('phrases') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const phrase = await ctx.db.get(args.id);

		if (!phrase || phrase.userId !== userId) {
			return null;
		}

		return phrase;
	}
});

// List phrases for a session (includes session metadata)
export const listBySession = query({
	args: { sessionId: v.id('sessions') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);

		// Verify session ownership
		const session = await ctx.db.get(args.sessionId);
		if (!session || session.userId !== userId) {
			throw new Error('Session not found or not authorized');
		}

		const phrases = await ctx.db
			.query('phrases')
			.withIndex('by_session', (q) => q.eq('sessionId', args.sessionId))
			.order('desc')
			.collect();

		return {
			phrases,
			session: {
				_id: session._id,
				date: session.date,
				targetLanguage: session.targetLanguage
			}
		};
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

		const phraseId = await ctx.db.insert('phrases', {
			sessionId: args.sessionId,
			userId,
			english: args.english,
			translation: args.translation,
			createdAt: Date.now()
		});

		// Schedule notifications for this phrase (if user has push subscription)
		const prefs = await ctx.db
			.query('userPreferences')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();

		if (prefs?.pushSubscription) {
			await ctx.scheduler.runAfter(0, internal.notifications.scheduleForPhrase, {
				phraseId,
				userId
			});
		}

		return phraseId;
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

// List all phrases for the current user (across all sessions)
export const listAllByUser = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		const phrases = await ctx.db
			.query('phrases')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.collect();

		// Fetch session metadata for each phrase to include the target language
		const sessionCache = new Map<string, { targetLanguage: string }>();
		const results = [];
		for (const phrase of phrases) {
			let sessionData = sessionCache.get(phrase.sessionId);
			if (!sessionData) {
				const session = await ctx.db.get(phrase.sessionId);
				if (session) {
					sessionData = { targetLanguage: session.targetLanguage };
					sessionCache.set(phrase.sessionId, sessionData);
				}
			}
			results.push({
				...phrase,
				targetLanguage: sessionData?.targetLanguage ?? 'Unknown'
			});
		}

		return results;
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
