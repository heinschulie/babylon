import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId } from './lib/auth';

/**
 * Generate random notification times within allowed hours, respecting quiet hours.
 * Returns timestamps for the next 24 hours.
 */
export function generateRandomTimes(count: number, quietStart: number, quietEnd: number): number[] {
	const times: number[] = [];
	const now = Date.now();
	const oneDayMs = 24 * 60 * 60 * 1000;
	const endTime = now + oneDayMs;

	// Generate available hours (outside quiet hours)
	const availableHours: number[] = [];
	for (let h = 0; h < 24; h++) {
		// If quiet hours wrap around midnight (e.g., 22-8)
		if (quietStart > quietEnd) {
			if (h >= quietEnd && h < quietStart) {
				availableHours.push(h);
			}
		} else {
			// Normal case (e.g., 0-6)
			if (h < quietStart || h >= quietEnd) {
				availableHours.push(h);
			}
		}
	}

	if (availableHours.length === 0) {
		return times;
	}

	// Generate random times
	for (let i = 0; i < count && times.length < count; i++) {
		const hour = availableHours[Math.floor(Math.random() * availableHours.length)];
		const minute = Math.floor(Math.random() * 60);

		const date = new Date(now);
		date.setHours(hour, minute, 0, 0);

		// If time is in the past, move to tomorrow
		let timestamp = date.getTime();
		if (timestamp <= now) {
			timestamp += oneDayMs;
		}

		// Only add if within our window
		if (timestamp <= endTime) {
			times.push(timestamp);
		}
	}

	return times.sort((a, b) => a - b);
}

/**
 * Schedule notifications for a phrase. Called when a phrase is created.
 */
export const scheduleForPhrase = internalMutation({
	args: {
		phraseId: v.id('phrases'),
		userId: v.string()
	},
	handler: async (ctx, { phraseId, userId }) => {
		// Get user preferences
		const prefs = await ctx.db
			.query('userPreferences')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();

		const quietStart = prefs?.quietHoursStart ?? 22;
		const quietEnd = prefs?.quietHoursEnd ?? 8;
		const count = prefs?.notificationsPerPhrase ?? 3;

		// Generate random times
		const times = generateRandomTimes(count, quietStart, quietEnd);

		// Schedule notifications
		for (const scheduledFor of times) {
			// Insert scheduled notification record
			const notificationId = await ctx.db.insert('scheduledNotifications', {
				phraseId,
				userId,
				scheduledFor,
				sent: false
			});

			// Schedule the action to send the notification (runs in Node.js runtime)
			await ctx.scheduler.runAt(scheduledFor, internal.notificationsNode.send, {
				notificationId
			});
		}
	}
});

/**
 * Get a phrase by ID (internal query for notifications).
 */
export const getPhraseById = internalQuery({
	args: { phraseId: v.id('phrases') },
	handler: async (ctx, { phraseId }) => {
		return ctx.db.get(phraseId);
	}
});

/**
 * Get user preferences by userId (internal query for notifications).
 */
export const getPreferencesByUserId = internalQuery({
	args: { userId: v.string() },
	handler: async (ctx, { userId }) => {
		return ctx.db
			.query('userPreferences')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();
	}
});

/**
 * Get notification by ID (internal).
 */
export const getNotificationById = internalQuery({
	args: { notificationId: v.id('scheduledNotifications') },
	handler: async (ctx, { notificationId }) => {
		return ctx.db.get(notificationId);
	}
});

/**
 * Mark a notification as sent.
 */
export const markSent = internalMutation({
	args: { notificationId: v.id('scheduledNotifications') },
	handler: async (ctx, { notificationId }) => {
		await ctx.db.patch(notificationId, { sent: true });
	}
});

/**
 * Get current authenticated user ID. Used by actions that need auth.
 */
export const getCurrentUserId = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await getAuthUserId(ctx);
	}
});
