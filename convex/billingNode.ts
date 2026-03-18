import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { BILLING_PLANS } from './lib/billing';
import { classifyExternalFetchError, fetchWithTimeout } from './lib/fetchWithTimeout';
import { buildPayfastSignature, normalizePayfastPassphrase, parseFormBody } from './lib/payfast';
import { sanitizeLogValue } from './lib/safeErrors';

const PAYFAST_VALIDATE_TIMEOUT_MS = 4_000;

function getPayfastValidateUrl() {
	const sandbox = process.env.PAYFAST_SANDBOX === 'true';
	return sandbox
		? 'https://sandbox.payfast.co.za/eng/query/validate'
		: 'https://www.payfast.co.za/eng/query/validate';
}

function normalizePlan(plan: string | undefined): 'ai' | 'pro' | null {
	if (plan === 'ai' || plan === 'pro') return plan;
	return null;
}

function toCents(amount: string | undefined) {
	if (!amount) return null;
	const n = Number.parseFloat(amount);
	if (!Number.isFinite(n)) return null;
	return Math.round(n * 100);
}

function logWebhookOutcome(
	level: 'info' | 'warn' | 'error',
	outcome: string,
	details: Record<string, unknown> = {}
) {
	const payload = sanitizeLogValue({ provider: 'payfast', outcome, ...details });
	if (level === 'warn') {
		console.warn('Billing webhook', payload);
		return;
	}
	if (level === 'error') {
		console.error('Billing webhook', payload);
		return;
	}
	console.info('Billing webhook', payload);
}

type TransitionResult = { applied?: boolean; reason?: string } | null;

