import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';
import {
	assertRecordingAllowed,
	consumeRecordingMinutes,
	minutesFromMs
} from './lib/billing';

// Create an attempt (audio upload may follow)
export const create = mutation({
	args: {
		phraseId: v.id('phrases'),
		offlineId: v.optional(v.string()),
		deviceId: v.optional(v.string()),
		durationMs: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		await assertRecordingAllowed(ctx, userId, 0);

		const attemptId = await ctx.db.insert('attempts', {
			userId,
			phraseId: args.phraseId,
			offlineId: args.offlineId,
			deviceId: args.deviceId,
			durationMs: args.durationMs,
			status: 'queued',
			createdAt: Date.now()
		});

		return attemptId;
	}
});

// Attach audio asset to an attempt
export const attachAudio = mutation({
	args: {
		attemptId: v.id('attempts'),
		audioAssetId: v.id('audioAssets')
	},
	handler: async (ctx, { attemptId, audioAssetId }) => {
		const userId = await getAuthUserId(ctx);
		const attempt = await ctx.db.get(attemptId);

		if (!attempt || attempt.userId !== userId) {
			throw new Error('Attempt not found or not authorized');
		}

		const audioAsset = await ctx.db.get(audioAssetId);
		const durationMs = audioAsset?.durationMs ?? attempt.durationMs ?? 0;
		const additionalMinutes = minutesFromMs(durationMs);

		const { dateKey } = await assertRecordingAllowed(ctx, userId, additionalMinutes);
		await consumeRecordingMinutes(ctx, userId, dateKey, additionalMinutes);

		await ctx.db.patch(attemptId, {
			audioAssetId,
			status: 'processing',
			durationMs: durationMs || attempt.durationMs
		});
	}
});

// List attempts for a phrase
export const listByPhrase = query({
	args: { phraseId: v.id('phrases') },
	handler: async (ctx, { phraseId }) => {
		const userId = await getAuthUserId(ctx);
		const attempts = await ctx.db
			.query('attempts')
			.withIndex('by_phrase', (q) => q.eq('phraseId', phraseId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.order('desc')
			.collect();

		const results = [];
		for (const attempt of attempts) {
			const audioAsset = await ctx.db
				.query('audioAssets')
				.withIndex('by_attempt', (q) => q.eq('attemptId', attempt._id))
				.unique();

			const feedback = await ctx.db
				.query('aiFeedback')
				.withIndex('by_attempt', (q) => q.eq('attemptId', attempt._id))
				.unique();

			const audioUrl = audioAsset?.storageKey
				? await ctx.storage.getUrl(audioAsset.storageKey)
				: null;

			results.push({
				...attempt,
				audioUrl,
				feedbackText: feedback?.feedbackText ?? null,
				transcript: feedback?.transcript ?? null,
				confidence: feedback?.confidence ?? null,
				errorTags: feedback?.errorTags ?? null,
				score: feedback?.score ?? null
			});
		}

		return results;
	}
});

// Mark attempt as failed
export const markFailed = mutation({
	args: { attemptId: v.id('attempts'), reason: v.optional(v.string()) },
	handler: async (ctx, { attemptId }) => {
		const userId = await getAuthUserId(ctx);
		const attempt = await ctx.db.get(attemptId);
		if (!attempt || attempt.userId !== userId) {
			throw new Error('Attempt not found or not authorized');
		}

		await ctx.db.patch(attemptId, { status: 'failed' });
	}
});
