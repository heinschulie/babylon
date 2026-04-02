import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId } from './lib/auth';

const EMOJI_CONFIG: Record<string, { sentence: string; mood: string }> = {
	'😎': { sentence: 'The cat wore sunglasses to the job interview', mood: 'chill' },
	'💩': { sentence: 'Someone left a flaming bag on the porch again', mood: 'angry' },
	'🔥': { sentence: 'The server room is fine, everything is fine', mood: 'happy' },
};

const VALID_EMOJIS = Object.keys(EMOJI_CONFIG);
const MAX_RECENT_ENTRIES = 20;
const MS_PER_DAY = 86400000;

/** Compute the streak day for a new submission given the user's most recent prior one. */
function computeStreakDay(
	prior: { createdAt: number; streakDay?: number } | null,
	nowMs: number
): number {
	if (!prior) return 1;

	const toUtcDay = (ms: number) => Math.floor(ms / MS_PER_DAY);
	const todayDay = toUtcDay(nowMs);
	const priorDay = toUtcDay(prior.createdAt);
	const gap = todayDay - priorDay;
	const priorStreak = prior.streakDay ?? 1;

	if (gap === 1) return priorStreak + 1; // consecutive day
	if (gap === 0) return priorStreak; // same day — carry forward
	return 1; // gap > 1 day — reset
}

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
		// Auth check first (expert guidance)
		await getAuthUserId(ctx);

		const config = EMOJI_CONFIG[emoji];
		if (!config) {
			throw new Error(`Invalid emoji: ${emoji}. Must be one of: ${VALID_EMOJIS.join(', ')}`);
		}

		// Validate mood matches emoji config
		if (config.mood !== mood) {
			throw new Error(`Mood mismatch: ${emoji} should have mood '${config.mood}', got '${mood}'`);
		}

		// Compute streak from most recent prior submission
		const priorSubmission = await ctx.db
			.query('testTable')
			.withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
			.order('desc')
			.first();

		const now = Date.now();
		const streakDay = computeStreakDay(priorSubmission, now);

		// Insert entry first
		const entryId = await ctx.db.insert('testTable', {
			emoji,
			mood,
			sentence: config.sentence,
			userId,
			createdAt: Date.now(),
			streakDay,
		});

		// Then check and unlock achievements
		await ctx.runMutation(internal.testAchievements.checkAndUnlockAchievements, { userId });

		return entryId;
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

export const getSentenceStats = query({
	args: {},
	handler: async (ctx) => {
		const entries = await ctx.db.query('testTable').collect();
		const withSentences = entries.filter(e => e.sentence.trim() !== '');

		const totalSentences = withSentences.length;

		if (totalSentences === 0) {
			return {
				totalSentences: 0,
				longestSentence: '',
				longestWordCount: 0,
				mostCommonFirstWord: null as string | null,
				wordCountDistribution: [
					{ bucket: '1', count: 0 },
					{ bucket: '2', count: 0 },
					{ bucket: '3', count: 0 },
					{ bucket: '4', count: 0 },
					{ bucket: '5+', count: 0 },
				],
			};
		}

		// Word counts per sentence
		const wordCounts = withSentences.map(e => ({
			sentence: e.sentence,
			count: e.sentence.split(/\s+/).filter(s => s !== '').length,
			firstWord: e.sentence.split(/\s+/).filter(s => s !== '')[0],
		}));

		// Longest sentence
		const longest = wordCounts.reduce((a, b) => (b.count > a.count ? b : a));

		// Most common first word
		const firstWordFreq = new Map<string, number>();
		for (const { firstWord } of wordCounts) {
			if (firstWord) {
				firstWordFreq.set(firstWord, (firstWordFreq.get(firstWord) ?? 0) + 1);
			}
		}
		let mostCommonFirstWord: string | null = null;
		let maxFreq = 0;
		for (const [word, freq] of firstWordFreq) {
			if (freq > maxFreq) {
				maxFreq = freq;
				mostCommonFirstWord = word;
			}
		}

		// Word count distribution buckets
		const buckets: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
		for (const { count } of wordCounts) {
			if (count >= 5) buckets['5+']++;
			else buckets[String(count)]++;
		}

		return {
			totalSentences,
			longestSentence: longest.sentence,
			longestWordCount: longest.count,
			mostCommonFirstWord,
			wordCountDistribution: Object.entries(buckets).map(([bucket, count]) => ({ bucket, count })),
		};
	},
});

export const getWordCounts = query({
	args: {},
	handler: async (ctx) => {
		const entries = await ctx.db.query('testTable').collect();

		return entries
			.filter(entry => entry.sentence.trim() !== '')
			.map(entry => ({
				_id: entry._id,
				wordCount: entry.sentence.split(/\s+/).filter(s => s !== '').length
			}));
	},
});