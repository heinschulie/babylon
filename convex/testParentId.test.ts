import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testTable parentId functionality', () => {
	describe('backward compatibility', () => {
		it('should insert testTable row without parentId (backward compat)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Insert using existing submitEmoji mutation - should work without parentId
			const id = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'backward-compat-user'
			});

			expect(id).toBeDefined();

			// Verify record was created correctly without parentId
			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record).toMatchObject({
				_id: id,
				emoji: '😎',
				sentence: 'The cat wore sunglasses to the job interview',
				mood: 'chill',
				userId: 'backward-compat-user',
				createdAt: expect.any(Number),
				streakDay: 1
			});

			// parentId should be undefined (not set)
			expect(record?.parentId).toBeUndefined();
		});
	});

	describe('parentId functionality', () => {
		it('should insert testTable row with valid parentId', async () => {
			const t = convexTest(schema, modules);

			// First, create a parent record
			const parentId = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎',
					sentence: 'Parent record',
					mood: 'chill',
					userId: 'parent-user',
					createdAt: Date.now(),
					streakDay: 1
				});
			});

			// Now create a child record with the parent's ID
			const childId = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '🔥',
					sentence: 'Child record',
					mood: 'happy',
					userId: 'child-user',
					createdAt: Date.now(),
					streakDay: 1,
					parentId: parentId
				});
			});

			expect(childId).toBeDefined();

			// Verify child record was created correctly with parentId
			const childRecord = await t.run(async (ctx) => ctx.db.get(childId));
			expect(childRecord).toMatchObject({
				_id: childId,
				emoji: '🔥',
				sentence: 'Child record',
				mood: 'happy',
				userId: 'child-user',
				createdAt: expect.any(Number),
				streakDay: 1,
				parentId: parentId
			});
		});

		it('should handle non-existent parentId gracefully', async () => {
			const t = convexTest(schema, modules);

			// Create a valid record first, then delete it to simulate a dangling reference
			const tempParentId = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎',
					sentence: 'Temporary parent',
					mood: 'chill',
					userId: 'temp-user',
					createdAt: Date.now(),
					streakDay: 1
				});
			});

			// Delete the parent record to create a scenario with non-existent parentId
			await t.run(async (ctx) => {
				await ctx.db.delete(tempParentId);
			});

			// Now attempt to create a record with the deleted parentId
			// According to expert guidance, this should succeed since there's no FK enforcement at DB level
			const childId = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '💩',
					sentence: 'Orphaned child record',
					mood: 'angry',
					userId: 'orphan-user',
					createdAt: Date.now(),
					streakDay: 1,
					parentId: tempParentId
				});
			});

			expect(childId).toBeDefined();

			// Verify the record was created with the non-existent parentId
			// This demonstrates "graceful" handling - insertion succeeds but creates orphaned record
			const childRecord = await t.run(async (ctx) => ctx.db.get(childId));
			expect(childRecord).toMatchObject({
				_id: childId,
				emoji: '💩',
				sentence: 'Orphaned child record',
				mood: 'angry',
				userId: 'orphan-user',
				createdAt: expect.any(Number),
				streakDay: 1,
				parentId: tempParentId
			});

			// Verify that the parent no longer exists (confirms orphaned state)
			const parentRecord = await t.run(async (ctx) => ctx.db.get(tempParentId));
			expect(parentRecord).toBeNull();
		});
	});

	describe('by_parentId index functionality', () => {
		it('should return all entries sharing the same parentId', async () => {
			const t = convexTest(schema, modules);

			// Create a parent record
			const parentId = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎',
					sentence: 'Parent record',
					mood: 'chill',
					userId: 'parent-user',
					createdAt: Date.now(),
					streakDay: 1
				});
			});

			// Create multiple child records with the same parentId
			const child1Id = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '🔥',
					sentence: 'First child',
					mood: 'happy',
					userId: 'child1-user',
					createdAt: Date.now(),
					streakDay: 1,
					parentId: parentId
				});
			});

			const child2Id = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '💩',
					sentence: 'Second child',
					mood: 'angry',
					userId: 'child2-user',
					createdAt: Date.now(),
					streakDay: 1,
					parentId: parentId
				});
			});

			// Create an unrelated record with no parentId
			await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎',
					sentence: 'Unrelated record',
					mood: 'chill',
					userId: 'unrelated-user',
					createdAt: Date.now(),
					streakDay: 1
				});
			});

			// Query by parentId using the index
			const childRecords = await t.run(async (ctx) => {
				return ctx.db
					.query('testTable')
					.withIndex('by_parentId', (q) => q.eq('parentId', parentId))
					.collect();
			});

			// Should return exactly 2 children
			expect(childRecords).toHaveLength(2);

			// Verify both children are returned with correct parentId
			const childIds = childRecords.map(r => r._id).sort();
			const expectedIds = [child1Id, child2Id].sort();
			expect(childIds).toEqual(expectedIds);

			// Verify all records have the correct parentId
			childRecords.forEach(record => {
				expect(record.parentId).toBe(parentId);
			});
		});

		it('should return empty array when no records have the specified parentId', async () => {
			const t = convexTest(schema, modules);

			// Create a parent record and a child with a different parentId
			const parentId1 = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎',
					sentence: 'Parent 1',
					mood: 'chill',
					userId: 'parent1-user',
					createdAt: Date.now(),
					streakDay: 1
				});
			});

			const parentId2 = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '🔥',
					sentence: 'Parent 2',
					mood: 'happy',
					userId: 'parent2-user',
					createdAt: Date.now(),
					streakDay: 1
				});
			});

			// Create child with parentId1
			await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '💩',
					sentence: 'Child of parent 1',
					mood: 'angry',
					userId: 'child-user',
					createdAt: Date.now(),
					streakDay: 1,
					parentId: parentId1
				});
			});

			// Query for children of parentId2 (should be empty)
			const childRecords = await t.run(async (ctx) => {
				return ctx.db
					.query('testTable')
					.withIndex('by_parentId', (q) => q.eq('parentId', parentId2))
					.collect();
			});

			expect(childRecords).toHaveLength(0);
			expect(childRecords).toEqual([]);
		});
	});

	describe('existing indexes compatibility', () => {
		it('should maintain existing index functionality after schema changes', async () => {
			const t = convexTest(schema, modules);

			// Create test records with different timestamps and users
			const now = Date.now();
			const record1Id = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎',
					sentence: 'First record',
					mood: 'chill',
					userId: 'user1',
					createdAt: now - 1000,
					streakDay: 1
				});
			});

			const record2Id = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '🔥',
					sentence: 'Second record',
					mood: 'happy',
					userId: 'user2',
					createdAt: now,
					streakDay: 2
				});
			});

			const record3Id = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '💩',
					sentence: 'Third record',
					mood: 'angry',
					userId: 'user1',
					createdAt: now + 1000,
					streakDay: 3
				});
			});

			// Test by_createdAt index (existing functionality)
			const byCreatedAt = await t.run(async (ctx) => {
				return ctx.db
					.query('testTable')
					.withIndex('by_createdAt')
					.order('desc')
					.collect();
			});

			expect(byCreatedAt.length).toBeGreaterThanOrEqual(3);
			// Verify records are in descending order by createdAt
			expect(byCreatedAt[0]._id).toBe(record3Id); // newest
			expect(byCreatedAt[byCreatedAt.length - 1]._id).toBe(record1Id); // oldest among the 3

			// Test by_userId_createdAt index (existing functionality)
			const byUser1 = await t.run(async (ctx) => {
				return ctx.db
					.query('testTable')
					.withIndex('by_userId_createdAt', (q) => q.eq('userId', 'user1'))
					.order('desc')
					.collect();
			});

			expect(byUser1).toHaveLength(2);
			expect(byUser1[0]._id).toBe(record3Id); // newest user1 record
			expect(byUser1[1]._id).toBe(record1Id); // older user1 record

			// Test listRecentEmojis query which uses by_createdAt index
			const recentEmojis = await t.query(api.testEmojiMutation.listRecentEmojis, {});
			expect(recentEmojis.length).toBeGreaterThanOrEqual(3);

			// Should be ordered by createdAt descending
			const createdAts = recentEmojis.map(r => r.createdAt);
			for (let i = 1; i < createdAts.length; i++) {
				expect(createdAts[i - 1]).toBeGreaterThanOrEqual(createdAts[i]);
			}
		});
	});
});