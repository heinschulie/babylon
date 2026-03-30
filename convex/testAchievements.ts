import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
import type { Doc } from './_generated/dataModel';

type TestEntry = Doc<'testTable'>;

/** Achievement definitions — each entry defines how to count qualifying actions. */
const ACHIEVEMENT_DEFS = {
  emoji_starter:    { title: 'Emoji Starter',    threshold: 5,  count: (e: TestEntry[]) => e.filter(x => !x.parentId && !x.pollId).length },
  emoji_pro:        { title: 'Emoji Pro',        threshold: 25, count: (e: TestEntry[]) => e.filter(x => !x.parentId && !x.pollId).length },
  democracy:        { title: 'Democracy!',       threshold: 1,  count: (e: TestEntry[]) => e.filter(x => !!x.pollId).length },
  social_butterfly: { title: 'Social Butterfly',  threshold: 5,  count: (e: TestEntry[]) => e.filter(x => !!x.parentId).length },
} satisfies Record<string, { title: string; threshold: number; count: (entries: TestEntry[]) => number }>;

type AchievementType = keyof typeof ACHIEVEMENT_DEFS;

// Mutation: check thresholds and unlock any newly earned achievements
export const checkAndUnlockAchievements = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<Array<{ type: string; title: string }>> => {
    const { userId } = args;

    // Single query: get all existing achievements for this user
    const existingAchievements = await ctx.db
      .query('testAchievementTable')
      .withIndex('by_userId', q => q.eq('userId', userId))
      .collect();
    const unlockedTypes = new Set(existingAchievements.map(a => a.type));

    // Single query: fetch all testTable entries for this user once
    const entries = await ctx.db
      .query('testTable')
      .withIndex('by_userId_createdAt', q => q.eq('userId', userId))
      .collect();

    // Evaluate all thresholds against cached data
    const newlyUnlocked: Array<{ type: string; title: string }> = [];
    for (const [type, def] of Object.entries(ACHIEVEMENT_DEFS) as [AchievementType, typeof ACHIEVEMENT_DEFS[AchievementType]][]) {
      if (unlockedTypes.has(type)) continue;
      if (def.count(entries) < def.threshold) continue;

      await ctx.db.insert('testAchievementTable', {
        type,
        title: def.title,
        userId,
        unlockedAt: Date.now(),
      });
      newlyUnlocked.push({ type, title: def.title });
    }

    return newlyUnlocked;
  },
});

// Query: get all achievements for a user
export const getUserAchievements = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<Array<{ type: string; title: string; unlockedAt: number }>> => {
    const { userId } = args;

    const achievements = await ctx.db
      .query('testAchievementTable')
      .withIndex('by_userId', q => q.eq('userId', userId))
      .collect();

    return achievements
      .map(a => ({ type: a.type, title: a.title, unlockedAt: a.unlockedAt }))
      .sort((a, b) => b.unlockedAt - a.unlockedAt); // Sort by unlockedAt desc
  },
});