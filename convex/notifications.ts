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
 * Daily cron: reschedule spaced-repetition notifications for all push-enabled users.
 * Picks the N least-recently-practiced phrases per user.
 *
 * Processes users in pages and self-schedules the next page, so a large user
 * base can't blow the mutation limits of a single invocation.
 */
const RESCHEDULE_PAGE_SIZE = 25;

type LearnerHandleStateDoc = {
	courseId: import('./_generated/dataModel').Id<'courses'>;
	handleKey: string;
};

/**
 * Pick an approved construction prompt exercising a due handle, preferring
 * prompts the learner hasn't attempted recently (novel recombination over
 * re-testing the same sentence).
 */
async function pickConstructionPrompt(
	ctx: { db: import('./_generated/server').MutationCtx['db'] },
	userId: string,
	handleState: LearnerHandleStateDoc,
	excludeIds: Set<string>
) {
	const candidates = await ctx.db
		.query('coursePrompts')
		.withIndex('by_handle_status', (q) =>
			q.eq('primaryHandleKey', handleState.handleKey).eq('status', 'approved')
		)
		.collect();

	const scored = [];
	for (const prompt of candidates) {
		if (prompt.courseId !== handleState.courseId) continue;
		if (excludeIds.has(prompt._id)) continue;
		const materialized = await ctx.db
			.query('phrases')
			.withIndex('by_user_course_prompt', (q) =>
				q.eq('userId', userId).eq('coursePromptId', prompt._id)
			)
			.unique();
		let lastAttemptAt = 0;
		if (materialized) {
			const latestAttempt = await ctx.db
				.query('attempts')
				.withIndex('by_phrase', (q) => q.eq('phraseId', materialized._id))
				.order('desc')
				.first();
			lastAttemptAt = latestAttempt?._creationTime ?? 0;
		}
		scored.push({ prompt, lastAttemptAt });
	}

	// Never-attempted first, then least recent.
	scored.sort((a, b) => a.lastAttemptAt - b.lastAttemptAt);
	return scored[0]?.prompt ?? null;
}

