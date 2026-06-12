import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

function makeT() {
	return convexTest(schema, modules);
}
type TestHarness = ReturnType<typeof makeT>;

const ADMIN_ID = 'admin_user_1';
let envBackup: string | undefined;

beforeEach(() => {
	envBackup = process.env.ADMIN_USER_IDS;
	process.env.ADMIN_USER_IDS = ADMIN_ID;
});

afterEach(() => {
	if (envBackup === undefined) delete process.env.ADMIN_USER_IDS;
	else process.env.ADMIN_USER_IDS = envBackup;
});

async function seedCourse(t: TestHarness) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const courseId = await ctx.db.insert('courses', {
			languageCode: 'xh-ZA',
			title: 'isiXhosa Foundation',
			status: 'published',
			version: 1,
			createdAt: now
		});
		const unitId = await ctx.db.insert('units', {
			courseId,
			index: 1,
			title: 'Saying what you want',
			introBody: 'ndi- means I. -funa means want.',
			handleKeys: ['sc_ndi', 'v_funa'],
			status: 'published',
			createdAt: now,
			updatedAt: now
		});
		for (const [index, key] of ['sc_ndi', 'v_funa'].entries()) {
			await ctx.db.insert('handles', {
				courseId,
				key,
				label: key,
				gloss: 'test handle',
				unitId,
				index
			});
		}
		const promptId = await ctx.db.insert('coursePrompts', {
			courseId,
			unitId,
			index: 0,
			english: 'I want',
			translation: 'Ndiyafuna',
			phonetic: 'ndee-ya-FOO-na',
			morphemeBreakdown: [
				{ morpheme: 'ndi-', gloss: 'I', role: 'subject concord' },
				{ morpheme: '-ya-', gloss: 'present', role: 'tense marker' },
				{ morpheme: '-funa', gloss: 'want', role: 'verb root' }
			],
			usesHandles: ['sc_ndi', 'v_funa'],
			primaryHandleKey: 'v_funa',
			status: 'approved',
			createdAt: now,
			updatedAt: now
		});
		const draftPromptId = await ctx.db.insert('coursePrompts', {
			courseId,
			unitId,
			index: 1,
			english: 'You want',
			translation: 'Uyafuna',
			morphemeBreakdown: [],
			usesHandles: ['v_funa'],
			primaryHandleKey: 'v_funa',
			status: 'draft',
			createdAt: now,
			updatedAt: now
		});
		return { courseId, unitId, promptId, draftPromptId };
	});
}

describe('materialization', () => {
	it('creates one phrase per user per prompt, idempotently', async () => {
		const t = makeT();
		const { promptId } = await seedCourse(t);
		const asUser = t.withIdentity({ subject: 'learner1' });

		const first = await asUser.mutation(api.courses.materializePromptPhrase, {
			coursePromptId: promptId
		});
		const second = await asUser.mutation(api.courses.materializePromptPhrase, {
			coursePromptId: promptId
		});
		expect(second).toEqual(first);

		const phrase = await t.run(async (ctx) => ctx.db.get(first));
		expect(phrase).toMatchObject({
			userId: 'learner1',
			english: 'I want',
			translation: 'Ndiyafuna',
			translationStatus: 'ready',
			coursePromptId: promptId
		});
	});

	it('refuses to materialize draft prompts', async () => {
		const t = makeT();
		const { draftPromptId } = await seedCourse(t);
		const asUser = t.withIdentity({ subject: 'learner1' });
		await expect(
			asUser.mutation(api.courses.materializePromptPhrase, { coursePromptId: draftPromptId })
		).rejects.toThrow('not available');
	});
});

describe('leak filters', () => {
	it('keeps materialized course phrases out of the library and free practice', async () => {
		const t = makeT();
		const { promptId } = await seedCourse(t);
		const asUser = t.withIdentity({ subject: 'learner1' });

		await asUser.mutation(api.phrases.createDirect, {
			english: 'Hello',
			translation: 'Molo'
		});
		await asUser.mutation(api.courses.materializePromptPhrase, { coursePromptId: promptId });

		const all = await asUser.query(api.phrases.listAllByUser, {});
		expect(all).toHaveLength(1);
		expect(all[0].english).toBe('Hello');

		const grouped = await asUser.query(api.phrases.listGroupedByCategory, {});
		const phraseCount = grouped.reduce(
			(sum: number, group: { phrases: unknown[] }) => sum + group.phrases.length,
			0
		);
		expect(phraseCount).toBe(1);
	});
});

