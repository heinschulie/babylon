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
			throw new Error(`Parent entry does not exist: ${parentId}`);
		}

		// Validate emoji is in config
		const config = EMOJI_CONFIG[emoji];
		if (!config) {
			throw new Error(`Invalid emoji: ${emoji}. Must be one of: ${Object.keys(EMOJI_CONFIG).join(', ')}`);
		}

		// Create reaction entry
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

		const counts = new Map<string, number>();
		for (const reaction of reactions) {
			counts.set(reaction.emoji, (counts.get(reaction.emoji) ?? 0) + 1);
		}

		return Array.from(counts.entries())
			.map(([emoji, count]) => ({ emoji, count }))
			.sort((a, b) => b.count - a.count);
	},
});