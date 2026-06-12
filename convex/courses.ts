import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';

/**
 * Learner-facing course surface. Authoring lives in courseAuthoring.ts.
 */

export const getPublishedCourse = query({
	args: { languageCode: v.string() },
	handler: async (ctx, args) => {
		await getAuthUserId(ctx);
		const course = await ctx.db
			.query('courses')
			.withIndex('by_language_status', (q) =>
				q.eq('languageCode', args.languageCode).eq('status', 'published')
			)
			.first();
		if (!course) return null;

		const units = await ctx.db
			.query('units')
			.withIndex('by_course_index', (q) => q.eq('courseId', course._id))
			.collect();

		return {
			course: { _id: course._id, title: course.title, languageCode: course.languageCode },
			units: units
				.filter((unit) => unit.status === 'published')
				.sort((a, b) => a.index - b.index)
				.map((unit) => ({
					_id: unit._id,
					index: unit.index,
					title: unit.title,
					handleKeys: unit.handleKeys
				}))
		};
	}
});

export const getUnit = query({
	args: { unitId: v.id('units') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const unit = await ctx.db.get(args.unitId);
		if (!unit || unit.status !== 'published') return null;

		const prompts = await ctx.db
			.query('coursePrompts')
			.withIndex('by_unit_index', (q) => q.eq('unitId', unit._id))
			.collect();

		const handles = await ctx.db
			.query('handles')
			.withIndex('by_course_index', (q) => q.eq('courseId', unit.courseId))
			.collect();
		const handlesByKey = new Map(handles.map((h) => [h.key, h]));

		const progress = await ctx.db
			.query('learnerUnitProgress')
			.withIndex('by_user_unit', (q) => q.eq('userId', userId).eq('unitId', unit._id))
			.unique();

		return {
			unit: {
				_id: unit._id,
				courseId: unit.courseId,
				index: unit.index,
				title: unit.title,
				introBody: unit.introBody,
				handles: unit.handleKeys.map((key) => ({
					key,
					label: handlesByKey.get(key)?.label ?? key,
					gloss: handlesByKey.get(key)?.gloss ?? ''
				}))
			},
			prompts: prompts
				.filter((prompt) => prompt.status === 'approved')
				.sort((a, b) => a.index - b.index)
				.map((prompt) => ({
					_id: prompt._id,
					index: prompt.index,
					english: prompt.english,
					translation: prompt.translation,
					phonetic: prompt.phonetic ?? null,
					morphemeBreakdown: prompt.morphemeBreakdown,
					hasExemplar: !!prompt.exemplarAudioAssetId
				})),
			progress: progress
				? {
						status: progress.status,
						promptCursor: progress.promptCursor,
						introSeen: !!progress.introSeenAt
					}
				: null
		};
	}
});

/** Course map + home hero data: per-unit progress for the published course. */
export const getMyCourseState = query({
	args: { languageCode: v.string() },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const course = await ctx.db
			.query('courses')
			.withIndex('by_language_status', (q) =>
				q.eq('languageCode', args.languageCode).eq('status', 'published')
			)
			.first();
		if (!course) return null;

		const units = (
			await ctx.db
				.query('units')
				.withIndex('by_course_index', (q) => q.eq('courseId', course._id))
				.collect()
		)
			.filter((unit) => unit.status === 'published')
			.sort((a, b) => a.index - b.index);

		const progressRows = await ctx.db
			.query('learnerUnitProgress')
			.withIndex('by_user_course', (q) => q.eq('userId', userId).eq('courseId', course._id))
			.collect();
		const progressByUnit = new Map(progressRows.map((row) => [row.unitId, row]));

		// First unlocked-but-incomplete unit is the "continue" target. Units
		// unlock sequentially: a unit is locked until the previous is completed.
		let continueUnitId = null;
		const unitStates = [];
		let previousCompleted = true;
		for (const unit of units) {
			const progress = progressByUnit.get(unit._id);
			const completed = progress?.status === 'completed';
			const locked = !previousCompleted;
			if (!locked && !completed && continueUnitId === null) {
				continueUnitId = unit._id;
			}
			unitStates.push({
				_id: unit._id,
				index: unit.index,
				title: unit.title,
				handleKeys: unit.handleKeys,
				state: completed
					? ('completed' as const)
					: locked
						? ('locked' as const)
						: ('available' as const),
				promptCursor: progress?.promptCursor ?? 0
			});
			previousCompleted = completed;
		}

		return {
			course: { _id: course._id, title: course.title },
			units: unitStates,
			continueUnitId
		};
	}
});

