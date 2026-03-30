import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';

type TestEntry = Doc<'testTable'>;

const isOriginalEmoji = (e: TestEntry): boolean => !e.parentId && !e.pollId;
const isPollVote = (e: TestEntry): boolean => e.pollId !== undefined;
const isReaction = (e: TestEntry): boolean => e.parentId !== undefined;

const ACHIEVEMENT_DEFS = {
  emoji_starter:    { title: 'Emoji Starter',    threshold: 5,  qualify: isOriginalEmoji },
  emoji_pro:        { title: 'Emoji Pro',        threshold: 25, qualify: isOriginalEmoji },
  democracy:        { title: 'Democracy!',       threshold: 1,  qualify: isPollVote },
  social_butterfly: { title: 'Social Butterfly', threshold: 5,  qualify: isReaction },
};

export const checkAndUnlockAchievements = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }): Promise<Array<{ type: string; title: string }>> => {
    // Get all user entries from testTable
    const entries = await ctx.db
      .query('testTable')
      .withIndex('by_userId_createdAt', q => q.eq('userId', userId))
      .collect();

    // Batch-fetch all existing achievements for this user (1 query instead of N)
    const existing = await ctx.db
      .query('testAchievementTable')
      .withIndex('by_userId', q => q.eq('userId', userId))
      .collect();
    const unlockedTypes = new Set(existing.map(a => a.type));

    const newlyUnlocked: Array<{ type: string; title: string }> = [];

    for (const [type, def] of Object.entries(ACHIEVEMENT_DEFS)) {
      if (unlockedTypes.has(type)) continue;

      const count = entries.filter(def.qualify).length;

      if (count >= def.threshold) {
        await ctx.db.insert('testAchievementTable', {
          type,
          title: def.title,
          userId,
          unlockedAt: Date.now()
        });
        newlyUnlocked.push({ type, title: def.title });
      }
    }

    return newlyUnlocked;
  },
});

export const getUserAchievements = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }): Promise<Array<{ type: string; title: string; unlockedAt: number }>> => {
    const achievements = await ctx.db
      .query('testAchievementTable')
      .withIndex('by_userId', q => q.eq('userId', userId))
      .collect();

    // Sort by unlockedAt descending (most recent first)
    achievements.sort((a, b) => b.unlockedAt - a.unlockedAt);

    return achievements.map(a => ({
      type: a.type,
      title: a.title,
      unlockedAt: a.unlockedAt,
    }));
  },
});