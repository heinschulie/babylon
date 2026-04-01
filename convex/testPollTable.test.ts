import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testPollTable', () => {
	describe('schema: testPollTable exists with correct fields', () => {
		it('should accept a document with question, options, and createdAt', async () => {
			const t = convexTest(schema, modules);

			const docId = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'What is your favorite color?',
					options: ['red', 'blue', 'green'],
					createdAt: Date.now()
				});
			});

			expect(docId).toBeDefined();

			// Verify the document was inserted with correct shape
			const doc = await t.run(async (ctx) => ctx.db.get(docId));
			expect(doc).toMatchObject({
				question: 'What is your favorite color?',
				options: ['red', 'blue', 'green'],
				createdAt: expect.any(Number)
			});
		});
	});

	describe('schema: testPollTable has by_createdAt index', () => {
		it('should support querying by createdAt index', async () => {
			const t = convexTest(schema, modules);

			const before = Date.now();
			const id1 = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'First question?',
					options: ['yes', 'no'],
					createdAt: before
				});
			});

			await new Promise(resolve => setTimeout(resolve, 10));
			const after = Date.now();

			const id2 = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Second question?',
					options: ['maybe', 'definitely'],
					createdAt: after
				});
			});

			// Query using the index
			const results = await t.run(async (ctx) => {
				return ctx.db
					.query('testPollTable')
					.withIndex('by_createdAt')
					.order('desc')
					.take(10);
			});

			expect(results).toHaveLength(2);
			// Verify descending order (newest first)
			expect(results[0]._id).toBe(id2);
			expect(results[1]._id).toBe(id1);
			expect(results[0].createdAt).toBeGreaterThan(results[1].createdAt);
		});
	});

	describe('schema: testTable has optional pollId field', () => {
		it('should accept a testTable document without pollId', async () => {
			const t = convexTest(schema, modules);

			const docId = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '😎',
					sentence: 'The cat wore sunglasses',
					mood: 'chill',
					userId: 'test-user',
					createdAt: Date.now()
				});
			});

			expect(docId).toBeDefined();

			const doc = await t.run(async (ctx) => ctx.db.get(docId));
			expect(doc).toMatchObject({
				emoji: '😎',
				sentence: 'The cat wore sunglasses',
				mood: 'chill',
				userId: 'test-user',
				createdAt: expect.any(Number)
			});
			// pollId should be undefined (optional)
			expect(doc?.pollId).toBeUndefined();
		});

		it('should accept a testTable document with a valid pollId reference', async () => {
			const t = convexTest(schema, modules);

			// Create a poll first
			const pollId = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Test poll',
					options: ['a', 'b'],
					createdAt: Date.now()
				});
			});

			// Create a testTable doc with the pollId
			const docId = await t.run(async (ctx) => {
				return ctx.db.insert('testTable', {
					emoji: '🔥',
					sentence: 'Everything is fine',
					mood: 'happy',
					userId: 'test-user',
					createdAt: Date.now(),
					pollId: pollId
				});
			});

			expect(docId).toBeDefined();

			const doc = await t.run(async (ctx) => ctx.db.get(docId));
			expect(doc?.pollId).toBe(pollId);
		});
	});

	describe('setExpiry mutation: patches expiresAt field on a poll', () => {
		it('should set expiresAt field on a poll and verify via doc read', async () => {
			const t = convexTest(schema, modules);

			// Create a poll first
			const pollId = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Test poll for expiry',
					options: ['option1', 'option2'],
					createdAt: Date.now()
				});
			});

			// Set expiry time to 5 minutes from now
			const expiresAt = Date.now() + 5 * 60 * 1000;
			await t.mutation(api.testPollMutation.setExpiry, { pollId, expiresAt });

			// Read back the poll and verify expiresAt field is set
			const updatedPoll = await t.run(async (ctx) => ctx.db.get(pollId));
			expect(updatedPoll?.expiresAt).toBe(expiresAt);
		});
	});

	describe('getActivePolls query: returns only non-expired polls', () => {
		it('should return polls where expiresAt is undefined or in the future', async () => {
			const t = convexTest(schema, modules);
			const now = Date.now();

			// Create polls with different expiry states
			const activePollId = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Active poll (no expiry)',
					options: ['option1', 'option2'],
					createdAt: now
				});
			});

			const futurePollId = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Future expiry poll',
					options: ['option1', 'option2'],
					createdAt: now,
					expiresAt: now + 10 * 60 * 1000 // 10 minutes in future
				});
			});

			const expiredPollId = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Expired poll',
					options: ['option1', 'option2'],
					createdAt: now,
					expiresAt: now - 5 * 60 * 1000 // 5 minutes ago
				});
			});

			// Query active polls
			const activePolls = await t.query(api.testPollMutation.getActivePolls, {});

			// Should contain non-expired polls only
			const activePollIds = activePolls.map(p => p._id);
			expect(activePollIds).toContain(activePollId);
			expect(activePollIds).toContain(futurePollId);
			expect(activePollIds).not.toContain(expiredPollId);
		});

		it('should order polls by expiresAt ascending (soonest expiring first)', async () => {
			const t = convexTest(schema, modules);
			const now = Date.now();

			// Create polls with different expiry times
			const poll1Id = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Poll expiring soon',
					options: ['option1', 'option2'],
					createdAt: now,
					expiresAt: now + 5 * 60 * 1000 // 5 minutes from now
				});
			});

			const poll2Id = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Poll expiring later',
					options: ['option1', 'option2'],
					createdAt: now,
					expiresAt: now + 10 * 60 * 1000 // 10 minutes from now
				});
			});

			const poll3Id = await t.run(async (ctx) => {
				return ctx.db.insert('testPollTable', {
					question: 'Poll with no expiry',
					options: ['option1', 'option2'],
					createdAt: now
				});
			});

			const activePolls = await t.query(api.testPollMutation.getActivePolls, {});

			// Should be ordered by expiresAt ascending (soonest first, no expiry last)
			expect(activePolls[0]._id).toBe(poll1Id); // expires in 5 min
			expect(activePolls[1]._id).toBe(poll2Id); // expires in 10 min
			expect(activePolls[2]._id).toBe(poll3Id); // no expiry (should be last)
		});
	});

	describe('backward compatibility: existing testEmojiMutation still works', () => {
		it('submitEmoji should create testTable docs without pollId as before', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const id = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record?.emoji).toBe('😎');
			expect(record?.mood).toBe('chill');
			expect(record?.userId).toBe('test-user');
			// Verify pollId is not present (or undefined)
			expect(record?.pollId).toBeUndefined();
		});

		it('listRecentEmojis should still work with new schema', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			await new Promise(resolve => setTimeout(resolve, 10));

			await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '💩',
				mood: 'angry',
				userId: 'test-user'
			});

			const result = await asUser.query(api.testEmojiMutation.listRecentEmojis, {});

			expect(result).toHaveLength(2);
			expect(result[0].emoji).toBe('💩');
			expect(result[1].emoji).toBe('😎');
		});
	});
});
