import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import { hmacHex } from './lib/billingProviders/crypto';
import schema from './schema';

const modules = import.meta.glob('./**/*.ts');

const PAYSTACK_SECRET = 'sk_test_pipeline_secret';

// t.fetch loads the full http router, whose auth routes read these at registration.
const TEST_ENV: Record<string, string> = {
	PAYSTACK_SECRET_KEY: PAYSTACK_SECRET,
	SITE_URL: 'http://localhost:5173',
	BETTER_AUTH_SECRET: 'test-secret-0123456789abcdef0123456789abcdef'
};
const envBackup: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const [name, value] of Object.entries(TEST_ENV)) {
		envBackup[name] = process.env[name];
		process.env[name] = value;
	}
});

afterEach(() => {
	for (const [name, value] of Object.entries(envBackup)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

async function signedPaystackPost(t: ReturnType<typeof convexTest>, payload: unknown) {
	const body = JSON.stringify(payload);
	const signature = await hmacHex('SHA-512', PAYSTACK_SECRET, body);
	return await t.fetch('/webhooks/paystack', {
		method: 'POST',
		headers: { 'x-paystack-signature': signature },
		body
	});
}

describe('paystack webhook pipeline', () => {
	it('activates subscription and entitlement on a valid charge.success', async () => {
		const t = convexTest(schema, modules);
		const subscriptionId = await t.mutation(internal.billingSubscriptions.createPending, {
			userId: 'user1',
			provider: 'paystack',
			plan: 'ai',
			reference: 'sub_ref_42'
		});

		const response = await signedPaystackPost(t, {
			event: 'charge.success',
			data: {
				id: 99,
				reference: 'sub_ref_42',
				amount: 15000,
				currency: 'ZAR',
				metadata: { reference: 'sub_ref_42', userId: 'user1', plan: 'ai' }
			}
		});
		expect(response.status).toBe(200);

		const { subscription, entitlement } = await t.run(async (ctx) => ({
			subscription: await ctx.db.get(subscriptionId),
			entitlement: await ctx.db
				.query('entitlements')
				.withIndex('by_user', (q) => q.eq('userId', 'user1'))
				.unique()
		}));
		expect(subscription).toMatchObject({ status: 'active', providerPaymentId: '99' });
		expect(entitlement).toMatchObject({ tier: 'ai', status: 'active' });
	});

	it('rejects an invalid signature without touching state', async () => {
		const t = convexTest(schema, modules);
		const body = JSON.stringify({ event: 'charge.success', data: { id: 1 } });
		const response = await t.fetch('/webhooks/paystack', {
			method: 'POST',
			headers: { 'x-paystack-signature': 'bad' },
			body
		});
		expect(response.status).toBe(400);
	});

	it('rejects an amount mismatch on payment_succeeded', async () => {
		const t = convexTest(schema, modules);
		await t.mutation(internal.billingSubscriptions.createPending, {
			userId: 'user1',
			provider: 'paystack',
			plan: 'ai',
			reference: 'sub_ref_43'
		});

		const response = await signedPaystackPost(t, {
			event: 'charge.success',
			data: {
				id: 100,
				reference: 'sub_ref_43',
				amount: 1,
				currency: 'ZAR',
				metadata: { reference: 'sub_ref_43', userId: 'user1', plan: 'ai' }
			}
		});
		expect(response.status).toBe(400);

		const entitlement = await t.run(async (ctx) =>
			ctx.db
				.query('entitlements')
				.withIndex('by_user', (q) => q.eq('userId', 'user1'))
				.unique()
		);
		expect(entitlement).toBeNull();
	});

	it('dedupes a replayed event', async () => {
		const t = convexTest(schema, modules);
		const subscriptionId = await t.mutation(internal.billingSubscriptions.createPending, {
			userId: 'user1',
			provider: 'paystack',
			plan: 'ai',
			reference: 'sub_ref_44'
		});
		const payload = {
			event: 'charge.success',
			data: {
				id: 101,
				reference: 'sub_ref_44',
				amount: 15000,
				currency: 'ZAR',
				metadata: { reference: 'sub_ref_44', userId: 'user1', plan: 'ai' }
			}
		};

		expect((await signedPaystackPost(t, payload)).status).toBe(200);
		expect((await signedPaystackPost(t, payload)).status).toBe(200);

		const events = await t.run(async (ctx) =>
			ctx.db
				.query('billingEvents')
				.withIndex('by_provider_event', (q) =>
					q.eq('provider', 'paystack').eq('providerEventId', 'charge.success:101')
				)
				.collect()
		);
		expect(events).toHaveLength(1);
		const subscription = await t.run(async (ctx) => ctx.db.get(subscriptionId));
		expect(subscription).toMatchObject({ status: 'active' });
	});
});

describe('billing webhook hardening', () => {
	it('dedupes repeated billing event inserts by provider event id', async () => {
		const t = convexTest(schema, modules);

		const first = await t.mutation(internal.billingEvents.insert, {
			provider: 'paystack',
			providerEventId: 'evt_1',
			providerPaymentId: 'pay_1',
			userId: 'user1',
			eventType: 'COMPLETE',
			payload: { ok: true }
		});
		const second = await t.mutation(internal.billingEvents.insert, {
			provider: 'paystack',
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
				provider: 'paystack',
				plan: 'ai',
				status: 'pending',
				providerReference: 'sub_ref_1',
				createdAt: now,
				updatedAt: now
			});
			return { subscriptionId };
		});

		const firstComplete = await t.mutation(internal.billingSubscriptions.setStatus, {
			subscriptionId,
			status: 'active',
			providerPaymentId: 'pay_1',
			providerSubscriptionId: 'sub_code_1'
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
			providerSubscriptionId: 'sub_code_1'
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
			providerSubscriptionId: 'sub_code_1'
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
			providerSubscriptionId: 'sub_code_1'
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
