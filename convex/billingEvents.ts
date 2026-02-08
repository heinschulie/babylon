import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

export const insert = internalMutation({
	args: {
		provider: v.string(),
		providerEventId: v.optional(v.string()),
		providerPaymentId: v.optional(v.string()),
		userId: v.optional(v.string()),
		eventType: v.optional(v.string()),
		payload: v.any()
	},
	handler: async (ctx, args) => {
		if (args.providerEventId) {
			const existing = await ctx.db
				.query('billingEvents')
				.withIndex('by_provider_event', (q) =>
					q.eq('provider', args.provider).eq('providerEventId', args.providerEventId)
				)
				.unique();

			if (existing) {
				return { id: existing._id, duplicate: true };
			}
		}

		const id = await ctx.db.insert('billingEvents', {
			...args,
			receivedAt: Date.now()
		});
		return { id, duplicate: false };
	}
});
