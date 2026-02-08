import type { MutationCtx, QueryCtx } from '../_generated/server';

export type Tier = 'free' | 'ai' | 'pro';

export const BILLING_PLANS: Record<Exclude<Tier, 'free'>, {
	name: string;
	amountZar: number;
	dailyMinutes: number;
}> = {
	ai: {
		name: 'AI',
		amountZar: 150,
		dailyMinutes: 10
	},
	pro: {
		name: 'Pro',
		amountZar: 500,
		dailyMinutes: 15
	}
};

export function getPlanFromTier(tier: Tier) {
	if (tier === 'free') return null;
	return BILLING_PLANS[tier];
}

export async function getUserTimeZone(ctx: QueryCtx | MutationCtx, userId: string) {
	const prefs = await ctx.db
		.query('userPreferences')
		.withIndex('by_user', (q) => q.eq('userId', userId))
		.unique();
	return prefs?.timeZone ?? 'Africa/Johannesburg';
}

export function getDateKeyForTimeZone(now: Date, timeZone: string) {
	const formatter = new Intl.DateTimeFormat('en-CA', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		timeZone
	});
	return formatter.format(now); // YYYY-MM-DD
}

export async function getEntitlement(ctx: QueryCtx | MutationCtx, userId: string) {
	const entitlement = await ctx.db
		.query('entitlements')
		.withIndex('by_user', (q) => q.eq('userId', userId))
		.unique();

	if (!entitlement) {
		return {
			tier: 'free' as Tier,
			status: 'active'
		};
	}

	return {
			tier: entitlement.tier as Tier,
			status: entitlement.status
	};
}

export async function getDailyUsage(ctx: QueryCtx | MutationCtx, userId: string, dateKey: string) {
	const usage = await ctx.db
		.query('usageDaily')
		.withIndex('by_user_date', (q) => q.eq('userId', userId).eq('dateKey', dateKey))
		.unique();
	return usage?.minutesRecorded ?? 0;
}

export function minutesFromMs(durationMs: number) {
	const minutes = durationMs / 60000;
	return Math.round(minutes * 1000) / 1000; // keep 3 decimals
}

export async function assertRecordingAllowed(
	ctx: QueryCtx | MutationCtx,
	userId: string,
	additionalMinutes: number
) {
	const entitlement = await getEntitlement(ctx, userId);
	if (entitlement.tier === 'free' || entitlement.status !== 'active') {
		throw new Error('Recording requires an active subscription');
	}

	const plan = getPlanFromTier(entitlement.tier);
	if (!plan) {
		throw new Error('Invalid subscription tier');
	}

	const timeZone = await getUserTimeZone(ctx, userId);
	const dateKey = getDateKeyForTimeZone(new Date(), timeZone);
	const minutesUsed = await getDailyUsage(ctx, userId, dateKey);
	const projected = minutesUsed + additionalMinutes;
	if (projected > plan.dailyMinutes) {
		throw new Error('Daily recording limit reached');
	}

	return { plan, dateKey, minutesUsed, projected };
}

export async function consumeRecordingMinutes(
	ctx: MutationCtx,
	userId: string,
	dateKey: string,
	additionalMinutes: number
) {
	const usage = await ctx.db
		.query('usageDaily')
		.withIndex('by_user_date', (q) => q.eq('userId', userId).eq('dateKey', dateKey))
		.unique();

	if (!usage) {
		await ctx.db.insert('usageDaily', {
			userId,
			dateKey,
			minutesRecorded: additionalMinutes,
			updatedAt: Date.now()
		});
		return additionalMinutes;
	}

	const updated = usage.minutesRecorded + additionalMinutes;
	await ctx.db.patch(usage._id, {
		minutesRecorded: updated,
		updatedAt: Date.now()
	});
	return updated;
}
