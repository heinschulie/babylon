import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

describe('billing webhook hardening', () => {
	it('dedupes repeated billing event inserts by provider event id', async () => {
		const t = convexTest(schema, modules);

		const first = await t.mutation(internal.billingEvents.insert, {
			provider: 'payfast',
			providerEventId: 'evt_1',
			providerPaymentId: 'pay_1',
			userId: 'user1',
			eventType: 'COMPLETE',
			payload: { ok: true }
		});
		const second = await t.mutation(internal.billingEvents.insert, {
			provider: 'payfast',
			providerEventId: 'evt_1',
			providerPaymentId: 'pay_1',
			userId: 'user1',
			eventType: 'COMPLETE',
			payload: { ok: true }
		});

		expect(first.duplicate).toBe(false);
		expect(second.duplicate).toBe(true);
		expect(second.id).toEqual(first.id);
	});

	it('makes subscription and entitlement transitions duplicate-safe and out-of-order safe', async () => {
		const t = convexTest(schema, modules);
		const { subscriptionId } = await t.run(async (ctx) => {
			const now = Date.now();
			const subscriptionId = await ctx.db.insert('billingSubscriptions', {
				userId: 'user1',
				provider: 'payfast',
				plan: 'ai',
				status: 'pending',
				payfastReference: 'sub_ref_1',
				createdAt: now,
				updatedAt: now
			});
			return { subscriptionId };
		});

		const firstComplete = await t.mutation(internal.billingSubscriptions.setStatus, {
			subscriptionId,
			status: 'active',
			providerPaymentId: 'pay_1',
			providerSubscriptionToken: 'tok_1'
		});
		const firstEntitlement = await t.mutation(internal.billing.setEntitlement, {
			userId: 'user1',
			tier: 'ai',
			status: 'active',
			source: 'webhook'
		});

		const duplicateComplete = await t.mutation(internal.billingSubscriptions.setStatus, {
			subscriptionId,
			status: 'active',
			providerPaymentId: 'pay_1',
			providerSubscriptionToken: 'tok_1'
		});
		const duplicateEntitlement = await t.mutation(internal.billing.setEntitlement, {
			userId: 'user1',
			tier: 'ai',
			status: 'active',
			source: 'webhook'
		});

		const cancel = await t.mutation(internal.billingSubscriptions.setStatus, {
			subscriptionId,
			status: 'canceled',
			providerPaymentId: 'pay_1',
			providerSubscriptionToken: 'tok_1'
		});
		const cancelEntitlement = await t.mutation(internal.billing.setEntitlement, {
			userId: 'user1',
			tier: 'free',
			status: 'canceled',
			source: 'webhook'
		});

		const outOfOrderComplete = await t.mutation(internal.billingSubscriptions.setStatus, {
			subscriptionId,
			status: 'active',
			providerPaymentId: 'pay_2',
			providerSubscriptionToken: 'tok_1'
		});
		const outOfOrderEntitlement = await t.mutation(internal.billing.setEntitlement, {
			userId: 'user1',
			tier: 'ai',
			status: 'active',
			source: 'webhook'
		});

		const { subscription, entitlement } = await t.run(async (ctx) => ({
			subscription: await ctx.db.get(subscriptionId),
			entitlement: await ctx.db
				.query('entitlements')
				.withIndex('by_user', (q) => q.eq('userId', 'user1'))
				.unique()
		}));

		expect(firstComplete).toMatchObject({ applied: true });
		expect(firstEntitlement).toMatchObject({ applied: true });

		expect(duplicateComplete).toMatchObject({ applied: false, reason: 'duplicate_status' });
		expect(duplicateEntitlement).toMatchObject({ applied: false, reason: 'duplicate_state' });

		expect(cancel).toMatchObject({ applied: true });
		expect(cancelEntitlement).toMatchObject({ applied: true });

		expect(outOfOrderComplete).toMatchObject({ applied: false, reason: 'invalid_transition' });
		expect(outOfOrderEntitlement).toMatchObject({ applied: false, reason: 'invalid_transition' });

		expect(subscription).toMatchObject({
			status: 'canceled',
			providerPaymentId: 'pay_1'
		});
		expect(entitlement).toMatchObject({
			tier: 'free',
			status: 'canceled'
		});
	});
});
