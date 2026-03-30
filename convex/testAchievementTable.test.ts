import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('testAchievementTable', () => {
	describe('inserting achievement records', () => {
		it('should insert a testAchievementTable row with all required fields', async () => {
			const t = convexTest(schema, modules);

			const before = Date.now();

			// Insert achievement record directly via database
			// This should fail if testAchievementTable is not defined in schema
			const id = await t.run(async (ctx) => {
				return ctx.db.insert('testAchievementTable', {
					type: 'emoji_starter',
					title: 'Emoji Starter',
					userId: 'test-user-1',
					unlockedAt: Date.now()
				});
			});

			const after = Date.now();

			expect(id).toBeDefined();

			// Verify record was created correctly
			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record).toEqual({
				_id: id,
				_creationTime: expect.any(Number),
				type: 'emoji_starter',
				title: 'Emoji Starter',
				userId: 'test-user-1',
				unlockedAt: expect.any(Number)
			});

			// Verify timestamp is reasonable
			expect(record?.unlockedAt).toBeGreaterThanOrEqual(before);
			expect(record?.unlockedAt).toBeLessThanOrEqual(after);
		});
	});

	describe('by_userId index', () => {
		it('should return all achievements for a given user', async () => {
			const t = convexTest(schema, modules);

			// Insert achievements for different users
			await t.run(async (ctx) => {
				// User 1 achievements
				await ctx.db.insert('testAchievementTable', {
					type: 'emoji_starter',
					title: 'Emoji Starter',
					userId: 'user-1',
					unlockedAt: Date.now()
				});

				await ctx.db.insert('testAchievementTable', {
					type: 'emoji_pro',
					title: 'Emoji Pro',
					userId: 'user-1',
					unlockedAt: Date.now()
				});

				// User 2 achievements
				await ctx.db.insert('testAchievementTable', {
					type: 'democracy',
					title: 'Democracy',
					userId: 'user-2',
					unlockedAt: Date.now()
				});
			});

			// Query achievements for user-1
			const user1Achievements = await t.run(async (ctx) => {
				return ctx.db
					.query('testAchievementTable')
					.withIndex('by_userId', q => q.eq('userId', 'user-1'))
					.collect();
			});

			// Should return 2 achievements for user-1
			expect(user1Achievements).toHaveLength(2);
			expect(user1Achievements.every(a => a.userId === 'user-1')).toBe(true);
			expect(user1Achievements.map(a => a.type).sort()).toEqual(['emoji_pro', 'emoji_starter']);

			// Query achievements for user-2
			const user2Achievements = await t.run(async (ctx) => {
				return ctx.db
					.query('testAchievementTable')
					.withIndex('by_userId', q => q.eq('userId', 'user-2'))
					.collect();
			});

			// Should return 1 achievement for user-2
			expect(user2Achievements).toHaveLength(1);
			expect(user2Achievements[0].userId).toBe('user-2');
			expect(user2Achievements[0].type).toBe('democracy');
		});
	});

	describe('by_type_userId index for idempotency', () => {
		it('should check for existing achievement using by_type_userId index', async () => {
			const t = convexTest(schema, modules);

			// Insert an achievement
			await t.run(async (ctx) => {
				await ctx.db.insert('testAchievementTable', {
					type: 'social_butterfly',
					title: 'Social Butterfly',
					userId: 'test-user',
					unlockedAt: Date.now()
				});
			});

			// Check for existing achievement (should find it)
			const existing = await t.run(async (ctx) => {
				return ctx.db
					.query('testAchievementTable')
					.withIndex('by_type_userId', q =>
						q.eq('type', 'social_butterfly').eq('userId', 'test-user')
					)
					.unique();
			});

			expect(existing).toBeDefined();
			expect(existing?.type).toBe('social_butterfly');
			expect(existing?.userId).toBe('test-user');

			// Check for non-existing achievement (should return null)
			const nonExisting = await t.run(async (ctx) => {
				return ctx.db
					.query('testAchievementTable')
					.withIndex('by_type_userId', q =>
						q.eq('type', 'poll_creator').eq('userId', 'test-user')
					)
					.unique();
			});

			expect(nonExisting).toBeNull();

			// Check for same type but different user (should return null)
			const differentUser = await t.run(async (ctx) => {
				return ctx.db
					.query('testAchievementTable')
					.withIndex('by_type_userId', q =>
						q.eq('type', 'social_butterfly').eq('userId', 'other-user')
					)
					.unique();
			});

			expect(differentUser).toBeNull();
		});
	});

	describe('duplicate (type, userId) handling', () => {
		it('should allow inserting duplicate (type, userId) pairs at schema level', async () => {
			const t = convexTest(schema, modules);

			const userId = 'duplicate-test-user';
			const type = 'poll_creator';
			const title = 'Poll Creator';

			// Insert first achievement
			const id1 = await t.run(async (ctx) => {
				return ctx.db.insert('testAchievementTable', {
					type,
					title,
					userId,
					unlockedAt: Date.now()
				});
			});

			// Insert duplicate (type, userId) - should succeed at schema level
			const id2 = await t.run(async (ctx) => {
				return ctx.db.insert('testAchievementTable', {
					type,
					title,
					userId,
					unlockedAt: Date.now()
				});
			});

			expect(id1).toBeDefined();
			expect(id2).toBeDefined();
			expect(id1).not.toBe(id2); // Different IDs

			// Verify both records exist
			const record1 = await t.run(async (ctx) => ctx.db.get(id1));
			const record2 = await t.run(async (ctx) => ctx.db.get(id2));

			expect(record1?.type).toBe(type);
			expect(record1?.userId).toBe(userId);
			expect(record2?.type).toBe(type);
			expect(record2?.userId).toBe(userId);

			// Query by index should return both records
			const allMatching = await t.run(async (ctx) => {
				return ctx.db
					.query('testAchievementTable')
					.withIndex('by_type_userId', q =>
						q.eq('type', type).eq('userId', userId)
					)
					.collect();
			});

			expect(allMatching).toHaveLength(2);
		});
	});
});