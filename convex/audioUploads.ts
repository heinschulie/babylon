import { mutation } from './_generated/server';
import { getAuthUserId } from './lib/auth';

export const generateUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		await getAuthUserId(ctx);
		return await ctx.storage.generateUploadUrl();
	}
});
