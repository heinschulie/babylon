import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('testAchievementTable', () => {
	describe('basic insertion', () => {
		it('should insert testAchievementTable row with all required fields successfully', async () => {
			const t = convexTest(schema, modules);

			const type = 'emoji_starter';
			const title = 'Emoji Starter';
			const userId = 'test-user-123';
			const unlockedAt = Date.now();

			// Insert achievement record - should work
			const id = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type,
					title,
					userId,
					unlockedAt
				});
			});

			expect(id).toBeDefined();

			// Verify record was inserted correctly
			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record).toEqual({
				_id: id,
				_creationTime: expect.any(Number),
				type,
				title,
				userId,
				unlockedAt
			});
		});
	});

	describe('by_userId index', () => {
		it('should return all achievements for a given user via by_userId index', async () => {
			const t = convexTest(schema, modules);

			const userId = 'test-user-123';
			const otherUserId = 'other-user-456';
			const now = Date.now();

			// Insert multiple achievements for the same user
			const achievement1Id = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type: 'emoji_starter',
					title: 'Emoji Starter',
					userId,
					unlockedAt: now - 100
				});
			});

			const achievement2Id = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type: 'emoji_pro',
					title: 'Emoji Pro',
					userId,
					unlockedAt: now
				});
			});

			// Insert achievement for different user (should be excluded)
			const otherAchievementId = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type: 'social_butterfly',
					title: 'Social Butterfly',
					userId: otherUserId,
					unlockedAt: now + 100
				});
			});

			// Query using the by_userId index
			const userAchievements = await t.run(async (ctx) => {
				return await ctx.db
					.query('testAchievementTable')
					.withIndex('by_userId', (q) => q.eq('userId', userId))
					.collect();
			});

			// Should return exactly 2 achievements for the target user
			expect(userAchievements).toHaveLength(2);

			const achievementIds = userAchievements.map(a => a._id).sort();
			expect(achievementIds).toEqual([achievement1Id, achievement2Id].sort());

			// Verify all returned records have correct userId
			userAchievements.forEach(achievement => {
				expect(achievement.userId).toBe(userId);
			});

			// Verify other user's achievement is not included
			expect(userAchievements.some(a => a._id === otherAchievementId)).toBe(false);
		});
	});

	describe('by_type_userId index (idempotency guard)', () => {
		it('should check for existing achievement using by_type_userId compound index', async () => {
			const t = convexTest(schema, modules);

			const type = 'emoji_starter';
			const title = 'Emoji Starter';
			const userId = 'test-user-123';
			const unlockedAt = Date.now();

			// Insert the first achievement
			const firstAchievementId = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type,
					title,
					userId,
					unlockedAt
				});
			});

			// Query using the by_type_userId compound index to check if this (type, userId) already exists
			const existingAchievement = await t.run(async (ctx) => {
				return await ctx.db
					.query('testAchievementTable')
					.withIndex('by_type_userId', (q) => q.eq('type', type).eq('userId', userId))
					.unique();
			});

			// Should find the existing achievement
			expect(existingAchievement).not.toBeNull();
			expect(existingAchievement!._id).toBe(firstAchievementId);
			expect(existingAchievement!.type).toBe(type);
			expect(existingAchievement!.userId).toBe(userId);

			// Verify uniqueness by checking that only one result exists
			const allMatchingAchievements = await t.run(async (ctx) => {
				return await ctx.db
					.query('testAchievementTable')
					.withIndex('by_type_userId', (q) => q.eq('type', type).eq('userId', userId))
					.collect();
			});

			expect(allMatchingAchievements).toHaveLength(1);
			expect(allMatchingAchievements[0]._id).toBe(firstAchievementId);
		});

		it('should return null when querying by_type_userId for non-existent combination', async () => {
			const t = convexTest(schema, modules);

			const type = 'non_existent_type';
			const userId = 'non-existent-user';

			// Query for a (type, userId) combination that doesn't exist
			const nonExistentAchievement = await t.run(async (ctx) => {
				return await ctx.db
					.query('testAchievementTable')
					.withIndex('by_type_userId', (q) => q.eq('type', type).eq('userId', userId))
					.unique();
			});

			// Should return null since no such achievement exists
			expect(nonExistentAchievement).toBeNull();
		});
	});

	describe('duplicate handling (schema level)', () => {
		it('should allow inserting duplicate (type, userId) pairs at schema level', async () => {
			const t = convexTest(schema, modules);

			const type = 'emoji_starter';
			const title = 'Emoji Starter';
			const userId = 'test-user-123';
			const now = Date.now();

			// Insert the first achievement
			const firstAchievementId = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type,
					title,
					userId,
					unlockedAt: now
				});
			});

			// Insert a duplicate (same type, same userId) - should be allowed at schema level
			const duplicateAchievementId = await t.run(async (ctx) => {
				return await ctx.db.insert('testAchievementTable', {
					type,
					title,
					userId,
					unlockedAt: now + 1000
				});
			});

			expect(firstAchievementId).toBeDefined();
			expect(duplicateAchievementId).toBeDefined();
			expect(firstAchievementId).not.toBe(duplicateAchievementId);

			// Verify both records exist with same (type, userId)
			const duplicateRecords = await t.run(async (ctx) => {
				return await ctx.db
					.query('testAchievementTable')
					.withIndex('by_type_userId', (q) => q.eq('type', type).eq('userId', userId))
					.collect();
			});

			// Should have 2 records with same (type, userId) - proving schema allows duplicates
			expect(duplicateRecords).toHaveLength(2);

			const recordIds = duplicateRecords.map(r => r._id).sort();
			expect(recordIds).toEqual([firstAchievementId, duplicateAchievementId].sort());

			// All records should have same type and userId
			duplicateRecords.forEach(record => {
				expect(record.type).toBe(type);
				expect(record.userId).toBe(userId);
				expect(record.title).toBe(title);
			});

			// But should have different unlockedAt timestamps
			expect(duplicateRecords[0].unlockedAt).not.toBe(duplicateRecords[1].unlockedAt);
		});
	});
});