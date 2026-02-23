'use node';

import { v } from 'convex/values';
import { internalAction, action } from './_generated/server';
import { internal } from './_generated/api';
import * as webpush from 'web-push';

/**
 * Send a push notification. Runs in Node.js runtime.
 */
export const send = internalAction({
	args: {
		notificationId: v.id('scheduledNotifications')
	},
	handler: async (ctx, { notificationId }) => {
		// Get the notification record
		const notification = await ctx.runQuery(internal.notifications.getNotificationById, {
			notificationId
		});

		if (!notification || notification.sent) {
			return;
		}

		// Get the phrase
		const phrase = await ctx.runQuery(internal.notifications.getPhraseById, {
			phraseId: notification.phraseId
		});

		if (!phrase) {
			return;
		}

		// Get user's push subscription
		const prefs = await ctx.runQuery(internal.notifications.getPreferencesByUserId, {
			userId: notification.userId
		});

		if (!prefs?.pushSubscription) {
			return;
		}

		try {
			const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
			const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
			const siteUrl = process.env.SITE_URL || 'http://localhost:5173';

			if (!vapidPublicKey || !vapidPrivateKey) {
				console.error('VAPID keys not configured');
				return;
			}

			webpush.setVapidDetails(
				`mailto:noreply@${new URL(siteUrl).hostname}`,
				vapidPublicKey,
				vapidPrivateKey
			);

			const payload = JSON.stringify({
				title: 'Time to Recall!',
				body: phrase.english,
				url: `/practice?phrase=${phrase._id}`,
				tag: `phrase-${phrase._id}`
			});

			await webpush.sendNotification(JSON.parse(prefs.pushSubscription), payload);

			// Mark as sent
			await ctx.runMutation(internal.notifications.markSent, { notificationId });
		} catch (error) {
			console.error('Failed to send notification:', error);
		}
	}
});

/**
 * Notify all push-enabled verifiers when a learner ends a session with pending reviews.
 */
export const notifyVerifiersNewWork = internalAction({
	args: { practiceSessionId: v.id('practiceSessions') },
	handler: async (ctx, { practiceSessionId }) => {
		const info = await ctx.runQuery(internal.notifications.getSessionReviewInfo, {
			practiceSessionId
		});
		if (info.count === 0) return;

		for (const languageCode of info.languages) {
			const verifierUserIds = await ctx.runQuery(
				internal.notifications.getVerifierPushSubscriptions,
				{ languageCode }
			);

			for (const userId of verifierUserIds) {
				await ctx.runAction(internal.notificationsNode.sendPushToUser, {
					userId,
					title: 'New work available',
					body: `${info.count} new recording${info.count > 1 ? 's' : ''} to review`,
					url: '/work',
					tag: `new-work-${practiceSessionId}`
				});
			}
		}
	}
});

/**
 * Send a push notification to a user by userId. Generic action for event-driven notifications.
 */
export const sendPushToUser = internalAction({
	args: {
		userId: v.string(),
		title: v.string(),
		body: v.string(),
		url: v.string(),
		tag: v.string()
	},
	handler: async (ctx, { userId, title, body, url, tag }) => {
		const prefs = await ctx.runQuery(internal.notifications.getPreferencesByUserId, { userId });
		if (!prefs?.pushSubscription) return;

		const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
		const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
		const siteUrl = process.env.SITE_URL || 'http://localhost:5173';

		if (!vapidPublicKey || !vapidPrivateKey) {
			console.error('VAPID keys not configured');
			return;
		}

		webpush.setVapidDetails(
			`mailto:noreply@${new URL(siteUrl).hostname}`,
			vapidPublicKey,
			vapidPrivateKey
		);

		const payload = JSON.stringify({ title, body, url, tag });

		try {
			await webpush.sendNotification(JSON.parse(prefs.pushSubscription), payload);
		} catch (error) {
			console.error(`Failed to send push to user ${userId}:`, error);
		}
	}
});

/**
 * Send a test push notification. Runs in Node.js runtime.
 */
export const sendTest = action({
	args: {},
	handler: async (ctx) => {
		const userId = await ctx.runQuery(internal.notifications.getCurrentUserId, {});

		// Get user's push subscription
		const prefs = await ctx.runQuery(internal.notifications.getPreferencesByUserId, {
			userId
		});

		if (!prefs?.pushSubscription) {
			throw new Error('Push notifications not enabled. Please enable notifications first.');
		}

		try {
			const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
			const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
			const siteUrl = process.env.SITE_URL || 'http://localhost:5173';

			if (!vapidPublicKey || !vapidPrivateKey) {
				throw new Error('VAPID keys not configured on server');
			}

			webpush.setVapidDetails(
				`mailto:noreply@${new URL(siteUrl).hostname}`,
				vapidPublicKey,
				vapidPrivateKey
			);

			const payload = JSON.stringify({
				title: 'Test Notification',
				body: 'Push notifications are working!',
				url: '/settings',
				tag: 'test-notification'
			});

			await webpush.sendNotification(JSON.parse(prefs.pushSubscription), payload);

			return { success: true };
		} catch (error) {
			console.error('Failed to send test notification:', error);
			throw new Error(
				`Failed to send notification: ${error instanceof Error ? error.message : 'Unknown error'}`
			);
		}
	}
});
