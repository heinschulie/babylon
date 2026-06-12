import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth';
import { components, internal } from './_generated/api';
import type { DataModel } from './_generated/dataModel';
import authConfig from './auth.config';

const LOCAL_TRUSTED_ORIGINS = new Set([
	'http://localhost:5173',
	'http://localhost:5178',
	'http://localhost:5180'
]);

export const authComponent = createClient<DataModel>(components.betterAuth);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
	const env = readAuthEnv();
	const trustedOrigins = buildTrustedOrigins(env);
	const requireEmailVerification = resolveRequireEmailVerification(env);

	if (env.isProduction && !env.verifierSiteUrl) {
		console.warn(
			'VERIFIER_SITE_URL is not set in production; verifier-origin auth requests may be rejected.'
		);
	}

	return betterAuth({
		baseURL: env.siteUrl,
		secret: env.authSecret,
		trustedOrigins,
		database: authComponent.adapter(ctx),
		emailAndPassword: {
			enabled: true,
			requireEmailVerification,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, url }, request) => {
				const delivery = getPasswordResetDeliveryConfig(env);
				const normalizedEmail = normalizeEmail(user.email);

				if (delivery.canSendEmail) {
					await sendPasswordResetEmail({
						to: normalizedEmail,
						resetUrl: url,
						siteUrl: env.siteUrl,
						request: request ?? new Request(url),
						apiKey: delivery.apiKey!,
						from: delivery.from!,
						replyTo: delivery.replyTo
					});
				}

				if (delivery.debugEnabled) {
					if (!('runMutation' in ctx)) {
						throw new Error('Password reset debug links require an action context.');
					}
					await ctx.runMutation(internal.passwordReset.storeDebugLink, {
						email: normalizedEmail,
						url,
						expiresAt: Date.now() + 15 * 60 * 1000
					});
					console.warn('Password reset debug link generated', { email: normalizedEmail });
				}

				if (!delivery.canSendEmail && !delivery.debugEnabled) {
					throw new Error(
						'Password reset delivery is not configured. Set RESEND_API_KEY/AUTH_EMAIL_FROM or enable AUTH_PASSWORD_RESET_DEBUG.'
					);
				}
			}
		},
		emailVerification: {
			sendOnSignUp: requireEmailVerification,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				const delivery = getPasswordResetDeliveryConfig(env);
				if (!delivery.canSendEmail) {
					// Without a sender, requiring verification would strand new users.
					console.error(
						'Verification email requested but RESEND_API_KEY/AUTH_EMAIL_FROM are not configured.'
					);
					return;
				}
				await sendVerificationEmailViaResend({
					to: normalizeEmail(user.email),
					verifyUrl: url,
					siteUrl: env.siteUrl,
					apiKey: delivery.apiKey!,
					from: delivery.from!,
					replyTo: delivery.replyTo
				});
			}
		},
		plugins: [convex({ authConfig })]
	});
};

type AuthEnv = {
	siteUrl: string;
	authSecret: string;
	verifierSiteUrl?: string;
	adminSiteUrl?: string;
	nodeEnv: string;
	isProduction: boolean;
	allowLocalhostOrigins: boolean;
	requireEmailVerificationOverride?: boolean;
	allowUnverifiedEmailsInProduction: boolean;
	extraTrustedOrigins: string[];
};

