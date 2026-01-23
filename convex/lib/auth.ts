import type { QueryCtx, MutationCtx } from '../_generated/server';

/**
 * Get authenticated user ID from context.
 * Uses Convex native identity first (works in tests with withIdentity),
 * falls back to BetterAuth component for production.
 */
export async function getAuthUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
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
	} catch {
		// BetterAuth not available (e.g., in tests without auth module)
	}

	throw new Error('Not authenticated');
}
