import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';
import { normalizeLanguage, requireSupportedLanguage } from './lib/languages';
import { internal } from './_generated/api';

const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
const SLA_MS = 24 * 60 * 60 * 1000;
const AGREEMENT_TOLERANCE = 1;

function scoresAreValid(scores: {
	soundAccuracy: number;
	rhythmIntonation: number;
	phraseAccuracy: number;
}) {
	return [scores.soundAccuracy, scores.rhythmIntonation, scores.phraseAccuracy].every(
		(score) => Number.isInteger(score) && score >= 1 && score <= 5
	);
}

function agreesWithOriginal(
	original: { soundAccuracy: number; rhythmIntonation: number; phraseAccuracy: number },
	next: { soundAccuracy: number; rhythmIntonation: number; phraseAccuracy: number }
) {
	return (
		Math.abs(original.soundAccuracy - next.soundAccuracy) <= AGREEMENT_TOLERANCE &&
		Math.abs(original.rhythmIntonation - next.rhythmIntonation) <= AGREEMENT_TOLERANCE &&
		Math.abs(original.phraseAccuracy - next.phraseAccuracy) <= AGREEMENT_TOLERANCE
	);
}

function medianOf(values: number[]) {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length / 2)];
}

async function updateAiCalibration(
	ctx: { db: any },
	phraseId: any,
	ai: { soundAccuracy: number; rhythmIntonation: number; phraseAccuracy: number },
	human: { soundAccuracy: number; rhythmIntonation: number; phraseAccuracy: number }
) {
	const dS = ai.soundAccuracy - human.soundAccuracy;
	const dR = ai.rhythmIntonation - human.rhythmIntonation;
	const dP = ai.phraseAccuracy - human.phraseAccuracy;

	const existing = await ctx.db
		.query('aiCalibration')
		.withIndex('by_phrase', (q: any) => q.eq('phraseId', phraseId))
		.unique();

	if (existing) {
		await ctx.db.patch(existing._id, {
			comparisonCount: existing.comparisonCount + 1,
			sumDeltaSoundAccuracy: existing.sumDeltaSoundAccuracy + dS,
			sumDeltaRhythmIntonation: existing.sumDeltaRhythmIntonation + dR,
			sumDeltaPhraseAccuracy: existing.sumDeltaPhraseAccuracy + dP,
			sumAbsDeltaSoundAccuracy: existing.sumAbsDeltaSoundAccuracy + Math.abs(dS),
			sumAbsDeltaRhythmIntonation: existing.sumAbsDeltaRhythmIntonation + Math.abs(dR),
			sumAbsDeltaPhraseAccuracy: existing.sumAbsDeltaPhraseAccuracy + Math.abs(dP),
			lastUpdatedAt: Date.now()
		});
	} else {
		await ctx.db.insert('aiCalibration', {
			phraseId,
			comparisonCount: 1,
			sumDeltaSoundAccuracy: dS,
			sumDeltaRhythmIntonation: dR,
			sumDeltaPhraseAccuracy: dP,
			sumAbsDeltaSoundAccuracy: Math.abs(dS),
			sumAbsDeltaRhythmIntonation: Math.abs(dR),
			sumAbsDeltaPhraseAccuracy: Math.abs(dP),
			lastUpdatedAt: Date.now()
		});
	}
}

async function assertVerifierLanguageAccess(
	ctx: { db: any },
	userId: string,
	languageCode: string
) {
	const membership = await ctx.db
		.query('verifierLanguageMemberships')
		.withIndex('by_user_language', (q: any) => q.eq('userId', userId).eq('languageCode', languageCode))
		.unique();

	if (!membership || !membership.active) {
		throw new Error('Verifier is not authorized for this language');
	}
}

async function reclaimExpiredClaims(ctx: { db: any }, languageCode: string, now: number) {
	const expired = await ctx.db
		.query('humanReviewRequests')
		.withIndex('by_status_claim_deadline', (q: any) =>
			q.eq('status', 'claimed').lte('claimDeadlineAt', now)
		)
		.filter((q: any) => q.eq(q.field('languageCode'), languageCode))
		.take(25);

	for (const request of expired) {
		await ctx.db.patch(request._id, {
			status: 'pending',
			claimedByVerifierUserId: undefined,
			claimedAt: undefined,
			claimDeadlineAt: undefined,
			priorityAt: 0,
			updatedAt: now
		});
	}
}

