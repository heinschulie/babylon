import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testAchievements', () => {
	describe('checkAndUnlockAchievements', () => {
		it('should unlock emoji_starter when user has 5+ emoji submissions', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const userId = 'test-user-emoji-starter';

			// Submit exactly 5 emojis (without parentId/pollId to qualify for emoji_starter)
			for (let i = 0; i < 5; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '😎',
					mood: 'chill',
					userId,
				});
			}

			// Check achievements should unlock emoji_starter
			await t.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId,
			});

			// Verify achievement was unlocked
			const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
				userId,
			});

			expect(achievements).toHaveLength(1);
			expect(achievements[0]).toMatchObject({
				type: 'emoji_starter',
				title: 'Emoji Starter',
				userId,
				unlockedAt: expect.any(Number),
			});
		});

		it('should be idempotent - calling twice does not create duplicate achievement', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const userId = 'test-user-idempotent';

			// Submit exactly 5 emojis to meet emoji_starter threshold
			for (let i = 0; i < 5; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '😎',
					mood: 'chill',
					userId,
				});
			}

			// First call - should unlock achievement
			await t.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId,
			});

			// Verify achievement was unlocked
			const achievementsAfterFirst = await asUser.query(api.testAchievements.getUserAchievements, {
				userId,
			});

			expect(achievementsAfterFirst).toHaveLength(1);

			// Second call - should NOT create duplicate
			await t.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId,
			});

			// Verify still only one achievement exists
			const achievementsAfterSecond = await asUser.query(api.testAchievements.getUserAchievements, {
				userId,
			});

			expect(achievementsAfterSecond).toHaveLength(1);
			expect(achievementsAfterSecond[0]).toMatchObject({
				type: 'emoji_starter',
				title: 'Emoji Starter',
				userId,
				unlockedAt: expect.any(Number),
			});
		});

		it('should unlock democracy when user has 1+ poll vote', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const userId = 'test-user-democracy';

			// Create a poll first
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Test poll for democracy achievement',
				options: ['Option A', 'Option B'],
			});

			// Cast a vote (this creates testTable entry with pollId)
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: 'Option A',
				userId,
			});

			// Check achievements should unlock democracy
			await t.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId,
			});

			// Verify democracy achievement was unlocked
			const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
				userId,
			});

			expect(achievements).toHaveLength(1);
			expect(achievements[0]).toMatchObject({
				type: 'democracy',
				title: 'Democracy',
				userId,
				unlockedAt: expect.any(Number),
			});
		});

		it('should NOT unlock emoji_starter at 4 emojis (boundary test)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const userId = 'test-user-boundary-4-emojis';

			// Submit exactly 4 emojis (just below threshold)
			for (let i = 0; i < 4; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '😎',
					mood: 'chill',
					userId,
				});
			}

			// Check achievements - should NOT unlock emoji_starter
			await t.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId,
			});

			// Verify no achievements were unlocked
			const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
				userId,
			});

			expect(achievements).toHaveLength(0);
		});

		it('should unlock emoji_pro at 25 emojis, social_butterfly at 5 reactions, poll_creator at 3 polls', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const userId = 'test-user-multiple-thresholds';

			// Test emoji_pro: Submit exactly 25 emojis (emoji pro threshold)
			for (let i = 0; i < 25; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '😎',
					mood: 'chill',
					userId,
				});
			}

			// Create a parent entry for reactions
			const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥',
				mood: 'happy',
				userId: 'parent-user',
			});

			// Test social_butterfly: Add 5 reactions (with parentId)
			for (let i = 0; i < 5; i++) {
				await asUser.mutation(api.testReactions.addReaction, {
					parentId,
					emoji: '🔥',
					mood: 'happy',
					sentence: `Reaction ${i}`,
					userId,
				});
			}

			// Test poll_creator: Create 3 polls (Note: this currently counts all polls, not by userId)
			for (let i = 0; i < 3; i++) {
				await asUser.mutation(api.testPollMutation.createPoll, {
					question: `Test poll ${i}`,
					options: ['Option A', 'Option B'],
				});
			}

			// Check achievements
			await t.mutation(api.testAchievements.checkAndUnlockAchievements, {
				userId,
			});

			// Verify achievements were unlocked
			const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
				userId,
			});

			// Should have unlocked all achievements: emoji_starter, emoji_pro, social_butterfly, poll_creator
			expect(achievements).toHaveLength(4);

			const achievementTypes = achievements.map(a => a.type).sort();
			expect(achievementTypes).toEqual(['emoji_pro', 'emoji_starter', 'poll_creator', 'social_butterfly']);

			// Verify specific achievement details
			const emojiProAchievement = achievements.find(a => a.type === 'emoji_pro');
			expect(emojiProAchievement).toMatchObject({
				type: 'emoji_pro',
				title: 'Emoji Pro',
				userId,
				unlockedAt: expect.any(Number),
			});

			const socialButterflyAchievement = achievements.find(a => a.type === 'social_butterfly');
			expect(socialButterflyAchievement).toMatchObject({
				type: 'social_butterfly',
				title: 'Social Butterfly',
				userId,
				unlockedAt: expect.any(Number),
			});

			const pollCreatorAchievement = achievements.find(a => a.type === 'poll_creator');
			expect(pollCreatorAchievement).toMatchObject({
				type: 'poll_creator',
				title: 'Poll Creator',
				userId,
				unlockedAt: expect.any(Number),
			});
		});
	});

	describe('getUserAchievements', () => {
		it('should return achievements for frontend display', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const userId = 'test-frontend-display-user';

			// Create an achievement directly in the database
			const achievementId = await t.run(async (ctx) => {
				return ctx.db.insert('testAchievementTable', {
					type: 'emoji_starter',
					title: 'Emoji Starter',
					userId,
					unlockedAt: Date.now(),
				});
			});

			// Query achievements for frontend use
			const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
				userId,
			});

			expect(achievements).toHaveLength(1);
			expect(achievements[0]).toMatchObject({
				_id: achievementId,
				type: 'emoji_starter',
				title: 'Emoji Starter',
				userId,
				unlockedAt: expect.any(Number),
			});
		});

		it('should return multiple achievements with correct title and unlock time fields', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const userId = 'test-multiple-achievements-user';

			const unlockTime1 = Date.now() - 1000; // 1 second ago
			const unlockTime2 = Date.now();

			// Create multiple achievements with different types and times
			await t.run(async (ctx) => {
				await ctx.db.insert('testAchievementTable', {
					type: 'emoji_starter',
					title: 'Emoji Starter',
					userId,
					unlockedAt: unlockTime1,
				});
				await ctx.db.insert('testAchievementTable', {
					type: 'democracy',
					title: 'Democracy',
					userId,
					unlockedAt: unlockTime2,
				});
			});

			// Query achievements
			const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
				userId,
			});

			expect(achievements).toHaveLength(2);

			// Should be sorted by unlockedAt descending (newest first)
			expect(achievements[0]).toMatchObject({
				type: 'democracy',
				title: 'Democracy',
				userId,
				unlockedAt: unlockTime2,
			});

			expect(achievements[1]).toMatchObject({
				type: 'emoji_starter',
				title: 'Emoji Starter',
				userId,
				unlockedAt: unlockTime1,
			});
		});

		it('should return achievements sorted by unlockedAt descending (newest first)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const userId = 'test-sorting-achievements-user';

			const time1 = Date.now() - 3000; // 3 seconds ago
			const time2 = Date.now() - 2000; // 2 seconds ago
			const time3 = Date.now() - 1000; // 1 second ago

			// Create achievements in non-chronological order to test sorting
			await t.run(async (ctx) => {
				// Insert middle time first
				await ctx.db.insert('testAchievementTable', {
					type: 'democracy',
					title: 'Democracy',
					userId,
					unlockedAt: time2,
				});
				// Insert oldest time second
				await ctx.db.insert('testAchievementTable', {
					type: 'emoji_starter',
					title: 'Emoji Starter',
					userId,
					unlockedAt: time1,
				});
				// Insert newest time last
				await ctx.db.insert('testAchievementTable', {
					type: 'social_butterfly',
					title: 'Social Butterfly',
					userId,
					unlockedAt: time3,
				});
			});

			// Query achievements
			const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
				userId,
			});

			expect(achievements).toHaveLength(3);

			// Verify sorting: newest first (time3, time2, time1)
			expect(achievements[0].unlockedAt).toBe(time3); // social_butterfly
			expect(achievements[1].unlockedAt).toBe(time2); // democracy
			expect(achievements[2].unlockedAt).toBe(time1); // emoji_starter

			expect(achievements[0].type).toBe('social_butterfly');
			expect(achievements[1].type).toBe('democracy');
			expect(achievements[2].type).toBe('emoji_starter');
		});

		it('should return empty array when user has no achievements', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const userId = 'test-no-achievements-user';

			// Query achievements for user with no achievements
			const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
				userId,
			});

			expect(achievements).toHaveLength(0);
			expect(achievements).toEqual([]);
		});
	});
});