import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { EMOJI_CONFIG, countByEmoji } from './lib/emojiConfig';

export const addReaction = mutation({
	args: {
		parentId: v.id('testTable'),
		emoji: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, { parentId, emoji, userId }) => {
		// Validate parentId exists
		const parent = await ctx.db.get(parentId);
		if (!parent) {
			throw new Error('Parent entry not found');
		}

		// Validate emoji
		const config = EMOJI_CONFIG[emoji];
		if (!config) {
			throw new Error(`Invalid emoji: ${emoji}`);
		}

		// Create reaction entry
		return await ctx.db.insert('testTable', {
			emoji,
			sentence: config.sentence,
			mood: config.mood,
			userId,
			createdAt: Date.now(),
			parentId,
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