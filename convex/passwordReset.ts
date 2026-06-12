import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';

export const getLatestDebugLink = query({
	args: {
		email: v.string()
	},
	handler: async (ctx, args) => {
		if (!passwordResetDebugEnabled()) {
			return null;
		}

		const email = normalizeEmail(args.email);
		const link = await ctx.db
			.query('passwordResetDebugLinks')
			.withIndex('by_email_createdAt', (q) => q.eq('email', email))
			.order('desc')
			.first();

		if (!link || link.expiresAt < Date.now()) {
			return null;
		}

		return {
			url: link.url,
			expiresAt: link.expiresAt
		};
	}
});

export const storeDebugLink = internalMutation({
	args: {
		email: v.string(),
		url: v.string(),
		expiresAt: v.number()
	},
	handler: async (ctx, args) => {
		const email = normalizeEmail(args.email);

		// Superseded links are useless (latest wins) — clear them so the table
		// doesn't grow unbounded.
		const stale = await ctx.db
			.query('passwordResetDebugLinks')
			.withIndex('by_email', (q) => q.eq('email', email))
			.collect();
		for (const link of stale) {
			await ctx.db.delete(link._id);
		}

		await ctx.db.insert('passwordResetDebugLinks', {
			email,
			url: args.url,
			expiresAt: args.expiresAt,
			createdAt: Date.now()
		});
	}
});

function passwordResetDebugEnabled() {
	const override = parseBooleanEnv(process.env.AUTH_PASSWORD_RESET_DEBUG);
	const isProduction = (process.env.NODE_ENV ?? 'development') === 'production';

	// Must mirror getPasswordResetDeliveryConfig in auth.ts: the debug query
	// exposes one-time reset URLs unauthenticated, so production requires an
	// explicit opt-in.
	if (isProduction) {
		return override === true;
	}

	return override ?? !hasPasswordResetEmailConfig();
}

function hasPasswordResetEmailConfig() {
	return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.AUTH_EMAIL_FROM?.trim());
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
	if (value == null || value.trim() === '') return undefined;

	const normalized = value.trim().toLowerCase();
	if (normalized === 'true') return true;
	if (normalized === 'false') return false;
	return undefined;
}

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}
