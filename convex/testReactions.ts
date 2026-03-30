import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

// Re-use the EMOJI_CONFIG from testEmojiMutation
const EMOJI_CONFIG: Record<string, { sentence: string; mood: string }> = {
	'😎': { sentence: 'The cat wore sunglasses to the job interview', mood: 'chill' },
	'💩': { sentence: 'Someone left a flaming bag on the porch again', mood: 'angry' },
	'🔥': { sentence: 'The server room is fine, everything is fine', mood: 'happy' },
};

const VALID_EMOJIS = Object.keys(EMOJI_CONFIG);

/** Group entries by emoji and return sorted counts (descending, alphabetical tiebreak). */
function countByEmoji(entries: Array<{ emoji: string }>): Array<{ emoji: string; count: number }> {
	const counts = new Map<string, number>();
	for (const { emoji } of entries) {
		counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
	}
	return Array.from(counts.entries())
		.map(([emoji, count]) => ({ emoji, count }))
		.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
}

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

		// Validate emoji is in EMOJI_CONFIG
		const config = EMOJI_CONFIG[emoji];
		if (!config) {
			throw new Error(`Invalid emoji: ${emoji}. Must be one of: ${VALID_EMOJIS.join(', ')}`);
		}

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