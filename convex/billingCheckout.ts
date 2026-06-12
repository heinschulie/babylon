import { v } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';
import { getAuthUserId } from './lib/auth';
import { BILLING_PLANS } from './lib/billing';
import { getBillingProvider, type BillingProviderName } from './lib/billingProviders';

function requireEnv(name: string) {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`Missing env var: ${name}`);
	return value;
}

function buildCheckoutReference() {
	const rand = Math.floor(Math.random() * 1_000_000)
		.toString()
		.padStart(6, '0');
	return `sub${Date.now()}${rand}`;
}

/**
 * Creates a pending subscription and a hosted checkout session with the
 * selected provider. The client redirects to the returned URL; the provider
 * webhook activates the subscription on payment.
 *
 * Paystack charges in ZAR (South Africa), Stripe in USD (international).
 */
export const createCheckout = action({
	args: {
		plan: v.union(v.literal('ai'), v.literal('pro')),
		provider: v.optional(v.union(v.literal('paystack'), v.literal('stripe')))
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const identity = await ctx.auth.getUserIdentity();
		const email = identity?.email;
		if (!email) {
			throw new Error('An account email is required to start checkout.');
		}

		const providerName: BillingProviderName = args.provider ?? 'paystack';
		const provider = getBillingProvider(providerName);
		const plan = BILLING_PLANS[args.plan];
		const amountCents = plan.prices[provider.currency];
		const reference = buildCheckoutReference();
		const successUrl = requireEnv('BILLING_RETURN_URL');
		const cancelUrl = requireEnv('BILLING_CANCEL_URL');

		const subscriptionId = await ctx.runMutation(internal.billingSubscriptions.createPending, {
			userId,
			provider: providerName,
			plan: args.plan,
			reference
		});

		try {
			const session = await provider.createCheckout({
				reference,
				userId,
				email,
				plan: args.plan,
				amountCents,
				currency: provider.currency,
				successUrl,
				cancelUrl
			});
			return { redirectUrl: session.redirectUrl, provider: providerName };
		} catch (error) {
			// The checkout never reached the user; close out the orphaned record.
			await ctx.runMutation(internal.billingSubscriptions.setStatus, {
				subscriptionId,
				status: 'canceled'
			});
			console.error('Checkout creation failed', {
				provider: providerName,
				plan: args.plan,
				error: error instanceof Error ? error.message : 'unknown'
			});
			throw new Error('Could not start checkout. Please try again.');
		}
	}
});
