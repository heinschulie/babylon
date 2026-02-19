import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	// Learning sessions - one per day per user
	sessions: defineTable({
		userId: v.string(),
		date: v.string(), // ISO date string (YYYY-MM-DD)
		targetLanguage: v.string(),
		targetLanguageCode: v.optional(v.string()), // BCP 47 (e.g. xh-ZA)
		targetLanguageIso639_1: v.optional(v.string()), // ISO 639-1 (e.g. xh)
		createdAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_user_date', ['userId', 'date']),

	// Phrases within a session
	phrases: defineTable({
		sessionId: v.optional(v.id('sessions')), // legacy container, no longer required for new phrases
		userId: v.string(),
		english: v.string(),
		translation: v.string(),
		languageCode: v.optional(v.string()), // BCP 47 (e.g. xh-ZA)
		categoryKey: v.optional(v.string()),
		categoryLabel: v.optional(v.string()),
		createdAt: v.number(),
		difficulty: v.optional(v.string()),
		grammarTags: v.optional(v.array(v.string())),
		phoneticTags: v.optional(v.array(v.string())),
		domainTags: v.optional(v.array(v.string())),
		referenceAudioUrl: v.optional(v.string())
	})
		.index('by_session', ['sessionId'])
		.index('by_user', ['userId'])
		.index('by_user_category', ['userId', 'categoryKey']),

	// Per-user phrase learning state (FSRS)
	userPhrases: defineTable({
		userId: v.string(),
		phraseId: v.id('phrases'),
		fsrsState: v.optional(v.any()),
		lastReviewedAt: v.optional(v.number()),
		nextReviewAt: v.optional(v.number())
	})
		.index('by_user', ['userId'])
		.index('by_user_phrase', ['userId', 'phraseId'])
		.index('by_next_review', ['userId', 'nextReviewAt']),

	// Audio assets stored in object storage
	audioAssets: defineTable({
		userId: v.string(),
		phraseId: v.optional(v.id('phrases')),
		attemptId: v.optional(v.id('attempts')),
		storageKey: v.string(),
		contentType: v.string(),
		durationMs: v.optional(v.number()),
		createdAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_phrase', ['phraseId'])
		.index('by_attempt', ['attemptId']),

	// User attempts (audio recordings)
	attempts: defineTable({
		userId: v.string(),
		phraseId: v.id('phrases'),
		practiceSessionId: v.optional(v.id('practiceSessions')),
		audioAssetId: v.optional(v.id('audioAssets')),
		deviceId: v.optional(v.string()),
		offlineId: v.optional(v.string()),
		durationMs: v.optional(v.number()),
		status: v.string(), // queued | processing | feedback_ready | failed
		createdAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_phrase', ['phraseId'])
		.index('by_practice_session', ['practiceSessionId'])
		.index('by_user_created', ['userId', 'createdAt']),

	// Practice runs: each run tracks a set of attempts over time.
	practiceSessions: defineTable({
		userId: v.string(),
		startedAt: v.number(),
		endedAt: v.optional(v.number()),
		createdAt: v.number()
	})
		.index('by_user_started', ['userId', 'startedAt'])
		.index('by_user_created', ['userId', 'createdAt']),

	// Verifier profile snapshot and activation state
	verifierProfiles: defineTable({
		userId: v.string(),
		firstName: v.string(),
		profileImageUrl: v.optional(v.string()),
		active: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_active', ['active']),

	// Which languages a verifier can review (mapped to BCP 47 language tags)
	verifierLanguageMemberships: defineTable({
		userId: v.string(),
		languageCode: v.string(), // BCP 47 (e.g. xh-ZA)
		active: v.boolean(),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_language_active', ['languageCode', 'active'])
		.index('by_user_language', ['userId', 'languageCode']),

	// Queue item lifecycle for human reviews.
	// phase: initial | dispute
	// status: pending | claimed | completed | dispute_resolved | escalated
	humanReviewRequests: defineTable({
		attemptId: v.id('attempts'),
		phraseId: v.id('phrases'),
		learnerUserId: v.string(),
		languageCode: v.string(), // BCP 47
		phase: v.string(),
		status: v.string(),
		priorityAt: v.number(),
		slaDueAt: v.number(),
		claimedByVerifierUserId: v.optional(v.string()),
		claimedAt: v.optional(v.number()),
		claimDeadlineAt: v.optional(v.number()),
		initialReviewId: v.optional(v.id('humanReviews')),
		disputeReviewCount: v.optional(v.number()),
		disputeAgreementCount: v.optional(v.number()),
		flaggedAt: v.optional(v.number()),
		flaggedByLearnerUserId: v.optional(v.string()),
		resolvedAt: v.optional(v.number()),
		escalatedAt: v.optional(v.number()),
		escalatedReason: v.optional(v.string()),
		feedbackSeenAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_attempt', ['attemptId'])
		.index('by_status_priority', ['status', 'priorityAt'])
		.index('by_language_status_priority', ['languageCode', 'status', 'priorityAt'])
		.index('by_status_claim_deadline', ['status', 'claimDeadlineAt'])
		.index('by_status_sla', ['status', 'slaDueAt'])
		.index('by_claimed_status', ['claimedByVerifierUserId', 'status'])
		.index('by_learner_created', ['learnerUserId', 'createdAt']),

	// A submitted verifier review. Dispute rounds store additional reviews for the same request.
	humanReviews: defineTable({
		requestId: v.id('humanReviewRequests'),
		attemptId: v.id('attempts'),
		learnerUserId: v.string(),
		verifierUserId: v.string(),
		reviewKind: v.string(), // initial | dispute
		sequence: v.number(), // initial: 1, dispute: 2..3
		soundAccuracy: v.number(), // 1..5
		rhythmIntonation: v.number(), // 1..5
		phraseAccuracy: v.number(), // 1..5
		aiAnalysisCorrect: v.optional(v.boolean()),
		exemplarAudioAssetId: v.id('audioAssets'),
		verifierFirstName: v.string(),
		verifierProfileImageUrl: v.optional(v.string()),
		agreesWithOriginal: v.optional(v.boolean()),
		createdAt: v.number()
	})
		.index('by_request_created', ['requestId', 'createdAt'])
		.index('by_attempt', ['attemptId'])
		.index('by_verifier_created', ['verifierUserId', 'createdAt']),

	// Learner-generated flag events against completed reviews.
	humanReviewFlags: defineTable({
		requestId: v.id('humanReviewRequests'),
		attemptId: v.id('attempts'),
		learnerUserId: v.string(),
		reason: v.optional(v.string()),
		status: v.string(), // open | resolved | escalated
		createdAt: v.number(),
		resolvedAt: v.optional(v.number()),
		resolvedByVerifierUserId: v.optional(v.string())
	})
		.index('by_request', ['requestId'])
		.index('by_attempt', ['attemptId'])
		.index('by_status_created', ['status', 'createdAt']),

	// AI feedback for attempts
	aiFeedback: defineTable({
		attemptId: v.id('attempts'),
		transcript: v.optional(v.string()),
		confidence: v.optional(v.number()),
		errorTags: v.optional(v.array(v.string())),
		soundAccuracy: v.optional(v.number()),
		rhythmIntonation: v.optional(v.number()),
		phraseAccuracy: v.optional(v.number()),
		feedbackText: v.optional(v.string()),
		ttsAudioUrl: v.optional(v.string()),
		createdAt: v.number()
	}).index('by_attempt', ['attemptId']),

	// Per-phrase AI vs human score calibration tracking
	aiCalibration: defineTable({
		phraseId: v.id('phrases'),
		comparisonCount: v.number(),
		sumDeltaSoundAccuracy: v.number(),
		sumDeltaRhythmIntonation: v.number(),
		sumDeltaPhraseAccuracy: v.number(),
		sumAbsDeltaSoundAccuracy: v.number(),
		sumAbsDeltaRhythmIntonation: v.number(),
		sumAbsDeltaPhraseAccuracy: v.number(),
		lastUpdatedAt: v.number()
	}).index('by_phrase', ['phraseId']),

	// User notification preferences
	userPreferences: defineTable({
		userId: v.string(),
		quietHoursStart: v.number(), // 0-23 hour
		quietHoursEnd: v.number(), // 0-23 hour
		notificationsPerPhrase: v.number(),
		pushSubscription: v.optional(v.string()), // JSON stringified PushSubscription
		timeZone: v.optional(v.string()), // IANA time zone for local-midnight resets
		uiLocale: v.optional(v.string()) // UI language (e.g. en, xh)
	}).index('by_user', ['userId']),

	// Billing subscriptions (provider state)
	billingSubscriptions: defineTable({
		userId: v.string(),
		provider: v.string(), // payfast
		plan: v.string(), // free | ai | pro
		status: v.string(), // pending | active | past_due | canceled
		payfastReference: v.optional(v.string()),
		providerPaymentId: v.optional(v.string()),
		providerSubscriptionToken: v.optional(v.string()),
		lastPaymentAt: v.optional(v.number()),
		currentPeriodEnd: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_provider_reference', ['provider', 'payfastReference'])
		.index('by_provider_payment', ['provider', 'providerPaymentId']),

	// Effective entitlements (authoritative for gating)
	entitlements: defineTable({
		userId: v.string(),
		tier: v.string(), // free | ai | pro
		status: v.string(), // active | past_due | canceled
		source: v.string(), // webhook | admin | seed
		updatedAt: v.number()
	}).index('by_user', ['userId']),

	// Daily usage tracking (local midnight reset)
	usageDaily: defineTable({
		userId: v.string(),
		dateKey: v.string(), // YYYY-MM-DD in user's time zone
		minutesRecorded: v.number(),
		updatedAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_user_date', ['userId', 'dateKey']),

	// Raw billing events for audit/debug
	billingEvents: defineTable({
		userId: v.optional(v.string()),
		provider: v.string(),
		providerEventId: v.optional(v.string()),
		providerPaymentId: v.optional(v.string()),
		eventType: v.optional(v.string()),
		payload: v.any(),
		receivedAt: v.number()
	})
		.index('by_provider_event', ['provider', 'providerEventId'])
		.index('by_provider_payment', ['provider', 'providerPaymentId']),

	// Scheduled notifications for spaced repetition
	scheduledNotifications: defineTable({
		phraseId: v.id('phrases'),
		userId: v.string(),
		scheduledFor: v.number(), // timestamp
		sent: v.boolean()
	})
		.index('by_phrase', ['phraseId'])
		.index('by_user_scheduled', ['userId', 'scheduledFor'])
		.index('by_sent', ['sent'])
});
