import { v } from 'convex/values';
import { internalMutation, internalQuery } from './_generated/server';

type BillingSubscriptionStatus = 'pending' | 'active' | 'past_due' | 'canceled';

function asSubscriptionStatus(value: string): BillingSubscriptionStatus | null {
	if (value === 'pending' || value === 'active' || value === 'past_due' || value === 'canceled') {
		return value;
	}
	return null;
}

function canTransitionStatus(
	from: BillingSubscriptionStatus,
	to: BillingSubscriptionStatus
): { allowed: boolean; reason?: 'duplicate_status' | 'invalid_transition' } {
	if (from === to) {
		return { allowed: false, reason: 'duplicate_status' };
	}

	// `canceled` is terminal for webhook-driven subscription state.
	if (from === 'canceled' && to !== 'canceled') {
		return { allowed: false, reason: 'invalid_transition' };
	}

	// Never regress back to `pending` after creation.
	if (to === 'pending') {
		return { allowed: false, reason: 'invalid_transition' };
	}

	return { allowed: true };
}

export const getForWebhook = internalQuery({
	args: {
		subscriptionId: v.id('billingSubscriptions')
	},
	handler: async (ctx, args) => {
		return await ctx.db.get(args.subscriptionId);
	}
});

export const getByPayfastReference = internalQuery({
	args: {
		reference: v.string()
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query('billingSubscriptions')
			.withIndex('by_provider_reference', (q) =>
				q.eq('provider', 'payfast').eq('payfastReference', args.reference)
			)
			.unique();
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
		if (!subscription) {
			return { applied: false as const, reason: 'not_found' as const };
		}

		const currentStatus = asSubscriptionStatus(subscription.status);
		if (!currentStatus) {
			return {
				applied: false as const,
				reason: 'invalid_current_status' as const,
				currentStatus: subscription.status
			};
		}

		const nextStatus = args.status;
		const providerPaymentId = args.providerPaymentId ?? undefined;
		const providerSubscriptionToken = args.providerSubscriptionToken ?? undefined;
		const providerMetadataChanged =
			(providerPaymentId !== undefined && providerPaymentId !== subscription.providerPaymentId) ||
			(providerSubscriptionToken !== undefined &&
				providerSubscriptionToken !== subscription.providerSubscriptionToken);

		const transition = canTransitionStatus(currentStatus, nextStatus);
		if (!transition.allowed && !(transition.reason === 'duplicate_status' && providerMetadataChanged)) {
			return {
				applied: false as const,
				reason: transition.reason,
				currentStatus
			};
		}

		await ctx.db.patch(subscription._id, {
			status: nextStatus,
			providerPaymentId,
			providerSubscriptionToken,
			...(nextStatus === 'active' ? { lastPaymentAt: Date.now() } : {}),
			updatedAt: Date.now()
		});

		return {
			applied: true as const,
			reason: (transition.reason === 'duplicate_status'
				? 'metadata_update'
				: 'applied') as 'applied' | 'metadata_update',
			status: nextStatus
		};
	}
});