describe('admin gating', () => {
	it('rejects non-admin authoring calls and accepts env-bootstrapped admins', async () => {
		const t = makeT();
		const asRandom = t.withIdentity({ subject: 'not_admin' });
		await expect(
			asRandom.mutation(api.courseAuthoring.createCourse, {
				languageCode: 'xh-ZA',
				title: 'Nope'
			})
		).rejects.toThrow('Admin access required');

		const asAdmin = t.withIdentity({ subject: ADMIN_ID });
		const courseId = await asAdmin.mutation(api.courseAuthoring.createCourse, {
			languageCode: 'xh-ZA',
			title: 'Yes'
		});
		expect(courseId).toBeDefined();
	});

	it('grants and revokes table-based admins', async () => {
		const t = makeT();
		const asAdmin = t.withIdentity({ subject: ADMIN_ID });
		await asAdmin.mutation(api.admin.grantAdmin, { userId: 'second_admin' });

		const asSecond = t.withIdentity({ subject: 'second_admin' });
		const state = await asSecond.query(api.admin.getMyAdminState, {});
		expect(state.isAdmin).toBe(true);

		await asAdmin.mutation(api.admin.revokeAdmin, { userId: 'second_admin' });
		const after = await asSecond.query(api.admin.getMyAdminState, {});
		expect(after.isAdmin).toBe(false);
	});
});

describe('prompt immutability', () => {
	it('blocks edits to approved prompts and clones to a new draft', async () => {
		const t = makeT();
		const { promptId } = await seedCourse(t);
		const asAdmin = t.withIdentity({ subject: ADMIN_ID });

		await expect(
			asAdmin.mutation(api.courseAuthoring.updatePrompt, {
				promptId,
				english: 'I really want'
			})
		).rejects.toThrow('immutable');

		const cloneId = await asAdmin.mutation(api.courseAuthoring.clonePromptForEdit, {
			promptId
		});
		const clone = await t.run(async (ctx) => ctx.db.get(cloneId));
		expect(clone).toMatchObject({ status: 'draft', english: 'I want', index: 2 });
	});
});

describe('handle-state updater', () => {
	async function makeAttemptWithFeedback(
		t: TestHarness,
		promptId: Id<'coursePrompts'>,
		feedback: { phraseAccuracy: number; constructionErrors?: { morpheme: string; issue: string }[] }
	) {
		const asUser = t.withIdentity({ subject: 'learner1' });
		await t.run(async (ctx) => {
			const existing = await ctx.db
				.query('entitlements')
				.withIndex('by_user', (q) => q.eq('userId', 'learner1'))
				.unique();
			if (!existing) {
				await ctx.db.insert('entitlements', {
					userId: 'learner1',
					tier: 'ai',
					status: 'active',
					source: 'test',
					updatedAt: Date.now()
				});
			}
		});
		const phraseId = await asUser.mutation(api.courses.materializePromptPhrase, {
			coursePromptId: promptId
		});
		const attemptId = await asUser.mutation(api.attempts.create, { phraseId });
		await t.run(async (ctx) => {
			await ctx.db.insert('aiFeedback', {
				attemptId,
				phraseAccuracy: feedback.phraseAccuracy,
				soundAccuracy: feedback.phraseAccuracy,
				rhythmIntonation: feedback.phraseAccuracy,
				constructionErrors: feedback.constructionErrors,
				createdAt: Date.now()
			});
		});
		await t.mutation(internal.courseProgress.applyConstructionResult, { attemptId });
		return attemptId;
	}

	it('climbs the ladder on clean constructions and owns after a streak', async () => {
		const t = makeT();
		const { promptId, courseId } = await seedCourse(t);

		await makeAttemptWithFeedback(t, promptId, { phraseAccuracy: 4 });
		await makeAttemptWithFeedback(t, promptId, { phraseAccuracy: 5 });

		const states = await t.run(async (ctx) =>
			ctx.db
				.query('learnerHandleState')
				.withIndex('by_user_course', (q) => q.eq('userId', 'learner1').eq('courseId', courseId))
				.collect()
		);
		expect(states).toHaveLength(2); // sc_ndi + v_funa
		for (const state of states) {
			expect(state.status).toBe('owned');
			expect(state.cleanStreak).toBe(2);
			expect(state.strength).toBe(2);
		}
	});

	it('regresses strength and resets streak on construction errors', async () => {
		const t = makeT();
		const { promptId, courseId } = await seedCourse(t);

		await makeAttemptWithFeedback(t, promptId, { phraseAccuracy: 4 });
		await makeAttemptWithFeedback(t, promptId, {
			phraseAccuracy: 4,
			constructionErrors: [{ morpheme: 'ndi-', issue: 'used u- instead' }]
		});

		const states = await t.run(async (ctx) =>
			ctx.db
				.query('learnerHandleState')
				.withIndex('by_user_course', (q) => q.eq('userId', 'learner1').eq('courseId', courseId))
				.collect()
		);
		for (const state of states) {
			expect(state.cleanStreak).toBe(0);
			expect(state.strength).toBe(0);
			expect(state.status).toBe('introduced');
		}
	});
});

