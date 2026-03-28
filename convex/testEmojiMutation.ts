import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const EMOJI_CONFIG: Record<string, { sentence: string; mood: string }> = {
	'😎': { sentence: 'The cat wore sunglasses to the job interview', mood: 'chill' },
	'💩': { sentence: 'Someone left a flaming bag on the porch again', mood: 'angry' },
	'🔥': { sentence: 'The server room is fine, everything is fine', mood: 'happy' },
};

const VALID_EMOJIS = Object.keys(EMOJI_CONFIG);
const MAX_RECENT_ENTRIES = 20;

export const submitEmoji = mutation({
	args: {
		emoji: v.string(),
		mood: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, { emoji, mood, userId }) => {
		const config = EMOJI_CONFIG[emoji];
		if (!config) {
			throw new Error(`Invalid emoji: ${emoji}. Must be one of: ${VALID_EMOJIS.join(', ')}`);
		}

		// Validate mood matches emoji config
		if (config.mood !== mood) {
			throw new Error(`Mood mismatch: ${emoji} should have mood '${config.mood}', got '${mood}'`);
		}

		return ctx.db.insert('testTable', {
			emoji,
			mood,
			sentence: config.sentence,
			userId,
			createdAt: Date.now(),
		});
	},
});

export const getEmojiLeaderboard = query({
	args: {
		mood: v.optional(v.string()),
	},
	handler: async (ctx, { mood }) => {
		let entries;
		if (mood) {
			entries = await ctx.db
				.query('testTable')
				.filter((q) => q.eq(q.field('mood'), mood))
				.collect();
		} else {
			entries = await ctx.db.query('testTable').collect();
		}

		const counts = new Map<string, number>();
		for (const entry of entries) {
			counts.set(entry.emoji, (counts.get(entry.emoji) ?? 0) + 1);
		}

		return Array.from(counts.entries())
			.map(([emoji, count]) => ({ emoji, count }))
			.sort((a, b) => b.count - a.count || a.emoji.localeCompare(b.emoji));
	},
});

export const listRecentEmojis = query({
	args: {},
	handler: async (ctx) => {
		return ctx.db
			.query('testTable')
			.withIndex('by_createdAt')
			.order('desc')
			.take(MAX_RECENT_ENTRIES);
	},
});