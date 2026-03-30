import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const ACHIEVEMENT_DEFS = {
  emoji_starter:    { title: 'Emoji Starter',    threshold: 5,  count: (entries: any[]) => entries.filter(e => !e.parentId && !e.pollId) },
  emoji_pro:        { title: 'Emoji Pro',        threshold: 25, count: (entries: any[]) => entries.filter(e => !e.parentId && !e.pollId) },
  democracy:        { title: 'Democracy!',       threshold: 1,  count: (entries: any[]) => entries.filter(e => e.pollId) },
  social_butterfly: { title: 'Social Butterfly', threshold: 5,  count: (entries: any[]) => entries.filter(e => e.parentId) },
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

    const newlyUnlocked: Array<{ type: string; title: string }> = [];

    // Check each achievement
    for (const [type, def] of Object.entries(ACHIEVEMENT_DEFS)) {
      // Check if already unlocked
      const existing = await ctx.db
        .query('testAchievementTable')
        .withIndex('by_type_userId', q => q.eq('type', type).eq('userId', userId))
        .unique();

      if (existing) continue; // Already unlocked

      // Count qualifying entries
      const qualifyingEntries = def.count(entries);

      // Check if threshold is met
      if (qualifyingEntries.length >= def.threshold) {
        // Unlock achievement
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
    return ctx.db
      .query('testAchievementTable')
      .withIndex('by_userId', q => q.eq('userId', userId))
      .order('desc')
      .collect()
      .then(achievements => achievements.map(a => ({
        type: a.type,
        title: a.title,
        unlockedAt: a.unlockedAt
      })));
  },
});