async function escalateExpiredSla(ctx: { db: any }, languageCode: string, now: number) {
	const pendingExpired = await ctx.db
		.query('humanReviewRequests')
		.withIndex('by_status_sla', (q: any) => q.eq('status', 'pending').lte('slaDueAt', now))
		.filter((q: any) => q.eq(q.field('languageCode'), languageCode))
		.take(25);

	for (const request of pendingExpired) {
		await ctx.db.patch(request._id, {
			status: 'escalated',
			escalatedAt: now,
			escalatedReason: 'SLA exceeded while pending',
			claimedByVerifierUserId: undefined,
			claimedAt: undefined,
			claimDeadlineAt: undefined,
			updatedAt: now
		});
	}

	const claimedExpired = await ctx.db
		.query('humanReviewRequests')
		.withIndex('by_status_sla', (q: any) => q.eq('status', 'claimed').lte('slaDueAt', now))
		.filter((q: any) => q.eq(q.field('languageCode'), languageCode))
		.take(25);

	for (const request of claimedExpired) {
		await ctx.db.patch(request._id, {
			status: 'escalated',
			escalatedAt: now,
			escalatedReason: 'SLA exceeded while claimed',
			claimedByVerifierUserId: undefined,
			claimedAt: undefined,
			claimDeadlineAt: undefined,
			updatedAt: now
		});
	}
}

async function buildAssignment(ctx: any, request: any, now: number) {
	const attempt = await ctx.db.get(request.attemptId);
	if (!attempt) {
		return null;
	}

	const phrase = await ctx.db.get(request.phraseId);
	const learnerAudio = attempt.audioAssetId ? await ctx.db.get(attempt.audioAssetId) : null;
	const learnerAudioUrl = learnerAudio?.storageKey ? await ctx.storage.getUrl(learnerAudio.storageKey) : null;

	const aiFeedback = await ctx.db
		.query('aiFeedback')
		.withIndex('by_attempt', (q: any) => q.eq('attemptId', request.attemptId))
		.unique();

	let initialReview: any = null;
	if (request.initialReviewId) {
		initialReview = await ctx.db.get(request.initialReviewId);
	}

	return {
		requestId: request._id,
		attemptId: request.attemptId,
		phraseId: request.phraseId,
		languageCode: request.languageCode,
		phase: request.phase,
		status: request.status,
		claimDeadlineAt: request.claimDeadlineAt ?? null,
		remainingMs: request.claimDeadlineAt ? Math.max(request.claimDeadlineAt - now, 0) : null,
		learner: {
			userId: request.learnerUserId
		},
		phrase: phrase
			? {
					english: phrase.english,
					translation: phrase.translation
				}
			: null,
		learnerAttempt: {
			durationMs: attempt.durationMs ?? null,
			audioUrl: learnerAudioUrl
		},
		originalReview: initialReview
			? {
					verifierFirstName: initialReview.verifierFirstName,
					verifierProfileImageUrl: initialReview.verifierProfileImageUrl ?? null,
					soundAccuracy: initialReview.soundAccuracy,
					rhythmIntonation: initialReview.rhythmIntonation,
					phraseAccuracy: initialReview.phraseAccuracy
				}
			: null,
		aiFeedback: aiFeedback
			? {
					transcript: aiFeedback.transcript ?? null,
					confidence: aiFeedback.confidence ?? null,
					soundAccuracy: aiFeedback.soundAccuracy ?? null,
					rhythmIntonation: aiFeedback.rhythmIntonation ?? null,
					phraseAccuracy: aiFeedback.phraseAccuracy ?? null,
					feedbackText: aiFeedback.feedbackText ?? null,
					errorTags: aiFeedback.errorTags ?? []
				}
			: null,
		disputeProgress:
			request.phase === 'dispute'
				? {
						completed: request.disputeReviewCount ?? 0,
						required: 2
					}
				: null
	};
}

