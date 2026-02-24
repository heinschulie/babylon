import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId } from './lib/auth';

export const start = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		const now = Date.now();
		return await ctx.db.insert('practiceSessions', {
			userId,
			startedAt: now,
			createdAt: now
		});
	}
});

export const end = mutation({
	args: {
		practiceSessionId: v.id('practiceSessions')
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const practiceSession = await ctx.db.get(args.practiceSessionId);
		if (!practiceSession || practiceSession.userId !== userId) {
			throw new Error('Practice session not found or not authorized');
		}
		if (practiceSession.endedAt) {
			return;
		}
		await ctx.db.patch(args.practiceSessionId, {
			endedAt: Date.now()
		});
		await ctx.scheduler.runAfter(0, internal.notificationsNode.notifyVerifiersNewWork, {
			practiceSessionId: args.practiceSessionId
		});
	}
});

export const list = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		const sessions = await ctx.db
			.query('practiceSessions')
			.withIndex('by_user_started', (q) => q.eq('userId', userId))
			.order('desc')
			.collect();

		const enriched = [];
		for (const session of sessions) {
			const attempts = await ctx.db
				.query('attempts')
				.withIndex('by_practice_session', (q) => q.eq('practiceSessionId', session._id))
				.collect();

			let totalSound = 0,
				totalRhythm = 0,
				totalPhrase = 0,
				scoredCount = 0;
			for (const attempt of attempts) {
				const feedback = await ctx.db
					.query('aiFeedback')
					.withIndex('by_attempt', (q) => q.eq('attemptId', attempt._id))
					.unique();
				if (feedback?.soundAccuracy != null) {
					totalSound += feedback.soundAccuracy;
					totalRhythm += feedback.rhythmIntonation!;
					totalPhrase += feedback.phraseAccuracy!;
					scoredCount++;
				}
			}
			const avgScores =
				scoredCount > 0
					? {
							sound: Math.round((totalSound / scoredCount) * 10) / 10,
							rhythm: Math.round((totalRhythm / scoredCount) * 10) / 10,
							phrase: Math.round((totalPhrase / scoredCount) * 10) / 10
						}
					: null;

			enriched.push({
				...session,
				attemptCount: attempts.length,
				phraseCount: new Set(attempts.map((attempt) => attempt.phraseId)).size,
				avgScores
			});
		}

		return enriched;
	}
});

export const getStreak = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		const prefs = await ctx.db
			.query('userPreferences')
			.withIndex('by_user', (q) => q.eq('userId', userId))
			.unique();
		const tz = prefs?.timeZone ?? 'Africa/Johannesburg';

		const sessions = await ctx.db
			.query('practiceSessions')
			.withIndex('by_user_started', (q) => q.eq('userId', userId))
			.order('desc')
			.collect();

		const endedSessions = sessions.filter((s) => s.endedAt);
		if (endedSessions.length === 0) return { streak: 0 };

		const practiceDays = new Set<string>();
		for (const session of endedSessions) {
			const dateKey = new Date(session.endedAt!).toLocaleDateString('en-CA', { timeZone: tz });
			practiceDays.add(dateKey);
		}

		const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
		let streak = 0;
		let checkDate = new Date(today + 'T12:00:00');

		if (!practiceDays.has(today)) {
			checkDate.setDate(checkDate.getDate() - 1);
		}

		while (true) {
			const key = checkDate.toLocaleDateString('en-CA', { timeZone: tz });
			if (practiceDays.has(key)) {
				streak++;
				checkDate.setDate(checkDate.getDate() - 1);
			} else {
				break;
			}
		}

		return { streak };
	}
});

export const get = query({
	args: {
		practiceSessionId: v.id('practiceSessions')
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const session = await ctx.db.get(args.practiceSessionId);
		if (!session || session.userId !== userId) {
			return null;
		}

		const attempts = await ctx.db
			.query('attempts')
			.withIndex('by_practice_session', (q) => q.eq('practiceSessionId', session._id))
			.collect();

		return {
			...session,
			attemptCount: attempts.length,
			phraseCount: new Set(attempts.map((attempt) => attempt.phraseId)).size
		};
	}
});

