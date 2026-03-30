import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';

type CountCategory = 'emoji' | 'pollVote' | 'reaction' | 'pollCreated';

const ACHIEVEMENT_DEFS: Record<
  string,
  { title: string; threshold: number; category: CountCategory }
> = {
  emoji_starter: { title: 'Emoji Starter', threshold: 5, category: 'emoji' },
  emoji_pro: { title: 'Emoji Pro', threshold: 25, category: 'emoji' },
  democracy: { title: 'Democracy!', threshold: 1, category: 'pollVote' },
  social_butterfly: { title: 'Social Butterfly', threshold: 5, category: 'reaction' },
  poll_creator: { title: 'Poll Creator', threshold: 3, category: 'pollCreated' },
};

/** Fetch per-category activity counts from testTable in a single query. */
async function getCategoryCounts(
  ctx: { db: any },
  userId: string,
): Promise<Record<CountCategory, number>> {
  const entries = await ctx.db
    .query('testTable')
    .withIndex('by_userId_createdAt', (q: any) => q.eq('userId', userId))
    .collect();

  const counts: Record<CountCategory, number> = { emoji: 0, pollVote: 0, reaction: 0, pollCreated: 0 };
  for (const entry of entries) {
    if (entry.parentId !== undefined) {
      counts.reaction++;
    } else if (entry.pollId !== undefined) {
      counts.pollVote++;
    } else {
      counts.emoji++;
    }
  }

  // poll_creator counts polls created, not votes — requires separate query
  // (polls are in a different table, not testTable entries)
  // For now, pollCreated stays 0 until poll creation tracking is wired
  return counts;
}

/** Check threshold and idempotently unlock a single achievement. */
async function tryUnlock(
  ctx: { db: any },
  type: string,
  title: string,
  userId: string,
): Promise<{ type: string; title: string } | null> {
  const existing = await ctx.db
    .query('testAchievementTable')
    .withIndex('by_type_userId', (q: any) => q.eq('type', type).eq('userId', userId))
    .unique();

  if (existing) return null;

  await ctx.db.insert('testAchievementTable', {
    type,
    title,
    userId,
    unlockedAt: Date.now(),
  });

  return { type, title };
}

export const checkAndUnlockAchievements = mutation({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, { userId }) => {
    const authUserId = await getAuthUserId(ctx);
    if (!authUserId) {
      throw new Error('User must be authenticated');
    }

    const counts = await getCategoryCounts(ctx, userId);
    const newAchievements: Array<{ type: string; title: string }> = [];

    for (const [type, def] of Object.entries(ACHIEVEMENT_DEFS)) {
      if (counts[def.category] >= def.threshold) {
        const unlocked = await tryUnlock(ctx, type, def.title, userId);
        if (unlocked) newAchievements.push(unlocked);
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