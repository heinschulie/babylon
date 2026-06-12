import type { MutationCtx, QueryCtx } from '../../_generated/server';
import { CLAIM_MAINTENANCE_BATCH } from './constants';

export async function assertVerifierLanguageAccess(
	ctx: QueryCtx,
	userId: string,
	languageCode: string
) {
	const profile = await ctx.db
		.query('verifierProfiles')
		.withIndex('by_user', (q) => q.eq('userId', userId))
		.unique();
	if (!profile || !profile.active) {
		throw new Error('Verifier profile is inactive');
	}

	const membership = await ctx.db
		.query('verifierLanguageMemberships')
		.withIndex('by_user_language', (q) => q.eq('userId', userId).eq('languageCode', languageCode))
		.unique();

	if (!membership || !membership.active) {
		throw new Error('Verifier is not authorized for this language');
	}
}

export async function reclaimExpiredClaims(ctx: MutationCtx, languageCode: string, now: number) {
	const expired = await ctx.db
		.query('humanReviewRequests')
		.withIndex('by_status_claim_deadline', (q) =>
			q.eq('status', 'claimed').lte('claimDeadlineAt', now)
		)
		.filter((q) => q.eq(q.field('languageCode'), languageCode))
		.take(CLAIM_MAINTENANCE_BATCH);

	for (const request of expired) {
		await ctx.db.patch(request._id, {
			status: 'pending',
			claimedByVerifierUserId: undefined,
			claimedAt: undefined,
			claimDeadlineAt: undefined,
			priorityAt: 0,
			updatedAt: now
		});
	}
}

export async function escalateExpiredSla(ctx: MutationCtx, languageCode: string, now: number) {
	const pendingExpired = await ctx.db
		.query('humanReviewRequests')
		.withIndex('by_status_sla', (q) => q.eq('status', 'pending').lte('slaDueAt', now))
		.filter((q) => q.eq(q.field('languageCode'), languageCode))
		.take(CLAIM_MAINTENANCE_BATCH);

	for (const request of pendingExpired) {
		await ctx.db.patch(request._id, {
			status: 'escalated',
			escalatedAt: now,
			escalatedReason: 'SLA exceeded while pending',
			claimedByVerifierUserId: undefined,
			claimedAt: undefined,
			claimDeadlineAt: undefined,
			updatedAt: now
		});
	}

	const claimedExpired = await ctx.db
		.query('humanReviewRequests')
		.withIndex('by_status_sla', (q) => q.eq('status', 'claimed').lte('slaDueAt', now))
		.filter((q) => q.eq(q.field('languageCode'), languageCode))
		.take(CLAIM_MAINTENANCE_BATCH);

	for (const request of claimedExpired) {
		await ctx.db.patch(request._id, {
			status: 'escalated',
			escalatedAt: now,
			escalatedReason: 'SLA exceeded while claimed',
			claimedByVerifierUserId: undefined,
			claimedAt: undefined,
			claimDeadlineAt: undefined,
			updatedAt: now
		});
	}
}
