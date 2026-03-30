import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { EMOJI_CONFIG, VALID_EMOJIS, countByEmoji } from './testEmojiConfig';

export const addReaction = mutation({
	args: {
		parentId: v.id('testTable'),
		emoji: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, { parentId, emoji, userId }) => {
		const parent = await ctx.db.get(parentId);
		if (!parent) {
			throw new Error(`Parent entry does not exist: ${parentId}`);
		}

		const config = EMOJI_CONFIG[emoji];
		if (!config) {
			throw new Error(`Invalid emoji: ${emoji}. Must be one of: ${VALID_EMOJIS.join(', ')}`);
		}

		return ctx.db.insert('testTable', {
			parentId,
			emoji,
			mood: config.mood,
			userId,
			sentence: config.sentence,
			createdAt: Date.now(),
		});
	},
});

export const getReactionCounts = query({
	args: {
		parentId: v.id('testTable'),
	},
	handler: async (ctx, { parentId }) => {
		const reactions = await ctx.db
			.query('testTable')
			.withIndex('by_parentId', (q) => q.eq('parentId', parentId))
			.collect();

		return countByEmoji(reactions);
	},
});