import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

async function seedAttemptWithAudio(t: ReturnType<typeof convexTest>, userId: string) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const storageId = await ctx.storage.store(new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/webm' }));
		const phraseId = await ctx.db.insert('phrases', {
			userId,
			english: 'Hello',
			translation: 'Molo',
			createdAt: now
		});
		const attemptId = await ctx.db.insert('attempts', {
			userId,
			phraseId,
			status: 'processing',
			createdAt: now
		});
		await ctx.db.insert('audioAssets', {
			userId,
			phraseId,
			attemptId,
			storageKey: storageId as string,
			contentType: 'audio/webm',
			createdAt: now
		});
		return { attemptId, phraseId };
	});
}

describe('aiPipeline', () => {
	describe('processAttempt idempotency', () => {
		it('avoids duplicate feedback rows on repeated action invocation', async () => {
			const t = convexTest(schema, modules);
			const asUser = t.withIdentity({ subject: 'user1' });
			const { attemptId, phraseId } = await seedAttemptWithAudio(t, 'user1');

			await asUser.action(api.aiPipeline.processAttempt, {
				attemptId,
				phraseId,
				englishPrompt: 'Hello',
				targetPhrase: 'Molo'
			});
			const second = await asUser.action(api.aiPipeline.processAttempt, {
				attemptId,
				phraseId,
				englishPrompt: 'Hello',
				targetPhrase: 'Molo'
			});

			const feedbackRows = await t.run(async (ctx) =>
				ctx.db
					.query('aiFeedback')
					.withIndex('by_attempt', (q) => q.eq('attemptId', attemptId))
					.collect()
			);
			const attempt = await t.run(async (ctx) => ctx.db.get(attemptId));

			expect(feedbackRows).toHaveLength(1);
			expect(attempt?.status).toBe('feedback_ready');
			expect(second).toMatchObject({ skipped: true });
		});

		it('returns in_progress for a fresh second processing claim', async () => {
			const t = convexTest(schema, modules);
			const { attemptId } = await seedAttemptWithAudio(t, 'user1');

			const first = await t.mutation(internal.aiPipelineData.patchAttemptStatus, {
				attemptId,
				status: 'processing',
				mode: 'claim_ai_processing',
				aiRunId: 'run_a',
				staleAfterMs: 60_000
			});
			const second = await t.mutation(internal.aiPipelineData.patchAttemptStatus, {
				attemptId,
				status: 'processing',
				mode: 'claim_ai_processing',
				aiRunId: 'run_b',
				staleAfterMs: 60_000
			});

			expect(first).toMatchObject({ outcome: 'claimed' });
			expect(second).toMatchObject({ outcome: 'in_progress' });
		});
	});
});
