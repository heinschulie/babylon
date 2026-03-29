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
				createdAt: expect.any(Number)
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
});