export const payfastWebhook = httpAction(async (ctx, req) => {
	const rawBody = await req.text();
	const params = parseFormBody(rawBody);

	const merchantId = process.env.PAYFAST_MERCHANT_ID?.trim();
	if (!merchantId || params.merchant_id !== merchantId) {
		logWebhookOutcome('warn', 'validation_failed', { reason: 'merchant_mismatch' });
		return new Response('Merchant mismatch', { status: 400 });
	}

	const passphrase = normalizePayfastPassphrase(process.env.PAYFAST_PASSPHRASE);
	const receivedSignature = params.signature;
	const expectedSignature = buildPayfastSignature(params, passphrase);
	if (!receivedSignature || receivedSignature !== expectedSignature) {
		logWebhookOutcome('warn', 'invalid_signature', {
			providerPaymentId: params.pf_payment_id,
			paymentStatus: params.payment_status
		});
		return new Response('Invalid signature', { status: 400 });
	}

	let validateResponse: Response;
	try {
		validateResponse = await fetchWithTimeout(getPayfastValidateUrl(), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body: rawBody,
			timeoutMs: PAYFAST_VALIDATE_TIMEOUT_MS,
			service: 'payfast',
			operation: 'webhook_validate',
			retries: 0
		});
	} catch (error) {
		logWebhookOutcome('warn', 'validation_failed', {
			reason: 'provider_validation_request_failed',
			errorType: classifyExternalFetchError(error),
			providerPaymentId: params.pf_payment_id,
			paymentStatus: params.payment_status
		});
		return new Response('Validation failed', { status: 400 });
	}

	const validateText = await validateResponse.text();
	if (!validateResponse.ok || validateText.trim() !== 'VALID') {
		logWebhookOutcome('warn', 'validation_failed', {
			reason: 'provider_validation_failed',
			providerPaymentId: params.pf_payment_id,
			paymentStatus: params.payment_status
		});
		return new Response('Validation failed', { status: 400 });
	}

	const providerPaymentId = params.pf_payment_id;
	const paymentStatus = params.payment_status;
	const merchantReference = params.m_payment_id;
	const providerEventId = params.signature ?? [providerPaymentId, paymentStatus, params.amount_gross].join(':');

	const eventResult = await ctx.runMutation(internal.billingEvents.insert, {
		provider: 'payfast',
		providerEventId,
		providerPaymentId,
		userId: params.custom_str1,
		eventType: paymentStatus,
		payload: params
	});
	if (eventResult.duplicate) {
		logWebhookOutcome('info', 'duplicate', {
			providerEventId,
			providerPaymentId,
			paymentStatus
		});
		return new Response('OK', { status: 200 });
	}

	if (!merchantReference || !paymentStatus) {
		logWebhookOutcome('warn', 'no_mapping', {
			reason: 'missing_reference_or_status',
			providerEventId,
			providerPaymentId
		});
		return new Response('Missing mapping', { status: 200 });
	}

	const subscription = await ctx.runQuery(internal.billingSubscriptions.getByPayfastReference, {
		reference: merchantReference
	});
	if (!subscription) {
		logWebhookOutcome('warn', 'no_mapping', {
			reason: 'subscription_not_found',
			reference: merchantReference,
			providerPaymentId,
			paymentStatus
		});
		return new Response('Unknown subscription', { status: 200 });
	}

	const subscriptionPlan = normalizePlan(subscription.plan);
	if (!subscriptionPlan) {
		logWebhookOutcome('warn', 'validation_failed', {
			reason: 'invalid_subscription_plan',
			subscriptionId: subscription._id,
			reference: merchantReference
		});
		return new Response('Invalid subscription plan', { status: 400 });
	}

	const plan = normalizePlan(params.custom_str2) ?? subscriptionPlan;
	const userId = params.custom_str1 ?? subscription.userId;
	if (plan !== subscriptionPlan || userId !== subscription.userId) {
		logWebhookOutcome('warn', 'validation_failed', {
			reason: 'subscription_mismatch',
			subscriptionId: subscription._id,
			reference: merchantReference,
			paymentStatus
		});
		return new Response('Subscription mismatch', { status: 400 });
	}

	const expectedCents = BILLING_PLANS[plan].amountZar * 100;
	const grossCents = toCents(params.amount_gross);
	if (paymentStatus === 'COMPLETE' && grossCents !== null && grossCents !== expectedCents) {
		logWebhookOutcome('warn', 'validation_failed', {
			reason: 'amount_mismatch',
			subscriptionId: subscription._id,
			reference: merchantReference,
			providerPaymentId,
			grossCents,
			expectedCents
		});
		return new Response('Amount mismatch', { status: 400 });
	}

	let subscriptionTransition: TransitionResult = null;
	let entitlementTransition: TransitionResult = null;

	if (paymentStatus === 'COMPLETE') {
		subscriptionTransition = await ctx.runMutation(internal.billingSubscriptions.setStatus, {
			subscriptionId: subscription._id,
			status: 'active',
			providerPaymentId: providerPaymentId ?? null,
			providerSubscriptionToken: params.token ?? null
		});

		entitlementTransition = await ctx.runMutation(internal.billing.setEntitlement, {
			userId,
			tier: plan,
			status: 'active',
			source: 'webhook'
		});
	}

	if (paymentStatus === 'FAILED') {
		subscriptionTransition = await ctx.runMutation(internal.billingSubscriptions.setStatus, {
			subscriptionId: subscription._id,
			status: 'past_due',
			providerPaymentId: providerPaymentId ?? null,
			providerSubscriptionToken: params.token ?? null
		});

		entitlementTransition = await ctx.runMutation(internal.billing.setEntitlement, {
			userId,
			tier: plan,
			status: 'past_due',
			source: 'webhook'
		});
	}

	if (paymentStatus === 'CANCELLED') {
		subscriptionTransition = await ctx.runMutation(internal.billingSubscriptions.setStatus, {
			subscriptionId: subscription._id,
			status: 'canceled',
			providerPaymentId: providerPaymentId ?? null,
			providerSubscriptionToken: params.token ?? null
		});

		entitlementTransition = await ctx.runMutation(internal.billing.setEntitlement, {
			userId,
			tier: 'free',
			status: 'canceled',
			source: 'webhook'
		});
	}

	if (!subscriptionTransition && !entitlementTransition) {
		logWebhookOutcome('info', 'processed', {
			subscriptionId: subscription._id,
			reference: merchantReference,
			providerPaymentId,
			paymentStatus,
			applied: false,
			reason: 'ignored_event_type'
		});
		return new Response('OK', { status: 200 });
	}

	logWebhookOutcome('info', 'processed', {
		subscriptionId: subscription._id,
		reference: merchantReference,
		providerPaymentId,
		paymentStatus,
		subscriptionApplied: subscriptionTransition?.applied ?? false,
		subscriptionReason: subscriptionTransition?.reason ?? null,
		entitlementApplied: entitlementTransition?.applied ?? false,
		entitlementReason: entitlementTransition?.reason ?? null
	});

	return new Response('OK', { status: 200 });
});
