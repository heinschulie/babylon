import type { QueryCtx, MutationCtx, ActionCtx } from '../_generated/server';

/**
 * Get authenticated user ID from context.
 * Uses Convex native identity first (works in tests with withIdentity),
 * falls back to BetterAuth component for production.
 */
export async function getAuthUserId(ctx: QueryCtx | MutationCtx | ActionCtx): Promise<string> {
	// Try Convex native identity first (works in tests)
	const identity = await ctx.auth.getUserIdentity();
	if (identity?.subject) {
		return identity.subject;
	}

	// Try BetterAuth (production with session token)
	try {
		const { authComponent } = await import('../auth');
		const user = await authComponent.getAuthUser(ctx);
		if (user) {
			return user.userId ?? user._id;
		}
	} catch (error) {
		// Expected in tests without the auth module; anything else (network, DB)
		// should be visible in logs rather than masquerading as a 401.
		console.warn('BetterAuth user lookup failed', {
			error: error instanceof Error ? error.message : 'unknown'
		});
	}

	throw new Error('Not authenticated');
}
