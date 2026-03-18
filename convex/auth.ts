import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins';
import { components } from './_generated/api';
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
			requireEmailVerification
		},
		plugins: [
			organization({
				allowUserToCreateOrganization: false,
				teams: {
					enabled: true
				}
			}),
			convex({ authConfig })
		]
	});
};

type AuthEnv = {
	siteUrl: string;
	authSecret: string;
	verifierSiteUrl?: string;
	nodeEnv: string;
	isProduction: boolean;
	allowLocalhostOrigins: boolean;
	requireEmailVerificationOverride?: boolean;
	allowUnverifiedEmailsInProduction: boolean;
};

function readAuthEnv(): AuthEnv {
	const siteUrl = requireEnv('SITE_URL');
	const authSecret = requireEnv('BETTER_AUTH_SECRET');
	const nodeEnv = process.env.NODE_ENV ?? 'development';
	const isProduction = nodeEnv === 'production';
	const verifierSiteUrl = normalizeOptionalUrl(process.env.VERIFIER_SITE_URL, 'VERIFIER_SITE_URL');
	const allowLocalhostOrigins = parseBooleanEnv('AUTH_ALLOW_LOCALHOST_ORIGINS') ?? !isProduction;
	const requireEmailVerificationOverride = parseBooleanEnv('AUTH_REQUIRE_EMAIL_VERIFICATION');
	const allowUnverifiedEmailsInProduction =
		parseBooleanEnv('AUTH_ALLOW_UNVERIFIED_EMAILS_PROD') === true;

	assertValidUrl(siteUrl, 'SITE_URL');

	return {
		siteUrl,
		authSecret,
		verifierSiteUrl,
		nodeEnv,
		isProduction,
		allowLocalhostOrigins,
		requireEmailVerificationOverride,
		allowUnverifiedEmailsInProduction
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
	if (env.allowLocalhostOrigins) {
		for (const origin of LOCAL_TRUSTED_ORIGINS) {
			candidates.add(origin);
		}
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
