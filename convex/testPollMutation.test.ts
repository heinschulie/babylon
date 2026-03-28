import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testPollMutation', () => {
	describe('createPoll', () => {
		it('should insert a valid poll and return its ID', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const before = Date.now();
			const id = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'What is your favorite color?',
				options: ['red', 'blue', 'green']
			});
			const after = Date.now();

			expect(id).toBeDefined();

			// Verify record was created correctly
			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record).toMatchObject({
				question: 'What is your favorite color?',
				options: ['red', 'blue', 'green'],
				createdAt: expect.any(Number)
			});

			// Verify timestamp is reasonable
			expect(record?.createdAt).toBeGreaterThanOrEqual(before);
			expect(record?.createdAt).toBeLessThanOrEqual(after);
		});

		it('should reject empty question string', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			await expect(
				asUser.mutation(api.testPollMutation.createPoll, {
					question: '',
					options: ['red', 'blue']
				})
			).rejects.toThrow();
		});

		it('should reject fewer than 2 options', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			await expect(
				asUser.mutation(api.testPollMutation.createPoll, {
					question: 'What color?',
					options: ['red']
				})
			).rejects.toThrow();
		});

		it('should reject options containing empty strings', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			await expect(
				asUser.mutation(api.testPollMutation.createPoll, {
					question: 'What color?',
					options: ['red', '']
				})
			).rejects.toThrow();
		});
	});

	describe('listPolls', () => {
		it('should return polls sorted by createdAt descending (newest first)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create first poll
			await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'First poll?',
				options: ['yes', 'no']
			});

			// Small delay to ensure different timestamps
			await new Promise(resolve => setTimeout(resolve, 10));

			// Create second poll
			await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Second poll?',
				options: ['maybe', 'definitely']
			});

			// Query polls
			const result = await asUser.query(api.testPollMutation.listPolls, {});

			expect(result).toHaveLength(2);
			// Verify descending order by createdAt (newest first)
			expect(result[0].createdAt).toBeGreaterThan(result[1].createdAt);
			expect(result[0].question).toBe('Second poll?');
			expect(result[1].question).toBe('First poll?');
		});

		it('should return empty array when no polls exist', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Query without creating any polls
			const result = await asUser.query(api.testPollMutation.listPolls, {});

			expect(result).toEqual([]);
			expect(result).toHaveLength(0);
		});

		it('should limit to 20 results when more than 20 exist', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create 25 polls
			for (let i = 0; i < 25; i++) {
				await asUser.mutation(api.testPollMutation.createPoll, {
					question: `Poll ${i}?`,
					options: ['yes', 'no']
				});
			}

			// Query should return only 20 results
			const result = await asUser.query(api.testPollMutation.listPolls, {});

			expect(result).toHaveLength(20);
			// Verify newest polls are returned (descending by createdAt)
			expect(result[0].question).toBe('Poll 24?');
			expect(result[19].question).toBe('Poll 5?');
		});
	});
});
