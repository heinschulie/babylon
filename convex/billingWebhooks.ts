import { httpAction, type ActionCtx } from './_generated/server';
import { internal } from './_generated/api';
import { BILLING_PLANS } from './lib/billing';
import {
	getBillingProvider,
	normalizePaidTier,
	type BillingProvider,
	type NormalizedBillingEvent
} from './lib/billingProviders';
import { sanitizeLogValue } from './lib/safeErrors';

function logWebhookOutcome(
	level: 'info' | 'warn' | 'error',
	provider: string,
	outcome: string,
	details: Record<string, unknown> = {}
) {
	const payload = sanitizeLogValue({ provider, outcome, ...details });
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

/**
 * Provider-agnostic webhook pipeline:
 * verify signature → normalize → dedup → map to subscription → validate
 * plan/user/amount → transition subscription + entitlement.
 *
 * Subscription/entitlement state machines (billingSubscriptions.setStatus,
 * billing.setEntitlement) make transitions duplicate- and out-of-order-safe,
 * so replayed or late events cannot regress state.
 */
function createProviderWebhook(provider: BillingProvider) {
	return httpAction(async (ctx, req) => {
		const rawBody = await req.text();

		const verification = await provider.verifyWebhook(req, rawBody);
		if (!verification.ok) {
			logWebhookOutcome('warn', provider.name, 'verification_failed', {
				reason: verification.reason
			});
			return new Response('Invalid signature', { status: 400 });
		}

		const parsed = provider.parseWebhook(rawBody);
		if (!parsed.ok) {
			logWebhookOutcome('warn', provider.name, 'parse_failed', { reason: parsed.reason });
			return new Response('Invalid payload', { status: 400 });
		}
		const event = parsed.event;

		const eventResult = await ctx.runMutation(internal.billingEvents.insert, {
			provider: event.provider,
			providerEventId: event.providerEventId,
			providerPaymentId: event.providerPaymentId,
			userId: event.userId,
			eventType: event.eventType,
			payload: event.payload
		});
		if (eventResult.duplicate) {
			logWebhookOutcome('info', provider.name, 'duplicate', {
				providerEventId: event.providerEventId,
				eventType: event.eventType
			});
			return new Response('OK', { status: 200 });
		}

		if (event.kind === 'ignored') {
			logWebhookOutcome('info', provider.name, 'ignored_event_type', {
				eventType: event.eventType
			});
			return new Response('OK', { status: 200 });
		}

		const subscription = await findSubscription(ctx, event);
		if (!subscription) {
			logWebhookOutcome('warn', provider.name, 'no_mapping', {
				reference: event.reference ?? null,
				providerSubscriptionId: event.providerSubscriptionId ?? null,
				eventType: event.eventType
			});
			return new Response('Unknown subscription', { status: 200 });
		}

		const subscriptionPlan = normalizePaidTier(subscription.plan);
		if (!subscriptionPlan) {
			logWebhookOutcome('warn', provider.name, 'validation_failed', {
				reason: 'invalid_subscription_plan',
				subscriptionId: subscription._id
			});
			return new Response('Invalid subscription plan', { status: 400 });
		}

		const plan = event.plan ?? subscriptionPlan;
		const userId = event.userId ?? subscription.userId;
		if (plan !== subscriptionPlan || userId !== subscription.userId) {
			logWebhookOutcome('warn', provider.name, 'validation_failed', {
				reason: 'subscription_mismatch',
				subscriptionId: subscription._id,
				eventType: event.eventType
			});
			return new Response('Subscription mismatch', { status: 400 });
		}

		if (event.kind === 'payment_succeeded' && event.amountCents != null) {
			const expectedCents = BILLING_PLANS[plan].prices[provider.currency];
			const currencyMatches = !event.currency || event.currency === provider.currency;
			if (!currencyMatches || event.amountCents !== expectedCents) {
				logWebhookOutcome('warn', provider.name, 'validation_failed', {
					reason: 'amount_mismatch',
					subscriptionId: subscription._id,
					amountCents: event.amountCents,
					currency: event.currency ?? null,
					expectedCents
				});
				return new Response('Amount mismatch', { status: 400 });
			}
		}

		let subscriptionTransition: TransitionResult = null;
		let entitlementTransition: TransitionResult = null;

		const statusByKind = {
			payment_succeeded: 'active',
			payment_failed: 'past_due',
			subscription_canceled: 'canceled'
		} as const;
		const nextStatus = statusByKind[event.kind];

		subscriptionTransition = await ctx.runMutation(internal.billingSubscriptions.setStatus, {
			subscriptionId: subscription._id,
			status: nextStatus,
			providerPaymentId: event.providerPaymentId ?? null,
			providerSubscriptionId: event.providerSubscriptionId ?? null
		});

		entitlementTransition = await ctx.runMutation(internal.billing.setEntitlement, {
			userId,
			tier: nextStatus === 'canceled' ? 'free' : plan,
			status: nextStatus,
			source: 'webhook'
		});

		logWebhookOutcome('info', provider.name, 'processed', {
			subscriptionId: subscription._id,
			eventType: event.eventType,
			kind: event.kind,
			subscriptionApplied: subscriptionTransition?.applied ?? false,
			subscriptionReason: subscriptionTransition?.reason ?? null,
			entitlementApplied: entitlementTransition?.applied ?? false,
			entitlementReason: entitlementTransition?.reason ?? null
		});

		return new Response('OK', { status: 200 });
	});
}

async function findSubscription(ctx: ActionCtx, event: NormalizedBillingEvent) {
	if (event.reference) {
		const byReference = await ctx.runQuery(internal.billingSubscriptions.getByReference, {
			provider: event.provider,
			reference: event.reference
		});
		if (byReference) return byReference;
	}
	if (event.providerSubscriptionId) {
		return await ctx.runQuery(internal.billingSubscriptions.getByProviderSubscriptionId, {
			provider: event.provider,
			providerSubscriptionId: event.providerSubscriptionId
		});
	}
	return null;
}

export const paystackWebhook = createProviderWebhook(getBillingProvider('paystack'));
export const stripeWebhook = createProviderWebhook(getBillingProvider('stripe'));
