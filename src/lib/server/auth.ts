import { betterAuth } from 'better-auth';
import { SITE_URL } from '$env/static/private';

/**
 * Server-side createAuth for token extraction in hooks.
 * This is a minimal configuration that only needs to match
 * the cookie settings from the Convex-hosted auth.
 */
export const createAuth = () => {
	return betterAuth({
		baseURL: SITE_URL
	});
};
