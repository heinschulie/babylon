import { v } from 'convex/values';
import { internalQuery, internalMutation } from './_generated/server';

const DEFAULT_AI_PROCESSING_STALE_AFTER_MS = 5 * 60 * 1000;

function omitUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
	return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

type ScoreTuple = {
	soundAccuracy: number;
	rhythmIntonation: number;
	phraseAccuracy: number;
};

function getScoredTuple(row: {
	soundAccuracy?: number;
	rhythmIntonation?: number;
	phraseAccuracy?: number;
}): ScoreTuple | null {
	if (
		typeof row.soundAccuracy !== 'number' ||
		typeof row.rhythmIntonation !== 'number' ||
		typeof row.phraseAccuracy !== 'number'
	) {
		return null;
	}

	return {
		soundAccuracy: row.soundAccuracy,
		rhythmIntonation: row.rhythmIntonation,
		phraseAccuracy: row.phraseAccuracy
	};
}

async function applyPracticeSessionAiAggregateDelta(
	ctx: any,
	args: {
		attemptId: string;
		previous: ScoreTuple | null;
		next: ScoreTuple | null;
	}
) {
	const attempt = await ctx.db.get(args.attemptId);
	const practiceSessionId = attempt?.practiceSessionId;
	if (!practiceSessionId) return;

	const session = await ctx.db.get(practiceSessionId);
	if (!session) return;

	const prev = args.previous;
	const next = args.next;
	if (!prev && !next) return;

	await ctx.db.patch(practiceSessionId, {
		aiScoreCount: Math.max(
			0,
			(session.aiScoreCount ?? 0) + (next ? 1 : 0) - (prev ? 1 : 0)
		),
		aiScoreSumSound: (session.aiScoreSumSound ?? 0) + (next?.soundAccuracy ?? 0) - (prev?.soundAccuracy ?? 0),
		aiScoreSumRhythm:
			(session.aiScoreSumRhythm ?? 0) + (next?.rhythmIntonation ?? 0) - (prev?.rhythmIntonation ?? 0),
		aiScoreSumPhrase:
			(session.aiScoreSumPhrase ?? 0) + (next?.phraseAccuracy ?? 0) - (prev?.phraseAccuracy ?? 0)
	});
}

export const getAttemptById = internalQuery({
	args: { attemptId: v.id('attempts') },
	handler: async (ctx, { attemptId }) => {
		return await ctx.db.get(attemptId);
	}
});

export const getAudioAssetByAttempt = internalQuery({
	args: { attemptId: v.id('attempts') },
	handler: async (ctx, { attemptId }) => {
		const attempt = await ctx.db.get(attemptId);
		if (!attempt) {
			return null;
		}

		if (attempt.audioAssetId) {
			const linkedAudioAsset = await ctx.db.get(attempt.audioAssetId);
			if (linkedAudioAsset) {
				return linkedAudioAsset;
			}
		}

		const audioAssets = await ctx.db
			.query('audioAssets')
			.withIndex('by_attempt', (q) => q.eq('attemptId', attemptId))
			.collect();
		if (audioAssets.length === 0) {
			return null;
		}

		const learnerAudioAsset = audioAssets.find(
			(audioAsset) => audioAsset.userId === attempt.userId && audioAsset.phraseId === attempt.phraseId
		);
		if (learnerAudioAsset) {
			return learnerAudioAsset;
		}

		return [...audioAssets].sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
	}
});