describe('handle-based notification scheduling', () => {
	it('schedules construction prompts for due handles instead of legacy recall', async () => {
		const t = makeT();
		const { promptId, courseId } = await seedCourse(t);

		await t.run(async (ctx) => {
			const now = Date.now();
			await ctx.db.insert('userPreferences', {
				userId: 'learner1',
				quietHoursStart: 22,
				quietHoursEnd: 8,
				notificationsPerPhrase: 3,
				pushSubscription: '{"endpoint":"https://x","keys":{"p256dh":"a","auth":"b"}}',
				timeZone: 'Africa/Johannesburg'
			});
			await ctx.db.insert('learnerHandleState', {
				userId: 'learner1',
				courseId,
				handleKey: 'v_funa',
				status: 'introduced',
				strength: 0,
				cleanStreak: 0,
				nextDueAt: now - 1000, // due
				updatedAt: now
			});
		});

		await t.mutation(internal.notifications.rescheduleDaily, {});

		const scheduled = await t.run(async (ctx) =>
			ctx.db
				.query('scheduledNotifications')
				.withIndex('by_user_scheduled', (q) => q.eq('userId', 'learner1'))
				.collect()
		);
		expect(scheduled.length).toBeGreaterThan(0);
		expect(scheduled[0].coursePromptId).toEqual(promptId);
		expect(scheduled[0].phraseId).toBeUndefined();
	});

	it('falls back to legacy phrase recall when nothing is due, excluding course phrases', async () => {
		const t = makeT();
		const { promptId } = await seedCourse(t);
		const asUser = t.withIdentity({ subject: 'learner1' });

		await asUser.mutation(api.phrases.createDirect, { english: 'Hello', translation: 'Molo' });
		const coursePhraseId = await asUser.mutation(api.courses.materializePromptPhrase, {
			coursePromptId: promptId
		});

		await t.run(async (ctx) => {
			await ctx.db.insert('userPreferences', {
				userId: 'learner1',
				quietHoursStart: 22,
				quietHoursEnd: 8,
				notificationsPerPhrase: 3,
				pushSubscription: '{"endpoint":"https://x","keys":{"p256dh":"a","auth":"b"}}',
				timeZone: 'Africa/Johannesburg'
			});
		});

		await t.mutation(internal.notifications.rescheduleDaily, {});

		const scheduled = await t.run(async (ctx) =>
			ctx.db
				.query('scheduledNotifications')
				.withIndex('by_user_scheduled', (q) => q.eq('userId', 'learner1'))
				.collect()
		);
		expect(scheduled.length).toBeGreaterThan(0);
		for (const notification of scheduled) {
			expect(notification.phraseId).not.toEqual(coursePhraseId);
			expect(notification.coursePromptId).toBeUndefined();
		}
	});
});

describe('exemplar gating', () => {
	it('returns null exemplar for prompts without audio and blocks unapproved prompts', async () => {
		const t = makeT();
		const { promptId, draftPromptId } = await seedCourse(t);
		const asUser = t.withIdentity({ subject: 'learner1' });

		expect(
			await asUser.query(api.courses.getPromptExemplarUrl, { coursePromptId: promptId })
		).toBeNull();
		expect(
			await asUser.query(api.courses.getPromptExemplarUrl, { coursePromptId: draftPromptId })
		).toBeNull();
		expect(
			await asUser.query(api.courses.getReviewPrompt, { coursePromptId: draftPromptId })
		).toBeNull();
	});
});
