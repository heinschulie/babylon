import { convexTest } from 'convex-test';
import { describe, test, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testReactions', () => {
	test('addReaction creates testTable entry with correct fields', async () => {
		const t = convexTest(schema, modules);

		// Create a parent emoji entry first
		const parentId = await t.mutation(api.testEmojiMutation.submitEmoji, {
			emoji: '😎',
			mood: 'chill',
			userId: 'test-user-1',
		});

		// Add a reaction to the parent entry
		const reactionId = await t.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🔥',
			userId: 'test-user-2',
		});

		// Verify the reaction was created with correct fields
		// Use t.run to directly inspect the database instead of using a non-existent query
		const reaction = await t.run(async (ctx) => {
			return await ctx.db.get(reactionId);
		});

		expect(reaction).toMatchObject({
			parentId,
			emoji: '🔥',
			mood: 'happy', // from EMOJI_CONFIG
			userId: 'test-user-2',
		});
		expect(reaction?.createdAt).toBeTypeOf('number');
	});

	test('addReaction throws if parentId does not exist', async () => {
		const t = convexTest(schema, modules);

		// Generate a non-existent ID
		const nonExistentParentId = await t.run(async (ctx) => {
			return ctx.db.insert('testTable', {
				emoji: '😎',
				mood: 'chill',
				userId: 'test-user',
				sentence: 'temp',
				createdAt: Date.now(),
			});
		});

		// Delete the entry to make the ID invalid
		await t.run(async (ctx) => {
			await ctx.db.delete(nonExistentParentId);
		});

		// Attempt to add reaction to non-existent parent should throw
		await expect(async () => {
			await t.mutation(api.testReactions.addReaction, {
				parentId: nonExistentParentId,
				emoji: '🔥',
				userId: 'test-user-2',
			});
		}).rejects.toThrowError('Parent entry does not exist');
	});

	test('addReaction only accepts valid emojis from EMOJI_CONFIG', async () => {
		const t = convexTest(schema, modules);

		// Create a parent emoji entry first
		const parentId = await t.mutation(api.testEmojiMutation.submitEmoji, {
			emoji: '😎',
			mood: 'chill',
			userId: 'test-user-1',
		});

		// Attempt to add reaction with invalid emoji should throw
		await expect(async () => {
			await t.mutation(api.testReactions.addReaction, {
				parentId,
				emoji: '🚀', // not in EMOJI_CONFIG
				userId: 'test-user-2',
			});
		}).rejects.toThrowError('Invalid emoji: 🚀');
	});

	test('getReactionCounts returns correct grouped counts', async () => {
		const t = convexTest(schema, modules);

		// Create a parent emoji entry
		const parentId = await t.mutation(api.testEmojiMutation.submitEmoji, {
			emoji: '😎',
			mood: 'chill',
			userId: 'test-user-1',
		});

		// Add multiple reactions
		await t.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🔥',
			userId: 'user-1',
		});
		await t.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🔥',
			userId: 'user-2',
		});
		await t.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '💩',
			userId: 'user-3',
		});

		// Get reaction counts
		const counts = await t.query(api.testReactions.getReactionCounts, { parentId });

		// Should be sorted descending by count
		expect(counts).toEqual([
			{ emoji: '🔥', count: 2 },
			{ emoji: '💩', count: 1 },
		]);
	});

	test('getReactionCounts returns empty array when no reactions exist', async () => {
		const t = convexTest(schema, modules);

		// Create a parent emoji entry
		const parentId = await t.mutation(api.testEmojiMutation.submitEmoji, {
			emoji: '😎',
			mood: 'chill',
			userId: 'test-user-1',
		});

		// Get reaction counts without adding any reactions
		const counts = await t.query(api.testReactions.getReactionCounts, { parentId });

		expect(counts).toEqual([]);
	});

	test('multiple reactions from same user are allowed', async () => {
		const t = convexTest(schema, modules);

		// Create a parent emoji entry
		const parentId = await t.mutation(api.testEmojiMutation.submitEmoji, {
			emoji: '😎',
			mood: 'chill',
			userId: 'test-user-1',
		});

		// Same user adds multiple reactions to same parent
		await t.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🔥',
			userId: 'same-user',
		});
		await t.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🔥',
			userId: 'same-user',
		});

		// Should count both reactions
		const counts = await t.query(api.testReactions.getReactionCounts, { parentId });
		expect(counts).toEqual([
			{ emoji: '🔥', count: 2 },
		]);
	});

	test('reactions do not appear in listRecentEmojis', async () => {
		const t = convexTest(schema, modules);

		// Create a parent emoji entry
		const parentId = await t.mutation(api.testEmojiMutation.submitEmoji, {
			emoji: '😎',
			mood: 'chill',
			userId: 'test-user-1',
		});

		// Get initial count of recent emojis
		const initialEmojis = await t.query(api.testEmojiMutation.listRecentEmojis);
		const initialCount = initialEmojis.length;

		// Add a reaction
		await t.mutation(api.testReactions.addReaction, {
			parentId,
			emoji: '🔥',
			userId: 'test-user-2',
		});

		// Get emojis again - should not include the reaction
		const finalEmojis = await t.query(api.testEmojiMutation.listRecentEmojis);
		expect(finalEmojis).toHaveLength(initialCount);

		// Verify none of the entries are reactions (all should have parentId = null/undefined)
		for (const emoji of finalEmojis) {
			expect(emoji.parentId).toBeUndefined();
		}
	});
});