export const queueAttemptForHumanReview = internalMutation({
	args: { attemptId: v.id('attempts') },
	handler: async (ctx, { attemptId }) => {
		const existing = await ctx.db
			.query('humanReviewRequests')
			.withIndex('by_attempt', (q) => q.eq('attemptId', attemptId))
			.unique();
		if (existing) {
			return existing._id;
		}

		const attempt = await ctx.db.get(attemptId);
		if (!attempt) {
			throw new Error('Attempt not found');
		}

		const phrase = await ctx.db.get(attempt.phraseId);
		if (!phrase) {
			throw new Error('Phrase not found for attempt');
		}

		const legacySession = phrase.sessionId ? await ctx.db.get(phrase.sessionId) : null;
		const language = requireSupportedLanguage(
			phrase.languageCode ?? legacySession?.targetLanguageCode ?? legacySession?.targetLanguage ?? 'xh-ZA'
		);
		const now = Date.now();

		const requestId = await ctx.db.insert('humanReviewRequests', {
			attemptId,
			phraseId: phrase._id,
			learnerUserId: attempt.userId,
			languageCode: language.bcp47,
			phase: 'initial',
			status: 'pending',
			priorityAt: now,
			slaDueAt: now + SLA_MS,
			createdAt: now,
			updatedAt: now
		});

		await ctx.scheduler.runAfter(SLA_MS, internal.humanReviews.escalateIfSlaExceeded, {
			requestId
		});
		return requestId;
	}
});

export const releaseClaimIfExpired = internalMutation({
	args: {
		requestId: v.id('humanReviewRequests'),
		expectedClaimedAt: v.number()
	},
	handler: async (ctx, args) => {
		const request = await ctx.db.get(args.requestId);
		if (!request) return;
		if (request.status !== 'claimed') return;
		if (request.claimedAt !== args.expectedClaimedAt) return;
		if (!request.claimDeadlineAt || request.claimDeadlineAt > Date.now()) return;

		await ctx.db.patch(args.requestId, {
			status: 'pending',
			claimedByVerifierUserId: undefined,
			claimedAt: undefined,
			claimDeadlineAt: undefined,
			priorityAt: 0,
			updatedAt: Date.now()
		});
	}
});

export const escalateIfSlaExceeded = internalMutation({
	args: { requestId: v.id('humanReviewRequests') },
	handler: async (ctx, { requestId }) => {
		const request = await ctx.db.get(requestId);
		if (!request) return;
		if (request.status !== 'pending' && request.status !== 'claimed') return;
		if (Date.now() < request.slaDueAt) return;

		await ctx.db.patch(requestId, {
			status: 'escalated',
			escalatedAt: Date.now(),
			escalatedReason:
				request.status === 'claimed'
					? 'SLA exceeded while claimed'
					: 'SLA exceeded while pending',
			claimedByVerifierUserId: undefined,
			claimedAt: undefined,
			claimDeadlineAt: undefined,
			updatedAt: Date.now()
		});
	}
});

export const claimNext = mutation({
	args: { languageCode: v.string() },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const language = requireSupportedLanguage(args.languageCode);
		const now = Date.now();

		await assertVerifierLanguageAccess(ctx, userId, language.bcp47);
		await reclaimExpiredClaims(ctx, language.bcp47, now);
		await escalateExpiredSla(ctx, language.bcp47, now);

		const myClaimed = await ctx.db
			.query('humanReviewRequests')
			.withIndex('by_claimed_status', (q) => q.eq('claimedByVerifierUserId', userId).eq('status', 'claimed'))
			.filter((q) => q.eq(q.field('languageCode'), language.bcp47))
			.collect();

		const activeClaim = myClaimed.find(
			(request) => !request.claimDeadlineAt || request.claimDeadlineAt > now
		);
		if (activeClaim) {
			return await buildAssignment(ctx, activeClaim, now);
		}

		if (myClaimed.length > 0) {
			for (const request of myClaimed) {
				await ctx.db.patch(request._id, {
					status: 'pending',
					claimedByVerifierUserId: undefined,
					claimedAt: undefined,
					claimDeadlineAt: undefined,
					priorityAt: 0,
					updatedAt: now
				});
			}
		}

		const pending = await ctx.db
			.query('humanReviewRequests')
			.withIndex('by_language_status_priority', (q) =>
				q.eq('languageCode', language.bcp47).eq('status', 'pending')
			)
			.take(20);

		let next: (typeof pending)[number] | null = null;
		for (const candidate of pending) {
			if (candidate.phase !== 'dispute') {
				next = candidate;
				break;
			}

			// For dispute rounds, skip any verifier who has already reviewed this request.
			const existingReviews = await ctx.db
				.query('humanReviews')
				.withIndex('by_request_created', (q) => q.eq('requestId', candidate._id))
				.collect();
			if (!existingReviews.some((review) => review.verifierUserId === userId)) {
				next = candidate;
				break;
			}
		}

		if (!next) {
			return null;
		}

		await ctx.db.patch(next._id, {
			status: 'claimed',
			claimedByVerifierUserId: userId,
			claimedAt: now,
			claimDeadlineAt: now + CLAIM_TIMEOUT_MS,
			updatedAt: now
		});

		await ctx.scheduler.runAfter(CLAIM_TIMEOUT_MS, internal.humanReviews.releaseClaimIfExpired, {
			requestId: next._id,
			expectedClaimedAt: now
		});

		const claimed = await ctx.db.get(next._id);
		if (!claimed) return null;
		return await buildAssignment(ctx, claimed, now);
	}
});

