import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';
import { assertAdmin } from './lib/admin';
import { assertVerifierLanguageAccess } from './lib/humanReviews/queue';
import { requireSupportedLanguage } from './lib/languages';

/**
 * Admin-gated curriculum authoring. Approved prompts are immutable: edits go
 * through clonePromptForEdit, which creates a fresh draft.
 */

const morphemeBreakdownValidator = v.array(
	v.object({ morpheme: v.string(), gloss: v.string(), role: v.string() })
);

export const listCourses = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		await assertAdmin(ctx, userId);
		const courses = await ctx.db.query('courses').collect();
		const result = [];
		for (const course of courses) {
			const units = await ctx.db
				.query('units')
				.withIndex('by_course_index', (q) => q.eq('courseId', course._id))
				.collect();
			result.push({
				_id: course._id,
				languageCode: course.languageCode,
				title: course.title,
				status: course.status,
				unitCount: units.length,
				publishedUnitCount: units.filter((u) => u.status === 'published').length
			});
		}
		return result;
	}
});

export const createCourse = mutation({
	args: { languageCode: v.string(), title: v.string() },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		await assertAdmin(ctx, userId);
		const language = requireSupportedLanguage(args.languageCode);

		return await ctx.db.insert('courses', {
			languageCode: language.bcp47,
			title: args.title.trim(),
			status: 'draft',
			version: 1,
			createdAt: Date.now()
		});
	}
});

export const publishCourse = mutation({
	args: { courseId: v.id('courses') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		await assertAdmin(ctx, userId);
		const course = await ctx.db.get(args.courseId);
		if (!course) throw new Error('Course not found');

		const units = await ctx.db
			.query('units')
			.withIndex('by_course_index', (q) => q.eq('courseId', args.courseId))
			.collect();
		if (!units.some((u) => u.status === 'published')) {
			throw new Error('Publish at least one unit first');
		}

		// Single published course per language: demote any other.
		const currentPublished = await ctx.db
			.query('courses')
			.withIndex('by_language_status', (q) =>
				q.eq('languageCode', course.languageCode).eq('status', 'published')
			)
			.collect();
		for (const other of currentPublished) {
			if (other._id !== course._id) {
				await ctx.db.patch(other._id, { status: 'draft' });
			}
		}

		await ctx.db.patch(args.courseId, { status: 'published' });
	}
});

export const getCourseForEditing = query({
	args: { courseId: v.id('courses') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		await assertAdmin(ctx, userId);
		const course = await ctx.db.get(args.courseId);
		if (!course) return null;

		const units = await ctx.db
			.query('units')
			.withIndex('by_course_index', (q) => q.eq('courseId', args.courseId))
			.collect();
		const handles = await ctx.db
			.query('handles')
			.withIndex('by_course_index', (q) => q.eq('courseId', args.courseId))
			.collect();

		const unitSummaries = [];
		for (const unit of units.sort((a, b) => a.index - b.index)) {
			const prompts = await ctx.db
				.query('coursePrompts')
				.withIndex('by_unit_index', (q) => q.eq('unitId', unit._id))
				.collect();
			unitSummaries.push({
				_id: unit._id,
				index: unit.index,
				title: unit.title,
				status: unit.status,
				handleKeys: unit.handleKeys,
				promptCount: prompts.filter((p) => p.status !== 'retired').length,
				approvedCount: prompts.filter((p) => p.status === 'approved').length
			});
		}

		return {
			course: {
				_id: course._id,
				languageCode: course.languageCode,
				title: course.title,
				status: course.status
			},
			units: unitSummaries,
			handles: handles
				.sort((a, b) => a.index - b.index)
				.map((h) => ({ key: h.key, label: h.label, gloss: h.gloss }))
		};
	}
});

