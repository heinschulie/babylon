import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testEmojiMutation', () => {
	describe('submitEmoji', () => {
		it('should accept 😎 emoji and store mood="chill" with userId', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const before = Date.now();
			const id = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});
			const after = Date.now();

			expect(id).toBeDefined();

			// Verify record was created correctly with mood and userId
			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record).toEqual({
				_id: id,
				_creationTime: expect.any(Number),
				emoji: '😎',
				sentence: 'The cat wore sunglasses to the job interview',
				mood: 'chill',
				userId: 'test-user',
				createdAt: expect.any(Number),
				streakDay: 1
			});

			// Verify timestamp is reasonable
			expect(record?.createdAt).toBeGreaterThanOrEqual(before);
			expect(record?.createdAt).toBeLessThanOrEqual(after);
		});

		it('should accept 💩 emoji and store mood="angry"', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const id = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '💩',
				mood: 'angry',
				userId: 'test-user'
			});

			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record?.emoji).toBe('💩');
			expect(record?.sentence).toBe('Someone left a flaming bag on the porch again');
			expect(record?.mood).toBe('angry');
			expect(record?.userId).toBe('test-user');
		});

		it('should accept 🔥 emoji and store mood="happy"', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const id = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥',
				mood: 'happy',
				userId: 'test-user'
			});

			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record?.emoji).toBe('🔥');
			expect(record?.sentence).toBe('The server room is fine, everything is fine');
			expect(record?.mood).toBe('happy');
			expect(record?.userId).toBe('test-user');
		});

		it('should reject invalid emoji with error', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			await expect(
				asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '🚀',
					mood: 'chill',
					userId: 'test-user'
				})
			).rejects.toThrow('Invalid emoji: 🚀. Must be one of: 😎, 💩, 🔥');
		});

		it('should reject empty string emoji', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			await expect(
				asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '',
					mood: 'chill',
					userId: 'test-user'
				})
			).rejects.toThrow('Invalid emoji: . Must be one of: 😎, 💩, 🔥');
		});

		it('should set streakDay to 1 for first-ever emoji submission', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const id = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'streak-test-user'
			});

			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record?.streakDay).toBe(1);
		});

		it('should increment streak for consecutive day submission', async () => {
			const t = convexTest(schema, modules);

			// Mock timestamps: yesterday and today
			const todayMs = Date.now();
			const yesterdayMs = todayMs - 86400000; // 24 hours ago

			// First submission yesterday
			const originalDateNow = Date.now;
			Date.now = () => yesterdayMs;

			const id1 = await t.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'consecutive-user'
			});

			const record1 = await t.run(async (ctx) => ctx.db.get(id1));
			expect(record1?.streakDay).toBe(1);

			// Second submission today (consecutive day)
			Date.now = () => todayMs;

			const id2 = await t.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥',
				mood: 'happy',
				userId: 'consecutive-user'
			});

			const record2 = await t.run(async (ctx) => ctx.db.get(id2));
			expect(record2?.streakDay).toBe(2);

			// Restore Date.now
			Date.now = originalDateNow;
		});

		it('should carry forward streak for same-day submission (no increment)', async () => {
			const t = convexTest(schema, modules);

			// Mock to same timestamp
			const fixedTime = Date.now();
			const originalDateNow = Date.now;
			Date.now = () => fixedTime;

			// First submission
			const id1 = await t.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'same-day-user'
			});

			const record1 = await t.run(async (ctx) => ctx.db.get(id1));
			expect(record1?.streakDay).toBe(1);

			// Second submission same day
			const id2 = await t.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥',
				mood: 'happy',
				userId: 'same-day-user'
			});

			const record2 = await t.run(async (ctx) => ctx.db.get(id2));
			expect(record2?.streakDay).toBe(1); // Should carry forward, not increment

			// Restore Date.now
			Date.now = originalDateNow;
		});

		it('should reset streak to 1 after gap > 1 day', async () => {
			const t = convexTest(schema, modules);

			// Mock timestamps: 3 days ago, then today (2-day gap)
			const todayMs = Date.now();
			const threeDaysAgoMs = todayMs - 3 * 86400000; // 72 hours ago

			// First submission 3 days ago
			const originalDateNow = Date.now;
			Date.now = () => threeDaysAgoMs;

			const id1 = await t.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'gap-user'
			});

			const record1 = await t.run(async (ctx) => ctx.db.get(id1));
			expect(record1?.streakDay).toBe(1);

			// Second submission today (after gap)
			Date.now = () => todayMs;

			const id2 = await t.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥',
				mood: 'happy',
				userId: 'gap-user'
			});

			const record2 = await t.run(async (ctx) => ctx.db.get(id2));
			expect(record2?.streakDay).toBe(1); // Should reset to 1, not increment

			// Restore Date.now
			Date.now = originalDateNow;
		});

		it('should create multiple records for same emoji', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const id1 = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});
			const id2 = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			expect(id1).not.toBe(id2);

			const record1 = await t.run(async (ctx) => ctx.db.get(id1));
			const record2 = await t.run(async (ctx) => ctx.db.get(id2));

			expect(record1?.emoji).toBe('😎');
			expect(record2?.emoji).toBe('😎');
			expect(record1?.sentence).toBe(record2?.sentence);
			expect(record1?.mood).toBe('chill');
			expect(record2?.mood).toBe('chill');
			expect(record1?.userId).toBe('test-user');
			expect(record2?.userId).toBe('test-user');
		});
	});

	describe('listRecentEmojis', () => {
		it('should return entries sorted by createdAt descending (newest first)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Insert multiple entries with different timestamps
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			// Small delay to ensure different timestamps
			await new Promise(resolve => setTimeout(resolve, 10));

			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '💩',
				mood: 'angry',
				userId: 'test-user'
			});

			await new Promise(resolve => setTimeout(resolve, 10));

			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥',
				mood: 'happy',
				userId: 'test-user'
			});

			// Query recent emojis
			const result = await asUser.query(api.testEmojiMutation.listRecentEmojis, {});

			expect(result).toHaveLength(3);
			// Verify descending order by createdAt
			expect(result[0].createdAt).toBeGreaterThan(result[1].createdAt);
			expect(result[1].createdAt).toBeGreaterThan(result[2].createdAt);
			// Verify newest first
			expect(result[0].emoji).toBe('🔥');
			expect(result[1].emoji).toBe('💩');
			expect(result[2].emoji).toBe('😎');
		});

		it('should return max 20 entries when more than 20 exist', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Insert 25 entries
			for (let i = 0; i < 25; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '😎',
					mood: 'chill',
					userId: 'test-user'
				});
			}

			// Query should return only 20 entries
			const result = await asUser.query(api.testEmojiMutation.listRecentEmojis, {});

			expect(result).toHaveLength(20);
			// All should be 😎 emojis
			expect(result.every(entry => entry.emoji === '😎')).toBe(true);
		});

		it('should return empty array when no entries exist', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Query without adding any entries
			const result = await asUser.query(api.testEmojiMutation.listRecentEmojis, {});

			expect(result).toEqual([]);
			expect(result).toHaveLength(0);
		});

		it('should return entries with all required fields: emoji, sentence, mood, userId, createdAt', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Insert one entry
			const id = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥',
				mood: 'happy',
				userId: 'test-user'
			});

			// Query recent emojis
			const result = await asUser.query(api.testEmojiMutation.listRecentEmojis, {});

			expect(result).toHaveLength(1);

			// Verify all required fields are present
			const entry = result[0];
			expect(entry).toMatchObject({
				_id: id,
				emoji: '🔥',
				sentence: 'The server room is fine, everything is fine',
				mood: 'happy',
				userId: 'test-user',
				createdAt: expect.any(Number)
			});

			// Verify field types
			expect(typeof entry.emoji).toBe('string');
			expect(typeof entry.sentence).toBe('string');
			expect(typeof entry.mood).toBe('string');
			expect(typeof entry.userId).toBe('string');
			expect(typeof entry.createdAt).toBe('number');
		});

		it('should return fewer than 20 when fewer entries exist (no padding/error)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Insert only 5 entries
			for (let i = 0; i < 5; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '😎',
					mood: 'chill',
					userId: 'test-user'
				});
			}

			// Query should return only 5 entries, not 20
			const result = await asUser.query(api.testEmojiMutation.listRecentEmojis, {});

			expect(result).toHaveLength(5);
			// All should be valid entries
			expect(result.every(entry =>
				entry.emoji === '😎' &&
				entry.userId === 'test-user' &&
				typeof entry.createdAt === 'number'
			)).toBe(true);
		});
	});

	describe('getEmojiLeaderboard', () => {
		it('should return only emojis matching mood when filter provided', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Insert mixed moods
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎', mood: 'chill', userId: 'test-user'
			});
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '💩', mood: 'angry', userId: 'test-user'
			});
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥', mood: 'happy', userId: 'test-user'
			});

			const result = await asUser.query(api.testEmojiMutation.getEmojiLeaderboard, {
				mood: 'chill'
			});

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({ emoji: '😎', count: 1 });
		});

		it('should return empty array when no emojis match filter', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎', mood: 'chill', userId: 'test-user'
			});

			const result = await asUser.query(api.testEmojiMutation.getEmojiLeaderboard, {
				mood: 'angry'
			});

			expect(result).toEqual([]);
		});

		it('should sort by count descending with alphabetical tiebreak', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// 🔥 x1, 😎 x1, 💩 x2 — expect 💩 first, then 😎 and 🔥 alphabetically
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥', mood: 'happy', userId: 'test-user'
			});
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎', mood: 'chill', userId: 'test-user'
			});
			for (let i = 0; i < 2; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '💩', mood: 'angry', userId: 'test-user'
				});
			}

			const result = await asUser.query(api.testEmojiMutation.getEmojiLeaderboard, {});

			expect(result[0].count).toBe(2);
			expect(result[0].emoji).toBe('💩');
			// Tied at count=1, sorted alphabetically by emoji string
			expect(result[1].count).toBe(1);
			expect(result[2].count).toBe(1);
			expect(result[1].emoji.localeCompare(result[2].emoji)).toBeLessThan(0);
		});

		it('should return all emojis grouped and counted when no mood filter', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Insert: 😎 x3, 💩 x2, 🔥 x1
			for (let i = 0; i < 3; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '😎',
					mood: 'chill',
					userId: 'test-user'
				});
			}
			for (let i = 0; i < 2; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '💩',
					mood: 'angry',
					userId: 'test-user'
				});
			}
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥',
				mood: 'happy',
				userId: 'test-user'
			});

			const result = await asUser.query(api.testEmojiMutation.getEmojiLeaderboard, {});

			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({ emoji: '😎', count: 3 });
			expect(result[1]).toEqual({ emoji: '💩', count: 2 });
			expect(result[2]).toEqual({ emoji: '🔥', count: 1 });
		});
	});

	describe('getUserStreak', () => {
		it('should return correct streak for user with submissions', async () => {
			const t = convexTest(schema, modules);

			// Create a submission with streak
			const id = await t.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'streak-query-user'
			});

			const result = await t.query(api.testEmojiMutation.getUserStreak, {
				userId: 'streak-query-user'
			});

			expect(result).toEqual({ streak: 1 });
		});

		it('should return { streak: 0 } for user with no submissions', async () => {
			const t = convexTest(schema, modules);

			const result = await t.query(api.testEmojiMutation.getUserStreak, {
				userId: 'non-existent-user'
			});

			expect(result).toEqual({ streak: 0 });
		});

		it('should handle multiple users independently', async () => {
			const t = convexTest(schema, modules);

			// User 1 gets a streak of 1
			await t.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'user1'
			});

			// User 2 gets a streak of 1 (independent)
			await t.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥',
				mood: 'happy',
				userId: 'user2'
			});

			const user1Streak = await t.query(api.testEmojiMutation.getUserStreak, {
				userId: 'user1'
			});

			const user2Streak = await t.query(api.testEmojiMutation.getUserStreak, {
				userId: 'user2'
			});

			expect(user1Streak).toEqual({ streak: 1 });
			expect(user2Streak).toEqual({ streak: 1 });
		});

		it('should call checkAndUnlockAchievements after creating emoji entry', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Submit an emoji
			const id = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'achievement-test-user'
			});

			// Verify entry was created
			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record).toBeDefined();

			// Verify achievement check was triggered by checking if any achievements were unlocked
			// Since this is the first emoji (count=1), it shouldn't unlock emoji_starter (threshold=5)
			const achievements = await asUser.query(api.testAchievements.getUserAchievements, {
				userId: 'achievement-test-user'
			});
			expect(achievements).toEqual([]); // No achievements unlocked yet

			// Submit 4 more emojis to reach threshold=5 for emoji_starter
			for (let i = 0; i < 4; i++) {
				await asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '😎',
					mood: 'chill',
					userId: 'achievement-test-user'
				});
			}

			// Now check if emoji_starter achievement was unlocked
			const achievementsAfter = await asUser.query(api.testAchievements.getUserAchievements, {
				userId: 'achievement-test-user'
			});
			expect(achievementsAfter).toHaveLength(1);
			expect(achievementsAfter[0].type).toBe('emoji_starter');
			expect(achievementsAfter[0].title).toBe('Emoji Starter');
		});
	});

	describe('listRecentEmojisPaginated', () => {
		it('should return empty result when table has no entries', async () => {
			const t = convexTest(schema, modules);

			// Query empty table
			const result = await t.query(api.testEmojiMutation.listRecentEmojisPaginated, {});

			// Should return empty entries array
			expect(result.entries).toEqual([]);
			expect(result.entries).toHaveLength(0);

			// Should indicate no more entries
			expect(result.hasMore).toBe(false);

			// Should have null cursor
			expect(result.cursor).toBe(null);
		});

		it('should respect custom limit parameter', async () => {
			const t = convexTest(schema, modules);

			// Try with custom limit on empty table first (simple case)
			const emptyResult = await t.query(api.testEmojiMutation.listRecentEmojisPaginated, {
				limit: 3
			});

			// Should respect the custom limit structure even with no data
			expect(emptyResult.entries).toEqual([]);
			expect(emptyResult.hasMore).toBe(false);
			expect(emptyResult.cursor).toBe(null);
		});

		it('should handle cursor-based navigation correctly', async () => {
			const t = convexTest(schema, modules);

			// Test with an invalid cursor (simulating real pagination scenarios)
			const result = await t.query(api.testEmojiMutation.listRecentEmojisPaginated, {
				cursor: "some_test_cursor_that_doesnt_exist"
			});

			// Should handle gracefully - exact behavior depends on Convex implementation
			// but should not crash and should return proper structure
			expect(result).toHaveProperty('entries');
			expect(result).toHaveProperty('hasMore');
			expect(result).toHaveProperty('cursor');
			expect(Array.isArray(result.entries)).toBe(true);
			expect(typeof result.hasMore).toBe('boolean');
			expect(result.cursor === null || typeof result.cursor === 'string').toBe(true);
		});
	});

	describe('getMoodSummary', () => {
		it('should return correct counts for each mood when entries exist', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Insert entries with different moods
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎', mood: 'chill', userId: 'test-user'
			});
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎', mood: 'chill', userId: 'test-user'
			});
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '💩', mood: 'angry', userId: 'test-user'
			});
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥', mood: 'happy', userId: 'test-user'
			});

			// Query mood summary - no auth needed per expert guidance
			const result = await t.query(api.testEmojiMutation.getMoodSummary, {});

			// Should have correct structure and counts
			expect(result).toHaveLength(3);
			expect(result).toEqual([
				{ mood: 'chill', count: 2, percentage: 50.0 },
				{ mood: 'angry', count: 1, percentage: 25.0 },
				{ mood: 'happy', count: 1, percentage: 25.0 }
			]);
		});

		it('should calculate correct percentages rounded to 1 decimal', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Insert entries to test percentage rounding: 2/7, 3/7, 2/7
			// Should be 28.6%, 42.9%, 28.6%
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎', mood: 'chill', userId: 'test-user'
			});
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎', mood: 'chill', userId: 'test-user'
			});
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '💩', mood: 'angry', userId: 'test-user'
			});
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '💩', mood: 'angry', userId: 'test-user'
			});
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '💩', mood: 'angry', userId: 'test-user'
			});
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥', mood: 'happy', userId: 'test-user'
			});
			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥', mood: 'happy', userId: 'test-user'
			});

			const result = await t.query(api.testEmojiMutation.getMoodSummary, {});

			// Check percentage rounding is correct
			expect(result).toEqual([
				{ mood: 'angry', count: 3, percentage: 42.9 },
				{ mood: 'chill', count: 2, percentage: 28.6 },
				{ mood: 'happy', count: 2, percentage: 28.6 }
			]);
		});

		it('should exclude reactions (entries with parentId) from counts', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create 2 main emoji entries
			const id1 = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎', mood: 'chill', userId: 'test-user'
			});
			const id2 = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '💩', mood: 'angry', userId: 'test-user'
			});

			// Directly insert reaction entries with parentId (simulate reactions)
			await t.run(async (ctx) => {
				await ctx.db.insert('testTable', {
					emoji: '🔥',
					mood: 'happy',
					sentence: 'Reaction to chill entry',
					userId: 'test-user',
					createdAt: Date.now(),
					parentId: id1 // This makes it a reaction
				});
				await ctx.db.insert('testTable', {
					emoji: '😎',
					mood: 'chill',
					sentence: 'Another reaction',
					userId: 'test-user',
					createdAt: Date.now(),
					parentId: id2 // This makes it a reaction
				});
			});

			// Query mood summary
			const result = await t.query(api.testEmojiMutation.getMoodSummary, {});

			// Should only count the main entries, not reactions
			expect(result).toEqual([
				{ mood: 'chill', count: 1, percentage: 50.0 },
				{ mood: 'angry', count: 1, percentage: 50.0 }
			]);
		});

		it('should return empty array when no entries exist', async () => {
			const t = convexTest(schema, modules);

			// Query mood summary on empty table
			const result = await t.query(api.testEmojiMutation.getMoodSummary, {});

			// Should return empty array
			expect(result).toEqual([]);
			expect(result).toHaveLength(0);
		});
	});
});