export const rescheduleDaily = internalMutation({
	args: { cursor: v.optional(v.string()) },
	handler: async (ctx, args) => {
		const page = await ctx.db
			.query('userPreferences')
			.paginate({ cursor: args.cursor ?? null, numItems: RESCHEDULE_PAGE_SIZE });

		for (const prefs of page.page) {
			if (!prefs.pushSubscription) continue;
			// Clean up old unsent notifications (scheduled >24h ago, never sent)
			const oldNotifications = await ctx.db
				.query('scheduledNotifications')
				.withIndex('by_user_scheduled', (q) => q.eq('userId', prefs.userId))
				.collect();

			const cutoff = Date.now() - 24 * 60 * 60 * 1000;
			for (const notif of oldNotifications) {
				if (!notif.sent && notif.scheduledFor < cutoff) {
					await ctx.db.delete(notif._id);
				}
			}

			const quietStartHour = prefs.quietHoursStart ?? 22;
			const quietEndHour = prefs.quietHoursEnd ?? 8;
			const notificationBudget = prefs.notificationsPerPhrase ?? 3;

			// Handle-based construction prompts take priority: due handles get a
			// novel construction prompt instead of a memory test.
			const dueHandles = await ctx.db
				.query('learnerHandleState')
				.withIndex('by_user_due', (q) =>
					q.eq('userId', prefs.userId).lte('nextDueAt', Date.now())
				)
				.take(notificationBudget);

			let scheduledCount = 0;
			const usedPromptIds = new Set<string>();
			for (const handleState of dueHandles) {
				const prompt = await pickConstructionPrompt(ctx, prefs.userId, handleState, usedPromptIds);
				if (!prompt) continue;
				usedPromptIds.add(prompt._id);

				const times = generateRandomTimes(1, quietStartHour, quietEndHour);
				for (const scheduledFor of times) {
					const notificationId = await ctx.db.insert('scheduledNotifications', {
						coursePromptId: prompt._id,
						userId: prefs.userId,
						scheduledFor,
						sent: false
					});
					await ctx.scheduler.runAt(scheduledFor, internal.notificationsNode.send, {
						notificationId
					});
					scheduledCount++;
				}
			}

			// Legacy phrase-recall branch only for learners with no course activity,
			// and never for materialized course phrases.
			if (scheduledCount > 0) continue;

			const phrases = (
				await ctx.db
					.query('phrases')
					.withIndex('by_user', (q) => q.eq('userId', prefs.userId))
					.collect()
			).filter((phrase) => phrase.coursePromptId === undefined);

			if (phrases.length === 0) continue;

			// Score each phrase by recency of last attempt (never-attempted = highest priority)
			const phraseScores: Array<{ phraseId: (typeof phrases)[0]['_id']; lastAttemptAt: number }> = [];
			for (const phrase of phrases) {
				const latestAttempt = await ctx.db
					.query('attempts')
					.withIndex('by_phrase', (q) => q.eq('phraseId', phrase._id))
					.order('desc')
					.first();
				phraseScores.push({
					phraseId: phrase._id,
					lastAttemptAt: latestAttempt?._creationTime ?? 0
				});
			}

			// Sort: oldest/never-attempted first
			phraseScores.sort((a, b) => a.lastAttemptAt - b.lastAttemptAt);

			// Pick top N phrases to remind about (1 notification each)
			const phrasesToRemind = phraseScores.slice(0, notificationBudget);

			for (const { phraseId } of phrasesToRemind) {
				const times = generateRandomTimes(1, quietStartHour, quietEndHour);
				for (const scheduledFor of times) {
					const notificationId = await ctx.db.insert('scheduledNotifications', {
						phraseId,
						userId: prefs.userId,
						scheduledFor,
						sent: false
					});
					await ctx.scheduler.runAt(scheduledFor, internal.notificationsNode.send, {
						notificationId
					});
				}
			}
		}

		if (!page.isDone) {
			await ctx.scheduler.runAfter(0, internal.notifications.rescheduleDaily, {
				cursor: page.continueCursor
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
 * Get a course prompt by ID (internal query for handle-based notifications).
 */
export const getCoursePromptById = internalQuery({
	args: { coursePromptId: v.id('coursePrompts') },
	handler: async (ctx, { coursePromptId }) => {
		return ctx.db.get(coursePromptId);
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
 * Get session review info: count of pending/claimed humanReviewRequests and their languages.
 */
export const getSessionReviewInfo = internalQuery({
	args: { practiceSessionId: v.id('practiceSessions') },
	handler: async (ctx, { practiceSessionId }) => {
		const attempts = await ctx.db
			.query('attempts')
			.withIndex('by_practice_session', (q) => q.eq('practiceSessionId', practiceSessionId))
			.collect();

		const requests = [];
		for (const attempt of attempts) {
			const req = await ctx.db
				.query('humanReviewRequests')
				.withIndex('by_attempt', (q) => q.eq('attemptId', attempt._id))
				.unique();
			if (req && (req.status === 'pending' || req.status === 'claimed')) {
				requests.push(req);
			}
		}

		const languages = [...new Set(requests.map((r) => r.languageCode))];
		return { count: requests.length, languages };
	}
});

/**
 * Get push-enabled verifier userIds for a given language.
 */
export const getVerifierPushSubscriptions = internalQuery({
	args: { languageCode: v.string() },
	handler: async (ctx, { languageCode }) => {
		const memberships = await ctx.db
			.query('verifierLanguageMemberships')
			.withIndex('by_language_active', (q) => q.eq('languageCode', languageCode).eq('active', true))
			.collect();

		const verifierUserIds: string[] = [];
		for (const mem of memberships) {
			const profile = await ctx.db
				.query('verifierProfiles')
				.withIndex('by_user', (q) => q.eq('userId', mem.userId))
				.unique();
			if (!profile?.active) continue;

			const prefs = await ctx.db
				.query('userPreferences')
				.withIndex('by_user', (q) => q.eq('userId', mem.userId))
				.unique();
			if (prefs?.pushSubscription) {
				verifierUserIds.push(mem.userId);
			}
		}
		return verifierUserIds;
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
