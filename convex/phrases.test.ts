import { convexTest } from 'convex-test';
import { describe, it, expect } from 'vitest';
import schema from './schema';
import { api } from './_generated/api';

const modules = import.meta.glob('./**/*.ts');

describe('phrases', () => {
	describe('listBySession', () => {
		it('should return empty array for session with no phrases', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const result = await asUser.query(api.phrases.listBySession, { sessionId });
			expect(result.phrases).toEqual([]);
			expect(result.session).toBeDefined();
		});

		it('should create and list phrases', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			await asUser.mutation(api.phrases.create, {
				sessionId,
				english: 'Hello',
				translation: 'Hola'
			});

			const result = await asUser.query(api.phrases.listBySession, { sessionId });
			expect(result.phrases).toHaveLength(1);
			expect(result.phrases[0]).toMatchObject({
				userId: 'user1',
				english: 'Hello',
				translation: 'Hola'
			});
		});

		it('should not list phrases from other users sessions', async () => {
			const t = convexTest(schema, modules);
			const asUser1 = t.withIdentity({ subject: 'user1' });
			const asUser2 = t.withIdentity({ subject: 'user2' });

			const sessionId = await asUser1.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			await asUser1.mutation(api.phrases.create, {
				sessionId,
				english: 'Hello',
				translation: 'Hola'
			});

			await expect(asUser2.query(api.phrases.listBySession, { sessionId })).rejects.toThrowError(
				'Session not found or not authorized'
			);
		});
	});

	describe('create', () => {
		it('should create a phrase in owned session', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const phraseId = await asUser.mutation(api.phrases.create, {
				sessionId,
				english: 'Good morning',
				translation: 'Buenos días'
			});

			expect(phraseId).toBeDefined();

			const result = await asUser.query(api.phrases.listBySession, { sessionId });
			expect(result.phrases).toHaveLength(1);
			expect(result.phrases[0].english).toBe('Good morning');
		});

		it('cannot create phrase for other users session', async () => {
			const t = convexTest(schema, modules);
			const asUser1 = t.withIdentity({ subject: 'user1' });
			const asUser2 = t.withIdentity({ subject: 'user2' });

			const sessionId = await asUser1.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			await expect(
				asUser2.mutation(api.phrases.create, {
					sessionId,
					english: 'Hello',
					translation: 'Hola'
				})
			).rejects.toThrowError('Not authorized to add phrases to this session');
		});

		it('should throw error for non-existent session', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			// Create and delete a session to get a valid but non-existent ID
			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});
			await asUser.mutation(api.sessions.remove, { id: sessionId });

			await expect(
				asUser.mutation(api.phrases.create, {
					sessionId,
					english: 'Hello',
					translation: 'Hola'
				})
			).rejects.toThrowError('Session not found');
		});
	});

	describe('update', () => {
		it('should update phrase english text', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const phraseId = await asUser.mutation(api.phrases.create, {
				sessionId,
				english: 'Hello',
				translation: 'Hola'
			});

			await asUser.mutation(api.phrases.update, {
				id: phraseId,
				english: 'Hi there'
			});

			const result = await asUser.query(api.phrases.listBySession, { sessionId });
			expect(result.phrases[0].english).toBe('Hi there');
			expect(result.phrases[0].translation).toBe('Hola');
		});

		it('should update phrase translation', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const phraseId = await asUser.mutation(api.phrases.create, {
				sessionId,
				english: 'Hello',
				translation: 'Hola'
			});

			await asUser.mutation(api.phrases.update, {
				id: phraseId,
				translation: '¡Hola!'
			});

			const result = await asUser.query(api.phrases.listBySession, { sessionId });
			expect(result.phrases[0].english).toBe('Hello');
			expect(result.phrases[0].translation).toBe('¡Hola!');
		});

		it('should not allow updating other users phrases', async () => {
			const t = convexTest(schema, modules);
			const asUser1 = t.withIdentity({ subject: 'user1' });
			const asUser2 = t.withIdentity({ subject: 'user2' });

			const sessionId = await asUser1.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const phraseId = await asUser1.mutation(api.phrases.create, {
				sessionId,
				english: 'Hello',
				translation: 'Hola'
			});

			await expect(
				asUser2.mutation(api.phrases.update, {
					id: phraseId,
					english: 'Hacked'
				})
			).rejects.toThrowError('Not authorized');
		});

		it('should throw error for non-existent phrase', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const phraseId = await asUser.mutation(api.phrases.create, {
				sessionId,
				english: 'Hello',
				translation: 'Hola'
			});

			await asUser.mutation(api.phrases.remove, { id: phraseId });

			await expect(
				asUser.mutation(api.phrases.update, {
					id: phraseId,
					english: 'Updated'
				})
			).rejects.toThrowError('Phrase not found');
		});
	});

	describe('remove', () => {
		it('should remove a phrase', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const phraseId = await asUser.mutation(api.phrases.create, {
				sessionId,
				english: 'Hello',
				translation: 'Hola'
			});

			await asUser.mutation(api.phrases.remove, { id: phraseId });

			const result = await asUser.query(api.phrases.listBySession, { sessionId });
			expect(result.phrases).toHaveLength(0);
		});

		it('should not allow removing other users phrases', async () => {
			const t = convexTest(schema, modules);
			const asUser1 = t.withIdentity({ subject: 'user1' });
			const asUser2 = t.withIdentity({ subject: 'user2' });

			const sessionId = await asUser1.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const phraseId = await asUser1.mutation(api.phrases.create, {
				sessionId,
				english: 'Hello',
				translation: 'Hola'
			});

			await expect(asUser2.mutation(api.phrases.remove, { id: phraseId })).rejects.toThrowError(
				'Not authorized'
			);
		});

		it('should throw error for non-existent phrase', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			const phraseId = await asUser.mutation(api.phrases.create, {
				sessionId,
				english: 'Hello',
				translation: 'Hola'
			});

			await asUser.mutation(api.phrases.remove, { id: phraseId });

			await expect(asUser.mutation(api.phrases.remove, { id: phraseId })).rejects.toThrowError(
				'Phrase not found'
			);
		});
	});

	describe('authentication', () => {
		it('should require authentication for listBySession', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			await expect(t.query(api.phrases.listBySession, { sessionId })).rejects.toThrowError(
				'Not authenticated'
			);
		});

		it('should require authentication for create', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });

			const sessionId = await asUser.mutation(api.sessions.create, {
				date: '2026-01-22',
				targetLanguage: 'Spanish'
			});

			await expect(
				t.mutation(api.phrases.create, {
					sessionId,
					english: 'Hello',
					translation: 'Hola'
				})
			).rejects.toThrowError('Not authenticated');
		});
	});
});
