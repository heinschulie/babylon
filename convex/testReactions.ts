import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const EMOJI_CONFIG: Record<string, { sentence: string; mood: string }> = {
	'😎': { sentence: 'The cat wore sunglasses to the job interview', mood: 'chill' },
	'💩': { sentence: 'Someone left a flaming bag on the porch again', mood: 'angry' },
	'🔥': { sentence: 'The server room is fine, everything is fine', mood: 'happy' },
};

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
		// Get all reactions for this parent
		const reactions = await ctx.db
			.query('testTable')
			.withIndex('by_parentId', (q) => q.eq('parentId', parentId))
			.collect();

		// Count by emoji
		const counts = new Map<string, number>();
		for (const reaction of reactions) {
			counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
		}

		// Convert to array and sort descending by count
		return Array.from(counts.entries())
			.map(([emoji, count]) => ({ emoji, count }))
			.sort((a, b) => b.count - a.count);
	},
});