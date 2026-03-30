import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { validateEmoji, countByEmoji } from './emojiConfig';

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
			throw new Error('Parent emoji entry not found');
		}

		const config = validateEmoji(emoji);

		// Create reaction entry with parentId set
		return ctx.db.insert('testTable', {
			emoji,
			mood: config.mood,
			sentence: config.sentence,
			userId,
			createdAt: Date.now(),
			parentId, // This makes it a reaction, not a top-level entry
		});
	},
});

export const getReactionCounts = query({
	args: {
		parentId: v.id('testTable'),
	},
	handler: async (ctx, { parentId }) => {
		// Use the by_parentId index to fetch all reactions for this parent
		const reactions = await ctx.db
			.query('testTable')
			.withIndex('by_parentId', q => q.eq('parentId', parentId))
			.collect();

		// Group by emoji and return counts
		return countByEmoji(reactions);
	},
});