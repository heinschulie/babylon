import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testActivityFeed', () => {
	describe('getActivityFeed', () => {
		it('should return items sorted by timestamp descending', async () => {
			const t = convexTest(schema, modules);

			const now = Date.now();

			// Create test data with different timestamps
			// Older emoji entry
			const oldEmojiId = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎',
					sentence: 'The cat wore sunglasses',
					mood: 'chill',
					userId: 'test-user',
					createdAt: now - 3000, // 3 seconds ago
				});
			});

			// Newer poll entry
			const newPollId = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'What is your favorite color?',
					options: ['red', 'blue', 'green'],
					createdAt: now - 1000, // 1 second ago
				});
			});

			// Newest emoji entry
			const newestEmojiId = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '🔥',
					sentence: 'Everything is fine',
					mood: 'happy',
					userId: 'test-user-2',
					createdAt: now, // now
				});
			});

			// Query activity feed
			const result = await t.query(api.testActivityFeed.getActivityFeed, {});

			// Verify results are sorted by timestamp descending (newest first)
			expect(result).toHaveLength(3);
			expect(result[0].timestamp).toBe(now); // newest emoji
			expect(result[1].timestamp).toBe(now - 1000); // poll
			expect(result[2].timestamp).toBe(now - 3000); // oldest emoji
		});

		it('should correctly classify emoji vs vote (presence of pollId)', async () => {
			const t = convexTest(schema, modules);

			// Create a poll first
			const pollId = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Test poll',
					options: ['option1', 'option2'],
					createdAt: Date.now() - 2000,
				});
			});

			// Create an emoji entry (no pollId)
			await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎',
					sentence: 'The cat wore sunglasses',
					mood: 'chill',
					userId: 'test-user',
					createdAt: Date.now() - 1000,
				});
			});

			// Create a vote entry (with pollId)
			await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '🔥',
					sentence: 'Everything is fine',
					mood: 'happy',
					userId: 'test-user-2',
					pollId: pollId,
					createdAt: Date.now(),
				});
			});

			// Query activity feed
			const result = await t.query(api.testActivityFeed.getActivityFeed, {});

			// Verify correct classification
			expect(result).toHaveLength(3);

			// Most recent should be 'vote' (has pollId)
			expect(result[0].type).toBe('vote');
			expect(result[0].data).toMatchObject({
				emoji: '🔥',
				mood: 'happy',
				pollId: pollId,
			});

			// Middle should be 'emoji' (no pollId)
			expect(result[1].type).toBe('emoji');
			expect(result[1].data).toMatchObject({
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user',
			});

			// Oldest should be 'poll'
			expect(result[2].type).toBe('poll');
			expect(result[2].data).toMatchObject({
				question: 'Test poll',
				optionCount: 2,
			});
		});

		it('should correctly classify poll creation events', async () => {
			const t = convexTest(schema, modules);

			// Create a poll with different question and options count
			await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'What is the best programming language?',
					options: ['JavaScript', 'TypeScript', 'Python', 'Rust', 'Go'],
					createdAt: Date.now(),
				});
			});

			// Query activity feed
			const result = await t.query(api.testActivityFeed.getActivityFeed, {});

			// Verify poll event
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('poll');
			expect(result[0].data).toEqual({
				question: 'What is the best programming language?',
				optionCount: 5,
			});
			expect(result[0].timestamp).toEqual(expect.any(Number));
		});

		it('should merge events from both tables into one sorted list', async () => {
			const t = convexTest(schema, modules);

			const baseTime = Date.now();

			// Create mixed entries with interleaved timestamps
			// testTable entry (oldest)
			await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎',
					sentence: 'Test',
					mood: 'chill',
					userId: 'user1',
					createdAt: baseTime - 3000,
				});
			});

			// testPollTable entry (middle)
			await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Middle poll',
					options: ['a', 'b'],
					createdAt: baseTime - 2000,
				});
			});

			// testTable entry (newer)
			await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '💩',
					sentence: 'Test 2',
					mood: 'angry',
					userId: 'user2',
					createdAt: baseTime - 1000,
				});
			});

			// testPollTable entry (newest)
			await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Newest poll',
					options: ['x', 'y', 'z'],
					createdAt: baseTime,
				});
			});

			// Query activity feed
			const result = await t.query(api.testActivityFeed.getActivityFeed, {});

			// Verify merged and sorted correctly
			expect(result).toHaveLength(4);

			// Check order (newest to oldest)
			expect(result[0]).toMatchObject({
				type: 'poll',
				timestamp: baseTime,
			});
			expect(result[1]).toMatchObject({
				type: 'emoji',
				timestamp: baseTime - 1000,
			});
			expect(result[2]).toMatchObject({
				type: 'poll',
				timestamp: baseTime - 2000,
			});
			expect(result[3]).toMatchObject({
				type: 'emoji',
				timestamp: baseTime - 3000,
			});

			// Verify all timestamps are in descending order
			for (let i = 0; i < result.length - 1; i++) {
				expect(result[i].timestamp).toBeGreaterThan(result[i + 1].timestamp);
			}
		});

		it('should limit output to 30 items even when more exist', async () => {
			const t = convexTest(schema, modules);

			const baseTime = Date.now();

			// Create more than 30 items (35 total)
			// 20 emoji entries
			for (let i = 0; i < 20; i++) {
				await t.run(async (ctx) => {
					return ctx.db.insert('testTable', {
						emoji: '😎',
						sentence: `Test emoji ${i}`,
						mood: 'chill',
						userId: `user${i}`,
						createdAt: baseTime - (i * 100),
					});
				});
			}

			// 15 poll entries
			for (let i = 0; i < 15; i++) {
				await t.run(async (ctx) => {
					return ctx.db.insert('testPollTable', {
						question: `Poll ${i}?`,
						options: [`option${i}a`, `option${i}b`],
						createdAt: baseTime - 2000 - (i * 100),
					});
				});
			}

			// Query activity feed
			const result = await t.query(api.testActivityFeed.getActivityFeed, {});

			// Should return exactly 30 items, not 35
			expect(result).toHaveLength(30);

			// Should be sorted by timestamp descending
			for (let i = 0; i < result.length - 1; i++) {
				expect(result[i].timestamp).toBeGreaterThan(result[i + 1].timestamp);
			}

			// First item should be the most recent
			expect(result[0].timestamp).toBe(baseTime);
		});

		it('should return empty array when both tables are empty', async () => {
			const t = convexTest(schema, modules);

			// Query without creating any data
			const result = await t.query(api.testActivityFeed.getActivityFeed, {});

			expect(result).toEqual([]);
			expect(result).toHaveLength(0);
		});

		it('should classify testTable entries with parentId as reaction type', async () => {
			const t = convexTest(schema, modules);
			const now = Date.now();

			// Create a parent emoji entry
			const parentId = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎',
					sentence: 'Parent emoji',
					mood: 'chill',
					userId: 'user1',
					createdAt: now - 2000,
				});
			});

			// Create a reaction entry (has parentId)
			await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '❤️',
					sentence: 'Reaction',
					mood: 'happy',
					userId: 'user2',
					createdAt: now,
					parentId,
				});
			});

			const result = await t.query(api.testActivityFeed.getActivityFeed, {});

			expect(result).toHaveLength(2);
			// Newest first: reaction, then emoji
			expect(result[0].type).toBe('reaction');
			expect(result[1].type).toBe('emoji');
		});

		it('should maintain correct timestamp sort across all 3 source tables', async () => {
			const t = convexTest(schema, modules);
			const now = Date.now();

			// Interleave entries from all 3 tables
			await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎', sentence: 'Oldest', mood: 'chill', userId: 'u1', createdAt: now - 4000,
				});
			});
			await t.run(async (ctx) => {
				return ctx.db.insert('testAchievementTable', {
					type: 'emoji_starter', title: 'Emoji Starter', userId: 'u1', unlockedAt: now - 3000,
				});
			});
			await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Middle poll', options: ['a', 'b'], createdAt: now - 2000,
				});
			});
			await t.run(async (ctx) => {
				return ctx.db.insert('testAchievementTable', {
					type: 'emoji_pro', title: 'Emoji Pro', userId: 'u1', unlockedAt: now - 1000,
				});
			});
			await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '🔥', sentence: 'Newest', mood: 'happy', userId: 'u2', createdAt: now,
				});
			});

			const result = await t.query(api.testActivityFeed.getActivityFeed, {});

			expect(result).toHaveLength(5);
			// Verify descending order across all 3 tables
			expect(result[0]).toMatchObject({ type: 'emoji', timestamp: now });
			expect(result[1]).toMatchObject({ type: 'achievement', timestamp: now - 1000 });
			expect(result[2]).toMatchObject({ type: 'poll', timestamp: now - 2000 });
			expect(result[3]).toMatchObject({ type: 'achievement', timestamp: now - 3000 });
			expect(result[4]).toMatchObject({ type: 'emoji', timestamp: now - 4000 });

			for (let i = 0; i < result.length - 1; i++) {
				expect(result[i].timestamp).toBeGreaterThan(result[i + 1].timestamp);
			}
		});

		it('should return correct event data shape for reaction events', async () => {
			const t = convexTest(schema, modules);
			const now = Date.now();

			const parentId = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎', sentence: 'Parent', mood: 'chill', userId: 'user1', createdAt: now - 1000,
				});
			});

			await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '❤️', sentence: 'Reaction', mood: 'happy', userId: 'user2', createdAt: now, parentId,
				});
			});

			const result = await t.query(api.testActivityFeed.getActivityFeed, {});
			const reaction = result.find((e: any) => e.type === 'reaction');

			expect(reaction).toBeDefined();
			expect(reaction!.data).toMatchObject({
				emoji: '❤️',
				parentId,
				userId: 'user2',
			});
		});

		it('should return correct event data shape for achievement events', async () => {
			const t = convexTest(schema, modules);
			const now = Date.now();

			await t.run(async (ctx) => {
				return ctx.db.insert('testAchievementTable', {
					type: 'democracy', title: 'Democracy', userId: 'user1', unlockedAt: now,
				});
			});

			const result = await t.query(api.testActivityFeed.getActivityFeed, {});
			const achievement = result.find((e: any) => e.type === 'achievement');

			expect(achievement).toBeDefined();
			expect(achievement!.data).toMatchObject({
				type: 'democracy',
				title: 'Democracy',
				userId: 'user1',
			});
		});

		it('should include testAchievementTable entries as achievement type', async () => {
			const t = convexTest(schema, modules);
			const now = Date.now();

			await t.run(async (ctx) => {
				return ctx.db.insert('testAchievementTable', {
					type: 'emoji_starter',
					title: 'Emoji Starter',
					userId: 'user1',
					unlockedAt: now,
				});
			});

			const result = await t.query(api.testActivityFeed.getActivityFeed, {});

			expect(result).toHaveLength(1);
			expect(result[0].type).toBe('achievement');
			expect(result[0].timestamp).toBe(now);
		});

		it('should handle case where one table is empty and other has data', async () => {
			const t = convexTest(schema, modules);

			// Only create entries in testTable, leave testPollTable empty
			await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎',
					sentence: 'Only emoji',
					mood: 'chill',
					userId: 'test-user',
					createdAt: Date.now() - 1000,
				});
			});

			await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '🔥',
					sentence: 'Another emoji',
					mood: 'happy',
					userId: 'test-user-2',
					createdAt: Date.now(),
				});
			});

			// Query activity feed
			const result = await t.query(api.testActivityFeed.getActivityFeed, {});

			// Should return only the emoji events
			expect(result).toHaveLength(2);
			expect(result[0].type).toBe('emoji');
			expect(result[1].type).toBe('emoji');
			expect(result[0].timestamp).toBeGreaterThan(result[1].timestamp);
		});
	});
});