import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('testAchievements', () => {
  describe('checkAndUnlockAchievements', () => {
    it('unlocks emoji_starter after exactly 5 emoji submissions', async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({ subject: 'user1' });

      const userId = 'test-user-123';

      // Insert exactly 4 emoji entries (should NOT unlock)
      for (let i = 0; i < 4; i++) {
        await asUser.mutation(api.testEmojiMutation.submitEmoji, {
          emoji: '😎',
          mood: 'chill',
          userId
        });
      }

      // Check achievements - should be empty
      let result = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result).toEqual([]);

      // Insert 5th emoji entry
      await asUser.mutation(api.testEmojiMutation.submitEmoji, {
        emoji: '😎',
        mood: 'chill',
        userId
      });

      // Check achievements - should unlock emoji_starter
      result = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result).toEqual([{
        type: 'emoji_starter',
        title: 'Emoji Starter'
      }]);
    });

    it('is idempotent — calling twice after threshold doesn\'t create duplicates', async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({ subject: 'user1' });

      const userId = 'test-user-idempotent';

      // Insert 5 emoji entries to meet threshold
      for (let i = 0; i < 5; i++) {
        await asUser.mutation(api.testEmojiMutation.submitEmoji, {
          emoji: '😎',
          mood: 'chill',
          userId
        });
      }

      // Call checkAndUnlockAchievements first time
      const result1 = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result1).toEqual([{
        type: 'emoji_starter',
        title: 'Emoji Starter'
      }]);

      // Call checkAndUnlockAchievements second time - should return empty (no new achievements)
      const result2 = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result2).toEqual([]);

      // Verify only one achievement record exists in database
      const allAchievements = await asUser.query(api.testAchievements.getUserAchievements, {
        userId
      });
      expect(allAchievements).toHaveLength(1);
      expect(allAchievements[0].type).toBe('emoji_starter');
    });

    it('unlocks democracy after first poll vote', async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({ subject: 'user1' });

      const userId = 'test-user-democracy';

      // Check achievements before poll vote - should be empty
      let result = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result).toEqual([]);

      // Create a poll
      const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
        question: 'What is your favorite emoji?',
        options: ['😎', '💩', '🔥']
      });

      // Cast a vote
      await asUser.mutation(api.testPollMutation.castVote, {
        pollId,
        option: '😎',
        userId
      });

      // Check achievements after poll vote - should unlock democracy
      result = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result).toEqual([{
        type: 'democracy',
        title: 'Democracy!'
      }]);
    });

    it('unlocks social_butterfly after 5 reactions', async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({ subject: 'user1' });

      const userId = 'test-user-social';

      // Create a parent emoji entry to react to
      const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
        emoji: '😎',
        mood: 'chill',
        userId: 'other-user'
      });

      // Add exactly 4 reactions (should NOT unlock)
      for (let i = 0; i < 4; i++) {
        await asUser.mutation(api.testReactions.addReaction, {
          parentId,
          emoji: '🔥',
          userId
        });
      }

      // Check achievements - should be empty
      let result = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result).toEqual([]);

      // Add 5th reaction
      await asUser.mutation(api.testReactions.addReaction, {
        parentId,
        emoji: '🔥',
        userId
      });

      // Check achievements - should unlock social_butterfly
      result = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result).toEqual([{
        type: 'social_butterfly',
        title: 'Social Butterfly'
      }]);
    });

    it('returns only NEWLY unlocked achievements (not previously unlocked)', async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({ subject: 'user1' });

      const userId = 'test-user-newly-unlocked';

      // Insert 5 emoji entries to unlock emoji_starter
      for (let i = 0; i < 5; i++) {
        await asUser.mutation(api.testEmojiMutation.submitEmoji, {
          emoji: '😎',
          mood: 'chill',
          userId
        });
      }

      // First call - should unlock emoji_starter
      const result1 = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result1).toEqual([{
        type: 'emoji_starter',
        title: 'Emoji Starter'
      }]);

      // Add 1 poll vote to unlock democracy
      const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
        question: 'Test poll',
        options: ['A', 'B']
      });
      await asUser.mutation(api.testPollMutation.castVote, {
        pollId,
        option: 'A',
        userId
      });

      // Second call - should return only democracy (newly unlocked), not emoji_starter
      const result2 = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result2).toEqual([{
        type: 'democracy',
        title: 'Democracy!'
      }]);

      // Third call - should return empty (no new achievements)
      const result3 = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result3).toEqual([]);
    });

    it('poll votes don\'t count toward emoji_starter threshold', async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({ subject: 'user1' });

      const userId = 'test-user-poll-exclusion';

      // Create a poll and cast 10 votes (more than emoji_starter threshold)
      const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
        question: 'Test poll for exclusion',
        options: ['A', 'B', 'C']
      });

      for (let i = 0; i < 10; i++) {
        await asUser.mutation(api.testPollMutation.castVote, {
          pollId,
          option: 'A',
          userId
        });
      }

      // Check achievements - should not unlock emoji_starter (poll votes don't count)
      let result = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result).toEqual([{
        type: 'democracy',
        title: 'Democracy!'
      }]); // Should unlock democracy but NOT emoji_starter

      // Add 4 actual emoji submissions
      for (let i = 0; i < 4; i++) {
        await asUser.mutation(api.testEmojiMutation.submitEmoji, {
          emoji: '😎',
          mood: 'chill',
          userId
        });
      }

      // Still shouldn't unlock emoji_starter (only 4 emoji submissions)
      result = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result).toEqual([]);

      // Add 5th emoji submission
      await asUser.mutation(api.testEmojiMutation.submitEmoji, {
        emoji: '😎',
        mood: 'chill',
        userId
      });

      // Now should unlock emoji_starter (exactly 5 emoji submissions)
      result = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
        userId
      });
      expect(result).toEqual([{
        type: 'emoji_starter',
        title: 'Emoji Starter'
      }]);
    });
  });

  describe('getUserAchievements', () => {
    it('returns all achievements for a user sorted by unlockedAt desc', async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({ subject: 'user1' });

      const userId = 'test-user-sorted';

      // Unlock emoji_starter first
      for (let i = 0; i < 5; i++) {
        await asUser.mutation(api.testEmojiMutation.submitEmoji, {
          emoji: '😎',
          mood: 'chill',
          userId
        });
      }
      await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });

      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));

      // Unlock democracy second
      const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
        question: 'Test poll',
        options: ['A', 'B']
      });
      await asUser.mutation(api.testPollMutation.castVote, {
        pollId,
        option: 'A',
        userId
      });
      await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, { userId });

      // Get all achievements - should be sorted by unlockedAt desc (newest first)
      const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
        userId
      });

      expect(achievements).toHaveLength(2);
      expect(achievements[0].type).toBe('democracy'); // unlocked second (newest)
      expect(achievements[1].type).toBe('emoji_starter'); // unlocked first (oldest)
      expect(achievements[0].unlockedAt).toBeGreaterThan(achievements[1].unlockedAt);

      // Verify all required fields are present
      achievements.forEach(achievement => {
        expect(achievement).toMatchObject({
          type: expect.any(String),
          title: expect.any(String),
          unlockedAt: expect.any(Number)
        });
      });
    });

    it('returns empty array for user with no achievements', async () => {
      const t = convexTest(schema, modules);
      const asUser = t.withIdentity({ subject: 'user1' });

      const userId = 'test-user-no-achievements';

      const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
        userId
      });

      expect(achievements).toEqual([]);
      expect(achievements).toHaveLength(0);
    });
  });
});