import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';

// Default preferences
const DEFAULT_PREFERENCES = {
	quietHoursStart: 22, // 10 PM
	quietHoursEnd: 8, // 8 AM
	notificationsPerPhrase: 3,
	timeZone: 'Africa/Johannesburg'
};

// Get user preferences (with defaults)
export const get = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);

		const prefs = await ctx.db
			.query('userPreferences')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();

		if (!prefs) {
			return {
				userId,
				quietHoursStart: 22,
				quietHoursEnd: DEFAULT_PREFERENCES.quietHoursEnd,
				notificationsPerPhrase: DEFAULT_PREFERENCES.notificationsPerPhrase,
				pushSubscription: undefined,
				timeZone: DEFAULT_PREFERENCES.timeZone,
				uiLocale: 'en',
				uiSkin: 'default'
			};
		}

		return { ...prefs, uiLocale: prefs.uiLocale ?? 'en', uiSkin: prefs.uiSkin ?? 'default' };
	}
});

// Get profile image URL from storage
export const getProfileImageUrl = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		const prefs = await ctx.db
			.query('userPreferences')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();
		if (!prefs?.profileImageStorageId) return null;
		return await ctx.storage.getUrl(prefs.profileImageStorageId);
	}
});

// Generate upload URL for profile images (no billing check)
export const generateProfileImageUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		await getAuthUserId(ctx);
		return await ctx.storage.generateUploadUrl();
	}
});

// Upsert user preferences
export const upsert = mutation({
	args: {
		quietHoursStart: v.optional(v.number()),
		quietHoursEnd: v.optional(v.number()),
		notificationsPerPhrase: v.optional(v.number()),
		pushSubscription: v.optional(v.string()),
		timeZone: v.optional(v.string()),
		uiLocale: v.optional(v.string()),
		uiSkin: v.optional(v.string()),
		profileImageStorageId: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);

		const existing = await ctx.db
			.query('userPreferences')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				...(args.quietHoursStart !== undefined && { quietHoursStart: args.quietHoursStart }),
				...(args.quietHoursEnd !== undefined && { quietHoursEnd: args.quietHoursEnd }),
				...(args.notificationsPerPhrase !== undefined && {
					notificationsPerPhrase: args.notificationsPerPhrase
				}),
				...(args.pushSubscription !== undefined && { pushSubscription: args.pushSubscription }),
				...(args.timeZone !== undefined && { timeZone: args.timeZone }),
				...(args.uiLocale !== undefined && { uiLocale: args.uiLocale }),
				...(args.uiSkin !== undefined && { uiSkin: args.uiSkin }),
				...(args.profileImageStorageId !== undefined && { profileImageStorageId: args.profileImageStorageId })
			});
			return existing._id;
		}

		return await ctx.db.insert('userPreferences', {
			userId,
			quietHoursStart: args.quietHoursStart ?? DEFAULT_PREFERENCES.quietHoursStart,
			quietHoursEnd: args.quietHoursEnd ?? DEFAULT_PREFERENCES.quietHoursEnd,
			notificationsPerPhrase:
				args.notificationsPerPhrase ?? DEFAULT_PREFERENCES.notificationsPerPhrase,
			pushSubscription: args.pushSubscription,
			timeZone: args.timeZone ?? DEFAULT_PREFERENCES.timeZone,
			uiLocale: args.uiLocale,
			uiSkin: args.uiSkin,
			profileImageStorageId: args.profileImageStorageId
		});
	}
});
