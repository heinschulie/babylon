import type { QueryCtx } from '../../_generated/server';
import type { Doc } from '../../_generated/dataModel';
import { DISPUTE_REVIEWS_REQUIRED } from './constants';

export async function buildAssignment(
	ctx: QueryCtx,
	request: Doc<'humanReviewRequests'>,
	now: number
) {
	const attempt = await ctx.db.get(request.attemptId);
	if (!attempt) {
		return null;
	}

	const phrase = await ctx.db.get(request.phraseId);
	const learnerAudio = attempt.audioAssetId ? await ctx.db.get(attempt.audioAssetId) : null;
	const learnerAudioUrl = learnerAudio?.storageKey
		? await ctx.storage.getUrl(learnerAudio.storageKey)
		: null;

	const aiFeedback = await ctx.db
		.query('aiFeedback')
		.withIndex('by_attempt', (q) => q.eq('attemptId', request.attemptId))
		.unique();

	let initialReview: Doc<'humanReviews'> | null = null;
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
						required: DISPUTE_REVIEWS_REQUIRED
					}
				: null
	};
}
