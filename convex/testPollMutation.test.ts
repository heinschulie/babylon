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

	describe('castVote', () => {
		it('should insert a testTable row with correct fields including pollId', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// First create a poll
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'What is your mood?',
				options: ['😎', '💩', '🔥']
			});

			const before = Date.now();
			const voteId = await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: '💩',
				userId: 'test-user'
			});
			const after = Date.now();

			expect(voteId).toBeDefined();

			// Verify the testTable record was created correctly
			const record = await t.run(async (ctx) => ctx.db.get(voteId));
			expect(record).toMatchObject({
				emoji: '💩',
				sentence: 'What is your mood?',
				mood: 'angry', // index 1 -> angry
				userId: 'test-user',
				pollId,
				createdAt: expect.any(Number)
			});

			// Verify timestamp is reasonable
			expect(record?.createdAt).toBeGreaterThanOrEqual(before);
			expect(record?.createdAt).toBeLessThanOrEqual(after);
		});

		it('should reject an invalid pollId (non-existent poll)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a poll to get a valid ID
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Temp poll',
				options: ['option1', 'option2']
			});

			// Remove the poll to make the ID invalid (but still properly formatted)
			await t.run(async (ctx) => ctx.db.delete(pollId));

			await expect(
				asUser.mutation(api.testPollMutation.castVote, {
					pollId,
					option: 'option1',
					userId: 'test-user'
				})
			).rejects.toThrow('Poll not found');
		});

		it('should reject an option not in the poll\'s options array', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a poll with specific options
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'What is your mood?',
				options: ['😎', '💩', '🔥']
			});

			await expect(
				asUser.mutation(api.testPollMutation.castVote, {
					pollId,
					option: '🚀', // Not in the options array
					userId: 'test-user'
				})
			).rejects.toThrow('Invalid option: 🚀. Must be one of: 😎, 💩, 🔥');
		});

		it('should derive mood correctly from option index (0=chill, 1=angry, 2+=happy)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a poll with multiple options
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'How do you feel?',
				options: ['first', 'second', 'third', 'fourth']
			});

			// Test index 0 -> chill
			const vote1 = await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: 'first',
				userId: 'test-user-1'
			});
			const record1 = await t.run(async (ctx) => ctx.db.get(vote1));
			expect(record1?.mood).toBe('chill');

			// Test index 1 -> angry
			const vote2 = await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: 'second',
				userId: 'test-user-2'
			});
			const record2 = await t.run(async (ctx) => ctx.db.get(vote2));
			expect(record2?.mood).toBe('angry');

			// Test index 2 -> happy
			const vote3 = await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: 'third',
				userId: 'test-user-3'
			});
			const record3 = await t.run(async (ctx) => ctx.db.get(vote3));
			expect(record3?.mood).toBe('happy');

			// Test index 3 (2+) -> happy
			const vote4 = await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: 'fourth',
				userId: 'test-user-4'
			});
			const record4 = await t.run(async (ctx) => ctx.db.get(vote4));
			expect(record4?.mood).toBe('happy');
		});
	});

	describe('getPollResults', () => {
		it('should return grouped counts sorted descending', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a poll
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Favorite emoji?',
				options: ['😎', '💩', '🔥']
			});

			// Cast votes with different frequencies
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: '🔥',
				userId: 'user1'
			});
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: '🔥',
				userId: 'user2'
			});
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: '🔥',
				userId: 'user3'
			});
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: '😎',
				userId: 'user4'
			});
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: '😎',
				userId: 'user5'
			});
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: '💩',
				userId: 'user6'
			});

			// Get results
			const results = await asUser.query(api.testPollMutation.getPollResults, {
				pollId
			});

			// Should be sorted by count descending: 🔥(3), 😎(2), 💩(1)
			expect(results).toEqual([
				{ option: '🔥', count: 3 },
				{ option: '😎', count: 2 },
				{ option: '💩', count: 1 }
			]);
		});

		it('should return empty array for poll with no votes', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a poll but don't cast any votes
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Empty poll?',
				options: ['yes', 'no']
			});

			// Get results should return empty array
			const results = await asUser.query(api.testPollMutation.getPollResults, {
				pollId
			});

			expect(results).toEqual([]);
			expect(results).toHaveLength(0);
		});

		it('should correctly count multiple votes for the same option', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a poll
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Same option test?',
				options: ['option1', 'option2']
			});

			// Cast multiple votes for the same option
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: 'option1',
				userId: 'user1'
			});
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: 'option1',
				userId: 'user2'
			});
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: 'option1',
				userId: 'user3'
			});
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: 'option1',
				userId: 'user4'
			});
			await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: 'option2',
				userId: 'user5'
			});

			// Get results
			const results = await asUser.query(api.testPollMutation.getPollResults, {
				pollId
			});

			expect(results).toEqual([
				{ option: 'option1', count: 4 },
				{ option: 'option2', count: 1 }
			]);
		});

		it('should make votes appear in listRecentEmojis since they are testTable rows', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a poll
			const pollId = await asUser.mutation(api.testPollMutation.createPoll, {
				question: 'Integration test?',
				options: ['🎉', '🚀']
			});

			// Cast a vote
			const voteId = await asUser.mutation(api.testPollMutation.castVote, {
				pollId,
				option: '🎉',
				userId: 'integration-user'
			});

			// Check if the vote appears in listRecentEmojis
			const recentEmojis = await asUser.query(api.testEmojiMutation.listRecentEmojis, {});

			// Find our vote in the results
			const ourVote = recentEmojis.find(entry => entry._id === voteId);
			expect(ourVote).toBeDefined();
			expect(ourVote).toMatchObject({
				emoji: '🎉',
				sentence: 'Integration test?',
				mood: 'chill', // index 0 -> chill
				userId: 'integration-user',
				pollId,
				createdAt: expect.any(Number)
			});
		});
	});
});
