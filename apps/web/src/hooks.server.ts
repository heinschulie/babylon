import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { sequence } from '@sveltejs/kit/hooks';
import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { createAuth } from '$lib/server/auth';
import { paraglideMiddleware } from '$lib/paraglide/server';

const STATIC_SECURITY_HEADERS = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy':
		'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), payment=(), usb=()'
} as const;

const securityHeadersHandle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
		if (!response.headers.has(name)) {
			response.headers.set(name, value);
		}
	}

	const forwardedProto = event.request.headers.get('x-forwarded-proto');
	const isSecureRequest = event.url.protocol === 'https:' || forwardedProto?.split(',')[0]?.trim() === 'https';
	if (!dev && isSecureRequest && !response.headers.has('strict-transport-security')) {
		response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains; preload');
	}

	return response;
};

const authHandle: Handle = async ({ event, resolve }) => {
	const token = await getToken(createAuth, event.cookies);
	event.locals.token = token;
	return resolve(event);
};

const i18nHandle: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
		event.request = localizedRequest;
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%lang%', locale)
		});
	});

export const handle = sequence(securityHeadersHandle, i18nHandle, authHandle);
