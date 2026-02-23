import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

export const patchTranslation = internalMutation({
	args: {
		phraseId: v.id('phrases'),
		translation: v.string(),
		phonetic: v.string(),
		status: v.string()
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.phraseId, {
			translation: args.translation,
			phonetic: args.phonetic,
			translationStatus: args.status
		});
	}
});
