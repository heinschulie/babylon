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
		createdAt: v.number()
	})
		.index('by_session', ['sessionId'])
		.index('by_user', ['userId']),

	// User notification preferences
	userPreferences: defineTable({
		userId: v.string(),
		quietHoursStart: v.number(), // 0-23 hour
		quietHoursEnd: v.number(), // 0-23 hour
		notificationsPerPhrase: v.number(),
		pushSubscription: v.optional(v.string()) // JSON stringified PushSubscription
	}).index('by_user', ['userId']),

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
