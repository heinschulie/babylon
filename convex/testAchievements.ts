import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';

const ACHIEVEMENT_DEFS = {
  emoji_starter: { title: 'Emoji Starter', threshold: 5 },
  emoji_pro: { title: 'Emoji Pro', threshold: 25 },
  democracy: { title: 'Democracy!', threshold: 1 },
  social_butterfly: { title: 'Social Butterfly', threshold: 5 },
  poll_creator: { title: 'Poll Creator', threshold: 3 },
};

export const checkAndUnlockAchievements = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error('User must be authenticated');
    }

    // Count emoji entries for this user (parentId = undefined AND pollId = undefined)
    const emojiEntries = await ctx.db
      .query('testTable')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .filter((q) => q.and(q.eq(q.field('parentId'), undefined), q.eq(q.field('pollId'), undefined)))
      .collect();

    const emojiCount = emojiEntries.length;

    // Count poll votes for this user (entries with pollId != undefined)
    const pollEntries = await ctx.db
      .query('testTable')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .filter((q) => q.neq(q.field('pollId'), undefined))
      .collect();

    const pollVoteCount = pollEntries.length;

    // Count reactions for this user (entries with parentId != undefined)
    const reactionEntries = await ctx.db
      .query('testTable')
      .withIndex('by_userId_createdAt', (q) => q.eq('userId', userId))
      .filter((q) => q.neq(q.field('parentId'), undefined))
      .collect();

    const reactionCount = reactionEntries.length;
    const newAchievements = [];

    // Check if emoji_starter threshold is met
    if (emojiCount >= ACHIEVEMENT_DEFS.emoji_starter.threshold) {
      // Check if user already has this achievement (idempotency)
      const existingAchievement = await ctx.db
        .query('testAchievementTable')
        .withIndex('by_type_userId', (q) => q.eq('type', 'emoji_starter').eq('userId', userId))
        .unique();

      if (!existingAchievement) {
        // Unlock the achievement
        await ctx.db.insert('testAchievementTable', {
          type: 'emoji_starter',
          title: ACHIEVEMENT_DEFS.emoji_starter.title,
          userId,
          unlockedAt: Date.now(),
        });

        newAchievements.push({
          type: 'emoji_starter',
          title: ACHIEVEMENT_DEFS.emoji_starter.title,
        });
      }
    }

    // Check if democracy threshold is met
    if (pollVoteCount >= ACHIEVEMENT_DEFS.democracy.threshold) {
      // Check if user already has this achievement (idempotency)
      const existingAchievement = await ctx.db
        .query('testAchievementTable')
        .withIndex('by_type_userId', (q) => q.eq('type', 'democracy').eq('userId', userId))
        .unique();

      if (!existingAchievement) {
        // Unlock the achievement
        await ctx.db.insert('testAchievementTable', {
          type: 'democracy',
          title: ACHIEVEMENT_DEFS.democracy.title,
          userId,
          unlockedAt: Date.now(),
        });

        newAchievements.push({
          type: 'democracy',
          title: ACHIEVEMENT_DEFS.democracy.title,
        });
      }
    }

    // Check if social_butterfly threshold is met
    if (reactionCount >= ACHIEVEMENT_DEFS.social_butterfly.threshold) {
      // Check if user already has this achievement (idempotency)
      const existingAchievement = await ctx.db
        .query('testAchievementTable')
        .withIndex('by_type_userId', (q) => q.eq('type', 'social_butterfly').eq('userId', userId))
        .unique();

      if (!existingAchievement) {
        // Unlock the achievement
        await ctx.db.insert('testAchievementTable', {
          type: 'social_butterfly',
          title: ACHIEVEMENT_DEFS.social_butterfly.title,
          userId,
          unlockedAt: Date.now(),
        });

        newAchievements.push({
          type: 'social_butterfly',
          title: ACHIEVEMENT_DEFS.social_butterfly.title,
        });
      }
    }

    return newAchievements;
  },
});

export const getUserAchievements = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error('User must be authenticated');
    }

    const achievements = await ctx.db
      .query('testAchievementTable')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();

    return achievements.map(achievement => ({
      type: achievement.type,
      title: achievement.title,
      unlockedAt: achievement.unlockedAt,
    }));
  },
});