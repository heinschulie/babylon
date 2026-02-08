import { v } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';
import {
	BILLING_PLANS,
	getDateKeyForTimeZone,
	getEntitlement,
	getPlanFromTier,
	getUserTimeZone,
	getDailyUsage
} from './lib/billing';
import { buildPayfastSignature } from './lib/payfast';

function requireEnv(name: string) {
	const value = process.env[name];
	if (!value) throw new Error(`Missing env var: ${name}`);
	return value;
}

function getPayfastEndpoint() {
	const sandbox = process.env.PAYFAST_SANDBOX === 'true';
	return sandbox ? 'https://sandbox.payfast.co.za/eng/process' : 'https://www.payfast.co.za/eng/process';
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
			dateKey
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

		const merchantId = requireEnv('PAYFAST_MERCHANT_ID');
		const merchantKey = requireEnv('PAYFAST_MERCHANT_KEY');
		const passphrase = process.env.PAYFAST_PASSPHRASE;
		const returnUrl = requireEnv('PAYFAST_RETURN_URL');
		const cancelUrl = requireEnv('PAYFAST_CANCEL_URL');
		const notifyUrl = requireEnv('PAYFAST_NOTIFY_URL');

		const now = Date.now();
		const subscriptionId = await ctx.db.insert('billingSubscriptions', {
			userId,
			provider: 'payfast',
			plan: args.plan,
			status: 'pending',
			createdAt: now,
			updatedAt: now
		});

		const fields: Record<string, string> = {
			merchant_id: merchantId,
			merchant_key: merchantKey,
			return_url: returnUrl,
			cancel_url: cancelUrl,
			notify_url: notifyUrl,
			m_payment_id: subscriptionId,
			amount: plan.amountZar.toFixed(2),
			item_name: `Xhosa ${plan.name} Plan`,
			subscription_type: '1',
			frequency: '3',
			cycles: '0',
			custom_str1: userId,
			custom_str2: args.plan
		};
		fields.signature = buildPayfastSignature(fields, passphrase);

		return {
			endpointUrl: getPayfastEndpoint(),
			fields
		};
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