/** Capability inventory for the home screen: handles owned/introduced. */
export const getMyCapabilities = query({
	args: { languageCode: v.string() },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const course = await ctx.db
			.query('courses')
			.withIndex('by_language_status', (q) =>
				q.eq('languageCode', args.languageCode).eq('status', 'published')
			)
			.first();
		if (!course) return null;

		const handles = await ctx.db
			.query('handles')
			.withIndex('by_course_index', (q) => q.eq('courseId', course._id))
			.collect();
		const states = await ctx.db
			.query('learnerHandleState')
			.withIndex('by_user_course', (q) => q.eq('userId', userId).eq('courseId', course._id))
			.collect();
		const stateByKey = new Map(states.map((s) => [s.handleKey, s]));

		return {
			totalHandles: handles.length,
			ownedCount: states.filter((s) => s.status === 'owned').length,
			introducedCount: states.filter((s) => s.status === 'introduced').length,
			handles: handles
				.sort((a, b) => a.index - b.index)
				.map((handle) => ({
					key: handle.key,
					label: handle.label,
					gloss: handle.gloss,
					status: stateByKey.get(handle.key)?.status ?? null
				}))
		};
	}
});

/**
 * Get-or-create the learner's materialized phrase for a course prompt, so the
 * existing attempts/AI/verifier pipeline runs unchanged. Deliberately skips
 * category inference, notification scheduling, and the translate pipeline —
 * content is copied verbatim from the approved prompt.
 */
export const materializePromptPhrase = mutation({
	args: { coursePromptId: v.id('coursePrompts') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const prompt = await ctx.db.get(args.coursePromptId);
		if (!prompt || prompt.status !== 'approved') {
			throw new Error('Course prompt not available');
		}

		const existing = await ctx.db
			.query('phrases')
			.withIndex('by_user_course_prompt', (q) =>
				q.eq('userId', userId).eq('coursePromptId', args.coursePromptId)
			)
			.unique();
		if (existing) return existing._id;

		const course = await ctx.db.get(prompt.courseId);

		return await ctx.db.insert('phrases', {
			userId,
			english: prompt.english,
			translation: prompt.translation,
			phonetic: prompt.phonetic,
			languageCode: course?.languageCode ?? 'xh-ZA',
			translationStatus: 'ready',
			coursePromptId: args.coursePromptId,
			createdAt: Date.now()
		});
	}
});

/**
 * Exemplar audio URL for an approved prompt. The asset belongs to a verifier,
 * so this resolves storage directly, gated on prompt approval rather than
 * asset ownership.
 */
export const getPromptExemplarUrl = query({
	args: { coursePromptId: v.id('coursePrompts') },
	handler: async (ctx, args) => {
		await getAuthUserId(ctx);
		const prompt = await ctx.db.get(args.coursePromptId);
		if (!prompt || prompt.status !== 'approved' || !prompt.exemplarAudioAssetId) {
			return null;
		}
		const asset = await ctx.db.get(prompt.exemplarAudioAssetId);
		if (!asset) return null;
		return await ctx.storage.getUrl(asset.storageKey);
	}
});

/** Single approved prompt for the notification review runner. */
export const getReviewPrompt = query({
	args: { coursePromptId: v.id('coursePrompts') },
	handler: async (ctx, args) => {
		await getAuthUserId(ctx);
		const prompt = await ctx.db.get(args.coursePromptId);
		if (!prompt || prompt.status !== 'approved') return null;
		return {
			_id: prompt._id,
			english: prompt.english,
			translation: prompt.translation,
			phonetic: prompt.phonetic ?? null,
			morphemeBreakdown: prompt.morphemeBreakdown,
			hasExemplar: !!prompt.exemplarAudioAssetId
		};
	}
});

/** Start (or resume) a unit; records intro seen. */
export const startUnit = mutation({
	args: { unitId: v.id('units'), markIntroSeen: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const unit = await ctx.db.get(args.unitId);
		if (!unit || unit.status !== 'published') {
			throw new Error('Unit not available');
		}

		const now = Date.now();
		const existing = await ctx.db
			.query('learnerUnitProgress')
			.withIndex('by_user_unit', (q) => q.eq('userId', userId).eq('unitId', args.unitId))
			.unique();

		if (existing) {
			if (args.markIntroSeen && !existing.introSeenAt) {
				await ctx.db.patch(existing._id, { introSeenAt: now, updatedAt: now });
			}
			return existing._id;
		}

		return await ctx.db.insert('learnerUnitProgress', {
			userId,
			courseId: unit.courseId,
			unitId: args.unitId,
			status: 'in_progress',
			promptCursor: 0,
			introSeenAt: args.markIntroSeen ? now : undefined,
			updatedAt: now
		});
	}
});

/** Mark a unit completed (runner calls this after the last prompt). */
export const completeUnit = mutation({
	args: { unitId: v.id('units') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const progress = await ctx.db
			.query('learnerUnitProgress')
			.withIndex('by_user_unit', (q) => q.eq('userId', userId).eq('unitId', args.unitId))
			.unique();
		if (!progress) throw new Error('Unit not started');
		if (progress.status === 'completed') return;

		await ctx.db.patch(progress._id, {
			status: 'completed',
			completedAt: Date.now(),
			updatedAt: Date.now()
		});
	}
});
