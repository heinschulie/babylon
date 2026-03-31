import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';
const EMOJI_MOOD_MAP: Record<string, string> = {
	'😎': 'chill',
	'💩': 'angry',
	'🔥': 'happy'
};

export const addReaction = mutation({
	args: {
		parentId: v.id('testTable'),
		emoji: v.string(),
		mood: v.optional(v.string()),
		sentence: v.optional(v.string()),
		userId: v.string()
	},
	handler: async (ctx, args) => {
		await getAuthUserId(ctx);

		const parentEntry = await ctx.db.get(args.parentId);
		if (!parentEntry) {
			throw new Error('Parent entry not found');
		}

		const mood = args.mood ?? EMOJI_MOOD_MAP[args.emoji] ?? 'happy';
		const sentence = args.sentence ?? `Reaction to entry`;

		return await ctx.db.insert('testTable', {
			emoji: args.emoji,
			sentence,
			mood,
			userId: args.userId,
			createdAt: Date.now(),
			parentId: args.parentId
		});
	}
});

export const getReactionCounts = query({
	args: {
		parentId: v.id('testTable')
	},
	handler: async (ctx, args) => {
		// Get all reactions for this parent
		const reactions = await ctx.db
			.query('testTable')
			.withIndex('by_parentId', q => q.eq('parentId', args.parentId))
			.collect();

		// Group by emoji and count
		const emojiCounts = reactions.reduce((acc, reaction) => {
			acc[reaction.emoji] = (acc[reaction.emoji] || 0) + 1;
			return acc;
		}, {} as Record<string, number>);

		// Convert to array format
		return Object.entries(emojiCounts).map(([emoji, count]) => ({
			emoji,
			count
		}));
	}
});