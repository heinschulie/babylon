import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { createAuth } from '$lib/server/auth';
import { paraglideMiddleware } from '$lib/paraglide/server';

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

export const handle = sequence(i18nHandle, authHandle);