export const insertAiFeedback = internalMutation({
	args: {
		attemptId: v.id('attempts'),
		transcript: v.optional(v.string()),
		confidence: v.optional(v.number()),
		errorTags: v.optional(v.array(v.string())),
		soundAccuracy: v.optional(v.number()),
		rhythmIntonation: v.optional(v.number()),
		phraseAccuracy: v.optional(v.number()),
		feedbackText: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query('aiFeedback')
			.withIndex('by_attempt', (q) => q.eq('attemptId', args.attemptId))
			.collect();
		const canonical =
			[...existing].sort((a, b) => {
				if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
				return b._creationTime - a._creationTime;
			})[0] ?? null;
		const now = Date.now();

		const patch = omitUndefined({
			transcript: args.transcript,
			confidence: args.confidence,
			errorTags: args.errorTags,
			soundAccuracy: args.soundAccuracy,
			rhythmIntonation: args.rhythmIntonation,
			phraseAccuracy: args.phraseAccuracy,
			feedbackText: args.feedbackText
		});
		const nextScored = getScoredTuple({
			soundAccuracy:
				args.soundAccuracy !== undefined ? args.soundAccuracy : canonical?.soundAccuracy,
			rhythmIntonation:
				args.rhythmIntonation !== undefined ? args.rhythmIntonation : canonical?.rhythmIntonation,
			phraseAccuracy:
				args.phraseAccuracy !== undefined ? args.phraseAccuracy : canonical?.phraseAccuracy
		});

		if (canonical) {
			const previousScored = getScoredTuple(canonical);
			await ctx.db.patch(canonical._id, patch);
			await applyPracticeSessionAiAggregateDelta(ctx, {
				attemptId: args.attemptId,
				previous: previousScored,
				next: nextScored
			});
			return canonical._id;
		}

		const insertedId = await ctx.db.insert('aiFeedback', {
			attemptId: args.attemptId,
			...patch,
			createdAt: now
		});
		await applyPracticeSessionAiAggregateDelta(ctx, {
			attemptId: args.attemptId,
			previous: null,
			next: nextScored
		});
		return insertedId;
	}
});

export const patchAttemptStatus = internalMutation({
	args: {
		attemptId: v.id('attempts'),
		status: v.string(),
		mode: v.optional(v.string()),
		aiRunId: v.optional(v.string()),
		expectedAiRunId: v.optional(v.string()),
		staleAfterMs: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const attempt = await ctx.db.get(args.attemptId);
		if (!attempt) {
			return { outcome: 'missing' as const };
		}

		if (args.mode === 'claim_ai_processing') {
			const existingFeedback = await ctx.db
				.query('aiFeedback')
				.withIndex('by_attempt', (q) => q.eq('attemptId', args.attemptId))
				.collect();
			if (existingFeedback.length > 0 || attempt.status === 'feedback_ready') {
				await ctx.db.patch(args.attemptId, {
					status: 'feedback_ready',
					aiProcessingStatus: 'feedback_ready',
					aiProcessedAt: attempt.aiProcessedAt ?? Date.now()
				});
				return { outcome: 'already_ready' as const };
			}

			const now = Date.now();
			const staleAfterMs = Math.max(0, args.staleAfterMs ?? DEFAULT_AI_PROCESSING_STALE_AFTER_MS);
			const isFreshInProgress =
				attempt.aiProcessingStatus === 'processing' &&
				typeof attempt.aiProcessingStartedAt === 'number' &&
				now - attempt.aiProcessingStartedAt < staleAfterMs;
			if (isFreshInProgress) {
				return { outcome: 'in_progress' as const, aiRunId: attempt.aiRunId ?? null };
			}

			const nextAiRunId = args.aiRunId ?? attempt.aiRunId ?? `run_${now}`;
			await ctx.db.patch(args.attemptId, {
				status: 'processing',
				aiProcessingStatus: 'processing',
				aiProcessingStartedAt: now,
				aiRunId: nextAiRunId
			});
			return { outcome: 'claimed' as const, aiRunId: nextAiRunId };
		}

		if (args.mode === 'finish_ai_processing') {
			if (args.expectedAiRunId && attempt.aiRunId && attempt.aiRunId !== args.expectedAiRunId) {
				return { outcome: 'superseded' as const };
			}
			const now = Date.now();
			const patch: Record<string, unknown> = {
				status: args.status,
				aiProcessingStatus: args.status === 'feedback_ready' ? 'feedback_ready' : 'failed',
				...(args.status === 'feedback_ready' ? { aiProcessedAt: now } : {})
			};
			if (args.expectedAiRunId ?? attempt.aiRunId) {
				patch.aiRunId = args.expectedAiRunId ?? attempt.aiRunId;
			}
			await ctx.db.patch(args.attemptId, patch);
			return { outcome: 'updated' as const };
		}

		await ctx.db.patch(args.attemptId, { status: args.status });
		return { outcome: 'updated' as const };
	}
});