export const releaseClaim = mutation({
	args: { requestId: v.id('humanReviewRequests') },
	handler: async (ctx, { requestId }) => {
		const userId = await getAuthUserId(ctx);
		const request = await ctx.db.get(requestId);
		if (!request) {
			throw new Error('Review request not found');
		}
		if (request.status !== 'claimed' || request.claimedByVerifierUserId !== userId) {
			throw new Error('You do not hold this claim');
		}

		await ctx.db.patch(requestId, {
			status: 'pending',
			claimedByVerifierUserId: undefined,
			claimedAt: undefined,
			claimDeadlineAt: undefined,
			priorityAt: 0,
			updatedAt: Date.now()
		});
	}
});

export const submitReview = mutation({
	args: {
		requestId: v.id('humanReviewRequests'),
		soundAccuracy: v.number(),
		rhythmIntonation: v.number(),
		phraseAccuracy: v.number(),
		aiAnalysisCorrect: v.optional(v.boolean()),
		exemplarAudioAssetId: v.id('audioAssets')
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const now = Date.now();
		const request = await ctx.db.get(args.requestId);
		if (!request) {
			throw new Error('Review request not found');
		}

		if (request.status !== 'claimed' || request.claimedByVerifierUserId !== userId) {
			throw new Error('You do not hold this claim');
		}

		if (request.claimDeadlineAt && now > request.claimDeadlineAt) {
			await ctx.db.patch(request._id, {
				status: 'pending',
				claimedByVerifierUserId: undefined,
				claimedAt: undefined,
				claimDeadlineAt: undefined,
				priorityAt: 0,
				updatedAt: now
			});
			throw new Error('Claim timed out and returned to queue');
		}

		if (
			!scoresAreValid({
				soundAccuracy: args.soundAccuracy,
				rhythmIntonation: args.rhythmIntonation,
				phraseAccuracy: args.phraseAccuracy
			})
		) {
			throw new Error('Scores must be integers from 1 to 5');
		}

		const audioAsset = await ctx.db.get(args.exemplarAudioAssetId);
		if (!audioAsset || audioAsset.userId !== userId) {
			throw new Error('Exemplar audio not found or not authorized');
		}

		const profile = await ctx.db
			.query('verifierProfiles')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();
		const verifierFirstName = profile?.firstName ?? 'Verifier';
		const verifierProfileImageUrl = profile?.profileImageUrl;

		const previousReviews = await ctx.db
			.query('humanReviews')
			.withIndex('by_request_created', (q) => q.eq('requestId', request._id))
			.collect();

		if (previousReviews.some((review) => review.verifierUserId === userId)) {
			throw new Error('You already reviewed this request');
		}

		let reviewKind: 'initial' | 'dispute' = 'initial';
		let sequence = 1;
		let agrees: boolean | undefined;

		if (request.phase === 'dispute') {
			reviewKind = 'dispute';
			sequence = 2 + previousReviews.filter((review) => review.reviewKind === 'dispute').length;

			if (!request.initialReviewId) {
				throw new Error('Dispute review requires an initial review');
			}
			const original = await ctx.db.get(request.initialReviewId);
			if (!original) {
				throw new Error('Initial review not found');
			}
			if (original.verifierUserId === userId) {
				throw new Error('Original verifier cannot submit dispute verification');
			}
			agrees = agreesWithOriginal(
				{
					soundAccuracy: original.soundAccuracy,
					rhythmIntonation: original.rhythmIntonation,
					phraseAccuracy: original.phraseAccuracy
				},
				{
					soundAccuracy: args.soundAccuracy,
					rhythmIntonation: args.rhythmIntonation,
					phraseAccuracy: args.phraseAccuracy
				}
			);
		}

		const reviewId = await ctx.db.insert('humanReviews', {
			requestId: request._id,
			attemptId: request.attemptId,
			learnerUserId: request.learnerUserId,
			verifierUserId: userId,
			reviewKind,
			sequence,
			soundAccuracy: args.soundAccuracy,
			rhythmIntonation: args.rhythmIntonation,
			phraseAccuracy: args.phraseAccuracy,
			aiAnalysisCorrect: args.aiAnalysisCorrect,
			exemplarAudioAssetId: args.exemplarAudioAssetId,
			verifierFirstName,
			verifierProfileImageUrl,
			agreesWithOriginal: agrees,
			createdAt: now
		});

		// Record AI vs human calibration if AI scores exist
		const aiFeedbackForCalibration = await ctx.db
			.query('aiFeedback')
			.withIndex('by_attempt', (q: any) => q.eq('attemptId', request.attemptId))
			.unique();

		if (
			aiFeedbackForCalibration?.soundAccuracy != null &&
			aiFeedbackForCalibration?.rhythmIntonation != null &&
			aiFeedbackForCalibration?.phraseAccuracy != null
		) {
			await updateAiCalibration(
				ctx,
				request.phraseId,
				{
					soundAccuracy: aiFeedbackForCalibration.soundAccuracy,
					rhythmIntonation: aiFeedbackForCalibration.rhythmIntonation,
					phraseAccuracy: aiFeedbackForCalibration.phraseAccuracy
				},
				{
					soundAccuracy: args.soundAccuracy,
					rhythmIntonation: args.rhythmIntonation,
					phraseAccuracy: args.phraseAccuracy
				}
			);
		}

		if (reviewKind === 'initial') {
			await ctx.db.patch(request._id, {
				status: 'completed',
				initialReviewId: reviewId,
				claimedByVerifierUserId: undefined,
				claimedAt: undefined,
				claimDeadlineAt: undefined,
				resolvedAt: now,
				updatedAt: now
			});
			return { requestId: request._id, status: 'completed' };
		}

		const disputeReviewCount = (request.disputeReviewCount ?? 0) + 1;
		const disputeAgreementCount = (request.disputeAgreementCount ?? 0) + (agrees ? 1 : 0);
		if (disputeReviewCount >= 2) {
			const fullyAgreed = disputeAgreementCount >= 2;
			if (fullyAgreed) {
				await ctx.db.patch(request._id, {
					status: 'dispute_resolved',
					disputeReviewCount,
					disputeAgreementCount,
					claimedByVerifierUserId: undefined,
					claimedAt: undefined,
					claimDeadlineAt: undefined,
					resolvedAt: now,
					updatedAt: now
				});

				const openFlags = await ctx.db
					.query('humanReviewFlags')
					.withIndex('by_request', (q) => q.eq('requestId', request._id))
					.filter((q) => q.eq(q.field('status'), 'open'))
					.collect();
				for (const flag of openFlags) {
					await ctx.db.patch(flag._id, {
						status: 'resolved',
						resolvedAt: now,
						resolvedByVerifierUserId: userId
					});
				}

				return { requestId: request._id, status: 'dispute_resolved' };
			}

			await ctx.db.patch(request._id, {
				status: 'escalated',
				disputeReviewCount,
				disputeAgreementCount,
				claimedByVerifierUserId: undefined,
				claimedAt: undefined,
				claimDeadlineAt: undefined,
				escalatedAt: now,
				escalatedReason: 'Dispute reviewers did not agree with original review',
				updatedAt: now
			});

			const openFlags = await ctx.db
				.query('humanReviewFlags')
				.withIndex('by_request', (q) => q.eq('requestId', request._id))
				.filter((q) => q.eq(q.field('status'), 'open'))
				.collect();
			for (const flag of openFlags) {
				await ctx.db.patch(flag._id, {
					status: 'escalated',
					resolvedAt: now,
					resolvedByVerifierUserId: userId
				});
			}

			return { requestId: request._id, status: 'escalated' };
		}

		await ctx.db.patch(request._id, {
			status: 'pending',
			disputeReviewCount,
			disputeAgreementCount,
			claimedByVerifierUserId: undefined,
			claimedAt: undefined,
			claimDeadlineAt: undefined,
			priorityAt: 0,
			updatedAt: now
		});
		return { requestId: request._id, status: 'pending' };
	}
});

