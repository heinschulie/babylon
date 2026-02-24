import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId } from './lib/auth';
import { inferPhraseCategory, PHRASE_CATEGORIES } from './lib/phraseCategories';
import { requireSupportedLanguage } from './lib/languages';

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
				targetLanguage: session.targetLanguage,
				targetLanguageCode: session.targetLanguageCode ?? null,
				targetLanguageIso639_1: session.targetLanguageIso639_1 ?? null
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
			languageCode: session.targetLanguageCode,
			categoryKey: inferPhraseCategory(args.english, args.translation).key,
			categoryLabel: inferPhraseCategory(args.english, args.translation).label,
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

// Create a phrase directly in the learner phrase library.
export const createDirect = mutation({
	args: {
		english: v.string(),
		translation: v.optional(v.string()),
		languageCode: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const language = requireSupportedLanguage(args.languageCode ?? 'xh-ZA');
		const needsTranslation = !args.translation?.trim();
		const category = inferPhraseCategory(args.english, args.translation ?? '');

		const phraseId = await ctx.db.insert('phrases', {
			userId,
			english: args.english,
			translation: args.translation?.trim() ?? '',
			languageCode: language.bcp47,
			categoryKey: category.key,
			categoryLabel: category.label,
			translationStatus: needsTranslation ? 'pending' : 'ready',
			createdAt: Date.now()
		});

		if (needsTranslation) {
			await ctx.scheduler.runAfter(0, internal.translatePhrase.translateAndPhoneticize, {
				phraseId,
				english: args.english,
				languageCode: language.bcp47
			});
		}

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
			...(args.translation !== undefined && { translation: args.translation }),
			...((args.english !== undefined || args.translation !== undefined) && {
				categoryKey: inferPhraseCategory(
					args.english ?? phrase.english,
					args.translation ?? phrase.translation
				).key,
				categoryLabel: inferPhraseCategory(
					args.english ?? phrase.english,
					args.translation ?? phrase.translation
				).label
			})
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

		// Fetch legacy session metadata for phrases that still reference sessions.
		const sessionCache = new Map<string, { targetLanguage: string; targetLanguageCode: string | null }>();
		const results = [];
		for (const phrase of phrases) {
			let sessionData: { targetLanguage: string; targetLanguageCode: string | null } | undefined;
			if (phrase.sessionId) {
				sessionData = sessionCache.get(phrase.sessionId);
				if (!sessionData) {
					const session = await ctx.db.get(phrase.sessionId);
					if (session) {
						sessionData = {
							targetLanguage: session.targetLanguage,
							targetLanguageCode: session.targetLanguageCode ?? null
						};
						sessionCache.set(phrase.sessionId, sessionData);
					}
				}
			}
			results.push({
				...phrase,
				targetLanguage: sessionData?.targetLanguage ?? 'Xhosa',
				targetLanguageCode: phrase.languageCode ?? sessionData?.targetLanguageCode ?? 'xh-ZA',
				categoryKey: phrase.categoryKey ?? inferPhraseCategory(phrase.english, phrase.translation).key,
				categoryLabel: phrase.categoryLabel ?? inferPhraseCategory(phrase.english, phrase.translation).label
			});
		}

		return results;
	}
});

export const listGroupedByCategory = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		const phrases = await ctx.db
			.query('phrases')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.order('desc')
			.collect();

		const grouped = new Map<
			string,
			{
				key: string;
				label: string;
				phrases: typeof phrases;
			}
		>();

		for (const category of PHRASE_CATEGORIES) {
			grouped.set(category.key, {
				key: category.key,
				label: category.label,
				phrases: []
			});
		}

		for (const phrase of phrases) {
			const inferred = inferPhraseCategory(phrase.english, phrase.translation);
			const key = phrase.categoryKey ?? inferred.key;
			const label = phrase.categoryLabel ?? inferred.label;
			const existing = grouped.get(key) ?? { key, label, phrases: [] };
			existing.phrases.push({
				...phrase,
				categoryKey: key,
				categoryLabel: label,
				languageCode: phrase.languageCode ?? 'xh-ZA'
			});
			grouped.set(key, existing);
		}

		return Array.from(grouped.values()).filter((group) => group.phrases.length > 0);
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

// Re-categorize all phrases using the latest category definitions.
// Run once after deploying new categories: npx convex run phrases:recategorizeAll
export const recategorizeAll = internalMutation({
	args: {},
	handler: async (ctx) => {
		const phrases = await ctx.db.query('phrases').collect();
		for (const phrase of phrases) {
			const category = inferPhraseCategory(phrase.english, phrase.translation);
			if (phrase.categoryKey !== category.key) {
				await ctx.db.patch(phrase._id, {
					categoryKey: category.key,
					categoryLabel: category.label
				});
			}
		}
	}
});
