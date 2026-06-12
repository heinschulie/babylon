import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hmacHex, timingSafeEqualHex } from './lib/billingProviders/crypto';
import { paystackProvider } from './lib/billingProviders/paystack';
import { stripeProvider } from './lib/billingProviders/stripe';

const PAYSTACK_SECRET = 'sk_test_paystack_secret';
const STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

const envBackup: Record<string, string | undefined> = {};

function setEnv(name: string, value: string) {
	if (!(name in envBackup)) envBackup[name] = process.env[name];
	process.env[name] = value;
}

beforeEach(() => {
	setEnv('PAYSTACK_SECRET_KEY', PAYSTACK_SECRET);
	setEnv('STRIPE_WEBHOOK_SECRET', STRIPE_WEBHOOK_SECRET);
});

afterEach(() => {
	for (const [name, value] of Object.entries(envBackup)) {
		if (value === undefined) delete process.env[name];
		else process.env[name] = value;
	}
});

function paystackRequest(body: string, signature: string) {
	return new Request('https://example.convex.site/webhooks/paystack', {
		method: 'POST',
		headers: { 'x-paystack-signature': signature },
		body
	});
}

async function stripeSignatureHeader(body: string, timestampSeconds: number) {
	const sig = await hmacHex('SHA-256', STRIPE_WEBHOOK_SECRET, `${timestampSeconds}.${body}`);
	return `t=${timestampSeconds},v1=${sig}`;
}

function stripeRequest(body: string, header: string) {
	return new Request('https://example.convex.site/webhooks/stripe', {
		method: 'POST',
		headers: { 'stripe-signature': header },
		body
	});
}

describe('timingSafeEqualHex', () => {
	it('matches equal strings and rejects different ones', () => {
		expect(timingSafeEqualHex('abc123', 'abc123')).toBe(true);
		expect(timingSafeEqualHex('abc123', 'abc124')).toBe(false);
		expect(timingSafeEqualHex('abc', 'abc123')).toBe(false);
	});
});

describe('paystack webhook verification', () => {
	it('accepts a valid HMAC-SHA512 signature over the raw body', async () => {
		const body = JSON.stringify({ event: 'charge.success', data: { id: 1 } });
		const signature = await hmacHex('SHA-512', PAYSTACK_SECRET, body);
		const result = await paystackProvider.verifyWebhook(paystackRequest(body, signature), body);
		expect(result).toEqual({ ok: true });
	});

	it('rejects a tampered body', async () => {
		const body = JSON.stringify({ event: 'charge.success', data: { id: 1 } });
		const signature = await hmacHex('SHA-512', PAYSTACK_SECRET, body);
		const tampered = body.replace('"id":1', '"id":2');
		const result = await paystackProvider.verifyWebhook(
			paystackRequest(tampered, signature),
			tampered
		);
		expect(result).toMatchObject({ ok: false, reason: 'invalid_signature' });
	});

	it('rejects a missing signature header', async () => {
		const body = '{}';
		const request = new Request('https://example.convex.site/webhooks/paystack', {
			method: 'POST',
			body
		});
		const result = await paystackProvider.verifyWebhook(request, body);
		expect(result).toMatchObject({ ok: false, reason: 'missing_signature' });
	});
});