export const getUnitForEditing = query({
	args: { unitId: v.id('units') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		await assertAdmin(ctx, userId);
		const unit = await ctx.db.get(args.unitId);
		if (!unit) return null;

		const prompts = await ctx.db
			.query('coursePrompts')
			.withIndex('by_unit_index', (q) => q.eq('unitId', args.unitId))
			.collect();
		const handles = await ctx.db
			.query('handles')
			.withIndex('by_course_index', (q) => q.eq('courseId', unit.courseId))
			.collect();

		return {
			unit: {
				_id: unit._id,
				courseId: unit.courseId,
				index: unit.index,
				title: unit.title,
				introBody: unit.introBody,
				handleKeys: unit.handleKeys,
				status: unit.status
			},
			prompts: prompts
				.filter((p) => p.status !== 'retired')
				.sort((a, b) => a.index - b.index)
				.map((p) => ({
					_id: p._id,
					index: p.index,
					english: p.english,
					translation: p.translation,
					phonetic: p.phonetic ?? null,
					morphemeBreakdown: p.morphemeBreakdown,
					usesHandles: p.usesHandles,
					primaryHandleKey: p.primaryHandleKey,
					status: p.status,
					hasExemplar: !!p.exemplarAudioAssetId
				})),
			handles: handles
				.sort((a, b) => a.index - b.index)
				.map((h) => ({ key: h.key, label: h.label, gloss: h.gloss }))
		};
	}
});

export const updateUnit = mutation({
	args: {
		unitId: v.id('units'),
		title: v.optional(v.string()),
		introBody: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		await assertAdmin(ctx, userId);
		const unit = await ctx.db.get(args.unitId);
		if (!unit) throw new Error('Unit not found');

		await ctx.db.patch(args.unitId, {
			...(args.title !== undefined && { title: args.title.trim() }),
			...(args.introBody !== undefined && { introBody: args.introBody }),
			updatedAt: Date.now()
		});
	}
});

export const publishUnit = mutation({
	args: { unitId: v.id('units') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		await assertAdmin(ctx, userId);
		const unit = await ctx.db.get(args.unitId);
		if (!unit) throw new Error('Unit not found');

		const prompts = await ctx.db
			.query('coursePrompts')
			.withIndex('by_unit_index', (q) => q.eq('unitId', args.unitId))
			.collect();
		if (!prompts.some((p) => p.status === 'approved')) {
			throw new Error('Approve at least one prompt first');
		}

		await ctx.db.patch(args.unitId, { status: 'published', updatedAt: Date.now() });
	}
});

export const updatePrompt = mutation({
	args: {
		promptId: v.id('coursePrompts'),
		english: v.optional(v.string()),
		translation: v.optional(v.string()),
		phonetic: v.optional(v.string()),
		morphemeBreakdown: v.optional(morphemeBreakdownValidator),
		usesHandles: v.optional(v.array(v.string())),
		primaryHandleKey: v.optional(v.string())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		await assertAdmin(ctx, userId);
		const prompt = await ctx.db.get(args.promptId);
		if (!prompt) throw new Error('Prompt not found');
		if (prompt.status !== 'draft') {
			throw new Error('Approved prompts are immutable — clone to edit');
		}

		const { promptId, ...fields } = args;
		const updates = Object.fromEntries(
			Object.entries(fields).filter(([, value]) => value !== undefined)
		);
		await ctx.db.patch(promptId, { ...updates, updatedAt: Date.now() });
	}
});

export const approvePrompt = mutation({
	args: { promptId: v.id('coursePrompts') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		await assertAdmin(ctx, userId);
		const prompt = await ctx.db.get(args.promptId);
		if (!prompt) throw new Error('Prompt not found');
		if (prompt.status === 'approved') return;
		if (!prompt.usesHandles.includes(prompt.primaryHandleKey)) {
			throw new Error('primaryHandleKey must be one of usesHandles');
		}
		await ctx.db.patch(args.promptId, { status: 'approved', updatedAt: Date.now() });
	}
});

