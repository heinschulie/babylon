import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('testReactions', () => {
	it('should create testTable entry with correct parentId, emoji, mood, and userId', async () => {
		const t = convexTest(schema, modules);
		const asUser = t.withIdentity({ subject: 'user1' });

		// Create a parent emoji entry first
		const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
			emoji: '😎',
			mood: 'chill',
			userId: 'test-user'
		});

		// Test the addReaction mutation
		const reactionId = await asUser.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🔥',
			userId: 'test-user'
		});

		// Verify the reaction was created correctly
		const reaction = await t.run(async (ctx) => ctx.db.get(reactionId)) as any;
		expect(reaction).toBeDefined();
		expect(reaction.parentId).toBe(parentId);
		expect(reaction.emoji).toBe('🔥');
		expect(reaction.mood).toBe('happy'); // 🔥 maps to 'happy' mood
		expect(reaction.userId).toBe('test-user');
		expect(reaction.createdAt).toBeTypeOf('number');
	});

	it('should throw error when parentId references non-existent entry', async () => {
		const t = convexTest(schema, modules);
		const asUser = t.withIdentity({ subject: 'user1' });

		// Create a properly formatted but non-existent ID
		const fakeParentId = await t.run(async (ctx) => {
			// Create and immediately delete an entry to get a valid ID that doesn't exist
			const tempId = await ctx.db.insert('testTable', {
				emoji: '😎',
				sentence: 'temp',
				mood: 'chill',
				userId: 'temp-user',
				createdAt: Date.now()
			});
			await ctx.db.delete(tempId);
			return tempId;
		});

		// Test that addReaction throws
		await expect(asUser.mutation(api.testReactions.addReaction, {
			parentId: fakeParentId,
			emoji: '🔥',
			userId: 'test-user'
		})).rejects.toThrow('Parent entry not found');
	});

	it('should only accept valid emojis from EMOJI_CONFIG', async () => {
		const t = convexTest(schema, modules);
		const asUser = t.withIdentity({ subject: 'user1' });

		// Create a parent emoji entry first
		const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
			emoji: '😎',
			mood: 'chill',
			userId: 'test-user'
		});

		// Test that invalid emoji throws error
		await expect(asUser.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🚀', // Invalid emoji not in EMOJI_CONFIG
			userId: 'test-user'
		})).rejects.toThrow('Invalid emoji: 🚀');
	});

	it('should return correct grouped counts for a parentId', async () => {
		const t = convexTest(schema, modules);
		const asUser = t.withIdentity({ subject: 'user1' });

		// Create a parent emoji entry first
		const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
			emoji: '😎',
			mood: 'chill',
			userId: 'test-user'
		});

		// Add some reactions
		await asUser.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🔥',
			userId: 'user1'
		});
		await asUser.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🔥',
			userId: 'user2'
		});
		await asUser.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '💩',
			userId: 'user3'
		});

		// Query reaction counts
		const counts = await asUser.query(api.testReactions.getReactionCounts, {
			parentId
		});

		// Verify counts are correct and sorted descending
		expect(counts).toHaveLength(2);
		expect(counts[0]).toEqual({ emoji: '🔥', count: 2 });
		expect(counts[1]).toEqual({ emoji: '💩', count: 1 });
	});

	it('should return empty array when no reactions exist', async () => {
		const t = convexTest(schema, modules);
		const asUser = t.withIdentity({ subject: 'user1' });

		// Create a parent emoji entry with no reactions
		const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
			emoji: '😎',
			mood: 'chill',
			userId: 'test-user'
		});

		// Query reaction counts (should be empty)
		const counts = await asUser.query(api.testReactions.getReactionCounts, {
			parentId
		});

		expect(counts).toEqual([]);
		expect(counts).toHaveLength(0);
	});

	it('should allow multiple reactions from same user on same parent', async () => {
		const t = convexTest(schema, modules);
		const asUser = t.withIdentity({ subject: 'user1' });

		// Create a parent emoji entry
		const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
			emoji: '😎',
			mood: 'chill',
			userId: 'test-user'
		});

		// Add multiple reactions from same user
		const reaction1Id = await asUser.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🔥',
			userId: 'same-user'
		});
		const reaction2Id = await asUser.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🔥',
			userId: 'same-user'
		});

		// Verify both reactions were created (different IDs)
		expect(reaction1Id).not.toBe(reaction2Id);

		// Verify count reflects both reactions
		const counts = await asUser.query(api.testReactions.getReactionCounts, {
			parentId
		});

		expect(counts).toHaveLength(1);
		expect(counts[0]).toEqual({ emoji: '🔥', count: 2 });
	});

	it('should not show reactions in listRecentEmojis (they have parentId set)', async () => {
		const t = convexTest(schema, modules);
		const asUser = t.withIdentity({ subject: 'user1' });

		// Create a parent emoji entry
		const parentId = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
			emoji: '😎',
			mood: 'chill',
			userId: 'test-user'
		});

		// Add a reaction
		await asUser.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🔥',
			userId: 'reactor-user'
		});

		// Query recent emojis (should only show the parent, not the reaction)
		const recentEmojis = await asUser.query(api.testEmojiMutation.listRecentEmojis, {});

		// Should only contain the parent emoji, not the reaction
		expect(recentEmojis).toHaveLength(1);
		expect(recentEmojis[0].emoji).toBe('😎');
		expect(recentEmojis[0].parentId).toBeUndefined(); // Parent entries don't have parentId
	});
});