export const flagAttemptReview = mutation({
	args: {
		attemptId: v.id('attempts'),
		reason: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const now = Date.now();
		const request = await ctx.db
			.query('humanReviewRequests')
			.withIndex('by_attempt', (q) => q.eq('attemptId', args.attemptId))
			.unique();
		if (!request) {
			throw new Error('Human review request not found');
		}
		if (request.learnerUserId !== userId) {
			throw new Error('Not authorized');
		}
		if (!request.initialReviewId) {
			throw new Error('No completed review to flag');
		}
		if (request.status !== 'completed' && request.status !== 'dispute_resolved') {
			throw new Error('Review cannot be flagged in its current state');
		}

		await ctx.db.insert('humanReviewFlags', {
			requestId: request._id,
			attemptId: request.attemptId,
			learnerUserId: userId,
			reason: args.reason,
			status: 'open',
			createdAt: now
		});

		await ctx.db.patch(request._id, {
			phase: 'dispute',
			status: 'pending',
			disputeReviewCount: 0,
			disputeAgreementCount: 0,
			flaggedAt: now,
			flaggedByLearnerUserId: userId,
			claimedByVerifierUserId: undefined,
			claimedAt: undefined,
			claimDeadlineAt: undefined,
			priorityAt: 0,
			updatedAt: now
		});
	}
});

