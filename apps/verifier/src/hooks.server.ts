import type { Handle } from '@sveltejs/kit';
import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { createAuth } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const token = await getToken(createAuth, event.cookies);
	event.locals.token = token;
	return resolve(event);
};
