import type { QueryCtx, MutationCtx } from '../_generated/server';

function envAdminUserIds(): Set<string> {
	const raw = process.env.ADMIN_USER_IDS ?? '';
	return new Set(
		raw
			.split(',')
			.map((value) => value.trim())
			.filter(Boolean)
	);
}

export async function isAdmin(ctx: QueryCtx | MutationCtx, userId: string): Promise<boolean> {
	if (envAdminUserIds().has(userId)) {
		return true;
	}
	const row = await ctx.db
		.query('admins')
		.withIndex('by_user', (q) => q.eq('userId', userId))
		.unique();
	return row !== null;
}

export async function assertAdmin(ctx: QueryCtx | MutationCtx, userId: string): Promise<void> {
	if (!(await isAdmin(ctx, userId))) {
		throw new Error('Admin access required');
	}
}
