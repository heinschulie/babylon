import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testAchievements', () => {
  it('should unlock emoji_starter after exactly 5 emoji submissions (not 4)', async () => {
    const t = convexTest(schema, modules);
    const userId = 'test-user-1';

    // Insert 4 emoji entries (should NOT unlock achievement)
    for (let i = 0; i < 4; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert('testTable', {
          emoji: '😎',
          sentence: `test sentence ${i}`,
          mood: 'happy',
          userId,
          createdAt: Date.now() - i * 1000,
          // parentId and pollId are undefined - qualifying entries
        });
      });
    }

    // Check achievements after 4 entries - should be empty
    const result4 = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result4).toEqual([]);

    // Verify no achievement was created
    const achievements4 = await t.query(api.testAchievements.getUserAchievements, { userId });
    expect(achievements4).toEqual([]);

    // Add 5th emoji entry
    await t.run(async (ctx) => {
      await ctx.db.insert('testTable', {
        emoji: '🔥',
        sentence: 'test sentence 5',
        mood: 'chill',
        userId,
        createdAt: Date.now(),
      });
    });

    // Check achievements after 5 entries - should unlock emoji_starter
    const result5 = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result5).toEqual([{ type: 'emoji_starter', title: 'Emoji Starter' }]);

    // Verify achievement was created
    const achievements5 = await t.query(api.testAchievements.getUserAchievements, { userId });
    expect(achievements5).toHaveLength(1);
    expect(achievements5[0].type).toBe('emoji_starter');
    expect(achievements5[0].title).toBe('Emoji Starter');
    expect(achievements5[0].unlockedAt).toBeGreaterThan(Date.now() - 5000);
  });

  it('should be idempotent - calling twice after threshold does not create duplicates', async () => {
    const t = convexTest(schema, modules);
    const userId = 'test-user-2';

    // Insert 5 emoji entries to reach threshold
    for (let i = 0; i < 5; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert('testTable', {
          emoji: '💯',
          sentence: `test sentence ${i}`,
          mood: 'happy',
          userId,
          createdAt: Date.now() - i * 1000,
        });
      });
    }

    // First call - should unlock achievement
    const result1 = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result1).toEqual([{ type: 'emoji_starter', title: 'Emoji Starter' }]);

    // Second call - should return empty (no new achievements)
    const result2 = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result2).toEqual([]);

    // Third call - should still return empty
    const result3 = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result3).toEqual([]);

    // Verify only one achievement exists
    const achievements = await t.query(api.testAchievements.getUserAchievements, { userId });
    expect(achievements).toHaveLength(1);
    expect(achievements[0].type).toBe('emoji_starter');
  });

  it('should unlock democracy after first poll vote', async () => {
    const t = convexTest(schema, modules);
    const userId = 'test-user-3';

    // Create a poll first
    const pollId = await t.run(async (ctx) => {
      return await ctx.db.insert('testPollTable', {
        question: 'Test poll question?',
        options: ['Option A', 'Option B'],
        createdAt: Date.now(),
      });
    });

    // Insert a poll vote entry (entry with pollId)
    await t.run(async (ctx) => {
      await ctx.db.insert('testTable', {
        emoji: '🗳️',
        sentence: 'Voted on poll',
        mood: 'happy',
        userId,
        createdAt: Date.now(),
        pollId,
      });
    });

    // Check achievements after poll vote - should unlock democracy
    const result = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result).toEqual([{ type: 'democracy', title: 'Democracy!' }]);

    // Verify achievement was created
    const achievements = await t.query(api.testAchievements.getUserAchievements, { userId });
    expect(achievements).toHaveLength(1);
    expect(achievements[0].type).toBe('democracy');
    expect(achievements[0].title).toBe('Democracy!');
  });

  it('should unlock social_butterfly after 5 reactions (entries with parentId)', async () => {
    const t = convexTest(schema, modules);
    const userId = 'test-user-4';

    // Create a parent entry first
    const parentId = await t.run(async (ctx) => {
      return await ctx.db.insert('testTable', {
        emoji: '😄',
        sentence: 'Parent entry',
        mood: 'happy',
        userId: 'other-user',
        createdAt: Date.now(),
      });
    });

    // Insert 4 reaction entries (should NOT unlock achievement)
    for (let i = 0; i < 4; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert('testTable', {
          emoji: '👍',
          sentence: `Reaction ${i}`,
          mood: 'happy',
          userId,
          createdAt: Date.now() - i * 1000,
          parentId,
        });
      });
    }

    // Check after 4 reactions - should be empty
    const result4 = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result4).toEqual([]);

    // Add 5th reaction entry
    await t.run(async (ctx) => {
      await ctx.db.insert('testTable', {
        emoji: '❤️',
        sentence: 'Reaction 5',
        mood: 'happy',
        userId,
        createdAt: Date.now(),
        parentId,
      });
    });

    // Check achievements after 5 reactions - should unlock social_butterfly
    const result5 = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result5).toEqual([{ type: 'social_butterfly', title: 'Social Butterfly' }]);

    // Verify achievement was created
    const achievements = await t.query(api.testAchievements.getUserAchievements, { userId });
    expect(achievements).toHaveLength(1);
    expect(achievements[0].type).toBe('social_butterfly');
    expect(achievements[0].title).toBe('Social Butterfly');
  });

  it('should return only NEWLY unlocked achievements (not previously unlocked)', async () => {
    const t = convexTest(schema, modules);
    const userId = 'test-user-5';

    // Insert exactly 25 emoji entries to reach both emoji_starter and emoji_pro thresholds
    for (let i = 0; i < 25; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert('testTable', {
          emoji: '🎉',
          sentence: `test sentence ${i}`,
          mood: 'happy',
          userId,
          createdAt: Date.now() - i * 1000,
        });
      });
    }

    // First call - should unlock both achievements
    const result1 = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result1).toHaveLength(2);
    expect(result1).toEqual(
      expect.arrayContaining([
        { type: 'emoji_starter', title: 'Emoji Starter' },
        { type: 'emoji_pro', title: 'Emoji Pro' }
      ])
    );

    // Second call - should return empty array (no newly unlocked)
    const result2 = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result2).toEqual([]);

    // Add more entries (but not enough to unlock any new achievements)
    for (let i = 0; i < 5; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert('testTable', {
          emoji: '🌟',
          sentence: `extra sentence ${i}`,
          mood: 'happy',
          userId,
          createdAt: Date.now() - i * 1000,
        });
      });
    }

    // Third call - should still return empty array
    const result3 = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result3).toEqual([]);

    // Verify both achievements exist in database
    const achievements = await t.query(api.testAchievements.getUserAchievements, { userId });
    expect(achievements).toHaveLength(2);
  });

  it('should return all achievements for a user sorted by unlockedAt desc', async () => {
    const t = convexTest(schema, modules);
    const userId = 'test-user-6';

    const baseTime = Date.now();

    // Manually insert achievements with specific timestamps to test sorting
    const achievement1Id = await t.run(async (ctx) => {
      return await ctx.db.insert('testAchievementTable', {
        type: 'democracy',
        title: 'Democracy!',
        userId,
        unlockedAt: baseTime - 2000, // 2 seconds ago
      });
    });

    const achievement2Id = await t.run(async (ctx) => {
      return await ctx.db.insert('testAchievementTable', {
        type: 'emoji_starter',
        title: 'Emoji Starter',
        userId,
        unlockedAt: baseTime - 1000, // 1 second ago (most recent)
      });
    });

    const achievement3Id = await t.run(async (ctx) => {
      return await ctx.db.insert('testAchievementTable', {
        type: 'social_butterfly',
        title: 'Social Butterfly',
        userId,
        unlockedAt: baseTime - 3000, // 3 seconds ago (oldest)
      });
    });

    // Query achievements - should be sorted by unlockedAt desc
    const achievements = await t.query(api.testAchievements.getUserAchievements, { userId });

    expect(achievements).toHaveLength(3);

    // Verify sorting: most recent first (descending order)
    expect(achievements[0].type).toBe('emoji_starter'); // baseTime - 1000
    expect(achievements[0].unlockedAt).toBe(baseTime - 1000);

    expect(achievements[1].type).toBe('democracy'); // baseTime - 2000
    expect(achievements[1].unlockedAt).toBe(baseTime - 2000);

    expect(achievements[2].type).toBe('social_butterfly'); // baseTime - 3000
    expect(achievements[2].unlockedAt).toBe(baseTime - 3000);

    // Verify timestamps are in descending order
    expect(achievements[0].unlockedAt).toBeGreaterThan(achievements[1].unlockedAt);
    expect(achievements[1].unlockedAt).toBeGreaterThan(achievements[2].unlockedAt);
  });

  it('should return empty array for user with no achievements', async () => {
    const t = convexTest(schema, modules);
    const userId = 'test-user-no-achievements';

    // Query achievements for user who has none
    const achievements = await t.query(api.testAchievements.getUserAchievements, { userId });

    expect(achievements).toEqual([]);
    expect(achievements).toHaveLength(0);
  });

  it('should not count poll votes toward emoji_starter threshold', async () => {
    const t = convexTest(schema, modules);
    const userId = 'test-user-7';

    // Create a poll first
    const pollId = await t.run(async (ctx) => {
      return await ctx.db.insert('testPollTable', {
        question: 'Test poll question?',
        options: ['Option A', 'Option B'],
        createdAt: Date.now(),
      });
    });

    // Insert 4 regular emoji entries (should NOT unlock achievement)
    for (let i = 0; i < 4; i++) {
      await t.run(async (ctx) => {
        await ctx.db.insert('testTable', {
          emoji: '😎',
          sentence: `emoji entry ${i}`,
          mood: 'happy',
          userId,
          createdAt: Date.now() - i * 1000,
          // parentId and pollId are undefined - qualifying entries
        });
      });
    }

    // Insert 1 poll vote entry (will unlock democracy, but should NOT count toward emoji_starter)
    await t.run(async (ctx) => {
      await ctx.db.insert('testTable', {
        emoji: '🗳️',
        sentence: 'poll vote',
        mood: 'happy',
        userId,
        createdAt: Date.now(),
        pollId, // This makes it a poll vote, should NOT count toward emoji_starter
      });
    });

    // Check achievements - should unlock democracy only (not emoji_starter despite 5 total entries)
    const result1 = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result1).toEqual([{ type: 'democracy', title: 'Democracy!' }]);

    // Add 1 more regular emoji entry (total 5 qualifying entries)
    await t.run(async (ctx) => {
      await ctx.db.insert('testTable', {
        emoji: '🔥',
        sentence: 'final emoji entry',
        mood: 'happy',
        userId,
        createdAt: Date.now(),
        // parentId and pollId are undefined - qualifying entry
      });
    });

    // Now should unlock emoji_starter (exactly 5 qualifying entries, ignoring poll votes)
    const result2 = await t.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });
    expect(result2).toEqual([{ type: 'emoji_starter', title: 'Emoji Starter' }]);

    // Verify both achievements exist (democracy from earlier, emoji_starter from now)
    const achievements = await t.query(api.testAchievements.getUserAchievements, { userId });
    expect(achievements).toHaveLength(2);

    // Find the emoji_starter achievement to verify it unlocked
    const emojiStarterAchievement = achievements.find(a => a.type === 'emoji_starter');
    expect(emojiStarterAchievement).toBeDefined();
    expect(emojiStarterAchievement?.title).toBe('Emoji Starter');
  });
});