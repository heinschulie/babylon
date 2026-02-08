import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	// Learning sessions - one per day per user
	sessions: defineTable({
		userId: v.string(),
		date: v.string(), // ISO date string (YYYY-MM-DD)
		targetLanguage: v.string(),
		createdAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_user_date', ['userId', 'date']),

	// Phrases within a session
	phrases: defineTable({
		sessionId: v.id('sessions'),
		userId: v.string(),
		english: v.string(),
		translation: v.string(),
		createdAt: v.number(),
		difficulty: v.optional(v.string()),
		grammarTags: v.optional(v.array(v.string())),
		phoneticTags: v.optional(v.array(v.string())),
		domainTags: v.optional(v.array(v.string())),
		referenceAudioUrl: v.optional(v.string())
	})
		.index('by_session', ['sessionId'])
		.index('by_user', ['userId']),

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
		audioAssetId: v.optional(v.id('audioAssets')),
		deviceId: v.optional(v.string()),
		offlineId: v.optional(v.string()),
		durationMs: v.optional(v.number()),
		status: v.string(), // queued | processing | feedback_ready | failed
		createdAt: v.number()
	})
		.index('by_user', ['userId'])
		.index('by_phrase', ['phraseId'])
		.index('by_user_created', ['userId', 'createdAt']),

	// AI feedback for attempts
	aiFeedback: defineTable({
		attemptId: v.id('attempts'),
		transcript: v.optional(v.string()),
		confidence: v.optional(v.number()),
		errorTags: v.optional(v.array(v.string())),
		score: v.optional(v.number()),
		feedbackText: v.optional(v.string()),
		ttsAudioUrl: v.optional(v.string()),
		createdAt: v.number()
	}).index('by_attempt', ['attemptId']),

	// User notification preferences
	userPreferences: defineTable({
		userId: v.string(),
		quietHoursStart: v.number(), // 0-23 hour
		quietHoursEnd: v.number(), // 0-23 hour
		notificationsPerPhrase: v.number(),
		pushSubscription: v.optional(v.string()), // JSON stringified PushSubscription
		timeZone: v.optional(v.string()) // IANA time zone for local-midnight resets
	}).index('by_user', ['userId']),

	// Billing subscriptions (provider state)
	billingSubscriptions: defineTable({
		userId: v.string(),
		provider: v.string(), // payfast
		plan: v.string(), // free | ai | pro
		status: v.string(), // pending | active | past_due | canceled
		providerPaymentId: v.optional(v.string()),
		providerSubscriptionToken: v.optional(v.string()),
		lastPaymentAt: v.optional(v.number()),
		currentPeriodEnd: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number()
	})
		.index('by_user', ['userId'])
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