export const retirePrompt = mutation({
	args: { promptId: v.id('coursePrompts') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		await assertAdmin(ctx, userId);
		const prompt = await ctx.db.get(args.promptId);
		if (!prompt) throw new Error('Prompt not found');
		await ctx.db.patch(args.promptId, { status: 'retired', updatedAt: Date.now() });
	}
});

export const clonePromptForEdit = mutation({
	args: { promptId: v.id('coursePrompts') },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		await assertAdmin(ctx, userId);
		const prompt = await ctx.db.get(args.promptId);
		if (!prompt) throw new Error('Prompt not found');

		const siblings = await ctx.db
			.query('coursePrompts')
			.withIndex('by_unit_index', (q) => q.eq('unitId', prompt.unitId))
			.collect();
		const nextIndex = Math.max(...siblings.map((p) => p.index)) + 1;
		const now = Date.now();

		return await ctx.db.insert('coursePrompts', {
			courseId: prompt.courseId,
			unitId: prompt.unitId,
			index: nextIndex,
			english: prompt.english,
			translation: prompt.translation,
			phonetic: prompt.phonetic,
			morphemeBreakdown: prompt.morphemeBreakdown,
			usesHandles: prompt.usesHandles,
			primaryHandleKey: prompt.primaryHandleKey,
			status: 'draft',
			createdAt: now,
			updatedAt: now
		});
	}
});

/**
 * Verifier-facing: attach exemplar audio to an approved prompt. Gated on the
 * verifier's language access (admins qualify implicitly by also being able to
 * use the admin UI; recording happens in the verifier app).
 */
export const setPromptExemplar = mutation({
	args: {
		coursePromptId: v.id('coursePrompts'),
		audioAssetId: v.id('audioAssets')
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const prompt = await ctx.db.get(args.coursePromptId);
		if (!prompt || prompt.status !== 'approved') {
			throw new Error('Prompt not available');
		}
		const course = await ctx.db.get(prompt.courseId);
		if (!course) throw new Error('Course not found');
		await assertVerifierLanguageAccess(ctx, userId, course.languageCode);

		const asset = await ctx.db.get(args.audioAssetId);
		if (!asset || asset.userId !== userId) {
			throw new Error('Audio asset not found or not yours');
		}

		await ctx.db.patch(args.coursePromptId, {
			exemplarAudioAssetId: args.audioAssetId,
			updatedAt: Date.now()
		});
	}
});

/** Approved prompts missing exemplar audio for a verifier's language. */
export const listPromptsNeedingExemplar = query({
	args: { languageCode: v.string() },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const language = requireSupportedLanguage(args.languageCode);
		await assertVerifierLanguageAccess(ctx, userId, language.bcp47);

		const course = await ctx.db
			.query('courses')
			.withIndex('by_language_status', (q) =>
				q.eq('languageCode', language.bcp47).eq('status', 'published')
			)
			.first();
		if (!course) return [];

		const prompts = await ctx.db
			.query('coursePrompts')
			.withIndex('by_course_status', (q) => q.eq('courseId', course._id).eq('status', 'approved'))
			.collect();

		return prompts
			.filter((p) => !p.exemplarAudioAssetId)
			.sort((a, b) => a.index - b.index)
			.map((p) => ({
				_id: p._id,
				english: p.english,
				translation: p.translation,
				phonetic: p.phonetic ?? null
			}));
	}
});

// ——— Internal: used by the AI drafting action ———

export const getDraftingContext = internalQuery({
	args: { courseId: v.id('courses') },
	handler: async (ctx, args) => {
		const course = await ctx.db.get(args.courseId);
		if (!course) throw new Error('Course not found');

		const handles = await ctx.db
			.query('handles')
			.withIndex('by_course_index', (q) => q.eq('courseId', args.courseId))
			.collect();
		const units = await ctx.db
			.query('units')
			.withIndex('by_course_index', (q) => q.eq('courseId', args.courseId))
			.collect();

		return {
			languageCode: course.languageCode,
			handles: handles
				.sort((a, b) => a.index - b.index)
				.map((h) => ({ key: h.key, label: h.label, gloss: h.gloss })),
			units: units
				.sort((a, b) => a.index - b.index)
				.map((u) => ({ index: u.index, title: u.title, handleKeys: u.handleKeys })),
			nextUnitIndex: units.length === 0 ? 1 : Math.max(...units.map((u) => u.index)) + 1
		};
	}
});

