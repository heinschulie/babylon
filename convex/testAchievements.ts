import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// Achievement type constants
const ACHIEVEMENT_DEFS: Record<string, { title: string; threshold: number; table: 'testTable' | 'testPollTable'; filter?: (entry: any) => boolean }> = {
  emoji_starter:    { title: 'Emoji Starter',    threshold: 5,  table: 'testTable', filter: (e) => !e.parentId && !e.pollId },
  emoji_pro:        { title: 'Emoji Pro',        threshold: 25, table: 'testTable', filter: (e) => !e.parentId && !e.pollId },
  democracy:        { title: 'Democracy!',       threshold: 1,  table: 'testTable', filter: (e) => !!e.pollId },
  social_butterfly: { title: 'Social Butterfly',  threshold: 5,  table: 'testTable', filter: (e) => !!e.parentId },
  poll_creator:     { title: 'Poll Creator',      threshold: 3,  table: 'testPollTable' },
};

// Mutation: check thresholds and unlock any newly earned achievements
export const checkAndUnlockAchievements = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<Array<{ type: string; title: string }>> => {
    const { userId } = args;
    const newlyUnlocked: Array<{ type: string; title: string }> = [];

    // Check each achievement type
    for (const [type, def] of Object.entries(ACHIEVEMENT_DEFS)) {
      // Check if already unlocked using by_type_userId index
      const existing = await ctx.db
        .query('testAchievementTable')
        .withIndex('by_type_userId', q =>
          q.eq('type', type).eq('userId', userId)
        )
        .unique();

      // Skip if already unlocked
      if (existing) {
        continue;
      }

      // Count qualifying entries for this user
      let count = 0;
      if (def.table === 'testTable') {
        const entries = await ctx.db
          .query('testTable')
          .filter(q => q.eq(q.field('userId'), userId))
          .collect();

        if (def.filter) {
          count = entries.filter(def.filter).length;
        } else {
          count = entries.length;
        }
      } else if (def.table === 'testPollTable') {
        // Skip poll_creator for now - testPollTable doesn't have userId field
        continue;
      }

      // If threshold met, unlock achievement
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