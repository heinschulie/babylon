import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('testAchievementTable', () => {
	describe('schema functionality', () => {
		it('should insert testAchievementTable row with all required fields succeeds', async () => {
			const t = convexTest(schema, modules);

			const now = Date.now();
			const recordId = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type: 'emoji_starter',
					title: 'Emoji Starter',
					userId: 'test-user-1',
					unlockedAt: now
				});
			});

			expect(recordId).toBeDefined();

			// Verify record was created correctly
			const record = await t.run(async (ctx) => ctx.db.get(recordId));
			expect(record).toEqual({
				_id: recordId,
				_creationTime: expect.any(Number),
				type: 'emoji_starter',
				title: 'Emoji Starter',
				userId: 'test-user-1',
				unlockedAt: now
			});
		});

		it('should return all achievements for a given user via by_userId index', async () => {
			const t = convexTest(schema, modules);

			const userId1 = 'test-user-1';
			const userId2 = 'test-user-2';
			const now = Date.now();

			// Insert achievements for user1
			const id1 = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type: 'emoji_starter',
					title: 'Emoji Starter',
					userId: userId1,
					unlockedAt: now
				});
			});

			const id2 = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type: 'emoji_pro',
					title: 'Emoji Pro',
					userId: userId1,
					unlockedAt: now + 1000
				});
			});

			// Insert achievement for user2 (should not appear in user1 results)
			const id3 = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type: 'democracy',
					title: 'Democracy',
					userId: userId2,
					unlockedAt: now + 2000
				});
			});

			// Query achievements by userId using the index
			const user1Achievements = await t.run(async (ctx) => {
				return await ctx.db
					.query('testAchievementTable')
					.withIndex('by_userId', q => q.eq('userId', userId1))
					.collect();
			});

			expect(user1Achievements).toHaveLength(2);
			const user1Ids = user1Achievements.map(a => a._id);
			expect(user1Ids).toContain(id1);
			expect(user1Ids).toContain(id2);
			expect(user1Achievements.every(a => a.userId === userId1)).toBe(true);

			// Query achievements for user2
			const user2Achievements = await t.run(async (ctx) => {
				return await ctx.db
					.query('testAchievementTable')
					.withIndex('by_userId', q => q.eq('userId', userId2))
					.collect();
			});

			expect(user2Achievements).toHaveLength(1);
			expect(user2Achievements[0]._id).toBe(id3);
			expect(user2Achievements[0].userId).toBe(userId2);
		});

		it('should check for existing achievement using by_type_userId index (idempotency guard)', async () => {
			const t = convexTest(schema, modules);

			const userId = 'test-user-1';
			const achievementType = 'emoji_starter';
			const now = Date.now();

			// Insert first achievement
			const id1 = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type: achievementType,
					title: 'Emoji Starter',
					userId: userId,
					unlockedAt: now
				});
			});

			// Check for existing achievement using compound index - should find the record
			const existing = await t.run(async (ctx) => {
				return await ctx.db
					.query('testAchievementTable')
					.withIndex('by_type_userId', q => q.eq('type', achievementType).eq('userId', userId))
					.unique();
			});

			expect(existing).not.toBeNull();
			expect(existing?._id).toBe(id1);
			expect(existing?.type).toBe(achievementType);
			expect(existing?.userId).toBe(userId);

			// Check for non-existent achievement - should return null
			const nonExistent = await t.run(async (ctx) => {
				return await ctx.db
					.query('testAchievementTable')
					.withIndex('by_type_userId', q => q.eq('type', 'non_existent_type').eq('userId', userId))
					.unique();
			});

			expect(nonExistent).toBeNull();

			// Check for same type but different user - should return null
			const differentUser = await t.run(async (ctx) => {
				return await ctx.db
					.query('testAchievementTable')
					.withIndex('by_type_userId', q => q.eq('type', achievementType).eq('userId', 'different-user'))
					.unique();
			});

			expect(differentUser).toBeNull();
		});

		it('should allow inserting duplicate (type, userId) pairs at schema level', async () => {
			const t = convexTest(schema, modules);

			const userId = 'test-user-1';
			const achievementType = 'emoji_starter';
			const title = 'Emoji Starter';
			const now = Date.now();

			// Insert first achievement
			const id1 = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type: achievementType,
					title: title,
					userId: userId,
					unlockedAt: now
				});
			});

			// Insert duplicate (same type, same userId) - should succeed at schema level
			const id2 = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type: achievementType,
					title: title,
					userId: userId,
					unlockedAt: now + 1000
				});
			});

			expect(id1).toBeDefined();
			expect(id2).toBeDefined();
			expect(id1).not.toBe(id2); // Different records

			// Verify both records exist and are distinct
			const record1 = await t.run(async (ctx) => ctx.db.get(id1));
			const record2 = await t.run(async (ctx) => ctx.db.get(id2));

			expect(record1?.type).toBe(achievementType);
			expect(record1?.userId).toBe(userId);
			expect(record2?.type).toBe(achievementType);
			expect(record2?.userId).toBe(userId);
			expect(record1?.unlockedAt).toBe(now);
			expect(record2?.unlockedAt).toBe(now + 1000);

			// Verify compound index can find both duplicates
			const allMatching = await t.run(async (ctx) => {
				return await ctx.db
					.query('testAchievementTable')
					.withIndex('by_type_userId', q => q.eq('type', achievementType).eq('userId', userId))
					.collect();
			});

			expect(allMatching).toHaveLength(2);
			const ids = allMatching.map(r => r._id);
			expect(ids).toContain(id1);
			expect(ids).toContain(id2);
		});
	});
});