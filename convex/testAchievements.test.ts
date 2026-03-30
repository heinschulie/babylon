import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testAchievements', () => {
	describe('checkAndUnlockAchievements', () => {
		it('should unlock emoji_starter after exactly 5 emoji submissions (not 4)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const userId = 'test-achievement-user';

			// Submit exactly 4 emojis - should NOT unlock yet
			for (let i = 0; i < 4; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '😎',
					mood: 'chill',
					userId
				});
			}

			// Check achievements - should return empty (no unlocks yet)
			const resultAfter4 = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(resultAfter4).toEqual([]);

			// Submit 5th emoji - should unlock emoji_starter
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥',
				mood: 'happy',
				userId
			});

			// Check achievements - should unlock emoji_starter
			const resultAfter5 = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(resultAfter5).toEqual([
				{ type: 'emoji_starter', title: 'Emoji Starter' }
			]);

			// Verify the achievement was actually stored in the database
			const storedAchievements = await t.run(async (ctx) => {
				return ctx.db
					.query('testAchievementTable')
					.withIndex('by_userId', q => q.eq('userId', userId))
					.collect();
			});

			expect(storedAchievements).toHaveLength(1);
			expect(storedAchievements[0]).toMatchObject({
				type: 'emoji_starter',
				title: 'Emoji Starter',
				userId,
				unlockedAt: expect.any(Number)
			});
		});

		it('should be idempotent — calling twice after threshold doesn\'t create duplicates', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const userId = 'idempotent-test-user';

			// Submit exactly 5 emojis to reach emoji_starter threshold
			for (let i = 0; i < 5; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '😎',
					mood: 'chill',
					userId
				});
			}

			// First call - should unlock emoji_starter
			const firstResult = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(firstResult).toEqual([
				{ type: 'emoji_starter', title: 'Emoji Starter' }
			]);

			// Second call immediately after - should return empty (idempotent)
			const secondResult = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(secondResult).toEqual([]);

			// Third call for good measure - should still return empty
			const thirdResult = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(thirdResult).toEqual([]);

			// Verify only one achievement record exists in database
			const storedAchievements = await t.run(async (ctx) => {
				return ctx.db
					.query('testAchievementTable')
					.withIndex('by_userId', q => q.eq('userId', userId))
					.collect();
			});

			expect(storedAchievements).toHaveLength(1);
			expect(storedAchievements[0].type).toBe('emoji_starter');
		});

		it('should unlock democracy after first poll vote', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const userId = 'democracy-test-user';

			// Create a poll first
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'What is your favorite emoji?',
				options: ['😎', '🔥', '💩']
			});

			// Cast a vote on the poll (this creates a testTable entry with pollId)
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: '😎',
				userId
			});

			// Check achievements - should unlock democracy
			const result = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(result).toEqual([
				{ type: 'democracy', title: 'Democracy!' }
			]);

			// Verify the achievement was stored
			const storedAchievements = await t.run(async (ctx) => {
				return ctx.db
					.query('testAchievementTable')
					.withIndex('by_userId', q => q.eq('userId', userId))
					.collect();
			});

			expect(storedAchievements).toHaveLength(1);
			expect(storedAchievements[0].type).toBe('democracy');
		});
	});
});