export const getCurrentClaim = query({
	args: { languageCode: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const claimed = await ctx.db
			.query('humanReviewRequests')
			.withIndex('by_claimed_status', (q) => q.eq('claimedByVerifierUserId', userId).eq('status', 'claimed'))
			.collect();

		const now = Date.now();
		const filtered = args.languageCode
			? claimed.filter((request) => {
					const normalized = normalizeLanguage(args.languageCode ?? '');
					return normalized ? request.languageCode === normalized.bcp47 : true;
				})
			: claimed;

		const active = filtered.find((request) => !request.claimDeadlineAt || request.claimDeadlineAt > now);
		if (!active) return null;
		return await buildAssignment(ctx, active, now);
	}
});

export const getQueueSignal = query({
	args: { languageCode: v.string() },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const language = requireSupportedLanguage(args.languageCode);
		await assertVerifierLanguageAccess(ctx, userId, language.bcp47);

		const pending = await ctx.db
			.query('humanReviewRequests')
			.withIndex('by_language_status_priority', (q) =>
				q.eq('languageCode', language.bcp47).eq('status', 'pending')
			)
			.take(25);

		return {
			languageCode: language.bcp47,
			pendingCount: pending.length,
			oldestPendingId: pending[0]?._id ?? null
		};
	}
});

export const getAttemptHumanReview = query({
	args: { attemptId: v.id('attempts') },
	handler: async (ctx, { attemptId }) => {
		const userId = await getAuthUserId(ctx);
		const request = await ctx.db
			.query('humanReviewRequests')
			.withIndex('by_attempt', (q) => q.eq('attemptId', attemptId))
			.unique();
		if (!request || request.learnerUserId !== userId) {
			return null;
		}

		const reviews = await ctx.db
			.query('humanReviews')
			.withIndex('by_request_created', (q) => q.eq('requestId', request._id))
			.collect();

		const initial = request.initialReviewId ? await ctx.db.get(request.initialReviewId) : null;
		const initialAudio =
			initial?.exemplarAudioAssetId ? await ctx.db.get(initial.exemplarAudioAssetId) : null;
		const initialAudioUrl = initialAudio?.storageKey ? await ctx.storage.getUrl(initialAudio.storageKey) : null;

		const disputeReviews = reviews.filter((review) => review.reviewKind === 'dispute');
		const disputeWithAudio = [];
		for (const review of disputeReviews) {
			const audioAsset = await ctx.db.get(review.exemplarAudioAssetId);
			const audioUrl = audioAsset?.storageKey ? await ctx.storage.getUrl(audioAsset.storageKey) : null;
			disputeWithAudio.push({
				reviewId: review._id,
				verifierFirstName: review.verifierFirstName,
				verifierProfileImageUrl: review.verifierProfileImageUrl ?? null,
				soundAccuracy: review.soundAccuracy,
				rhythmIntonation: review.rhythmIntonation,
				phraseAccuracy: review.phraseAccuracy,
				agreesWithOriginal: review.agreesWithOriginal ?? null,
				audioUrl
			});
		}

		let finalScores: { soundAccuracy: number; rhythmIntonation: number; phraseAccuracy: number } | null = null;
		if (initial) {
			const scoreCandidates = [initial, ...disputeReviews];
			finalScores = {
				soundAccuracy: medianOf(scoreCandidates.map((row) => row.soundAccuracy)),
				rhythmIntonation: medianOf(scoreCandidates.map((row) => row.rhythmIntonation)),
				phraseAccuracy: medianOf(scoreCandidates.map((row) => row.phraseAccuracy))
			};
		}

		return {
			requestId: request._id,
			status: request.status,
			phase: request.phase,
			flaggedAt: request.flaggedAt ?? null,
			escalatedAt: request.escalatedAt ?? null,
			escalatedReason: request.escalatedReason ?? null,
			initialReview: initial
				? {
						reviewId: initial._id,
						verifierFirstName: initial.verifierFirstName,
						verifierProfileImageUrl: initial.verifierProfileImageUrl ?? null,
						soundAccuracy: initial.soundAccuracy,
						rhythmIntonation: initial.rhythmIntonation,
						phraseAccuracy: initial.phraseAccuracy,
						audioUrl: initialAudioUrl
					}
				: null,
			disputeReviews: disputeWithAudio,
			finalScores
		};
	}
});

