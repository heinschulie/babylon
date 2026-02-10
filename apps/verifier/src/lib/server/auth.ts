import { betterAuth } from 'better-auth';
import { env } from '$env/dynamic/private';

/**
 * Server-side createAuth for token extraction in hooks.
 * This is a minimal configuration that only needs to match
 * the cookie settings from the Convex-hosted auth.
 */
export const createAuth = () => {
	const siteUrl = env.SITE_URL;
	const secret = env.BETTER_AUTH_SECRET;
	if (!siteUrl || !secret) {
		throw new Error('Missing SITE_URL or BETTER_AUTH_SECRET for BetterAuth');
	}

	return betterAuth({
		baseURL: siteUrl,
		secret,
		trustedOrigins: [
			'http://localhost:5173',
			'http://localhost:5178',
			'http://localhost:5180',
			'https://intaka.netlify.app',
			env.VERIFIER_SITE_URL
		].filter(Boolean) as string[]
	});
};
