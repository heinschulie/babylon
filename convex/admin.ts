import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';
import { assertAdmin, isAdmin } from './lib/admin';

export const getMyAdminState = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		return { isAdmin: await isAdmin(ctx, userId) };
	}
});

export const listAdmins = query({
	args: {},
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		await assertAdmin(ctx, userId);
		const rows = await ctx.db.query('admins').collect();
		return rows.map((row) => ({
			userId: row.userId,
			grantedBy: row.grantedBy,
			createdAt: row.createdAt
		}));
	}
});

export const grantAdmin = mutation({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const callerId = await getAuthUserId(ctx);
		await assertAdmin(ctx, callerId);

		const existing = await ctx.db
			.query('admins')
			.withIndex('by_user', (q) => q.eq('userId', args.userId))
			.unique();
		if (existing) return;

		await ctx.db.insert('admins', {
			userId: args.userId,
			grantedBy: callerId,
			createdAt: Date.now()
		});
	}
});

export const revokeAdmin = mutation({
	args: { userId: v.string() },
	handler: async (ctx, args) => {
		const callerId = await getAuthUserId(ctx);
		await assertAdmin(ctx, callerId);
		if (args.userId === callerId) {
			throw new Error('Cannot revoke your own admin access');
		}

		const existing = await ctx.db
			.query('admins')
			.withIndex('by_user', (q) => q.eq('userId', args.userId))
			.unique();
		if (existing) {
			await ctx.db.delete(existing._id);
		}
	}
});
