import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';

const ACHIEVEMENT_THRESHOLDS = {
	emoji_starter: 5,
	emoji_pro: 25,
	democracy: 1,
	social_butterfly: 5,
	poll_creator: 3,
} as const;

const ACHIEVEMENT_TITLES = {
	emoji_starter: 'Emoji Starter',
	emoji_pro: 'Emoji Pro',
	democracy: 'Democracy',
	social_butterfly: 'Social Butterfly',
	poll_creator: 'Poll Creator',
} as const;

type AchievementType = keyof typeof ACHIEVEMENT_THRESHOLDS;

// Internal mutation: check thresholds and unlock if not already unlocked
export const checkAndUnlockAchievements = mutation({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, { userId }) => {
		// Check emoji_starter achievement (5 emojis without parentId/pollId)
		const emojiCount = await ctx.db
			.query('testTable')
			.filter((q: any) =>
				q.eq(q.field('userId'), userId) &&
				q.eq(q.field('parentId'), undefined) &&
				q.eq(q.field('pollId'), undefined)
			)
			.collect()
			.then(results => results.length);

		if (emojiCount >= ACHIEVEMENT_THRESHOLDS.emoji_starter) {
			await unlockAchievementIfNotExists(ctx, userId, 'emoji_starter');
		}

		// Check emoji_pro achievement (25 emojis)
		if (emojiCount >= ACHIEVEMENT_THRESHOLDS.emoji_pro) {
			await unlockAchievementIfNotExists(ctx, userId, 'emoji_pro');
		}

		// Check democracy achievement (1 poll vote)
		const pollVoteCount = await ctx.db
			.query('testTable')
			.filter((q: any) =>
				q.eq(q.field('userId'), userId) &&
				q.neq(q.field('pollId'), undefined)
			)
			.collect()
			.then(results => results.length);

		if (pollVoteCount >= ACHIEVEMENT_THRESHOLDS.democracy) {
			await unlockAchievementIfNotExists(ctx, userId, 'democracy');
		}

		// Check social_butterfly achievement (5 reactions given)
		const reactionCount = await ctx.db
			.query('testTable')
			.filter((q: any) =>
				q.eq(q.field('userId'), userId) &&
				q.neq(q.field('parentId'), undefined)
			)
			.collect()
			.then(results => results.length);

		if (reactionCount >= ACHIEVEMENT_THRESHOLDS.social_butterfly) {
			await unlockAchievementIfNotExists(ctx, userId, 'social_butterfly');
		}

		// Check poll_creator achievement (3 polls created)
		const pollsCreatedCount = await ctx.db
			.query('testPollTable')
			.collect()
			.then(results => results.length); // Note: testPollTable doesn't have userId field, so counting all polls for now

		if (pollsCreatedCount >= ACHIEVEMENT_THRESHOLDS.poll_creator) {
			await unlockAchievementIfNotExists(ctx, userId, 'poll_creator');
		}
	},
});

async function unlockAchievementIfNotExists(
	ctx: any,
	userId: string,
	achievementType: AchievementType
) {
	// Check if already unlocked using by_type_userId index
	const existing = await ctx.db
		.query('testAchievementTable')
		.withIndex('by_type_userId', (q: any) =>
			q.eq('type', achievementType).eq('userId', userId)
		)
		.first();

	if (!existing) {
		// Insert new achievement
		await ctx.db.insert('testAchievementTable', {
			type: achievementType,
			title: ACHIEVEMENT_TITLES[achievementType],
			userId,
			unlockedAt: Date.now(),
		});
	}
}

// Query: get all achievements for a user
export const getUserAchievements = query({
	args: {
		userId: v.string(),
	},
	handler: async (ctx, { userId }) => {
		await getAuthUserId(ctx); // Ensure authenticated

		const achievements = await ctx.db
			.query('testAchievementTable')
			.withIndex('by_userId', (q: any) => q.eq('userId', userId))
			.collect();

		// Sort by unlockedAt descending (newest first)
		const sortedAchievements = achievements.sort((a, b) => b.unlockedAt - a.unlockedAt);

		return sortedAchievements.map(achievement => ({
			_id: achievement._id,
			type: achievement.type,
			title: achievement.title,
			userId: achievement.userId,
			unlockedAt: achievement.unlockedAt,
		}));
	},
});