function readAuthEnv(): AuthEnv {
	const siteUrl = requireEnv('SITE_URL');
	const authSecret = requireEnv('BETTER_AUTH_SECRET');
	const nodeEnv = process.env.NODE_ENV ?? 'development';
	const isProduction = nodeEnv === 'production';
	const verifierSiteUrl = normalizeOptionalUrl(process.env.VERIFIER_SITE_URL, 'VERIFIER_SITE_URL');
	const adminSiteUrl = normalizeOptionalUrl(process.env.ADMIN_SITE_URL, 'ADMIN_SITE_URL');
	const allowLocalhostOrigins = parseBooleanEnv('AUTH_ALLOW_LOCALHOST_ORIGINS') ?? !isProduction;
	const requireEmailVerificationOverride = parseBooleanEnv('AUTH_REQUIRE_EMAIL_VERIFICATION');
	const allowUnverifiedEmailsInProduction =
		parseBooleanEnv('AUTH_ALLOW_UNVERIFIED_EMAILS_PROD') === true;
	const extraTrustedOrigins = parseCommaSeparatedEnv('AUTH_EXTRA_TRUSTED_ORIGINS');

	assertValidUrl(siteUrl, 'SITE_URL');

	return {
		siteUrl,
		authSecret,
		verifierSiteUrl,
		adminSiteUrl,
		nodeEnv,
		isProduction,
		allowLocalhostOrigins,
		requireEmailVerificationOverride,
		allowUnverifiedEmailsInProduction,
		extraTrustedOrigins
	};
}

function resolveRequireEmailVerification(env: AuthEnv): boolean {
	const requireEmailVerification = env.requireEmailVerificationOverride ?? env.isProduction;

	if (env.isProduction && !requireEmailVerification && !env.allowUnverifiedEmailsInProduction) {
		throw new Error(
			'Production auth requires email verification by default. Set AUTH_REQUIRE_EMAIL_VERIFICATION=true or explicitly acknowledge risk with AUTH_ALLOW_UNVERIFIED_EMAILS_PROD=true.'
		);
	}

	if (env.isProduction && !requireEmailVerification) {
		console.warn(
			'Email verification is disabled in production via explicit override. Restrict high-risk actions until rollout is complete.'
		);
	}

	return requireEmailVerification;
}

function buildTrustedOrigins(env: AuthEnv): string[] {
	const candidates = new Set<string>();
	candidates.add(env.siteUrl);
	if (env.verifierSiteUrl) {
		candidates.add(env.verifierSiteUrl);
	}
	if (env.adminSiteUrl) {
		candidates.add(env.adminSiteUrl);
	}
	if (env.allowLocalhostOrigins) {
		for (const origin of LOCAL_TRUSTED_ORIGINS) {
			candidates.add(origin);
		}
	}
	for (const origin of env.extraTrustedOrigins) {
		candidates.add(origin);
	}

	const trustedOrigins: string[] = [];
	for (const origin of candidates) {
		assertValidUrl(origin, 'trusted origin');
		const normalizedOrigin = new URL(origin).origin;
		const isLocalhost = normalizedOrigin.startsWith('http://localhost:');
		if (env.isProduction && isLocalhost && !env.allowLocalhostOrigins) {
			continue;
		}
		if (env.isProduction && !isLocalhost && !normalizedOrigin.startsWith('https://')) {
			throw new Error(`Production trusted origin must use https: ${normalizedOrigin}`);
		}
		trustedOrigins.push(normalizedOrigin);
	}

	return Array.from(new Set(trustedOrigins));
}

function requireEnv(name: string): string {
	const value = process.env[name]?.trim();
	if (!value) {
		throw new Error(`Missing required auth environment variable: ${name}`);
	}
	return value;
}

function parseBooleanEnv(name: string): boolean | undefined {
	const raw = process.env[name];
	if (raw == null || raw.trim() === '') return undefined;
	const normalized = raw.trim().toLowerCase();
	if (normalized === 'true') return true;
	if (normalized === 'false') return false;
	throw new Error(`Invalid boolean environment variable ${name}: ${raw}`);
}

