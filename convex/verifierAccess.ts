import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';
import { requireSupportedLanguage, SUPPORTED_LANGUAGES } from './lib/languages';

export const upsertMyProfile = mutation({
	args: {
		firstName: v.string(),
		profileImageUrl: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const now = Date.now();
		const existing = await ctx.db
			.query('verifierProfiles')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();

		if (!existing) {
			await ctx.db.insert('verifierProfiles', {
				userId,
				firstName: args.firstName.trim(),
				profileImageUrl: args.profileImageUrl,
				active: true,
				createdAt: now,
				updatedAt: now
			});
			return;
		}

		await ctx.db.patch(existing._id, {
			firstName: args.firstName.trim(),
			profileImageUrl: args.profileImageUrl,
			active: true,
			updatedAt: now
		});
	}
});

export const setMyLanguageActive = mutation({
	args: {
		languageCode: v.string(),
		active: v.boolean()
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const language = requireSupportedLanguage(args.languageCode);
		const now = Date.now();

		const existing = await ctx.db
			.query('verifierLanguageMemberships')
			.withIndex('by_user_language', (q) => q.eq('userId', userId).eq('languageCode', language.bcp47))
			.unique();

		if (!existing) {
			await ctx.db.insert('verifierLanguageMemberships', {
				userId,
				languageCode: language.bcp47,
				active: args.active,
				createdAt: now,
				updatedAt: now
			});
			return;
		}

		await ctx.db.patch(existing._id, {
			active: args.active,
			updatedAt: now
		});
	}
});

export const getMyVerifierState = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		const profile = await ctx.db
			.query('verifierProfiles')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();
		const memberships = await ctx.db
			.query('verifierLanguageMemberships')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.collect();

		return {
			profile: profile
				? {
						firstName: profile.firstName,
						profileImageUrl: profile.profileImageUrl ?? null,
						active: profile.active
					}
				: null,
			languages: memberships.map((membership) => ({
				languageCode: membership.languageCode,
				active: membership.active
			}))
		};
	}
});

export const listSupportedLanguages = query({
	args: {},
	handler: async () => {
		return SUPPORTED_LANGUAGES.map((language) => ({
			code: language.bcp47,
			iso639_1: language.iso639_1,
			displayName: language.displayName
		}));
	}
});