export const getUnseenFeedback = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);

		const requests = await ctx.db
			.query('humanReviewRequests')
			.withIndex('by_learner_created', (q) => q.eq('learnerUserId', userId))
			.order('desc')
			.collect();

		const unseen = requests.filter(
			(r) =>
				(r.status === 'completed' || r.status === 'dispute_resolved') &&
				r.feedbackSeenAt === undefined
		);

		if (unseen.length === 0) return null;

		const latest = unseen[0];
		const attempt = await ctx.db.get(latest.attemptId);

		return {
			practiceSessionId: attempt?.practiceSessionId ?? null,
			attemptId: latest.attemptId,
			count: unseen.length
		};
	}
});

export const markFeedbackSeen = mutation({
	args: {
		practiceSessionId: v.id('practiceSessions')
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const now = Date.now();

		const attempts = await ctx.db
			.query('attempts')
			.withIndex('by_practice_session', (q) =>
				q.eq('practiceSessionId', args.practiceSessionId)
			)
			.collect();

		const attemptIds = new Set(attempts.map((a) => a._id));

		const requests = await ctx.db
			.query('humanReviewRequests')
			.withIndex('by_learner_created', (q) => q.eq('learnerUserId', userId))
			.collect();

		for (const req of requests) {
			if (
				attemptIds.has(req.attemptId) &&
				req.feedbackSeenAt === undefined &&
				(req.status === 'completed' || req.status === 'dispute_resolved')
			) {
				await ctx.db.patch(req._id, { feedbackSeenAt: now });
			}
		}
	}
});

export const listEscalated = query({
	args: { languageCode: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const profile = await ctx.db
			.query('verifierProfiles')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();
		if (!profile?.active) {
			throw new Error('Verifier profile required');
		}

		const escalated = await ctx.db
			.query('humanReviewRequests')
			.withIndex('by_status_sla', (q) => q.eq('status', 'escalated'))
			.collect();

		const normalized = args.languageCode ? normalizeLanguage(args.languageCode) : null;
		return escalated
			.filter((item) => (normalized ? item.languageCode === normalized.bcp47 : true))
			.map((item) => ({
				requestId: item._id,
				attemptId: item.attemptId,
				phase: item.phase,
				languageCode: item.languageCode,
				escalatedAt: item.escalatedAt ?? null,
				escalatedReason: item.escalatedReason ?? 'Escalated'
			}));
	}
});

export const listPendingForLanguage = query({
	args: { languageCode: v.string() },
	handler: async (ctx, { languageCode }) => {
		const userId = await getAuthUserId(ctx);
		await assertVerifierLanguageAccess(ctx, userId, languageCode);

		const pending = await ctx.db
			.query('humanReviewRequests')
			.withIndex('by_language_status_priority', (q) =>
				q.eq('languageCode', languageCode).eq('status', 'pending')
			)
			.take(50);

		const results = [];
		for (const request of pending) {
			const phrase = await ctx.db.get(request.phraseId);
			results.push({
				requestId: request._id,
				attemptId: request.attemptId,
				phraseId: request.phraseId,
				phase: request.phase,
				priorityAt: request.priorityAt,
				slaDueAt: request.slaDueAt,
				createdAt: request.createdAt,
				phrase: phrase
					? { english: phrase.english, translation: phrase.translation }
					: null
			});
		}
		return results;
	}
});
