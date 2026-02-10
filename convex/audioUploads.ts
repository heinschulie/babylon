import { mutation } from './_generated/server';
import { getAuthUserId } from './lib/auth';
import { assertRecordingAllowed } from './lib/billing';

export const generateUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		await assertRecordingAllowed(ctx, userId, 0);
		return await ctx.storage.generateUploadUrl();
	}
});

export const generateUploadUrlForVerifier = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		const profile = await ctx.db
			.query('verifierProfiles')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();

		if (!profile?.active) {
			throw new Error('Active verifier profile required');
		}

		return await ctx.storage.generateUploadUrl();
	}
});
