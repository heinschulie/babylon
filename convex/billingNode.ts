import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { BILLING_PLANS } from './lib/billing';
import { buildPayfastSignature, parseFormBody } from './lib/payfast';

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

export const payfastWebhook = httpAction(async (ctx, req) => {
	const rawBody = await req.text();
	const params = parseFormBody(rawBody);

	const merchantId = process.env.PAYFAST_MERCHANT_ID;
	if (!merchantId || params.merchant_id !== merchantId) {
		return new Response('Merchant mismatch', { status: 400 });
	}

	const passphrase = process.env.PAYFAST_PASSPHRASE;
	const receivedSignature = params.signature;
	const expectedSignature = buildPayfastSignature(params, passphrase);
	if (!receivedSignature || receivedSignature !== expectedSignature) {
		return new Response('Invalid signature', { status: 400 });
	}

	const validateResponse = await fetch(getPayfastValidateUrl(), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: rawBody
	});

	const validateText = await validateResponse.text();
	if (!validateResponse.ok || validateText.trim() !== 'VALID') {
		return new Response('Validation failed', { status: 400 });
	}

	const providerPaymentId = params.pf_payment_id;
	const paymentStatus = params.payment_status;
	const subscriptionId = params.m_payment_id as Id<'billingSubscriptions'> | undefined;
	const userId = params.custom_str1;
	const plan = normalizePlan(params.custom_str2);
	const providerEventId = params.signature ?? [providerPaymentId, paymentStatus, params.amount_gross].join(':');

	const eventResult = await ctx.runMutation(internal.billingEvents.insert, {
		provider: 'payfast',
		providerEventId,
		providerPaymentId,
		userId,
		eventType: paymentStatus,
		payload: params
	});
	if (eventResult.duplicate) {
		return new Response('OK', { status: 200 });
	}

	if (!subscriptionId || !userId || !plan || !paymentStatus) {
		return new Response('Missing mapping', { status: 200 });
	}

	const subscription = await ctx.runQuery(internal.billingSubscriptions.getForWebhook, {
		subscriptionId
	});
	if (!subscription) {
		return new Response('Unknown subscription', { status: 200 });
	}

	if (subscription.userId !== userId || subscription.plan !== plan) {
		return new Response('Subscription mismatch', { status: 400 });
	}

	const expectedCents = BILLING_PLANS[plan].amountZar * 100;
	const grossCents = toCents(params.amount_gross);
	if (paymentStatus === 'COMPLETE' && grossCents !== null && grossCents !== expectedCents) {
		return new Response('Amount mismatch', { status: 400 });
	}

	if (paymentStatus === 'COMPLETE') {
		await ctx.runMutation(internal.billingSubscriptions.setStatus, {
			subscriptionId,
			status: 'active',
			providerPaymentId: providerPaymentId ?? null,
			providerSubscriptionToken: params.token ?? null
		});

		await ctx.runMutation(internal.billing.setEntitlement, {
			userId,
			tier: plan,
			status: 'active',
			source: 'webhook'
		});
	}

	if (paymentStatus === 'FAILED') {
		await ctx.runMutation(internal.billingSubscriptions.setStatus, {
			subscriptionId,
			status: 'past_due',
			providerPaymentId: providerPaymentId ?? null,
			providerSubscriptionToken: params.token ?? null
		});

		await ctx.runMutation(internal.billing.setEntitlement, {
			userId,
			tier: plan,
			status: 'past_due',
			source: 'webhook'
		});
	}

	if (paymentStatus === 'CANCELLED') {
		await ctx.runMutation(internal.billingSubscriptions.setStatus, {
			subscriptionId,
			status: 'canceled',
			providerPaymentId: providerPaymentId ?? null,
			providerSubscriptionToken: params.token ?? null
		});

		await ctx.runMutation(internal.billing.setEntitlement, {
			userId,
			tier: 'free',
			status: 'canceled',
			source: 'webhook'
		});
	}

	return new Response('OK', { status: 200 });
});
