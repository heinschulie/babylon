import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testReactions', () => {
	describe('addReaction', () => {
		it('should create testTable entry with correct parentId, emoji, mood, and userId', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// First create a parent emoji entry
			const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			const before = Date.now();
			const reactionId = await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '💩',
				userId: 'reaction-user'
			});
			const after = Date.now();

			expect(reactionId).toBeDefined();

			// Verify reaction record was created correctly
			const reaction = await t.run(async (ctx) => ctx.db.get(reactionId));
			expect(reaction).toEqual({
				_id: reactionId,
				_creationTime: expect.any(Number),
				emoji: '💩',
				sentence: 'Someone left a flaming bag on the porch again',
				mood: 'angry',
				userId: 'reaction-user',
				createdAt: expect.any(Number),
				parentId: parentId,  // Key field: this is a reaction
			});

			// Verify timestamp is reasonable
			expect(reaction?.createdAt).toBeGreaterThanOrEqual(before);
			expect(reaction?.createdAt).toBeLessThanOrEqual(after);
		});

		it('should throw if parentId references a non-existent entry', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a temporary entry to get a valid ID format, then delete it
			const tempId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'temp-user'
			});

			// Delete the temporary entry, leaving us with a valid but non-existent ID
			await t.run(async (ctx) => {
				await ctx.db.delete(tempId);
			});

			// Try to create a reaction with the non-existent parentId
			await expect(
				asUser.mutation(api.testReactions.addReaction, {
					parentId: tempId,  // Valid format but doesn't exist
					emoji: '💩',
					userId: 'reaction-user'
				})
			).rejects.toThrow('Parent emoji entry not found');
		});

		it('should only accept valid emojis from EMOJI_CONFIG', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a parent emoji entry
			const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			// Try to create a reaction with an invalid emoji
			await expect(
				asUser.mutation(api.testReactions.addReaction, {
					parentId,
					emoji: '🚀',  // Invalid emoji not in EMOJI_CONFIG
					userId: 'reaction-user'
				})
			).rejects.toThrow('Invalid emoji: 🚀. Must be one of: 😎, 💩, 🔥');

			// Try with empty string
			await expect(
				asUser.mutation(api.testReactions.addReaction, {
					parentId,
					emoji: '',  // Empty string
					userId: 'reaction-user'
				})
			).rejects.toThrow('Invalid emoji: . Must be one of: 😎, 💩, 🔥');

			// Valid emojis should work
			const validReactionId = await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '🔥',  // Valid emoji from EMOJI_CONFIG
				userId: 'reaction-user'
			});

			expect(validReactionId).toBeDefined();
		});
	});

	describe('getReactionCounts', () => {
		it('should return correct grouped counts for a parentId', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a parent emoji entry
			const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			// Add multiple reactions: 😎 x2, 💩 x1, 🔥 x3
			await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '😎',
				userId: 'user1'
			});
			await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '😎',
				userId: 'user2'
			});
			await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '💩',
				userId: 'user3'
			});
			await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '🔥',
				userId: 'user4'
			});
			await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '🔥',
				userId: 'user5'
			});
			await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '🔥',
				userId: 'user6'
			});

			// Query reaction counts
			const result = await asUser.query(api.testReactions.getReactionCounts, {
				parentId
			});

			// Should return counts sorted descending by count, alphabetical tiebreak
			expect(result).toEqual([
				{ emoji: '🔥', count: 3 },  // Most common
				{ emoji: '😎', count: 2 },  // Second most
				{ emoji: '💩', count: 1 }   // Least common
			]);
		});

		it('should return empty array when no reactions exist', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a parent emoji entry (but add no reactions)
			const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			// Query reaction counts
			const result = await asUser.query(api.testReactions.getReactionCounts, {
				parentId
			});

			// Should return empty array
			expect(result).toEqual([]);
			expect(result).toHaveLength(0);
		});
	});

	describe('multiple reactions behavior', () => {
		it('should allow multiple reactions from same user on same parent (no uniqueness constraint)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a parent emoji entry
			const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			// Same user adds multiple reactions with same emoji
			const reaction1Id = await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '💩',
				userId: 'same-user'
			});

			const reaction2Id = await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '💩',
				userId: 'same-user'  // Same user, same emoji
			});

			const reaction3Id = await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '🔥',
				userId: 'same-user'  // Same user, different emoji
			});

			// All reactions should be created successfully
			expect(reaction1Id).toBeDefined();
			expect(reaction2Id).toBeDefined();
			expect(reaction3Id).toBeDefined();

			// All IDs should be different (no deduplication)
			expect(reaction1Id).not.toBe(reaction2Id);
			expect(reaction2Id).not.toBe(reaction3Id);
			expect(reaction1Id).not.toBe(reaction3Id);

			// Verify reaction counts reflect all reactions
			const counts = await asUser.query(api.testReactions.getReactionCounts, {
				parentId
			});

			expect(counts).toEqual([
				{ emoji: '💩', count: 2 },  // Two reactions from same user
				{ emoji: '🔥', count: 1 }
			]);
		});
	});

	describe('listRecentEmojis filtering', () => {
		it('should not include reactions in listRecentEmojis (they have parentId set)', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create a top-level emoji entry
			const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user'
			});

			// Add several reactions to this entry
			await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '💩',
				userId: 'reaction-user-1'
			});

			await asUser.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '🔥',
				userId: 'reaction-user-2'
			});

			// Query listRecentEmojis
			const recentEmojis = await asUser.query(api.testEmojiMutation.listRecentEmojis, {});

			// Should only contain the parent entry, not the reactions
			expect(recentEmojis).toHaveLength(1);
			expect(recentEmojis[0]._id).toBe(parentId);
			expect(recentEmojis[0].emoji).toBe('😎');
			expect(recentEmojis[0].parentId).toBeUndefined();

			// None of the reactions should be in the list
			const reactionEmojis = recentEmojis.filter(e => e.parentId !== undefined);
			expect(reactionEmojis).toHaveLength(0);
		});
	});
});