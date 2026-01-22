import { v } from 'convex/values';
import { mutation, query, type QueryCtx, type MutationCtx } from './_generated/server';
import { authComponent } from './auth';

// Default preferences
const DEFAULT_PREFERENCES = {
	quietHoursStart: 22, // 10 PM
	quietHoursEnd: 8, // 8 AM
	notificationsPerPhrase: 3
};

// Helper to get authenticated user ID
async function getAuthUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
	const user = await authComponent.getAuthUser(ctx);
	if (!user) {
		throw new Error('Not authenticated');
	}
	return user.id;
}

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
				pushSubscription: undefined
			};
		}

		return prefs;
	}
});

// Upsert user preferences
export const upsert = mutation({
	args: {
		quietHoursStart: v.optional(v.number()),
		quietHoursEnd: v.optional(v.number()),
		notificationsPerPhrase: v.optional(v.number()),
		pushSubscription: v.optional(v.string())
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
				...(args.pushSubscription !== undefined && { pushSubscription: args.pushSubscription })
			});
			return existing._id;
		}

		return await ctx.db.insert('userPreferences', {
			userId,
			quietHoursStart: args.quietHoursStart ?? DEFAULT_PREFERENCES.quietHoursStart,
			quietHoursEnd: args.quietHoursEnd ?? DEFAULT_PREFERENCES.quietHoursEnd,
			notificationsPerPhrase:
				args.notificationsPerPhrase ?? DEFAULT_PREFERENCES.notificationsPerPhrase,
			pushSubscription: args.pushSubscription
		});
	}
});
