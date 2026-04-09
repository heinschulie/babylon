import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { validateAndNormalizeTags } from './lib/tags';
import { internal } from './_generated/api';
import { getAuthUserId } from './lib/auth';

const MOOD_BY_INDEX = ['chill', 'angry', 'happy'] as const;
const MAX_TAG_LENGTH = 20;

function deriveMood(optionIndex: number): string {
	return MOOD_BY_INDEX[Math.min(optionIndex, MOOD_BY_INDEX.length - 1)];
}

/** Validate, normalize, and enforce length limit on tags. */
function validateAndProcessTags(tags: string[]): string[] {
	const normalized = validateAndNormalizeTags(tags);
	for (const tag of normalized) {
		if (tag.length > MAX_TAG_LENGTH) throw new Error('Tags must not exceed 20 characters');
	}
	return normalized;
}

export const createPoll = mutation({
	args: {
		question: v.string(),
		options: v.array(v.string()),
		tags: v.optional(v.array(v.string())),
		expiresAt: v.optional(v.number()),
	},
	handler: async (ctx, { question, options, tags, expiresAt }) => {
		// Validate question is non-empty
		if (!question.trim()) {
			throw new Error('Question must not be empty');
		}

		// Validate at least 2 options
		if (options.length < 2) {
			throw new Error('Poll must have at least 2 options');
		}

		// Validate no empty options
		if (options.some(opt => !opt.trim())) {
			throw new Error('Options must not be empty');
		}

		const processedTags = tags ? validateAndProcessTags(tags) : undefined;

		return ctx.db.insert('testPollTable', {
			question,
			options,
			createdAt: Date.now(),
			...(processedTags && { tags: processedTags }),
			...(expiresAt && { expiresAt }),
		});
	},
});

export const listPolls = query({
	args: {},
	handler: async (ctx) => {
		return ctx.db
			.query('testPollTable')
			.withIndex('by_createdAt')
			.order('desc')
			.take(20);
	},
});

export const castVote = mutation({
	args: {
		pollId: v.id('testPollTable'),
		option: v.string(),
		userId: v.string(),
	},
	handler: async (ctx, { pollId, option, userId }) => {
		// Auth check first (expert guidance)
		await getAuthUserId(ctx);

		const poll = await ctx.db.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		// Check if poll is closed or expired
		if (poll.closedAt) {
			throw new Error('Poll is closed');
		}

		if (poll.expiresAt && poll.expiresAt <= Date.now()) {
			throw new Error('Poll has expired');
		}

		const optionIndex = poll.options.indexOf(option);
		if (optionIndex === -1) {
			throw new Error(`Invalid option: ${option}. Must be one of: ${poll.options.join(', ')}`);
		}

		// Insert entry first
		const entryId = await ctx.db.insert('testTable', {
			emoji: option,
			sentence: poll.question,
			mood: deriveMood(optionIndex),
			userId,
			pollId,
			createdAt: Date.now()
		});

		// Then check and unlock achievements
		await ctx.runMutation(internal.testAchievements.checkAndUnlockAchievements, { userId });

		return entryId;
	},
});

export const closePoll = mutation({
	args: {
		pollId: v.id('testPollTable'),
	},
	handler: async (ctx, { pollId }) => {
		const poll = await ctx.db.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		await ctx.db.patch(pollId, {
			closedAt: Date.now(),
		});

		return null;
	},
});

export const setExpiry = mutation({
	args: { pollId: v.id('testPollTable'), expiresAt: v.number() },
	handler: async (ctx, { pollId, expiresAt }) => {
		const poll = await ctx.db.get(pollId);
		if (!poll) {
			throw new Error('Poll not found');
		}

		await ctx.db.patch(pollId, { expiresAt });
	},
});

export const getActivePolls = query({
	args: {},
	handler: async (ctx) => {
		const allPolls = await ctx.db
			.query('testPollTable')
			.withIndex('by_createdAt')
			.order('desc')
			.collect();

		const now = Date.now();
		// Filter to only active polls (expiresAt is undefined OR expiresAt > now)
		const activePolls = allPolls.filter(poll =>
			!poll.expiresAt || poll.expiresAt > now
		);

		// Sort by expiresAt ascending (soonest-expiring first), undefined last
		return activePolls.sort((a, b) => {
			if (!a.expiresAt && !b.expiresAt) return 0;
			if (!a.expiresAt) return 1; // a goes to end
			if (!b.expiresAt) return -1; // b goes to end
			return a.expiresAt - b.expiresAt; // ascending
		});
	},
});

export const getPollResults = query({
	args: {
		pollId: v.id('testPollTable'),
	},
	handler: async (ctx, { pollId }) => {
		const votes = await ctx.db
			.query('testTable')
			.withIndex('by_pollId', (q) => q.eq('pollId', pollId))
			.collect();

		const counts = new Map<string, number>();
		for (const vote of votes) {
			counts.set(vote.emoji, (counts.get(vote.emoji) || 0) + 1);
		}

		return Array.from(counts.entries())
			.map(([option, count]) => ({ option, count }))
			.sort((a, b) => b.count - a.count);
	},
});
