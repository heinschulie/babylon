import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const EMOJI_CONFIG: Record<string, { sentence: string; mood: string }> = {
	'😎': { sentence: 'The cat wore sunglasses to the job interview', mood: 'chill' },
	'💩': { sentence: 'Someone left a flaming bag on the porch again', mood: 'angry' },
	'🔥': { sentence: 'The server room is fine, everything is fine', mood: 'happy' },
};

const VALID_EMOJIS = Object.keys(EMOJI_CONFIG);
const MAX_RECENT_ENTRIES = 20;

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

		// Compute streak: query user's most recent prior submission
		const priorSubmission = await ctx.db
			.query('testTable')
			.withIndex('by_userId_createdAt', q => q.eq('userId', userId))
			.order('desc')
			.first();

		let streakDay = 1; // Default for first-ever submission
		if (priorSubmission) {
			const now = Date.now();
			const todayUTC = Math.floor(now / 86400000) * 86400000; // UTC midnight today
			const yesterdayUTC = todayUTC - 86400000; // UTC midnight yesterday
			const priorDayUTC = Math.floor(priorSubmission.createdAt / 86400000) * 86400000;

			if (priorDayUTC === yesterdayUTC) {
				// Consecutive day: increment prior streak
				streakDay = (priorSubmission.streakDay ?? 1) + 1;
			} else if (priorDayUTC === todayUTC) {
				// Same day: carry forward prior streak
				streakDay = priorSubmission.streakDay ?? 1;
			} else {
				// Gap > 1 day: reset to 1
				streakDay = 1;
			}
		}

		return ctx.db.insert('testTable', {
			emoji,
			mood,
			sentence: config.sentence,
			userId,
			createdAt: Date.now(),
			streakDay,
		});
	},
});

export const getEmojiLeaderboard = query({
	args: {
		mood: v.optional(v.string()),
	},
	handler: async (ctx, { mood }) => {
		const query = ctx.db.query('testTable');
		const entries = mood
			? await query.filter((q) => q.eq(q.field('mood'), mood)).collect()
			: await query.collect();
		return countByEmoji(entries);
	},
});

export const getUserStreak = query({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, { userId }) => {
		const mostRecentSubmission = await ctx.db
			.query('testTable')
			.withIndex('by_userId_createdAt', q => q.eq('userId', userId))
			.order('desc')
			.first();

		return { streak: mostRecentSubmission?.streakDay ?? 0 };
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