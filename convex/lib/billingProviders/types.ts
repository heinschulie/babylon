export type BillingProviderName = 'paystack' | 'stripe';
export type SupportedCurrency = 'ZAR' | 'USD';
export type PaidTier = 'ai' | 'pro';

export type CheckoutRequest = {
	/** Our reference, roundtripped through provider metadata to map webhooks back. */
	reference: string;
	userId: string;
	email: string;
	plan: PaidTier;
	amountCents: number;
	currency: SupportedCurrency;
	successUrl: string;
	cancelUrl: string;
};

export type CheckoutSession = {
	redirectUrl: string;
};

export type BillingEventKind = 'payment_succeeded' | 'payment_failed' | 'subscription_canceled';

export type NormalizedBillingEvent = {
	kind: BillingEventKind | 'ignored';
	provider: BillingProviderName;
	/** Stable per-event id used for webhook dedup. */
	providerEventId: string;
	/** Raw provider event name (e.g. 'charge.success', 'invoice.paid'). */
	eventType: string;
	/** Our checkout reference, when the event carries it. */
	reference?: string;
	providerPaymentId?: string;
	providerSubscriptionId?: string;
	userId?: string;
	plan?: PaidTier;
	amountCents?: number;
	currency?: string;
	payload: unknown;
};

export type WebhookVerification = { ok: true } | { ok: false; reason: string };

export type WebhookParseResult =
	| { ok: true; event: NormalizedBillingEvent }
	| { ok: false; reason: string };

export interface BillingProvider {
	readonly name: BillingProviderName;
	/** The currency this provider charges in. Paystack: ZAR, Stripe: USD. */
	readonly currency: SupportedCurrency;
	/** Create a hosted checkout the client redirects to. Runs in a Convex action. */
	createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
	/** Verify webhook authenticity (signature headers over the raw body). */
	verifyWebhook(request: Request, rawBody: string): Promise<WebhookVerification>;
	/** Normalize a verified webhook body into a provider-agnostic event. */
	parseWebhook(rawBody: string): WebhookParseResult;
}

export function normalizePaidTier(value: string | undefined | null): PaidTier | null {
	if (value === 'ai' || value === 'pro') return value;
	return null;
}
