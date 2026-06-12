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
		phonetic: v.optional(v.string()),
		translationStatus: v.optional(v.string()),
		// Set when this phrase is a per-user materialization of a course prompt.
		// Such phrases are excluded from the library/free-practice surfaces.
		coursePromptId: v.optional(v.id('coursePrompts'))
	})
		.index('by_session', ['sessionId'])
		.index('by_user', ['userId'])
		.index('by_user_category', ['userId', 'categoryKey'])
		.index('by_user_course_prompt', ['userId', 'coursePromptId']),

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
		aiProcessingStatus: v.optional(v.string()), // processing | feedback_ready | failed
		aiProcessingStartedAt: v.optional(v.number()),
		aiProcessedAt: v.optional(v.number()),
		aiRunId: v.optional(v.string()),
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
		attemptCount: v.optional(v.number()),
		phraseCount: v.optional(v.number()),
		aiScoreCount: v.optional(v.number()),
		aiScoreSumSound: v.optional(v.number()),
		aiScoreSumRhythm: v.optional(v.number()),
		aiScoreSumPhrase: v.optional(v.number()),
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
		// Course attempts only: which morphemes were wrong (drives decomposition).
		constructionErrors: v.optional(
			v.array(v.object({ morpheme: v.string(), issue: v.string() }))
		),
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
		uiLocale: v.optional(v.string()), // UI language (e.g. en, xh)
		uiSkin: v.optional(v.string()), // UI skin (e.g. "default", "mono")
		profileImageStorageId: v.optional(v.string()) // Convex storage ID for profile pic
	}).index('by_user', ['userId']),

	// Temporary password reset links for environments without real email delivery.
	passwordResetDebugLinks: defineTable({
		email: v.string(),
		url: v.string(),
		expiresAt: v.number(),
		createdAt: v.number()
	})
		.index('by_email', ['email'])
		.index('by_email_createdAt', ['email', 'createdAt']),

	// Billing subscriptions (provider state)
	billingSubscriptions: defineTable({
		userId: v.string(),
		provider: v.string(), // paystack | stripe
		plan: v.string(), // free | ai | pro
		status: v.string(), // pending | active | past_due | canceled
		providerReference: v.optional(v.string()), // our checkout reference
		providerPaymentId: v.optional(v.string()),
		providerSubscriptionId: v.optional(v.string()),
		lastPaymentAt: v.optional(v.number()),
		currentPeriodEnd: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_provider_reference', ['provider', 'providerReference'])
		.index('by_provider_subscription', ['provider', 'providerSubscriptionId'])
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

	// Scheduled notifications for spaced repetition.
	// Legacy phrase recall carries phraseId; handle-based construction prompts
	// carry coursePromptId (no phrase exists until the learner first attempts it).
	scheduledNotifications: defineTable({
		phraseId: v.optional(v.id('phrases')),
		coursePromptId: v.optional(v.id('coursePrompts')),
		userId: v.string(),
		scheduledFor: v.number(), // timestamp
		sent: v.boolean()
	})
		.index('by_phrase', ['phraseId'])
		.index('by_user_scheduled', ['userId', 'scheduledFor'])
		.index('by_sent', ['sent']),

	// ——— Michel-Thomas course mode ———

	// One course per language (versioned; only one published at a time).
	courses: defineTable({
		languageCode: v.string(), // BCP 47
		title: v.string(),
		status: v.union(v.literal('draft'), v.literal('published')),
		version: v.number(),
		createdAt: v.number()
	}).index('by_language_status', ['languageCode', 'status']),

	// Canonical inventory of building blocks ("handles") for a course.
	// This is the constraint input for AI drafting and the SRS scheduling unit.
	handles: defineTable({
		courseId: v.id('courses'),
		key: v.string(), // stable slug, e.g. 'sc_ndi'
		label: v.string(), // e.g. "ndi- (I)"
		gloss: v.string(), // what it does, e.g. "first-person subject concord"
		unitId: v.optional(v.id('units')), // unit that introduces it
		index: v.number()
	})
		.index('by_course_index', ['courseId', 'index'])
		.index('by_course_key', ['courseId', 'key']),

	// A lesson: introduces 1–4 handles via a text intro + construction prompts.
	units: defineTable({
		courseId: v.id('courses'),
		index: v.number(),
		title: v.string(),
		introBody: v.string(), // plain text, whitespace-pre-wrap rendering
		handleKeys: v.array(v.string()),
		status: v.union(v.literal('draft'), v.literal('published')),
		createdAt: v.number(),
		updatedAt: v.number()
	}).index('by_course_index', ['courseId', 'index']),

	// A construction prompt: English in, learner constructs the target phrase.
	// Approved prompts are IMMUTABLE — materialized phrases and issued feedback
	// snapshot their content; edits go through clonePromptForEdit.
	coursePrompts: defineTable({
		courseId: v.id('courses'),
		unitId: v.id('units'),
		index: v.number(),
		english: v.string(),
		translation: v.string(),
		phonetic: v.optional(v.string()),
		morphemeBreakdown: v.array(
			v.object({ morpheme: v.string(), gloss: v.string(), role: v.string() })
		),
		usesHandles: v.array(v.string()),
		primaryHandleKey: v.string(), // denormalized: arrays aren't indexable
		status: v.union(v.literal('draft'), v.literal('approved'), v.literal('retired')),
		exemplarAudioAssetId: v.optional(v.id('audioAssets')),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_unit_index', ['unitId', 'index'])
		.index('by_course_status', ['courseId', 'status'])
		.index('by_handle_status', ['primaryHandleKey', 'status']),

	// Per-learner SRS state per handle. nextDueAt drives notification scheduling.
	learnerHandleState: defineTable({
		userId: v.string(),
		courseId: v.id('courses'),
		handleKey: v.string(),
		status: v.union(v.literal('introduced'), v.literal('owned')),
		strength: v.number(), // 0-based rung on the interval ladder
		cleanStreak: v.number(), // consecutive clean constructions
		lastConstructedAt: v.optional(v.number()),
		nextDueAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_user_course', ['userId', 'courseId'])
		.index('by_user_handle', ['userId', 'courseId', 'handleKey'])
		.index('by_user_due', ['userId', 'nextDueAt']),

	// Authoritative per-learner course position ("continue course" + completion).
	learnerUnitProgress: defineTable({
		userId: v.string(),
		courseId: v.id('courses'),
		unitId: v.id('units'),
		status: v.union(v.literal('in_progress'), v.literal('completed')),
		promptCursor: v.number(),
		introSeenAt: v.optional(v.number()),
		completedAt: v.optional(v.number()),
		updatedAt: v.number()
	})
		.index('by_user_course', ['userId', 'courseId'])
		.index('by_user_unit', ['userId', 'unitId']),

	// Admin tier: curriculum authoring + admin management.
	// Bootstrap via ADMIN_USER_IDS env var; grants live here.
	admins: defineTable({
		userId: v.string(),
		grantedBy: v.string(),
		createdAt: v.number()
	}).index('by_user', ['userId'])
});
