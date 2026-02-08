import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

export const getForWebhook = internalQuery({
	args: {
		subscriptionId: v.id('billingSubscriptions')
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.subscriptionId);
	}
});

export const setStatus = internalMutation({
	args: {
		subscriptionId: v.id('billingSubscriptions'),
		status: v.union(
			v.literal('pending'),
			v.literal('active'),
			v.literal('past_due'),
			v.literal('canceled')
		),
		providerPaymentId: v.optional(v.union(v.string(), v.null())),
		providerSubscriptionToken: v.optional(v.union(v.string(), v.null()))
	},
	handler: async (ctx, args) => {
		const subscription = await ctx.db.get(args.subscriptionId);
		if (!subscription) return;

		await ctx.db.patch(subscription._id, {
			status: args.status,
			providerPaymentId: args.providerPaymentId ?? undefined,
			providerSubscriptionToken: args.providerSubscriptionToken ?? undefined,
			...(args.status === 'active' ? { lastPaymentAt: Date.now() } : {}),
			updatedAt: Date.now()
		});
	}
});