export const insertDraftUnit = internalMutation({
	args: {
		courseId: v.id('courses'),
		title: v.string(),
		introBody: v.string(),
		newHandles: v.array(v.object({ key: v.string(), label: v.string(), gloss: v.string() })),
		prompts: v.array(
			v.object({
				english: v.string(),
				translation: v.string(),
				phonetic: v.optional(v.string()),
				morphemeBreakdown: morphemeBreakdownValidator,
				usesHandles: v.array(v.string()),
				primaryHandleKey: v.string()
			})
		)
	},
	handler: async (ctx, args) => {
		const course = await ctx.db.get(args.courseId);
		if (!course) throw new Error('Course not found');

		const existingHandles = await ctx.db
			.query('handles')
			.withIndex('by_course_index', (q) => q.eq('courseId', args.courseId))
			.collect();
		const existingKeys = new Set(existingHandles.map((h) => h.key));
		const newKeys = new Set(args.newHandles.map((h) => h.key));
		for (const key of newKeys) {
			if (existingKeys.has(key)) {
				throw new Error(`Handle key already exists: ${key}`);
			}
		}
		const validKeys = new Set([...existingKeys, ...newKeys]);
		for (const prompt of args.prompts) {
			for (const key of prompt.usesHandles) {
				if (!validKeys.has(key)) throw new Error(`Unknown handle key in prompt: ${key}`);
			}
			if (!prompt.usesHandles.includes(prompt.primaryHandleKey)) {
				throw new Error('primaryHandleKey must be one of usesHandles');
			}
		}

		const units = await ctx.db
			.query('units')
			.withIndex('by_course_index', (q) => q.eq('courseId', args.courseId))
			.collect();
		const unitIndex = units.length === 0 ? 1 : Math.max(...units.map((u) => u.index)) + 1;
		const now = Date.now();

		const unitId = await ctx.db.insert('units', {
			courseId: args.courseId,
			index: unitIndex,
			title: args.title,
			introBody: args.introBody,
			handleKeys: args.newHandles.map((h) => h.key),
			status: 'draft',
			createdAt: now,
			updatedAt: now
		});

		let handleIndex = existingHandles.length;
		for (const handle of args.newHandles) {
			await ctx.db.insert('handles', {
				courseId: args.courseId,
				key: handle.key,
				label: handle.label,
				gloss: handle.gloss,
				unitId,
				index: handleIndex++
			});
		}

		let promptIndex = 0;
		for (const prompt of args.prompts) {
			await ctx.db.insert('coursePrompts', {
				courseId: args.courseId,
				unitId,
				index: promptIndex++,
				english: prompt.english,
				translation: prompt.translation,
				phonetic: prompt.phonetic,
				morphemeBreakdown: prompt.morphemeBreakdown,
				usesHandles: prompt.usesHandles,
				primaryHandleKey: prompt.primaryHandleKey,
				status: 'draft',
				createdAt: now,
				updatedAt: now
			});
		}

		return unitId;
	}
});

/** Ops-only seeding entry point (bunx convex run). */
export const createCourseInternal = internalMutation({
	args: { languageCode: v.string(), title: v.string() },
	handler: async (ctx, args) => {
		const language = requireSupportedLanguage(args.languageCode);
		return await ctx.db.insert('courses', {
			languageCode: language.bcp47,
			title: args.title.trim(),
			status: 'draft',
			version: 1,
			createdAt: Date.now()
		});
	}
});

export const assertAdminForAction = internalQuery({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		await assertAdmin(ctx, args.userId);
		return true;
	}
});
