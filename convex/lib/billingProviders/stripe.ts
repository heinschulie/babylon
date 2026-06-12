import { classifyExternalFetchError, fetchWithTimeout } from '../fetchWithTimeout';
import { hmacHex, timingSafeEqualHex } from './crypto';
import {
	normalizePaidTier,
	type BillingProvider,
	type CheckoutRequest,
	type CheckoutSession,
	type WebhookParseResult,
	type WebhookVerification
} from './types';

const STRIPE_API_BASE = 'https://api.stripe.com';
const CHECKOUT_TIMEOUT_MS = 8_000;
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function requireSecretKey() {
	const key = process.env.STRIPE_SECRET_KEY?.trim();
	if (!key) throw new Error('Missing env var: STRIPE_SECRET_KEY');
	return key;
}

function requireWebhookSecret() {
	const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
	if (!secret) throw new Error('Missing env var: STRIPE_WEBHOOK_SECRET');
	return secret;
}

/** Stripe subscriptions bill against pre-created Prices. */
function requirePriceId(plan: 'ai' | 'pro') {
	const key = plan === 'ai' ? 'STRIPE_PRICE_AI' : 'STRIPE_PRICE_PRO';
	const value = process.env[key]?.trim();
	if (!value) throw new Error(`Missing env var: ${key}`);
	return value;
}

type StripeEvent = {
	id?: string;
	type?: string;
	data?: { object?: Record<string, unknown> };
};

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
	return typeof value === 'number' ? value : undefined;
}

function asMetadata(value: unknown): Record<string, string> {
	if (value && typeof value === 'object') return value as Record<string, string>;
	return {};
}

export const stripeProvider: BillingProvider = {
	name: 'stripe',
	currency: 'USD',

	async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
		const secretKey = requireSecretKey();
		const priceId = requirePriceId(req.plan);

		const form = new URLSearchParams({
			mode: 'subscription',
			'line_items[0][price]': priceId,
			'line_items[0][quantity]': '1',
			success_url: req.successUrl,
			cancel_url: req.cancelUrl,
			client_reference_id: req.reference,
			customer_email: req.email,
			'metadata[reference]': req.reference,
			'metadata[userId]': req.userId,
			'metadata[plan]': req.plan,
			'subscription_data[metadata][reference]': req.reference,
			'subscription_data[metadata][userId]': req.userId,
			'subscription_data[metadata][plan]': req.plan
		});

		let response: Response;
		try {
			response = await fetchWithTimeout(`${STRIPE_API_BASE}/v1/checkout/sessions`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${secretKey}`,
					'Content-Type': 'application/x-www-form-urlencoded'
				},
				body: form.toString(),
				timeoutMs: CHECKOUT_TIMEOUT_MS,
				service: 'stripe',
				operation: 'checkout_session_create',
				retries: 1
			});
		} catch (error) {
			throw new Error(`Stripe checkout request failed: ${classifyExternalFetchError(error)}`);
		}

		const result = (await response.json().catch(() => null)) as {
			url?: string;
			error?: { message?: string };
		} | null;

		if (!response.ok || !result?.url) {
			throw new Error(`Stripe checkout failed: ${result?.error?.message ?? response.status}`);
		}

		return { redirectUrl: result.url };
	},

	async verifyWebhook(request: Request, rawBody: string): Promise<WebhookVerification> {
		const webhookSecret = requireWebhookSecret();
		const header = request.headers.get('stripe-signature');
		if (!header) {
			return { ok: false, reason: 'missing_signature' };
		}

		let timestamp: string | undefined;
		const signatures: string[] = [];
		for (const part of header.split(',')) {
			const [key, value] = part.split('=', 2);
			if (key?.trim() === 't') timestamp = value;
			if (key?.trim() === 'v1' && value) signatures.push(value);
		}
		if (!timestamp || signatures.length === 0) {
			return { ok: false, reason: 'malformed_signature_header' };
		}

		const timestampSeconds = Number.parseInt(timestamp, 10);
		if (!Number.isFinite(timestampSeconds)) {
			return { ok: false, reason: 'malformed_signature_header' };
		}
		const ageSeconds = Math.abs(Date.now() / 1000 - timestampSeconds);
		if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) {
			return { ok: false, reason: 'signature_timestamp_out_of_tolerance' };
		}

		const expected = await hmacHex('SHA-256', webhookSecret, `${timestamp}.${rawBody}`);
		const matches = signatures.some((sig) => timingSafeEqualHex(sig.toLowerCase(), expected));
		if (!matches) {
			return { ok: false, reason: 'invalid_signature' };
		}
		return { ok: true };
	},

	parseWebhook(rawBody: string): WebhookParseResult {
		let event: StripeEvent;
		try {
			event = JSON.parse(rawBody) as StripeEvent;
		} catch {
			return { ok: false, reason: 'invalid_json' };
		}
		if (!event.id || !event.type) {
			return { ok: false, reason: 'missing_event_fields' };
		}

		const object = event.data?.object ?? {};
		const metadata = asMetadata(object.metadata);

		const base = {
			provider: 'stripe' as const,
			providerEventId: event.id,
			eventType: event.type,
			reference: asString(object.client_reference_id) ?? metadata.reference,
			userId: metadata.userId,
			plan: normalizePaidTier(metadata.plan) ?? undefined,
			currency: asString(object.currency)?.toUpperCase(),
			payload: event
		};

		switch (event.type) {
			case 'checkout.session.completed':
				return {
					ok: true,
					event: {
						...base,
						kind: 'payment_succeeded',
						providerPaymentId: asString(object.payment_intent) ?? asString(object.id),
						providerSubscriptionId: asString(object.subscription),
						amountCents: asNumber(object.amount_total)
					}
				};
			case 'invoice.paid':
				return {
					ok: true,
					event: {
						...base,
						kind: 'payment_succeeded',
						providerPaymentId: asString(object.payment_intent) ?? asString(object.id),
						providerSubscriptionId: asString(object.subscription),
						amountCents: asNumber(object.amount_paid)
					}
				};
			case 'invoice.payment_failed':
				return {
					ok: true,
					event: {
						...base,
						kind: 'payment_failed',
						providerPaymentId: asString(object.payment_intent) ?? asString(object.id),
						providerSubscriptionId: asString(object.subscription)
					}
				};
			case 'customer.subscription.deleted':
				return {
					ok: true,
					event: {
						...base,
						kind: 'subscription_canceled',
						providerSubscriptionId: asString(object.id)
					}
				};
			default:
				return { ok: true, event: { ...base, kind: 'ignored' } };
		}
	}
};