describe('paystack webhook normalization', () => {
	it('normalizes charge.success with metadata', () => {
		const body = JSON.stringify({
			event: 'charge.success',
			data: {
				id: 302961,
				reference: 'sub17000000001',
				amount: 15000,
				currency: 'ZAR',
				metadata: { reference: 'sub17000000001', userId: 'user1', plan: 'ai' }
			}
		});
		const parsed = paystackProvider.parseWebhook(body);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.event).toMatchObject({
			kind: 'payment_succeeded',
			provider: 'paystack',
			providerEventId: 'charge.success:302961',
			reference: 'sub17000000001',
			providerPaymentId: '302961',
			userId: 'user1',
			plan: 'ai',
			amountCents: 15000,
			currency: 'ZAR'
		});
	});

	it('normalizes subscription.disable to a cancellation', () => {
		const body = JSON.stringify({
			event: 'subscription.disable',
			data: { subscription_code: 'SUB_code1' }
		});
		const parsed = paystackProvider.parseWebhook(body);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.event).toMatchObject({
			kind: 'subscription_canceled',
			providerSubscriptionId: 'SUB_code1'
		});
	});

	it('marks unknown events as ignored and invalid JSON as a parse failure', () => {
		const unknown = paystackProvider.parseWebhook(
			JSON.stringify({ event: 'transfer.success', data: { id: 5 } })
		);
		expect(unknown.ok && unknown.event.kind).toBe('ignored');

		expect(paystackProvider.parseWebhook('not-json')).toMatchObject({
			ok: false,
			reason: 'invalid_json'
		});
	});
});

describe('stripe webhook verification', () => {
	it('accepts a valid signed payload within tolerance', async () => {
		const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', data: { object: {} } });
		const header = await stripeSignatureHeader(body, Math.floor(Date.now() / 1000));
		const result = await stripeProvider.verifyWebhook(stripeRequest(body, header), body);
		expect(result).toEqual({ ok: true });
	});

	it('rejects an expired timestamp', async () => {
		const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', data: { object: {} } });
		const header = await stripeSignatureHeader(body, Math.floor(Date.now() / 1000) - 3600);
		const result = await stripeProvider.verifyWebhook(stripeRequest(body, header), body);
		expect(result).toMatchObject({ ok: false, reason: 'signature_timestamp_out_of_tolerance' });
	});

	it('rejects a wrong signature', async () => {
		const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', data: { object: {} } });
		const timestamp = Math.floor(Date.now() / 1000);
		const header = `t=${timestamp},v1=${'0'.repeat(64)}`;
		const result = await stripeProvider.verifyWebhook(stripeRequest(body, header), body);
		expect(result).toMatchObject({ ok: false, reason: 'invalid_signature' });
	});
});

describe('stripe webhook normalization', () => {
	it('normalizes checkout.session.completed', () => {
		const body = JSON.stringify({
			id: 'evt_123',
			type: 'checkout.session.completed',
			data: {
				object: {
					id: 'cs_1',
					client_reference_id: 'sub17000000002',
					payment_intent: 'pi_1',
					subscription: 'sub_stripe_1',
					amount_total: 900,
					currency: 'usd',
					metadata: { reference: 'sub17000000002', userId: 'user2', plan: 'ai' }
				}
			}
		});
		const parsed = stripeProvider.parseWebhook(body);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.event).toMatchObject({
			kind: 'payment_succeeded',
			provider: 'stripe',
			providerEventId: 'evt_123',
			reference: 'sub17000000002',
			providerPaymentId: 'pi_1',
			providerSubscriptionId: 'sub_stripe_1',
			userId: 'user2',
			plan: 'ai',
			amountCents: 900,
			currency: 'USD'
		});
	});

	it('normalizes customer.subscription.deleted to a cancellation', () => {
		const body = JSON.stringify({
			id: 'evt_124',
			type: 'customer.subscription.deleted',
			data: { object: { id: 'sub_stripe_1', metadata: { userId: 'user2', plan: 'ai' } } }
		});
		const parsed = stripeProvider.parseWebhook(body);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.event).toMatchObject({
			kind: 'subscription_canceled',
			providerSubscriptionId: 'sub_stripe_1'
		});
	});

	it('normalizes invoice.payment_failed', () => {
		const body = JSON.stringify({
			id: 'evt_125',
			type: 'invoice.payment_failed',
			data: { object: { id: 'in_1', subscription: 'sub_stripe_1' } }
		});
		const parsed = stripeProvider.parseWebhook(body);
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.event).toMatchObject({
			kind: 'payment_failed',
			providerSubscriptionId: 'sub_stripe_1'
		});
	});
});
