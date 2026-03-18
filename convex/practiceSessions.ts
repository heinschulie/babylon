import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId } from './lib/auth';

const DEFAULT_PRACTICE_SESSION_LIST_LIMIT = 25;
const MAX_PRACTICE_SESSION_LIST_LIMIT = 100;

function pickLatestAiFeedback(feedbackRows: any[]) {
	return [...feedbackRows].sort((a, b) => {
		if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
		return (b._creationTime ?? 0) - (a._creationTime ?? 0);
	})[0] ?? null;
}

function clampListLimit(limit: number | undefined) {
	if (typeof limit !== 'number' || !Number.isFinite(limit)) {
		return DEFAULT_PRACTICE_SESSION_LIST_LIMIT;
	}
	return Math.max(1, Math.min(MAX_PRACTICE_SESSION_LIST_LIMIT, Math.floor(limit)));
}

function roundOneDecimal(value: number) {
	return Math.round(value * 10) / 10;
}

function buildAvgScoresFromSessionAggregates(session: any) {
	if (
		typeof session.aiScoreCount !== 'number' ||
		typeof session.aiScoreSumSound !== 'number' ||
		typeof session.aiScoreSumRhythm !== 'number' ||
		typeof session.aiScoreSumPhrase !== 'number' ||
		session.aiScoreCount <= 0
	) {
		return null;
	}

	return {
		sound: roundOneDecimal(session.aiScoreSumSound / session.aiScoreCount),
		rhythm: roundOneDecimal(session.aiScoreSumRhythm / session.aiScoreCount),
		phrase: roundOneDecimal(session.aiScoreSumPhrase / session.aiScoreCount)
	};
}

export const start = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		const now = Date.now();
		return await ctx.db.insert('practiceSessions', {
			userId,
			startedAt: now,
			attemptCount: 0,
			phraseCount: 0,
			aiScoreCount: 0,
			aiScoreSumSound: 0,
			aiScoreSumRhythm: 0,
			aiScoreSumPhrase: 0,
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
	args: {
		limit: v.optional(v.number())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const limit = clampListLimit(args.limit);
		const sessions = await ctx.db
			.query('practiceSessions')
			.withIndex('by_user_started', (q) => q.eq('userId', userId))
			.order('desc')
			.take(limit);

		if (sessions.length === 0) {
			return [];
		}

		const sessionsNeedingFallback = sessions.filter(
			(session) =>
				typeof session.attemptCount !== 'number' ||
				typeof session.phraseCount !== 'number' ||
				typeof session.aiScoreCount !== 'number' ||
				typeof session.aiScoreSumSound !== 'number' ||
				typeof session.aiScoreSumRhythm !== 'number' ||
				typeof session.aiScoreSumPhrase !== 'number'
		);

		const attemptsPerSession = await Promise.all(
			sessionsNeedingFallback.map(async (session) => {
				const attempts = await ctx.db
					.query('attempts')
					.withIndex('by_practice_session', (q) => q.eq('practiceSessionId', session._id))
					.collect();
				return [session._id, attempts] as const;
			})
		);
		const attemptsBySessionId = new Map(attemptsPerSession);
		const allAttempts = attemptsPerSession.flatMap(([, attempts]) => attempts);

		const feedbackRowsPerAttempt = await Promise.all(
			allAttempts.map(async (attempt) => {
				const rows = await ctx.db
					.query('aiFeedback')
					.withIndex('by_attempt', (q) => q.eq('attemptId', attempt._id))
					.collect();
				return [attempt._id, pickLatestAiFeedback(rows)] as const;
			})
		);
		const feedbackByAttemptId = new Map(feedbackRowsPerAttempt);

		const enriched = [];
		for (const session of sessions) {
			if (
				typeof session.attemptCount === 'number' &&
				typeof session.phraseCount === 'number' &&
				typeof session.aiScoreCount === 'number' &&
				typeof session.aiScoreSumSound === 'number' &&
				typeof session.aiScoreSumRhythm === 'number' &&
				typeof session.aiScoreSumPhrase === 'number'
			) {
				enriched.push({
					...session,
					attemptCount: session.attemptCount,
					phraseCount: session.phraseCount,
					avgScores: buildAvgScoresFromSessionAggregates(session)
				});
				continue;
			}

			const attempts = attemptsBySessionId.get(session._id) ?? [];
			let totalSound = 0;
			let totalRhythm = 0;
			let totalPhrase = 0;
			let scoredCount = 0;
			for (const attempt of attempts) {
				const feedback = feedbackByAttemptId.get(attempt._id);
				if (
					feedback?.soundAccuracy != null &&
					feedback?.rhythmIntonation != null &&
					feedback?.phraseAccuracy != null
				) {
					totalSound += feedback.soundAccuracy;
					totalRhythm += feedback.rhythmIntonation;
					totalPhrase += feedback.phraseAccuracy;
					scoredCount++;
				}
			}
			const avgScores =
				scoredCount > 0
					? {
							sound: roundOneDecimal(totalSound / scoredCount),
							rhythm: roundOneDecimal(totalRhythm / scoredCount),
							phrase: roundOneDecimal(totalPhrase / scoredCount)
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
			attemptCount:
				typeof session.attemptCount === 'number' ? session.attemptCount : attempts.length,
			phraseCount:
				typeof session.phraseCount === 'number'
					? session.phraseCount
					: new Set(attempts.map((attempt) => attempt.phraseId)).size
		};
	}
});
