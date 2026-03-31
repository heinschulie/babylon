import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testReactions', () => {
	describe('addReaction', () => {
		it('should create a testTable entry with parentId set to the target entry _id', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// First, create a parent entry
			const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			// Now add a reaction to that entry
			const reactionId = await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '🔥',
				mood: 'happy',
				sentence: 'Test reaction sentence',
				userId: 'reaction-user'
			});

			expect(reactionId).toBeDefined();

			// Verify the reaction was created correctly with parentId set
			const reactionRecord = await t.run(async (ctx) => ctx.db.get(reactionId));
			expect(reactionRecord).toEqual({
				_id: reactionId,
				_creationTime: expect.any(Number),
				emoji: '🔥',
				sentence: 'Test reaction sentence',
				mood: 'happy',
				userId: 'reaction-user',
				createdAt: expect.any(Number),
				parentId: parentId
			});
		});

		it('should validate that parentId references an existing testTable entry', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create an entry to get a valid ID format, then delete it
			const tempEntryId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'temp-user'
			});

			// Delete the entry to make the ID non-existent
			await t.run(async (ctx) => {
				await ctx.db.delete(tempEntryId);
			});

			// Attempt to add a reaction to the now non-existent parent
			await expect(
				asUser.mutation(api.testReactions.addReaction, {
					parentId: tempEntryId,
					emoji: '🔥',
					mood: 'happy',
					sentence: 'Test reaction sentence',
					userId: 'reaction-user'
				})
			).rejects.toThrow('Parent entry not found');
		});
	});

	describe('getReactionCounts', () => {
		it('should return emoji counts grouped by emoji for a given parentId', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a parent entry
			const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			// Add multiple reactions with different emojis
			await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '🔥',
				mood: 'happy',
				sentence: 'Reaction 1',
				userId: 'user1'
			});

			await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '🔥',
				mood: 'happy',
				sentence: 'Reaction 2',
				userId: 'user2'
			});

			await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '💩',
				mood: 'angry',
				sentence: 'Reaction 3',
				userId: 'user3'
			});

			// Query reaction counts
			const counts = await asUser.query(api.testReactions.getReactionCounts, {
				parentId
			});

			// Verify grouped counts
			expect(counts).toHaveLength(2);
			expect(counts).toEqual(
				expect.arrayContaining([
					{ emoji: '🔥', count: 2 },
					{ emoji: '💩', count: 1 }
				])
			);
		});

		it('should return empty array when entry has no reactions', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a parent entry with no reactions
			const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			// Query reaction counts (should be empty)
			const counts = await asUser.query(api.testReactions.getReactionCounts, {
				parentId
			});

			// Verify empty array returned
			expect(counts).toEqual([]);
			expect(counts).toHaveLength(0);
		});
	});
});