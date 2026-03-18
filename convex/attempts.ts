import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';
import {
	assertRecordingAllowed,
	consumeRecordingMinutes,
	minutesFromMs,
	getEntitlement
} from './lib/billing';
import { requireSupportedLanguage } from './lib/languages';
import { internal } from './_generated/api';

function pickLatestAiFeedback(feedbackRows: any[]) {
	return [...feedbackRows].sort((a, b) => {
		if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
		return (b._creationTime ?? 0) - (a._creationTime ?? 0);
	})[0] ?? null;
}

type AttemptResultCaches = {
	phraseById: Map<string, Promise<any>>;
	audioAssetById: Map<string, Promise<any>>;
	storageUrlByKey: Map<string, Promise<string | null>>;
};

function createAttemptResultCaches(): AttemptResultCaches {
	return {
		phraseById: new Map(),
		audioAssetById: new Map(),
		storageUrlByKey: new Map()
	};
}

function getCached<T>(
	cache: Map<string, Promise<T>>,
	key: string,
	load: () => Promise<T>
): Promise<T> {
	const existing = cache.get(key);
	if (existing) {
		return existing;
	}
	const pending = load();
	cache.set(key, pending);
	return pending;
}

async function updatePracticeSessionAttemptAggregates(
	ctx: any,
	args: { practiceSessionId: string; phraseAlreadyCounted: boolean }
) {
	const session = await ctx.db.get(args.practiceSessionId);
	if (!session) return;

	// Fast path for new-format sessions with aggregate counters already initialized.
	if (typeof session.attemptCount === 'number' && typeof session.phraseCount === 'number') {
		await ctx.db.patch(args.practiceSessionId, {
			attemptCount: session.attemptCount + 1,
			phraseCount: session.phraseCount + (args.phraseAlreadyCounted ? 0 : 1)
		});
		return;
	}

	// Legacy fallback: recompute from session attempts if aggregate fields are missing.
	const existingAttemptsForSession = await ctx.db
		.query('attempts')
		.withIndex('by_practice_session', (q: any) => q.eq('practiceSessionId', args.practiceSessionId))
		.collect();

	await ctx.db.patch(args.practiceSessionId, {
		attemptCount: existingAttemptsForSession.length,
		phraseCount: new Set(existingAttemptsForSession.map((a: any) => a.phraseId)).size
	});
}

async function getStorageUrlCached(
	ctx: any,
	caches: AttemptResultCaches | undefined,
	storageKey: string
) {
	if (!caches) {
		return await ctx.storage.getUrl(storageKey);
	}
	return await getCached(caches.storageUrlByKey, storageKey, async () => ctx.storage.getUrl(storageKey));
}

async function getDocCached(
	ctx: any,
	caches: AttemptResultCaches | undefined,
	kind: 'phrase' | 'audioAsset',
	id: string
) {
	if (!caches) {
		return await ctx.db.get(id);
	}
	if (kind === 'phrase') {
		return await getCached(caches.phraseById, id, async () => ctx.db.get(id));
	}
	return await getCached(caches.audioAssetById, id, async () => ctx.db.get(id));
}

