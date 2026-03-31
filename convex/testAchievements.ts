import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { getAuthUserId } from './lib/auth';

// --- Achievement definitions: single source of truth ---

type AchievementType = 'emoji_starter' | 'emoji_pro' | 'democracy' | 'social_butterfly' | 'poll_creator';

interface AchievementDef {
	type: AchievementType;
	title: string;
	threshold: number;
	count: (ctx: MutationCtx, userId: string) => Promise<number>;
}

async function countTestTableEntries(
	ctx: MutationCtx,
	userId: string,
	filter: { hasParentId?: boolean; hasPollId?: boolean }
): Promise<number> {
	const entries = await ctx.db
		.query('testTable')
		.filter((q) => {
			const conditions = [q.eq(q.field('userId'), userId)];
			if (filter.hasParentId === true) conditions.push(q.neq(q.field('parentId'), undefined));
			if (filter.hasParentId === false) conditions.push(q.eq(q.field('parentId'), undefined));
			if (filter.hasPollId === true) conditions.push(q.neq(q.field('pollId'), undefined));
			if (filter.hasPollId === false) conditions.push(q.eq(q.field('pollId'), undefined));
			return conditions.reduce((acc, cond) => q.and(acc, cond));
		})
		.collect();
	return entries.length;
}

const ACHIEVEMENTS: AchievementDef[] = [
	{
		type: 'emoji_starter',
		title: 'Emoji Starter',
		threshold: 5,
		count: (ctx, userId) => countTestTableEntries(ctx, userId, { hasParentId: false, hasPollId: false }),
	},
	{
		type: 'emoji_pro',
		title: 'Emoji Pro',
		threshold: 25,
		count: (ctx, userId) => countTestTableEntries(ctx, userId, { hasParentId: false, hasPollId: false }),
	},
	{
		type: 'democracy',
		title: 'Democracy',
		threshold: 1,
		count: (ctx, userId) => countTestTableEntries(ctx, userId, { hasPollId: true }),
	},
	{
		type: 'social_butterfly',
		title: 'Social Butterfly',
		threshold: 5,
		count: (ctx, userId) => countTestTableEntries(ctx, userId, { hasParentId: true }),
	},
	{
		type: 'poll_creator',
		title: 'Poll Creator',
		threshold: 3,
		count: async (ctx) => {
			const polls = await ctx.db.query('testPollTable').collect();
			return polls.length;
		},
	},
];

// --- Mutations & Queries ---

export const checkAndUnlockAchievements = mutation({
	args: { userId: v.string() },
	handler: async (ctx, { userId }) => {
		for (const achievement of ACHIEVEMENTS) {
			const count = await achievement.count(ctx, userId);
			if (count >= achievement.threshold) {
				await unlockIfNew(ctx, userId, achievement);
			}
		}
	},
});

async function unlockIfNew(ctx: MutationCtx, userId: string, def: AchievementDef) {
	const existing = await ctx.db
		.query('testAchievementTable')
		.withIndex('by_type_userId', (q) => q.eq('type', def.type).eq('userId', userId))
		.first();

	if (!existing) {
		await ctx.db.insert('testAchievementTable', {
			type: def.type,
			title: def.title,
			userId,
			unlockedAt: Date.now(),
		});
	}
}

export const getUserAchievements = query({
	args: { userId: v.string() },
	handler: async (ctx, { userId }) => {
		await getAuthUserId(ctx);

		const achievements = await ctx.db
			.query('testAchievementTable')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.collect();

		return achievements
			.sort((a, b) => b.unlockedAt - a.unlockedAt)
			.map(({ _id, type, title, userId, unlockedAt }) => ({
				_id,
				type,
				title,
				userId,
				unlockedAt,
			}));
	},
});
