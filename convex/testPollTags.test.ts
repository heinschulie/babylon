import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testPollTags', () => {
	describe('tagPoll', () => {
		it('should set tags on a poll and query back correctly', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a poll first
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Test poll for tagging?',
				options: ['yes', 'no']
			});

			// Tag the poll
			const result = await asUser.mutation(api.testPollTags.tagPoll, {
				pollId,
				tags: ['urgent', 'feedback', 'team']
			});

			// tagPoll should return null
			expect(result).toBeNull();

			// Verify tags were set correctly by reading the poll directly
			const poll = await t.run(async (ctx) => ctx.db.get(pollId));
			expect(poll?.tags).toEqual(['urgent', 'feedback', 'team']);
		});

		it('should throw if poll does not exist', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create and delete a poll to get an invalid ID
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Temp poll',
				options: ['yes', 'no']
			});
			await t.run(async (ctx) => ctx.db.delete(pollId));

			// Try to tag a non-existent poll - should throw
			await expect(
				asUser.mutation(api.testPollTags.tagPoll, {
					pollId,
					tags: ['urgent', 'feedback']
				})
			).rejects.toThrow('Poll not found');
		});

		it('should reject empty tags after trimming', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a poll first
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Test poll',
				options: ['yes', 'no']
			});

			// Try to tag with empty string after trimming
			await expect(
				asUser.mutation(api.testPollTags.tagPoll, {
					pollId,
					tags: ['valid', '   ', 'another']
				})
			).rejects.toThrow('Tags must not be empty');
		});

		it('should reject more than 5 tags', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a poll first
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Test poll',
				options: ['yes', 'no']
			});

			// Try to tag with more than 5 tags
			await expect(
				asUser.mutation(api.testPollTags.tagPoll, {
					pollId,
					tags: ['tag1', 'tag2', 'tag3', 'tag4', 'tag5', 'tag6']
				})
			).rejects.toThrow('Maximum 5 tags allowed');
		});

		it('should trim whitespace from tags when setting them', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a poll first
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Test poll',
				options: ['yes', 'no']
			});

			// Tag with whitespace - should trim automatically
			const result = await asUser.mutation(api.testPollTags.tagPoll, {
				pollId,
				tags: ['  foo  ', ' bar', 'baz ']
			});

			expect(result).toBeNull();

			// Verify tags were trimmed when stored
			const poll = await t.run(async (ctx) => ctx.db.get(pollId));
			expect(poll?.tags).toEqual(['foo', 'bar', 'baz']);
		});
	});

	describe('listPollsByTag', () => {
		it('should return only polls matching the specified tag', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create polls with different tags
			const poll1 = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Poll with urgent tag?',
				options: ['yes', 'no'],
				tags: ['urgent', 'feedback']
			});

			const poll2 = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Poll with feedback tag?',
				options: ['maybe', 'no'],
				tags: ['feedback', 'team']
			});

			const poll3 = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Poll without matching tag?',
				options: ['yes', 'maybe'],
				tags: ['team', 'low-priority']
			});

			// Query polls by 'feedback' tag - should return poll1 and poll2
			const results = await asUser.query(api.testPollTags.listPollsByTag, {
				tag: 'feedback'
			});

			expect(results).toHaveLength(2);
			const pollIds = results.map(p => p._id);
			expect(pollIds).toContain(poll1);
			expect(pollIds).toContain(poll2);
			expect(pollIds).not.toContain(poll3);

			// Verify returned polls have the correct structure
			expect(results[0]).toMatchObject({
				_id: expect.any(String),
				question: expect.any(String),
				options: expect.any(Array),
				tags: expect.any(Array),
				createdAt: expect.any(Number)
			});
		});

		it('should return empty array when no polls have the specified tag', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create polls with specific tags (none have 'nonexistent' tag)
			await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Poll one?',
				options: ['yes', 'no'],
				tags: ['urgent', 'feedback']
			});

			await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Poll two?',
				options: ['maybe', 'no'],
				tags: ['team', 'low-priority']
			});

			// Query for a tag that doesn't exist
			const results = await asUser.query(api.testPollTags.listPollsByTag, {
				tag: 'nonexistent'
			});

			expect(results).toEqual([]);
			expect(results).toHaveLength(0);
		});

		it('should return polls in createdAt descending order (newest first)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create polls with same tag but different timestamps
			const firstPoll = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'First poll?',
				options: ['yes', 'no'],
				tags: ['test-ordering']
			});

			// Small delay to ensure different timestamps
			await new Promise(resolve => setTimeout(resolve, 10));

			const secondPoll = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Second poll?',
				options: ['maybe', 'no'],
				tags: ['test-ordering']
			});

			await new Promise(resolve => setTimeout(resolve, 10));

			const thirdPoll = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Third poll?',
				options: ['definitely', 'no'],
				tags: ['test-ordering']
			});

			// Query polls by tag
			const results = await asUser.query(api.testPollTags.listPollsByTag, {
				tag: 'test-ordering'
			});

			expect(results).toHaveLength(3);

			// Verify descending order by createdAt (newest first)
			expect(results[0]._id).toBe(thirdPoll);  // newest
			expect(results[1]._id).toBe(secondPoll); // middle
			expect(results[2]._id).toBe(firstPoll);  // oldest

			// Verify timestamps are in descending order
			expect(results[0].createdAt).toBeGreaterThan(results[1].createdAt);
			expect(results[1].createdAt).toBeGreaterThan(results[2].createdAt);
		});
	});

	describe('getPollTagCloud', () => {
		it('should count tags across multiple polls correctly', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create polls with overlapping tags
			await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Poll one?',
				options: ['yes', 'no'],
				tags: ['urgent', 'feedback', 'team']
			});

			await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Poll two?',
				options: ['maybe', 'no'],
				tags: ['feedback', 'team', 'low-priority']
			});

			await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Poll three?',
				options: ['definitely', 'no'],
				tags: ['urgent', 'team']
			});

			// Get tag cloud
			const results = await asUser.query(api.testPollTags.getPollTagCloud, {});

			// Should count: team(3), urgent(2), feedback(2), low-priority(1)
			expect(results).toEqual([
				{ tag: 'team', count: 3 },
				{ tag: 'urgent', count: 2 },
				{ tag: 'feedback', count: 2 },
				{ tag: 'low-priority', count: 1 }
			]);
		});

		it('should return empty array when no polls have tags', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create polls without tags
			await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Poll without tags?',
				options: ['yes', 'no']
				// No tags provided
			});

			await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Another poll without tags?',
				options: ['maybe', 'no']
				// No tags provided
			});

			// Get tag cloud - should be empty
			const results = await asUser.query(api.testPollTags.getPollTagCloud, {});

			expect(results).toEqual([]);
			expect(results).toHaveLength(0);
		});

		it('should sort results by count descending', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create polls with different tag frequencies
			// 'common': 3 times, 'medium': 2 times, 'rare': 1 time
			await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Poll 1?',
				options: ['yes', 'no'],
				tags: ['common', 'medium', 'rare']
			});

			await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Poll 2?',
				options: ['yes', 'no'],
				tags: ['common', 'medium']
			});

			await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Poll 3?',
				options: ['yes', 'no'],
				tags: ['common']
			});

			// Get tag cloud
			const results = await asUser.query(api.testPollTags.getPollTagCloud, {});

			expect(results).toHaveLength(3);

			// Should be sorted by count descending
			expect(results[0]).toEqual({ tag: 'common', count: 3 });
			expect(results[1]).toEqual({ tag: 'medium', count: 2 });
			expect(results[2]).toEqual({ tag: 'rare', count: 1 });

			// Verify counts are in descending order
			expect(results[0].count).toBeGreaterThan(results[1].count);
			expect(results[1].count).toBeGreaterThan(results[2].count);
		});
	});
});