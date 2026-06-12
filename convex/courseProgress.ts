import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

// Graded-interval ladder (days). strength indexes into this; clean
// constructions climb, failures fall back one rung.
const INTERVAL_LADDER_DAYS = [1, 3, 7, 14, 30];
const DAY_MS = 24 * 60 * 60 * 1000;
const OWNED_AFTER_CLEAN_STREAK = 2;

/**
 * Applies one construction result to the learner's handle states and unit
 * cursor. Runs server-side from the AI pipeline (never client-driven — the
 * spacing engine must not be gameable and must work for backgrounded tabs).
 */
export const applyConstructionResult = internalMutation({
	args: { attemptId: v.id('attempts') },
	handler: async (ctx, { attemptId }) => {
		const attempt = await ctx.db.get(attemptId);
		if (!attempt) return;

		const phrase = await ctx.db.get(attempt.phraseId);
		if (!phrase?.coursePromptId) return; // free practice — nothing to do

		const prompt = await ctx.db.get(phrase.coursePromptId);
		if (!prompt) return;

		const feedbackRows = await ctx.db
			.query('aiFeedback')
			.withIndex('by_attempt', (q) => q.eq('attemptId', attemptId))
			.collect();
		const feedback = feedbackRows.sort((a, b) => b.createdAt - a.createdAt)[0];
		if (!feedback || typeof feedback.phraseAccuracy !== 'number') return;

		const clean =
			feedback.phraseAccuracy >= 3 && (feedback.constructionErrors?.length ?? 0) === 0;
		const now = Date.now();

		for (const handleKey of prompt.usesHandles) {
			const existing = await ctx.db
				.query('learnerHandleState')
				.withIndex('by_user_handle', (q) =>
					q
						.eq('userId', attempt.userId)
						.eq('courseId', prompt.courseId)
						.eq('handleKey', handleKey)
				)
				.unique();

			if (!existing) {
				await ctx.db.insert('learnerHandleState', {
					userId: attempt.userId,
					courseId: prompt.courseId,
					handleKey,
					status: 'introduced',
					strength: clean ? 1 : 0,
					cleanStreak: clean ? 1 : 0,
					lastConstructedAt: now,
					nextDueAt: now + INTERVAL_LADDER_DAYS[clean ? 1 : 0] * DAY_MS,
					updatedAt: now
				});
				continue;
			}

			const strength = clean
				? Math.min(existing.strength + 1, INTERVAL_LADDER_DAYS.length - 1)
				: Math.max(existing.strength - 1, 0);
			const cleanStreak = clean ? existing.cleanStreak + 1 : 0;

			await ctx.db.patch(existing._id, {
				strength,
				cleanStreak,
				status: cleanStreak >= OWNED_AFTER_CLEAN_STREAK ? 'owned' : existing.status,
				lastConstructedAt: now,
				nextDueAt: now + INTERVAL_LADDER_DAYS[strength] * DAY_MS,
				updatedAt: now
			});
		}

		// Advance the unit cursor past this prompt (lesson runner reads this to
		// resume; review-runner attempts on completed units are a no-op here).
		const progress = await ctx.db
			.query('learnerUnitProgress')
			.withIndex('by_user_unit', (q) =>
				q.eq('userId', attempt.userId).eq('unitId', prompt.unitId)
			)
			.unique();
		if (progress && progress.status === 'in_progress') {
			const nextCursor = Math.max(progress.promptCursor, prompt.index + 1);
			if (nextCursor !== progress.promptCursor) {
				await ctx.db.patch(progress._id, { promptCursor: nextCursor, updatedAt: now });
			}
		}
	}
});
