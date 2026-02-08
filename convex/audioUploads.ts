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