async function buildHumanReviewSummary(ctx: any, attemptId: string, caches?: AttemptResultCaches) {
	const reviewRequest = await ctx.db
		.query('humanReviewRequests')
		.withIndex('by_attempt', (q: any) => q.eq('attemptId', attemptId))
		.unique();

	if (!reviewRequest) {
		return null;
	}

	const initialReview = reviewRequest.initialReviewId
		? await ctx.db.get(reviewRequest.initialReviewId)
		: null;
	const initialReviewAudioAsset =
		initialReview?.exemplarAudioAssetId
			? await getDocCached(ctx, caches, 'audioAsset', initialReview.exemplarAudioAssetId)
			: null;
	const initialReviewAudioUrl = initialReviewAudioAsset?.storageKey
		? await getStorageUrlCached(ctx, caches, initialReviewAudioAsset.storageKey)
		: null;

	const allReviews = await ctx.db
		.query('humanReviews')
		.withIndex('by_request_created', (q: any) => q.eq('requestId', reviewRequest._id))
		.collect();
	const scoreRows = initialReview
		? [initialReview, ...allReviews.filter((review: any) => review.reviewKind === 'dispute')]
		: [];
	const sorted = (values: number[]) => [...values].sort((a, b) => a - b);
	const finalScores =
		scoreRows.length > 0
			? {
					soundAccuracy: sorted(scoreRows.map((row: any) => row.soundAccuracy))[
						Math.floor(scoreRows.length / 2)
					],
					rhythmIntonation: sorted(scoreRows.map((row: any) => row.rhythmIntonation))[
						Math.floor(scoreRows.length / 2)
					],
					phraseAccuracy: sorted(scoreRows.map((row: any) => row.phraseAccuracy))[
						Math.floor(scoreRows.length / 2)
					]
				}
			: null;

	return {
		status: reviewRequest.status,
		phase: reviewRequest.phase,
		flaggedAt: reviewRequest.flaggedAt ?? null,
		escalatedAt: reviewRequest.escalatedAt ?? null,
		escalatedReason: reviewRequest.escalatedReason ?? null,
		initialReview: initialReview
			? {
					verifierFirstName: initialReview.verifierFirstName,
					verifierProfileImageUrl: initialReview.verifierProfileImageUrl ?? null,
					soundAccuracy: initialReview.soundAccuracy,
					rhythmIntonation: initialReview.rhythmIntonation,
					phraseAccuracy: initialReview.phraseAccuracy,
					audioUrl: initialReviewAudioUrl
				}
			: null,
		finalScores,
		disputeReviewCount: reviewRequest.disputeReviewCount ?? 0
	};
}

async function getLearnerAudioAssetForAttempt(ctx: any, attempt: any, caches?: AttemptResultCaches) {
	if (attempt.audioAssetId) {
		const linkedAudioAsset = await getDocCached(ctx, caches, 'audioAsset', attempt.audioAssetId);
		if (linkedAudioAsset) {
			return linkedAudioAsset;
		}
	}

	const audioAssets = await ctx.db
		.query('audioAssets')
		.withIndex('by_attempt', (q: any) => q.eq('attemptId', attempt._id))
		.collect();

	if (audioAssets.length === 0) {
		return null;
	}

	const learnerAudioAsset = audioAssets.find(
		(audioAsset: any) => audioAsset.userId === attempt.userId && audioAsset.phraseId === attempt.phraseId
	);
	if (learnerAudioAsset) {
		return learnerAudioAsset;
	}

	return [...audioAssets].sort((a, b) => a.createdAt - b.createdAt)[0] ?? null;
}

async function buildAttemptResult(ctx: any, attempt: any, caches?: AttemptResultCaches) {
	const [audioAsset, feedbackRows, humanReview, phrase] = await Promise.all([
		getLearnerAudioAssetForAttempt(ctx, attempt, caches),
		ctx.db
			.query('aiFeedback')
			.withIndex('by_attempt', (q: any) => q.eq('attemptId', attempt._id))
			.collect(),
		buildHumanReviewSummary(ctx, attempt._id, caches),
		getDocCached(ctx, caches, 'phrase', attempt.phraseId)
	]);
	const feedback = pickLatestAiFeedback(feedbackRows);

	const audioUrl = audioAsset?.storageKey
		? await getStorageUrlCached(ctx, caches, audioAsset.storageKey)
		: null;

	return {
		...attempt,
		phraseEnglish: phrase?.english ?? null,
		phraseTranslation: phrase?.translation ?? null,
		audioUrl,
		feedbackText: feedback?.feedbackText ?? null,
		transcript: feedback?.transcript ?? null,
		confidence: feedback?.confidence ?? null,
		errorTags: feedback?.errorTags ?? null,
		aiSoundAccuracy: feedback?.soundAccuracy ?? null,
		aiRhythmIntonation: feedback?.rhythmIntonation ?? null,
		aiPhraseAccuracy: feedback?.phraseAccuracy ?? null,
		humanReview
	};
}

async function buildAttemptResults(ctx: any, attempts: any[]) {
	const caches = createAttemptResultCaches();
	return await Promise.all(attempts.map((attempt) => buildAttemptResult(ctx, attempt, caches)));
}

