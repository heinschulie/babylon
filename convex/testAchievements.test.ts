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
	});
});