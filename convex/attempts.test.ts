import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function seedActiveEntitlement(t: ReturnType<typeof convexTest>, userId: string) {
	await t.run(async (ctx) => {
		await ctx.db.insert('entitlements', {
			userId,
			tier: 'ai',
			status: 'active',
			source: 'seed',
			updatedAt: Date.now()
		});
	});
}

async function createPhraseForUser(asUser: ReturnType<ReturnType<typeof convexTest>['withIdentity']>) {
	const sessionId = await asUser.mutation(api.sessions.create, {
		date: '2026-02-24',
		targetLanguage: 'Spanish'
	});

	return await asUser.mutation(api.phrases.create, {
		sessionId,
		english: 'Hello',
		translation: 'Hola'
	});
}

async function createPhrase(
	asUser: ReturnType<ReturnType<typeof convexTest>['withIdentity']>,
	values: { english: string; translation: string; date: string }
) {
	const sessionId = await asUser.mutation(api.sessions.create, {
		date: values.date,
		targetLanguage: 'Spanish'
	});

	return await asUser.mutation(api.phrases.create, {
		sessionId,
		english: values.english,
		translation: values.translation
	});
}

describe('attempts', () => {
	describe('create', () => {
		it('allows creating an attempt for an owned phrase', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			await seedActiveEntitlement(t, 'user1');

			const phraseId = await createPhraseForUser(asUser);
			const attemptId = await asUser.mutation(api.attempts.create, { phraseId });

			const attempt = await t.run(async (ctx) => ctx.db.get(attemptId));
			expect(attempt).toBeTruthy();
			expect(attempt).toMatchObject({
				userId: 'user1',
				phraseId,
				status: 'queued'
			});
		});

		it("rejects creating an attempt for another user's phrase", async () => {
			const t = convexTest(schema, modules);
			const asUser1 = t.withIdentity({ subject: 'user1' });
			const asUser2 = t.withIdentity({ subject: 'user2' });
			await seedActiveEntitlement(t, 'user1');
			await seedActiveEntitlement(t, 'user2');

			const phraseId = await createPhraseForUser(asUser1);

			await expect(asUser2.mutation(api.attempts.create, { phraseId })).rejects.toThrowError(
				'Phrase not found or not authorized'
			);
		});

		it('increments practice session aggregates without double-counting phraseCount', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			await seedActiveEntitlement(t, 'user1');

			const phraseA = await createPhrase(asUser, {
				english: 'One',
				translation: 'Uno',
				date: '2026-02-23'
			});
			const phraseB = await createPhrase(asUser, {
				english: 'Two',
				translation: 'Dos',
				date: '2026-02-22'
			});
			const practiceSessionId = await asUser.mutation(api.practiceSessions.start, {});

			await asUser.mutation(api.attempts.create, { phraseId: phraseA, practiceSessionId });
			await asUser.mutation(api.attempts.create, { phraseId: phraseA, practiceSessionId });
			await asUser.mutation(api.attempts.create, { phraseId: phraseB, practiceSessionId });

			const session = await t.run(async (ctx) => ctx.db.get(practiceSessionId));
			expect(session).toMatchObject({
				attemptCount: 3,
				phraseCount: 2
			});
		});
	});
});
