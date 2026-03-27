import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('testEmojiMutation', () => {
	describe('submitEmoji', () => {
		it('should accept 😎 emoji and store mood="chill" with userId', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const before = Date.now();
			const id = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				userId: 'test-user'
			});
			const after = Date.now();

			expect(id).toBeDefined();

			// Verify record was created correctly with mood and userId
			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record).toEqual({
				_id: id,
				_creationTime: expect.any(Number),
				emoji: '😎',
				sentence: 'The cat wore sunglasses to the job interview',
				mood: 'chill',
				userId: 'test-user',
				createdAt: expect.any(Number)
			});

			// Verify timestamp is reasonable
			expect(record?.createdAt).toBeGreaterThanOrEqual(before);
			expect(record?.createdAt).toBeLessThanOrEqual(after);
		});

		it('should accept 💩 emoji and store mood="angry"', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const id = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '💩',
				userId: 'test-user'
			});

			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record?.emoji).toBe('💩');
			expect(record?.sentence).toBe('Someone left a flaming bag on the porch again');
			expect(record?.mood).toBe('angry');
			expect(record?.userId).toBe('test-user');
		});

		it('should accept 🔥 emoji and store mood="happy"', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const id = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '🔥',
				userId: 'test-user'
			});

			const record = await t.run(async (ctx) => ctx.db.get(id));
			expect(record?.emoji).toBe('🔥');
			expect(record?.sentence).toBe('The server room is fine, everything is fine');
			expect(record?.mood).toBe('happy');
			expect(record?.userId).toBe('test-user');
		});

		it('should reject invalid emoji with error', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			await expect(
				asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '🚀',
					userId: 'test-user'
				})
			).rejects.toThrow('Invalid emoji: 🚀. Must be one of: 😎, 💩, 🔥');
		});

		it('should reject empty string emoji', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			await expect(
				asUser.mutation(api.testEmojiMutation.submitEmoji, {
					emoji: '',
					userId: 'test-user'
				})
			).rejects.toThrow('Invalid emoji: . Must be one of: 😎, 💩, 🔥');
		});

		it('should create multiple records for same emoji', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const id1 = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				userId: 'test-user'
			});
			const id2 = await asUser.mutation(api.testEmojiMutation.submitEmoji, {
				emoji: '😎',
				userId: 'test-user'
			});

			expect(id1).not.toBe(id2);

			const record1 = await t.run(async (ctx) => ctx.db.get(id1));
			const record2 = await t.run(async (ctx) => ctx.db.get(id2));

			expect(record1?.emoji).toBe('😎');
			expect(record2?.emoji).toBe('😎');
			expect(record1?.sentence).toBe(record2?.sentence);
			expect(record1?.mood).toBe('chill');
			expect(record2?.mood).toBe('chill');
			expect(record1?.userId).toBe('test-user');
			expect(record2?.userId).toBe('test-user');
		});
	});
});