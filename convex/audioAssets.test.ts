import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function seedStorageAudio(t: ReturnType<typeof convexTest>, contentType = 'audio/webm') {
	return await t.run(async (ctx) => {
		return await ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: contentType }));
	});
}

async function seedPhraseAndAttempt(t: ReturnType<typeof convexTest>, userId: string) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const phraseId = await ctx.db.insert('phrases', {
			userId,
			english: 'Hello',
			translation: 'Hola',
			createdAt: now
		});
		const attemptId = await ctx.db.insert('attempts', {
			userId,
			phraseId,
			status: 'queued',
			createdAt: now
		});
		return { phraseId, attemptId };
	});
}

async function seedClaimedReviewRequest(
	t: ReturnType<typeof convexTest>,
	args: {
		attemptId: any;
		phraseId: any;
		learnerUserId: string;
		verifierUserId: string;
	}
) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		return await ctx.db.insert('humanReviewRequests', {
			attemptId: args.attemptId,
			phraseId: args.phraseId,
			learnerUserId: args.learnerUserId,
			languageCode: 'xh-ZA',
			phase: 'initial',
			status: 'claimed',
			priorityAt: now,
			slaDueAt: now + 60_000,
			claimedByVerifierUserId: args.verifierUserId,
			claimedAt: now,
			claimDeadlineAt: now + 60_000,
			createdAt: now,
			updatedAt: now
		});
	});
}

describe('audioAssets', () => {
	describe('create', () => {
		it('allows a user to register audio linked to their own phrase and attempt', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const { phraseId, attemptId } = await seedPhraseAndAttempt(t, 'user1');
			const storageId = await seedStorageAudio(t);

			const audioAssetId = await asUser.mutation(api.audioAssets.create, {
				storageKey: storageId as string,
				contentType: 'audio/webm',
				phraseId,
				attemptId,
				durationMs: 1234
			});

			const row = await t.run(async (ctx) => ctx.db.get(audioAssetId));
			expect(row).toMatchObject({
				userId: 'user1',
				phraseId,
				attemptId,
				contentType: 'audio/webm',
				durationMs: 1234
			});
		});

		it("rejects linking another user's phrase", async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user2' });
			const { phraseId } = await seedPhraseAndAttempt(t, 'user1');
			const storageId = await seedStorageAudio(t);

			await expect(
				asUser.mutation(api.audioAssets.create, {
					storageKey: storageId as string,
					contentType: 'audio/webm',
					phraseId
				})
			).rejects.toThrowError('Phrase not found or not authorized');
		});

		it("rejects linking another user's attempt without an active verifier claim", async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user2' });
			const { attemptId } = await seedPhraseAndAttempt(t, 'user1');
			const storageId = await seedStorageAudio(t);

			await expect(
				asUser.mutation(api.audioAssets.create, {
					storageKey: storageId as string,
					contentType: 'audio/webm',
					attemptId
				})
			).rejects.toThrowError('Attempt not found or not authorized');
		});

		it('allows a verifier to link exemplar audio to a claimed learner attempt', async () => {
			const t = convexTest(schema, modules);
			const asVerifier = t.withIdentity({ subject: 'verifier1' });
			const { phraseId, attemptId } = await seedPhraseAndAttempt(t, 'learner1');
			await seedClaimedReviewRequest(t, {
				attemptId,
				phraseId,
				learnerUserId: 'learner1',
				verifierUserId: 'verifier1'
			});
			const storageId = await seedStorageAudio(t);

			const audioAssetId = await asVerifier.mutation(api.audioAssets.create, {
				storageKey: storageId as string,
				contentType: 'audio/webm',
				attemptId
			});
			const row = await t.run(async (ctx) => ctx.db.get(audioAssetId));

			expect(row).toMatchObject({
				userId: 'verifier1',
				attemptId,
				contentType: 'audio/webm'
			});
		});

		it('rejects mismatched attempt and phrase linkage', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const ownedA = await seedPhraseAndAttempt(t, 'user1');
			const ownedB = await seedPhraseAndAttempt(t, 'user1');
			const storageId = await seedStorageAudio(t);

			await expect(
				asUser.mutation(api.audioAssets.create, {
					storageKey: storageId as string,
					contentType: 'audio/webm',
					phraseId: ownedA.phraseId,
					attemptId: ownedB.attemptId
				})
			).rejects.toThrowError('Attempt and phrase do not match');
		});

		it('rejects non-audio content types', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const { phraseId } = await seedPhraseAndAttempt(t, 'user1');
			const storageId = await seedStorageAudio(t);

			await expect(
				asUser.mutation(api.audioAssets.create, {
					storageKey: storageId as string,
					contentType: 'image/png',
					phraseId
				})
			).rejects.toThrowError('Invalid content type');
		});
	});
});
