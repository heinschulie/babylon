import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId } from './lib/auth';
import {
	BILLING_PLANS,
	getDateKeyForTimeZone,
	getEntitlement,
	getPlanFromTier,
	getUserTimeZone,
	getDailyUsage
} from './lib/billing';
import { buildPayfastSignature, normalizePayfastPassphrase } from './lib/payfast';

function requireEnv(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing env var: ${name}`);
	return value.trim();
}

function getPayfastEndpoint() {
	const sandbox = process.env.PAYFAST_SANDBOX === 'true';
	return sandbox ? 'https://sandbox.payfast.co.za/eng/process' : 'https://www.payfast.co.za/eng/process';
}

function recurringEnabled() {
	return process.env.PAYFAST_ENABLE_RECURRING !== 'false';
}

function minimalCheckoutEnabled() {
	return process.env.PAYFAST_MINIMAL_CHECKOUT === 'true';
}

function buildPayfastReference() {
	const rand = Math.floor(Math.random() * 1_000_000)
		.toString()
		.padStart(6, '0');
	return `sub${Date.now()}${rand}`;
}

function devBillingToggleEnabled() {
	if (process.env.BILLING_DEV_TOGGLE === 'true') {
		return true;
	}

	const nodeEnv = process.env.NODE_ENV;
	if (nodeEnv && nodeEnv !== 'production') {
		return true;
	}

	const siteUrl = process.env.SITE_URL ?? '';
	return siteUrl.includes('localhost') || siteUrl.includes('127.0.0.1');
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
			devToggleEnabled: devBillingToggleEnabled()
		};
	}
});

export const createPayfastCheckout = mutation({
	args: {
		plan: v.union(v.literal('ai'), v.literal('pro'))
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const plan = BILLING_PLANS[args.plan];
		const payfastReference = buildPayfastReference();

		const merchantId = requireEnv('PAYFAST_MERCHANT_ID');
		const merchantKey = requireEnv('PAYFAST_MERCHANT_KEY');
		const passphrase = normalizePayfastPassphrase(process.env.PAYFAST_PASSPHRASE);
		const returnUrl = requireEnv('PAYFAST_RETURN_URL');
		const cancelUrl = requireEnv('PAYFAST_CANCEL_URL');
		const notifyUrl = requireEnv('PAYFAST_NOTIFY_URL');

		const now = Date.now();
		const subscriptionId = await ctx.db.insert('billingSubscriptions', {
			userId,
			provider: 'payfast',
			plan: args.plan,
			status: 'pending',
			payfastReference,
			createdAt: now,
			updatedAt: now
		});

		const fields: Record<string, string> = {};
		fields.merchant_id = merchantId;
		fields.merchant_key = merchantKey;
		fields.return_url = returnUrl;
		fields.cancel_url = cancelUrl;
		fields.notify_url = notifyUrl;

		if (!minimalCheckoutEnabled()) {
			fields.m_payment_id = payfastReference;
		}

		fields.amount = plan.amountZar.toFixed(2);
		fields.item_name = `Xhosa ${plan.name} Plan`;

		if (recurringEnabled() && !minimalCheckoutEnabled()) {
			fields.subscription_type = '1';
			fields.frequency = '3';
			fields.cycles = '0';
		}

		fields.signature = buildPayfastSignature(fields, passphrase);

		return {
			endpointUrl: getPayfastEndpoint(),
			fields
		};
	}
});

export const setMyTierForDev = mutation({
	args: {
		tier: v.union(v.literal('free'), v.literal('ai'), v.literal('pro')),
		resetDailyUsage: v.optional(v.boolean())
	},
	handler: async (ctx, args) => {
		if (!devBillingToggleEnabled()) {
			throw new Error('Dev billing toggle is disabled');
		}

		const userId = await getAuthUserId(ctx);
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
			return;
		}

		await ctx.db.patch(existing._id, {
			tier: args.tier,
			status: args.status,
			source: args.source,
			updatedAt: now
		});
	}
});