function parseCommaSeparatedEnv(name: string): string[] {
	const raw = process.env[name];
	if (raw == null || raw.trim() === '') return [];
	return raw
		.split(',')
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function normalizeOptionalUrl(value: string | undefined, name: string): string | undefined {
	if (!value || !value.trim()) return undefined;
	const trimmed = value.trim();
	assertValidUrl(trimmed, name);
	return trimmed;
}

function assertValidUrl(value: string, name: string) {
	try {
		// eslint-disable-next-line no-new
		new URL(value);
	} catch {
		throw new Error(`Invalid URL for ${name}: ${value}`);
	}
}

function normalizeEmail(email: string) {
	return email.trim().toLowerCase();
}

function getPasswordResetDeliveryConfig(env: AuthEnv) {
	const apiKey = process.env.RESEND_API_KEY?.trim();
	const from = process.env.AUTH_EMAIL_FROM?.trim();
	const replyTo = process.env.AUTH_EMAIL_REPLY_TO?.trim();
	const debugOverride = parseBooleanEnv('AUTH_PASSWORD_RESET_DEBUG');
	const canSendEmail = Boolean(apiKey && from);

	// Debug links expose one-time reset URLs to an unauthenticated query, which is
	// account takeover if it ever runs in production. Never auto-enable there.
	const debugEnabled = env.isProduction
		? debugOverride === true
		: (debugOverride ?? !canSendEmail);

	if (env.isProduction && debugEnabled) {
		console.warn(
			'AUTH_PASSWORD_RESET_DEBUG=true in production: reset links are exposed via debug query.'
		);
	}

	return { apiKey, from, replyTo, canSendEmail, debugEnabled };
}

async function sendResendEmail(args: {
	to: string;
	subject: string;
	text: string;
	html: string;
	apiKey: string;
	from: string;
	replyTo?: string;
}) {
	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${args.apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			from: args.from,
			to: [args.to],
			reply_to: args.replyTo ? [args.replyTo] : undefined,
			subject: args.subject,
			text: args.text,
			html: args.html
		})
	});

	if (!response.ok) {
		const body = await response.text();
		throw new Error(`Resend email failed: ${response.status} ${body}`);
	}
}

async function sendPasswordResetEmail(args: {
	to: string;
	resetUrl: string;
	siteUrl: string;
	request: Request;
	apiKey: string;
	from: string;
	replyTo?: string;
}) {
	const appHost = new URL(args.siteUrl).hostname;
	const userAgent = args.request.headers.get('user-agent') ?? 'unknown device';
	const text = [
		`Reset your ${appHost} password.`,
		'',
		`Open this link to choose a new password: ${args.resetUrl}`,
		'',
		`If you did not request this, you can ignore this email.`,
		`Request came from: ${userAgent}`
	].join('\n');

	const html = [
		`<p>Reset your password for <strong>${escapeHtml(appHost)}</strong>.</p>`,
		`<p><a href="${escapeHtml(args.resetUrl)}">Choose a new password</a></p>`,
		`<p>If you did not request this, you can ignore this email.</p>`,
		`<p style="color:#666;font-size:12px">Request came from: ${escapeHtml(userAgent)}</p>`
	].join('');

	await sendResendEmail({
		to: args.to,
		subject: 'Reset your password',
		text,
		html,
		apiKey: args.apiKey,
		from: args.from,
		replyTo: args.replyTo
	});
}

async function sendVerificationEmailViaResend(args: {
	to: string;
	verifyUrl: string;
	siteUrl: string;
	apiKey: string;
	from: string;
	replyTo?: string;
}) {
	const appHost = new URL(args.siteUrl).hostname;
	const text = [
		`Welcome to ${appHost}!`,
		'',
		`Confirm your email address to finish setting up your account: ${args.verifyUrl}`,
		'',
		`If you did not create this account, you can ignore this email.`
	].join('\n');

	const html = [
		`<p>Welcome to <strong>${escapeHtml(appHost)}</strong>!</p>`,
		`<p><a href="${escapeHtml(args.verifyUrl)}">Confirm your email address</a></p>`,
		`<p>If you did not create this account, you can ignore this email.</p>`
	].join('');

	await sendResendEmail({
		to: args.to,
		subject: 'Confirm your email',
		text,
		html,
		apiKey: args.apiKey,
		from: args.from,
		replyTo: args.replyTo
	});
}

function escapeHtml(value: string) {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
