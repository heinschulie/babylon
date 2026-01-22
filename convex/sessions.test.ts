import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

// Provide modules for convex-test to load
const modules = import.meta.glob('./**/*.ts');

describe('sessions', () => {
	describe('list', () => {
		it('should return empty array for user with no sessions', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessions = await asUser.query(api.sessions.list);
			expect(sessions).toEqual([]);
		});

		it('should create and list sessions', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const sessions = await asUser.query(api.sessions.list);
			expect(sessions).toHaveLength(1);
			expect(sessions[0]).toMatchObject({
				userId: 'user1',
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});
		});

		it('should not list other users sessions', async () => {
			const t = convexTest(schema, modules);
			const asUser1 = t.withIdentity({ subject: 'user1' });
			const asUser2 = t.withIdentity({ subject: 'user2' });

			await asUser1.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const user2Sessions = await asUser2.query(api.sessions.list);
			expect(user2Sessions).toEqual([]);
		});
	});

	describe('getByDate', () => {
		it('should return null for non-existent date', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const session = await asUser.query(api.sessions.getByDate, { date: '2026-01-22' });
			expect(session).toBeNull();
		});

		it('should return session for existing date', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const session = await asUser.query(api.sessions.getByDate, { date: '2026-01-22' });
			expect(session).toMatchObject({
				userId: 'user1',
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});
		});
	});

	describe('create', () => {
		it('should create a new session', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'French'
			});

			expect(sessionId).toBeDefined();

			const sessions = await asUser.query(api.sessions.list);
			expect(sessions).toHaveLength(1);
			expect(sessions[0].targetLanguage).toBe('French');
		});

		it('duplicate date returns existing session', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const firstId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const secondId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'French'
			});

			expect(secondId).toEqual(firstId);

			const sessions = await asUser.query(api.sessions.list);
			expect(sessions).toHaveLength(1);
			expect(sessions[0].targetLanguage).toBe('Spanish');
		});

		it('should allow different users to have sessions on same date', async () => {
			const t = convexTest(schema, modules);
			const asUser1 = t.withIdentity({ subject: 'user1' });
			const asUser2 = t.withIdentity({ subject: 'user2' });

			await asUser1.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			await asUser2.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'French'
			});

			const user1Sessions = await asUser1.query(api.sessions.list);
			const user2Sessions = await asUser2.query(api.sessions.list);

			expect(user1Sessions).toHaveLength(1);
			expect(user2Sessions).toHaveLength(1);
			expect(user1Sessions[0].targetLanguage).toBe('Spanish');
			expect(user2Sessions[0].targetLanguage).toBe('French');
		});
	});

	describe('remove', () => {
		it('should remove session and cascade delete phrases', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			// Add phrases to session
			await asUser.mutation(api.phrases.create, {
				sessionId,
				english: 'Hello',
				translation: 'Hola'
			});
			await asUser.mutation(api.phrases.create, {
				sessionId,
				english: 'Goodbye',
				translation: 'Adiós'
			});

			// Verify phrases exist
			const phrases = await asUser.query(api.phrases.listBySession, { sessionId });
			expect(phrases).toHaveLength(2);

			// Remove session
			await asUser.mutation(api.sessions.remove, { id: sessionId });

			// Verify session gone
			const sessions = await asUser.query(api.sessions.list);
			expect(sessions).toHaveLength(0);

			// Verify phrases cascade deleted (check via run since session is gone)
			const phraseCount = await t.run(async (ctx) => {
				return await ctx.db.query('phrases').collect();
			});
			expect(phraseCount).toHaveLength(0);
		});

		it('should throw error for non-existent session', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create and get a valid session ID, then delete it
			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});
			await asUser.mutation(api.sessions.remove, { id: sessionId });

			// Try to delete again
			await expect(asUser.mutation(api.sessions.remove, { id: sessionId })).rejects.toThrowError(
				'Session not found'
			);
		});

		it('should not allow removing other users sessions', async () => {
			const t = convexTest(schema, modules);
			const asUser1 = t.withIdentity({ subject: 'user1' });
			const asUser2 = t.withIdentity({ subject: 'user2' });

			const sessionId = await asUser1.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			await expect(asUser2.mutation(api.sessions.remove, { id: sessionId })).rejects.toThrowError(
				'Not authorized'
			);
		});
	});

	describe('authentication', () => {
		it('should require authentication for list', async () => {
			const t = convexTest(schema, modules);
			await expect(t.query(api.sessions.list)).rejects.toThrowError('Not authenticated');
		});

		it('should require authentication for create', async () => {
			const t = convexTest(schema, modules);
			await expect(
				t.mutation(api.sessions.create, { date: '2026-01-22', targetLanguage: 'Spanish' })
			).rejects.toThrowError('Not authenticated');
		});
	});
});
