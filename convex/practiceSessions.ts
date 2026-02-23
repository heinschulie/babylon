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

			enriched.push({
				...session,
				attemptCount: attempts.length,
				phraseCount: new Set(attempts.map((attempt) => attempt.phraseId)).size
			});
		}

		return enriched;
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

