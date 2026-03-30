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

		it('should unlock social_butterfly after 5 reactions (entries with parentId)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const userId = 'social-butterfly-user';
			const otherUserId = 'other-user';

			// First, create some original emoji submissions from another user to react to
			const originalIds: any[] = [];
			for (let i = 0; i < 3; i++) {
				const id = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '🔥',
					mood: 'happy',
					userId: otherUserId
				});
				originalIds.push(id);
			}

			// Create exactly 4 reactions - should NOT unlock yet
			for (let i = 0; i < 4; i++) {
				await t.run(async (ctx) => {
					await ctx.db.insert('testTable', {
						emoji: '😎',
						sentence: 'Reaction to original post',
						mood: 'chill',
						userId,
						parentId: originalIds[i % originalIds.length],
						createdAt: Date.now()
					});
				});
			}

			// Check achievements after 4 reactions - should be empty
			const resultAfter4 = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(resultAfter4).toEqual([]);

			// Add 5th reaction - should unlock social_butterfly
			await t.run(async (ctx) => {
				await ctx.db.insert('testTable', {
					emoji: '💩',
					sentence: 'Another reaction',
					mood: 'angry',
					userId,
					parentId: originalIds[0],
					createdAt: Date.now()
				});
			});

			// Check achievements - should unlock social_butterfly
			const resultAfter5 = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(resultAfter5).toEqual([
				{ type: 'social_butterfly', title: 'Social Butterfly' }
			]);

			// Verify the achievement was stored
			const storedAchievements = await t.run(async (ctx) => {
				return ctx.db
					.query('testAchievementTable')
					.withIndex('by_userId', q => q.eq('userId', userId))
					.collect();
			});

			expect(storedAchievements).toHaveLength(1);
			expect(storedAchievements[0].type).toBe('social_butterfly');
		});

		it('should return only NEWLY unlocked achievements (not previously unlocked)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const userId = 'newly-unlocked-user';

			// Submit 5 emojis to unlock emoji_starter
			for (let i = 0; i < 5; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '😎',
					mood: 'chill',
					userId
				});
			}

			// First check - should unlock emoji_starter
			const firstResult = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(firstResult).toEqual([
				{ type: 'emoji_starter', title: 'Emoji Starter' }
			]);

			// Submit 20 more emojis to reach emoji_pro threshold (25 total)
			for (let i = 0; i < 20; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '🔥',
					mood: 'happy',
					userId
				});
			}

			// Second check - should return only emoji_pro (not emoji_starter again)
			const secondResult = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(secondResult).toEqual([
				{ type: 'emoji_pro', title: 'Emoji Pro' }
			]);

			// Verify both achievements are stored in database
			const storedAchievements = await t.run(async (ctx) => {
				return ctx.db
					.query('testAchievementTable')
					.withIndex('by_userId', q => q.eq('userId', userId))
					.collect();
			});

			expect(storedAchievements).toHaveLength(2);
			const types = storedAchievements.map(a => a.type).sort();
			expect(types).toEqual(['emoji_pro', 'emoji_starter']);
		});
	});

	describe('getUserAchievements', () => {
		it('should return all achievements for a user sorted by unlockedAt desc', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const userId = 'sorted-achievements-user';

			// Unlock achievements at different times
			const now = Date.now();

			// Insert achievements manually with specific timestamps
			await t.run(async (ctx) => {
				await ctx.db.insert('testAchievementTable', {
					type: 'emoji_starter',
					title: 'Emoji Starter',
					userId,
					unlockedAt: now - 2000 // older
				});

				await ctx.db.insert('testAchievementTable', {
					type: 'democracy',
					title: 'Democracy!',
					userId,
					unlockedAt: now - 1000 // middle
				});

				await ctx.db.insert('testAchievementTable', {
					type: 'social_butterfly',
					title: 'Social Butterfly',
					userId,
					unlockedAt: now // newest
				});
			});

			// Query achievements
			const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
				userId
			});

			expect(achievements).toHaveLength(3);
			// Should be sorted by unlockedAt descending (newest first)
			expect(achievements[0].type).toBe('social_butterfly');
			expect(achievements[1].type).toBe('democracy');
			expect(achievements[2].type).toBe('emoji_starter');

			// Verify all have required fields
			achievements.forEach(achievement => {
				expect(achievement).toMatchObject({
					type: expect.any(String),
					title: expect.any(String),
					unlockedAt: expect.any(Number)
				});
			});
		});

		it('should return empty array for user with no achievements', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const userId = 'no-achievements-user';

			// Query achievements for user with none
			const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
				userId
			});

			expect(achievements).toEqual([]);
			expect(achievements).toHaveLength(0);
		});
	});

	describe('achievement filtering logic', () => {
		it('should not count poll votes toward emoji_starter threshold', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const userId = 'filter-poll-votes-user';

			// Create a poll
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Test poll for filtering',
				options: ['😎', '🔥', '💩']
			});

			// Cast 5 poll votes (should not count toward emoji_starter)
			for (let i = 0; i < 5; i++) {
				await asUser.mutation(api.testPollMutation.castVote, {
					pollId,
					option: '😎',
					userId
				});
			}

			// Check achievements - should unlock democracy but NOT emoji_starter (poll votes don't count toward emoji_starter)
			const result = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(result).toEqual([
				{ type: 'democracy', title: 'Democracy!' }
			]); // Democracy unlocked from poll vote

			// Add 5 regular emoji submissions (these should count)
			for (let i = 0; i < 5; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '🔥',
					mood: 'happy',
					userId
				});
			}

			// Now should unlock emoji_starter
			const secondResult = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(secondResult).toEqual([
				{ type: 'emoji_starter', title: 'Emoji Starter' }
			]);
		});

		it('should not count reactions toward emoji_starter threshold', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const userId = 'filter-reactions-user';
			const otherUserId = 'other-user-for-reactions';

			// Create an original post to react to
			const originalId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥',
				mood: 'happy',
				userId: otherUserId
			});

			// Add 5 reactions (should not count toward emoji_starter)
			for (let i = 0; i < 5; i++) {
				await t.run(async (ctx) => {
					await ctx.db.insert('testTable', {
						emoji: '😎',
						sentence: 'Reaction to original',
						mood: 'chill',
						userId,
						parentId: originalId,
						createdAt: Date.now()
					});
				});
			}

			// Check achievements - should unlock social_butterfly but NOT emoji_starter (reactions don't count toward emoji_starter)
			const result = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(result).toEqual([
				{ type: 'social_butterfly', title: 'Social Butterfly' }
			]); // Social butterfly unlocked from reactions

			// Add 5 regular emoji submissions (these should count)
			for (let i = 0; i < 5; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '🔥',
					mood: 'happy',
					userId
				});
			}

			// Now should unlock emoji_starter (since social_butterfly was already unlocked, only emoji_starter should be new)
			const secondResult = await asUser.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId
			});

			expect(secondResult).toEqual([
				{ type: 'emoji_starter', title: 'Emoji Starter' }
			]);
		});
	});
});