// Create an attempt (audio upload may follow)
export const create = mutation({
	args: {
		phraseId: v.id('phrases'),
		practiceSessionId: v.optional(v.id('practiceSessions')),
		offlineId: v.optional(v.string()),
		deviceId: v.optional(v.string()),
		durationMs: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		await assertRecordingAllowed(ctx, userId, 0);

		const phrase = await ctx.db.get(args.phraseId);
		if (!phrase || phrase.userId !== userId) {
			throw new Error('Phrase not found or not authorized');
		}

		if (args.practiceSessionId) {
			const practiceSession = await ctx.db.get(args.practiceSessionId);
			if (!practiceSession || practiceSession.userId !== userId) {
				throw new Error('Practice session not found or not authorized');
			}
		}

		let phraseAlreadyCountedInSession = false;
		if (args.practiceSessionId) {
			const existingForPhrase = await ctx.db
				.query('attempts')
				.withIndex('by_practice_session', (q) => q.eq('practiceSessionId', args.practiceSessionId!))
				.filter((q) => q.eq(q.field('phraseId'), args.phraseId))
				.take(1);
			phraseAlreadyCountedInSession = existingForPhrase.length > 0;
		}

		const attemptId = await ctx.db.insert('attempts', {
			userId,
			phraseId: args.phraseId,
			practiceSessionId: args.practiceSessionId,
			offlineId: args.offlineId,
			deviceId: args.deviceId,
			durationMs: args.durationMs,
			status: 'queued',
			createdAt: Date.now()
		});

		if (args.practiceSessionId) {
			await updatePracticeSessionAttemptAggregates(ctx, {
				practiceSessionId: args.practiceSessionId,
				phraseAlreadyCounted: phraseAlreadyCountedInSession
			});
		}

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

		const entitlement = await getEntitlement(ctx, userId);
		if (entitlement.tier === 'pro' && entitlement.status === 'active') {
			const existingRequest = await ctx.db
				.query('humanReviewRequests')
				.withIndex('by_attempt', (q) => q.eq('attemptId', attemptId))
				.unique();

			if (!existingRequest) {
				const phrase = await ctx.db.get(attempt.phraseId);
				if (phrase) {
					const legacySession = phrase.sessionId ? await ctx.db.get(phrase.sessionId) : null;
					const language = requireSupportedLanguage(
						phrase.languageCode ??
							legacySession?.targetLanguageCode ??
							legacySession?.targetLanguage ??
							'xh-ZA'
					);
					const now = Date.now();
					const requestId = await ctx.db.insert('humanReviewRequests', {
						attemptId,
						phraseId: phrase._id,
						learnerUserId: userId,
						languageCode: language.bcp47,
						phase: 'initial',
						status: 'pending',
						priorityAt: now,
						slaDueAt: now + 24 * 60 * 60 * 1000,
						createdAt: now,
						updatedAt: now
					});
					await ctx.scheduler.runAfter(
						24 * 60 * 60 * 1000,
						internal.humanReviews.escalateIfSlaExceeded,
						{ requestId }
					);
				}
			}
		}
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

		return await buildAttemptResults(ctx, attempts);
	}
});

export const listByPracticeSession = query({
	args: {
		practiceSessionId: v.id('practiceSessions')
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const practiceSession = await ctx.db.get(args.practiceSessionId);
		if (!practiceSession || practiceSession.userId !== userId) {
			throw new Error('Practice session not found or not authorized');
		}

		const attempts = await ctx.db
			.query('attempts')
			.withIndex('by_practice_session', (q) => q.eq('practiceSessionId', args.practiceSessionId))
			.order('desc')
			.collect();

		return {
			practiceSession,
			attempts: await buildAttemptResults(ctx, attempts)
		};
	}
});

export const listByPracticeSessionAsc = query({
	args: {
		practiceSessionId: v.id('practiceSessions')
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const practiceSession = await ctx.db.get(args.practiceSessionId);
		if (!practiceSession || practiceSession.userId !== userId) {
			throw new Error('Practice session not found or not authorized');
		}

		const attempts = await ctx.db
			.query('attempts')
			.withIndex('by_practice_session', (q) => q.eq('practiceSessionId', args.practiceSessionId))
			.order('asc')
			.collect();

		return {
			practiceSession,
			attempts: await buildAttemptResults(ctx, attempts)
		};
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
