import type { Cookies } from '@sveltejs/kit';
import { JWT_COOKIE_NAME } from '@convex-dev/better-auth/plugins';
import { env } from '$env/dynamic/private';
import { betterAuth } from 'better-auth';
import { createCookieGetter } from 'better-auth/cookies';

const LOCAL_ORIGINS = ['http://localhost:5173', 'http://localhost:5178', 'http://localhost:5180'];

const getTrustedOrigins = (requestOrigin?: string) =>
	Array.from(
		new Set(
			[
				...LOCAL_ORIGINS,
				requestOrigin,
				env.SITE_URL,
				env.VERIFIER_SITE_URL,
				env.URL,
				env.DEPLOY_URL,
				env.DEPLOY_PRIME_URL
			].filter(Boolean)
		)
	) as string[];

/**
 * Server-side createAuth for token extraction in hooks.
 * This is a minimal configuration that only needs to match
 * the cookie settings from the Convex-hosted auth.
 */
export const createAuth = (requestOrigin?: string) => {
	const siteUrl = requestOrigin ?? env.SITE_URL ?? env.DEPLOY_PRIME_URL ?? env.URL ?? env.DEPLOY_URL;
	const secret = env.BETTER_AUTH_SECRET;
	if (!siteUrl || !secret) {
		throw new Error('Missing SITE_URL or BETTER_AUTH_SECRET for BetterAuth');
	}

	return betterAuth({
		baseURL: siteUrl,
		secret,
		trustedOrigins: getTrustedOrigins(requestOrigin)
	});
};

export const getAuthToken = (cookies: Cookies, requestOrigin?: string) => {
	const options = createAuth(requestOrigin).options;
	const createCookie = createCookieGetter(options);
	const cookie = createCookie(JWT_COOKIE_NAME);
	const token = cookies.get(cookie.name);
	if (token) {
		return token;
	}

	const isSecure = cookie.name.startsWith('__Secure-');
	const insecureCookieName = cookie.name.replace('__Secure-', '');
	const secureCookieName = isSecure ? cookie.name : `__Secure-${insecureCookieName}`;

	return cookies.get(isSecure ? insecureCookieName : secureCookieName);
};
