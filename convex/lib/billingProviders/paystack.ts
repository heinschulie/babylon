import { classifyExternalFetchError, fetchWithTimeout } from '../fetchWithTimeout';
import { hmacHex, timingSafeEqualHex } from './crypto';
import {
	normalizePaidTier,
	type BillingProvider,
	type CheckoutRequest,
	type CheckoutSession,
	type NormalizedBillingEvent,
	type WebhookParseResult,
	type WebhookVerification
} from './types';

const PAYSTACK_API_BASE = 'https://api.paystack.co';
const CHECKOUT_TIMEOUT_MS = 8_000;

function requireSecretKey() {
	const key = process.env.PAYSTACK_SECRET_KEY?.trim();
	if (!key) throw new Error('Missing env var: PAYSTACK_SECRET_KEY');
	return key;
}

/** Optional Paystack plan codes; when set, checkout creates a recurring subscription. */
function getPlanCode(plan: 'ai' | 'pro') {
	const key = plan === 'ai' ? 'PAYSTACK_PLAN_CODE_AI' : 'PAYSTACK_PLAN_CODE_PRO';
	return process.env[key]?.trim() || undefined;
}

type PaystackWebhookBody = {
	event?: string;
	data?: {
		id?: number | string;
		reference?: string;
		amount?: number;
		currency?: string;
		subscription_code?: string;
		metadata?: { reference?: string; userId?: string; plan?: string } | null;
		subscription?: { subscription_code?: string } | null;
		plan?: { plan_code?: string } | null;
	};
};

export const paystackProvider: BillingProvider = {
	name: 'paystack',
	currency: 'ZAR',

	async createCheckout(req: CheckoutRequest): Promise<CheckoutSession> {
		const secretKey = requireSecretKey();
		const planCode = getPlanCode(req.plan);

		const body: Record<string, unknown> = {
			email: req.email,
			// Paystack amounts are in subunits (cents for ZAR). Ignored when `plan` is set.
			amount: req.amountCents,
			currency: req.currency,
			reference: req.reference,
			callback_url: req.successUrl,
			metadata: {
				reference: req.reference,
				userId: req.userId,
				plan: req.plan,
				cancel_action: req.cancelUrl
			}
		};
		if (planCode) {
			body.plan = planCode;
		}

		let response: Response;
		try {
			response = await fetchWithTimeout(`${PAYSTACK_API_BASE}/transaction/initialize`, {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${secretKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(body),
				timeoutMs: CHECKOUT_TIMEOUT_MS,
				service: 'paystack',
				operation: 'checkout_initialize',
				retries: 1
			});
		} catch (error) {
			throw new Error(`Paystack checkout request failed: ${classifyExternalFetchError(error)}`);
		}

		const result = (await response.json().catch(() => null)) as {
			status?: boolean;
			message?: string;
			data?: { authorization_url?: string };
		} | null;

		if (!response.ok || !result?.status || !result.data?.authorization_url) {
			throw new Error(`Paystack checkout failed: ${result?.message ?? response.status}`);
		}

		return { redirectUrl: result.data.authorization_url };
	},

	async verifyWebhook(request: Request, rawBody: string): Promise<WebhookVerification> {
		const secretKey = requireSecretKey();
		const received = request.headers.get('x-paystack-signature');
		if (!received) {
			return { ok: false, reason: 'missing_signature' };
		}
		const expected = await hmacHex('SHA-512', secretKey, rawBody);
		if (!timingSafeEqualHex(received.toLowerCase(), expected)) {
			return { ok: false, reason: 'invalid_signature' };
		}
		return { ok: true };
	},

	parseWebhook(rawBody: string): WebhookParseResult {
		let body: PaystackWebhookBody;
		try {
			body = JSON.parse(rawBody) as PaystackWebhookBody;
		} catch {
			return { ok: false, reason: 'invalid_json' };
		}
		if (!body.event || typeof body.event !== 'string') {
			return { ok: false, reason: 'missing_event_type' };
		}

		const data = body.data ?? {};
		const metadata = data.metadata ?? {};
		const subscriptionCode = data.subscription_code ?? data.subscription?.subscription_code;
		const providerEventId = `${body.event}:${data.id ?? subscriptionCode ?? data.reference ?? 'unknown'}`;

		const base = {
			provider: 'paystack' as const,
			providerEventId,
			eventType: body.event,
			// Initial charges carry our reference directly; renewal charges only via metadata.
			reference: metadata.reference ?? data.reference,
			providerPaymentId: data.id != null ? String(data.id) : undefined,
			providerSubscriptionId: subscriptionCode,
			userId: metadata.userId,
			plan: normalizePaidTier(metadata.plan) ?? undefined,
			amountCents: typeof data.amount === 'number' ? data.amount : undefined,
			currency: data.currency?.toUpperCase(),
			payload: body
		};

		switch (body.event) {
			case 'charge.success':
				return { ok: true, event: { ...base, kind: 'payment_succeeded' } };
			case 'invoice.payment_failed':
				return { ok: true, event: { ...base, kind: 'payment_failed' } };
			case 'subscription.disable':
			case 'subscription.not_renew':
				return { ok: true, event: { ...base, kind: 'subscription_canceled' } };
			default:
				return { ok: true, event: { ...base, kind: 'ignored' } };
		}
	}
};

export type { NormalizedBillingEvent };
