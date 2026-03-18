import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function seedCompletedReviewRequest(t: ReturnType<typeof convexTest>, learnerUserId: string) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const phraseId = await ctx.db.insert('phrases', {
			userId: learnerUserId,
			english: 'Hello',
			translation: 'Molo',
			createdAt: now
		});
		const attemptId = await ctx.db.insert('attempts', {
			userId: learnerUserId,
			phraseId,
			status: 'feedback_ready',
			createdAt: now
		});
		const exemplarAudioAssetId = await ctx.db.insert('audioAssets', {
			userId: 'verifier1',
			attemptId,
			storageKey: 'fake-storage-key',
			contentType: 'audio/webm',
			createdAt: now
		});
		const requestId = await ctx.db.insert('humanReviewRequests', {
			attemptId,
			phraseId,
			learnerUserId,
			languageCode: 'xh-ZA',
			phase: 'initial',
			status: 'completed',
			priorityAt: now,
			slaDueAt: now + 60_000,
			resolvedAt: now,
			createdAt: now,
			updatedAt: now
		});
		const reviewId = await ctx.db.insert('humanReviews', {
			requestId,
			attemptId,
			learnerUserId,
			verifierUserId: 'verifier1',
			reviewKind: 'initial',
			sequence: 1,
			soundAccuracy: 4,
			rhythmIntonation: 4,
			phraseAccuracy: 4,
			exemplarAudioAssetId,
			verifierFirstName: 'Verifier',
			createdAt: now
		});
		await ctx.db.patch(requestId, {
			initialReviewId: reviewId
		});

		return { requestId, attemptId };
	});
}

describe('human review flags', () => {
	it('returns existing open flag and does not create duplicates on repeated calls', async () => {
		const t = convexTest(schema, modules);
		const asLearner = t.withIdentity({ subject: 'learner1' });
		const { requestId, attemptId } = await seedCompletedReviewRequest(t, 'learner1');

		const first = await asLearner.mutation(api.humanReviews.flagAttemptReview, {
			attemptId,
			reason: 'I disagree'
		});
		const afterFirst = await t.run(async (ctx) => ({
			request: await ctx.db.get(requestId),
			flags: await ctx.db
				.query('humanReviewFlags')
				.withIndex('by_request', (q) => q.eq('requestId', requestId))
				.collect()
		}));

		const second = await asLearner.mutation(api.humanReviews.flagAttemptReview, {
			attemptId,
			reason: 'double click'
		});
		const afterSecond = await t.run(async (ctx) => ({
			request: await ctx.db.get(requestId),
			flags: await ctx.db
				.query('humanReviewFlags')
				.withIndex('by_request', (q) => q.eq('requestId', requestId))
				.collect()
		}));

		expect(first).toMatchObject({ requestId, duplicate: false });
		expect(second).toMatchObject({
			requestId,
			flagId: first.flagId,
			duplicate: true
		});

		expect(afterFirst.flags).toHaveLength(1);
		expect(afterSecond.flags).toHaveLength(1);
		expect(afterSecond.flags[0]).toMatchObject({
			learnerUserId: 'learner1',
			status: 'open',
			reason: 'I disagree'
		});

		expect(afterFirst.request).toMatchObject({
			phase: 'dispute',
			status: 'pending'
		});
		expect(afterSecond.request).toMatchObject({
			phase: 'dispute',
			status: 'pending'
		});
		expect(afterSecond.request?.updatedAt).toBe(afterFirst.request?.updatedAt);
		expect(afterSecond.request?.flaggedAt).toBe(afterFirst.request?.flaggedAt);
	});
});
