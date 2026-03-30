import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('testTable parentId schema extension', () => {
	describe('backward compatibility', () => {
		it('should insert testTable row WITHOUT parentId successfully', async () => {
			const t = convexTest(schema, modules);

			const userId = 'test-user';
			const emoji = '😎';
			const sentence = 'Test sentence';
			const mood = 'happy';
			const createdAt = Date.now();

			// Insert record without parentId - should work with existing schema
			const id = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId,
					emoji,
					sentence,
					mood,
					createdAt
				});
			});

			expect(id).toBeDefined();

			// Verify record was inserted correctly
			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record).toEqual({
				_id: id,
				_creationTime: expect.any(Number),
				userId,
				emoji,
				sentence,
				mood,
				createdAt,
				parentId: undefined // optional field should be undefined
			});
		});
	});

	describe('valid parentId insertion', () => {
		it('should insert testTable row WITH a valid parentId successfully', async () => {
			const t = convexTest(schema, modules);

			// First create a parent row
			const parentId = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId: 'parent-user',
					emoji: '👨',
					sentence: 'Parent sentence',
					mood: 'neutral',
					createdAt: Date.now()
				});
			});

			// Now create a child row with valid parentId
			const childId = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId: 'child-user',
					emoji: '👶',
					sentence: 'Child sentence',
					mood: 'happy',
					createdAt: Date.now(),
					parentId: parentId
				});
			});

			expect(childId).toBeDefined();
			expect(childId).not.toBe(parentId);

			// Verify child record has correct parentId
			const childRecord = await t.run(async (ctx) => ctx.db.get(childId));
			expect(childRecord).toEqual({
				_id: childId,
				_creationTime: expect.any(Number),
				userId: 'child-user',
				emoji: '👶',
				sentence: 'Child sentence',
				mood: 'happy',
				createdAt: expect.any(Number),
				parentId: parentId // should reference the parent
			});

			// Verify parent record exists
			const parentRecord = await t.run(async (ctx) => ctx.db.get(parentId));
			expect(parentRecord?.parentId).toBeUndefined();
		});
	});

	describe('orphaned entries (no FK enforcement)', () => {
		it('should create orphaned entry with non-existent parentId (no FK validation)', async () => {
			const t = convexTest(schema, modules);

			// Create a record and then delete it to get a valid but non-existent ID
			const tempId = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId: 'temp-user',
					emoji: '⏰',
					sentence: 'Temp record',
					mood: 'temporary',
					createdAt: Date.now()
				});
			});

			// Delete the record to make the ID non-existent
			await t.run(async (ctx) => {
				await ctx.db.delete(tempId);
			});

			// Now use the deleted ID as a fake parentId
			const orphanId = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId: 'orphan-user',
					emoji: '👻',
					sentence: 'Orphaned sentence',
					mood: 'lonely',
					createdAt: Date.now(),
					parentId: tempId // Using deleted/non-existent ID
				});
			});

			expect(orphanId).toBeDefined();

			// Verify the orphaned record exists with the deleted parentId
			const orphanRecord = await t.run(async (ctx) => ctx.db.get(orphanId));
			expect(orphanRecord).toEqual({
				_id: orphanId,
				_creationTime: expect.any(Number),
				userId: 'orphan-user',
				emoji: '👻',
				sentence: 'Orphaned sentence',
				mood: 'lonely',
				createdAt: expect.any(Number),
				parentId: tempId // should store the deleted/non-existent ID
			});

			// Verify the parent no longer exists
			const nonExistentParent = await t.run(async (ctx) => ctx.db.get(tempId));
			expect(nonExistentParent).toBeNull();
		});
	});

	describe('by_parentId index functionality', () => {
		it('should return all entries sharing the same parentId via index', async () => {
			const t = convexTest(schema, modules);

			// Create a parent row
			const parentId = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId: 'parent-user',
					emoji: '👨',
					sentence: 'Parent sentence',
					mood: 'parent',
					createdAt: Date.now()
				});
			});

			// Create multiple child rows with the same parentId
			const child1Id = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId: 'child1-user',
					emoji: '👶',
					sentence: 'Child 1 sentence',
					mood: 'child',
					createdAt: Date.now(),
					parentId: parentId
				});
			});

			const child2Id = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId: 'child2-user',
					emoji: '🧒',
					sentence: 'Child 2 sentence',
					mood: 'child',
					createdAt: Date.now(),
					parentId: parentId
				});
			});

			// Create another row with different parentId to test isolation
			const otherParentId = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId: 'other-parent',
					emoji: '👩',
					sentence: 'Other parent',
					mood: 'other',
					createdAt: Date.now()
				});
			});

			const otherChildId = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId: 'other-child',
					emoji: '👧',
					sentence: 'Other child',
					mood: 'other',
					createdAt: Date.now(),
					parentId: otherParentId
				});
			});

			// Query using the by_parentId index
			const children = await t.run(async (ctx) => {
				return await ctx.db
					.query('testTable')
					.withIndex('by_parentId', (q) => q.eq('parentId', parentId))
					.collect();
			});

			// Should return exactly 2 children with matching parentId
			expect(children).toHaveLength(2);

			const childIds = children.map(c => c._id).sort();
			expect(childIds).toEqual([child1Id, child2Id].sort());

			// Verify all returned records have correct parentId
			children.forEach(child => {
				expect(child.parentId).toBe(parentId);
			});

			// Verify other parent's child is not included
			expect(children.some(c => c._id === otherChildId)).toBe(false);
		});
	});

	describe('existing indexes remain functional', () => {
		it('should verify all existing indexes (by_createdAt, by_pollId, by_userId_createdAt) still work', async () => {
			const t = convexTest(schema, modules);

			const now = Date.now();

			// Create test poll first for pollId references
			const pollId = await t.run(async (ctx) => {
				return await ctx.db.insert('testPollTable', {
					question: 'Test poll question?',
					options: ['Option 1', 'Option 2'],
					createdAt: now
				});
			});

			// Insert test records with all index-relevant fields
			const record1Id = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId: 'user-a',
					emoji: '😎',
					sentence: 'Record 1',
					mood: 'happy',
					createdAt: now - 100, // Earlier
					pollId: pollId
				});
			});

			const record2Id = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId: 'user-a',
					emoji: '🔥',
					sentence: 'Record 2',
					mood: 'excited',
					createdAt: now, // Later
					pollId: pollId
				});
			});

			const record3Id = await t.run(async (ctx) => {
				return await ctx.db.insert('testTable', {
					userId: 'user-b',
					emoji: '💩',
					sentence: 'Record 3',
					mood: 'annoyed',
					createdAt: now + 100 // Latest
				});
			});

			// Test by_createdAt index
			const byCreatedAt = await t.run(async (ctx) => {
				return await ctx.db
					.query('testTable')
					.withIndex('by_createdAt')
					.collect();
			});
			expect(byCreatedAt).toHaveLength(3);
			// Should be ordered by createdAt (index order)
			expect(byCreatedAt[0].createdAt).toBeLessThanOrEqual(byCreatedAt[1].createdAt);
			expect(byCreatedAt[1].createdAt).toBeLessThanOrEqual(byCreatedAt[2].createdAt);

			// Test by_pollId index
			const byPollId = await t.run(async (ctx) => {
				return await ctx.db
					.query('testTable')
					.withIndex('by_pollId', (q) => q.eq('pollId', pollId))
					.collect();
			});
			expect(byPollId).toHaveLength(2); // record1 and record2 have pollId
			expect(byPollId.every(r => r.pollId === pollId)).toBe(true);

			// Test by_userId_createdAt index
			const byUserIdCreatedAt = await t.run(async (ctx) => {
				return await ctx.db
					.query('testTable')
					.withIndex('by_userId_createdAt', (q) => q.eq('userId', 'user-a'))
					.collect();
			});
			expect(byUserIdCreatedAt).toHaveLength(2); // record1 and record2 for user-a
			expect(byUserIdCreatedAt.every(r => r.userId === 'user-a')).toBe(true);
			// Should be ordered by createdAt within same userId
			if (byUserIdCreatedAt.length > 1) {
				expect(byUserIdCreatedAt[0].createdAt).toBeLessThanOrEqual(byUserIdCreatedAt[1].createdAt);
			}
		});
	});
});