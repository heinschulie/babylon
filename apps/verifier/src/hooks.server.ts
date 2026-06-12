import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getAuthToken } from '$lib/server/auth';
import { paraglideMiddleware } from '$lib/paraglide/server';

const STATIC_SECURITY_HEADERS = {
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'permissions-policy':
		'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), payment=(), usb=()'
} as const;

const securityHeadersHandle: Handle = async ({ event, resolve }) => {
	const resolved = await resolve(event);
	// Clone via Response-as-ResponseInit: resolved headers can be immutable on Netlify.
	const response = new Response(resolved.body, resolved);

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

const PUBLIC_ROUTES = new Set(['/login', '/register', '/forgot-password', '/reset-password']);
const PUBLIC_PREFIXES = ['/api/auth'];

const authHandle: Handle = async ({ event, resolve }) => {
	try {
		event.locals.token = getAuthToken(event.cookies, event.url.origin);
	} catch (error) {
		console.error('Failed to initialize auth token from cookies', error);
		event.locals.token = undefined;
	}

	// Server-side guard: avoids flashing protected pages before the client-side
	// auth check kicks in. Token presence is checked here; Convex still enforces
	// real authorization on every query/mutation.
	const { pathname } = event.url;
	const isPublic =
		PUBLIC_ROUTES.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
	if (!event.locals.token && !isPublic) {
		redirect(302, '/login');
	}

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
