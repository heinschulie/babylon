import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId } from './lib/auth';
import {
	getDateKeyForTimeZone,
	getEntitlement,
	getPlanFromTier,
	getUserTimeZone,
	getDailyUsage
} from './lib/billing';

type EntitlementStatus = 'active' | 'past_due' | 'canceled';

type DevBillingToggleDecision =
	| { enabled: true; mode: 'local_dev' | 'allowlisted_non_prod' | 'allowlisted_production' }
	| {
			enabled: false;
			reason: 'disabled' | 'not_allowlisted' | 'production_disabled' | 'missing_user';
	  };

function asEntitlementStatus(value: string): EntitlementStatus | null {
	if (value === 'active' || value === 'past_due' || value === 'canceled') return value;
	return null;
}

function shouldApplyWebhookEntitlementUpdate(
	current: { status: string; tier: string },
	next: { status: EntitlementStatus; tier: 'free' | 'ai' | 'pro' }
) {
	if (current.status === next.status && current.tier === next.tier) {
		return { allowed: false as const, reason: 'duplicate_state' as const };
	}

	const currentStatus = asEntitlementStatus(current.status);
	if (!currentStatus) {
		return { allowed: false as const, reason: 'invalid_current_status' as const };
	}

	// Do not let late/out-of-order webhook events restore access after cancellation.
	if (currentStatus === 'canceled' && next.status !== 'canceled') {
		return { allowed: false as const, reason: 'invalid_transition' as const };
	}

	return { allowed: true as const };
}

function isLocalDevHost() {
	const siteUrl = (process.env.SITE_URL ?? '').toLowerCase();
	return siteUrl.includes('localhost') || siteUrl.includes('127.0.0.1');
}

function parseDevBillingAllowlist() {
	const raw = process.env.BILLING_DEV_TOGGLE_ALLOWLIST ?? process.env.BILLING_DEV_TOGGLE_ADMIN_ALLOWLIST ?? '';
	return new Set(
		raw
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean)
	);
}

function canUseDevBillingToggle(userId: string | null | undefined): DevBillingToggleDecision {
	if (!userId) return { enabled: false, reason: 'missing_user' };

	const nodeEnv = process.env.NODE_ENV;
	const localHost = isLocalDevHost();
	if (nodeEnv === 'test') {
		return { enabled: true, mode: 'local_dev' };
	}

	// Local/non-production development remains convenient by default.
	if (localHost && nodeEnv !== 'production') {
		return { enabled: true, mode: 'local_dev' };
	}

	// Non-local environments require explicit enable + an allowlisted user.
	if (process.env.BILLING_DEV_TOGGLE !== 'true') {
		return { enabled: false, reason: 'disabled' };
	}

	const allowlist = parseDevBillingAllowlist();
	if (!allowlist.has(userId)) {
		return { enabled: false, reason: 'not_allowlisted' };
	}

	// Production must opt-in separately to avoid accidental entitlement escalation.
	if (nodeEnv === 'production' && process.env.BILLING_DEV_TOGGLE_ALLOW_PRODUCTION !== 'true') {
		return { enabled: false, reason: 'production_disabled' };
	}

	return {
		enabled: true,
		mode: nodeEnv === 'production' ? 'allowlisted_production' : 'allowlisted_non_prod'
	};
}

export const getStatus = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		const entitlement = await getEntitlement(ctx, userId);
		const timeZone = await getUserTimeZone(ctx, userId);
		const dateKey = getDateKeyForTimeZone(new Date(), timeZone);
		const minutesUsed = await getDailyUsage(ctx, userId, dateKey);
		const plan = getPlanFromTier(entitlement.tier);
		return {
			tier: entitlement.tier,
			status: entitlement.status,
			minutesUsed,
			minutesLimit: plan?.dailyMinutes ?? 0,
			dateKey,
			devToggleEnabled: canUseDevBillingToggle(userId).enabled
		};
	}
});

export const setMyTierForDev = mutation({
	args: {
		tier: v.union(v.literal('free'), v.literal('ai'), v.literal('pro')),
		resetDailyUsage: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const gate = canUseDevBillingToggle(userId);
		if (!gate.enabled) {
			throw new Error('Dev billing toggle is disabled');
		}

		if (gate.mode !== 'local_dev') {
			console.warn('Dev billing toggle used in non-local environment', {
				userId,
				tier: args.tier,
				resetDailyUsage: args.resetDailyUsage ?? true,
				mode: gate.mode
			});
		}

		await ctx.runMutation(internal.billing.setEntitlement, {
			userId,
			tier: args.tier,
			status: 'active',
			source: 'dev_toggle'
		});

		if (args.resetDailyUsage ?? true) {
			const timeZone = await getUserTimeZone(ctx, userId);
			const dateKey = getDateKeyForTimeZone(new Date(), timeZone);
			const usage = await ctx.db
				.query('usageDaily')
				.withIndex('by_user_date', (q) => q.eq('userId', userId).eq('dateKey', dateKey))
				.unique();

			if (!usage) {
				await ctx.db.insert('usageDaily', {
					userId,
					dateKey,
					minutesRecorded: 0,
					updatedAt: Date.now()
				});
			} else {
				await ctx.db.patch(usage._id, {
					minutesRecorded: 0,
					updatedAt: Date.now()
				});
			}
		}

		return { ok: true };
	}
});

export const setEntitlement = internalMutation({
	args: {
		userId: v.string(),
		tier: v.union(v.literal('free'), v.literal('ai'), v.literal('pro')),
		status: v.union(v.literal('active'), v.literal('past_due'), v.literal('canceled')),
		source: v.string()
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const existing = await ctx.db
			.query('entitlements')
			.withIndex('by_user', (q) => q.eq('userId', args.userId))
			.unique();

		if (!existing) {
			await ctx.db.insert('entitlements', {
				userId: args.userId,
				tier: args.tier,
				status: args.status,
				source: args.source,
				updatedAt: now
			});
			return { applied: true as const, reason: 'inserted' as const };
		}

		if (args.source === 'webhook') {
			const decision = shouldApplyWebhookEntitlementUpdate(existing, {
				status: args.status,
				tier: args.tier
			});
			if (!decision.allowed) {
				return { applied: false as const, reason: decision.reason };
			}
		}

		await ctx.db.patch(existing._id, {
			tier: args.tier,
			status: args.status,
			source: args.source,
			updatedAt: now
		});

		return { applied: true as const, reason: 'updated' as const };
	}
});
