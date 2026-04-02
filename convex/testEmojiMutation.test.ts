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

	describe('getSentenceStats', () => {
		it('should find the longest sentence by word count', async () => {
			const t = convexTest(schema, modules);

			await t.run(async (ctx) => {
				await ctx.db.insert('testTable', {
					emoji: '😎', mood: 'chill', sentence: 'Short one', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
				await ctx.db.insert('testTable', {
					emoji: '🔥', mood: 'happy', sentence: 'This is the longest sentence in the test data set', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
				await ctx.db.insert('testTable', {
					emoji: '💩', mood: 'angry', sentence: 'Medium length sentence here', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
			});

			const result = await t.query(api.testEmojiMutation.getSentenceStats, {});

			expect(result.longestSentence).toBe('This is the longest sentence in the test data set');
			expect(result.longestWordCount).toBe(10);
		});

		it('should return null/zero values when no sentences exist', async () => {
			const t = convexTest(schema, modules);

			const result = await t.query(api.testEmojiMutation.getSentenceStats, {});

			expect(result.totalSentences).toBe(0);
			expect(result.longestSentence).toBe('');
			expect(result.longestWordCount).toBe(0);
			expect(result.mostCommonFirstWord).toBeNull();
			expect(result.wordCountDistribution).toEqual([
				{ bucket: '1', count: 0 },
				{ bucket: '2', count: 0 },
				{ bucket: '3', count: 0 },
				{ bucket: '4', count: 0 },
				{ bucket: '5+', count: 0 },
			]);
		});

		it('should bucket word counts into 1, 2, 3, 4, 5+ distribution', async () => {
			const t = convexTest(schema, modules);

			await t.run(async (ctx) => {
				await ctx.db.insert('testTable', {
					emoji: '😎', mood: 'chill', sentence: 'One', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
				await ctx.db.insert('testTable', {
					emoji: '😎', mood: 'chill', sentence: 'Two words', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
				await ctx.db.insert('testTable', {
					emoji: '😎', mood: 'chill', sentence: 'Three words here', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
				await ctx.db.insert('testTable', {
					emoji: '😎', mood: 'chill', sentence: 'Four words are here', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
				await ctx.db.insert('testTable', {
					emoji: '😎', mood: 'chill', sentence: 'Five words are right here', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
				await ctx.db.insert('testTable', {
					emoji: '😎', mood: 'chill', sentence: 'Six words are placed right here', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
			});

			const result = await t.query(api.testEmojiMutation.getSentenceStats, {});

			expect(result.wordCountDistribution).toEqual([
				{ bucket: '1', count: 1 },
				{ bucket: '2', count: 1 },
				{ bucket: '3', count: 1 },
				{ bucket: '4', count: 1 },
				{ bucket: '5+', count: 2 },
			]);
		});

		it('should compute mostCommonFirstWord correctly', async () => {
			const t = convexTest(schema, modules);

			await t.run(async (ctx) => {
				await ctx.db.insert('testTable', {
					emoji: '😎', mood: 'chill', sentence: 'The cat sat', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
				await ctx.db.insert('testTable', {
					emoji: '🔥', mood: 'happy', sentence: 'The dog ran', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
				await ctx.db.insert('testTable', {
					emoji: '💩', mood: 'angry', sentence: 'A bird flew', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
			});

			const result = await t.query(api.testEmojiMutation.getSentenceStats, {});

			expect(result.mostCommonFirstWord).toBe('The');
		});

		it('should return correct totalSentences count', async () => {
			const t = convexTest(schema, modules);

			// Seed 3 entries with non-empty sentences, 1 with empty
			await t.run(async (ctx) => {
				await ctx.db.insert('testTable', {
					emoji: '😎', mood: 'chill', sentence: 'Hello world', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
				await ctx.db.insert('testTable', {
					emoji: '🔥', mood: 'happy', sentence: 'The cat sat', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
				await ctx.db.insert('testTable', {
					emoji: '💩', mood: 'angry', sentence: 'One', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
				await ctx.db.insert('testTable', {
					emoji: '😎', mood: 'chill', sentence: '', userId: 'u1', createdAt: Date.now(), streakDay: 1
				});
			});

			const result = await t.query(api.testEmojiMutation.getSentenceStats, {});

			expect(result.totalSentences).toBe(3);
		});
	});

	describe('getWordCounts', () => {
		it('should return correct word count for a sentence with multiple words', async () => {
			const t = convexTest(schema, modules);

			// Seed test data directly via DB
			const id1 = await t.run(async (ctx) =>
				ctx.db.insert('testTable', {
					emoji: '😎',
					mood: 'chill',
					sentence: 'The cat wore sunglasses to the job interview',
					userId: 'test-user',
					createdAt: Date.now(),
					streakDay: 1
				})
			);

			// Call the query
			const result = await t.query(api.testEmojiMutation.getWordCounts, {});

			// Verify response shape and word count
			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				_id: id1,
				wordCount: 8 // "The cat wore sunglasses to the job interview" = 8 words
			});
		});

		it('should return 0 for entry with empty sentence', async () => {
			const t = convexTest(schema, modules);

			// Seed test data with empty sentence
			const id1 = await t.run(async (ctx) =>
				ctx.db.insert('testTable', {
					emoji: '😎',
					mood: 'chill',
					sentence: '',
					userId: 'test-user',
					createdAt: Date.now(),
					streakDay: 1
				})
			);

			// Call the query
			const result = await t.query(api.testEmojiMutation.getWordCounts, {});

			// Should return empty array because empty sentence is filtered out
			expect(result).toHaveLength(0);
		});

		it('should return empty array when no entries exist', async () => {
			const t = convexTest(schema, modules);

			// Call the query without adding any entries
			const result = await t.query(api.testEmojiMutation.getWordCounts, {});

			// Should return empty array
			expect(result).toEqual([]);
			expect(result).toHaveLength(0);
		});
	});
});