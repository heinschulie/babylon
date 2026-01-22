import { createAuthClient } from 'better-auth/svelte';
import { convexClient } from '@convex-dev/better-auth/client/plugins';

const CONVEX_SITE_URL = import.meta.env.VITE_CONVEX_SITE_URL as string;

if (!CONVEX_SITE_URL) {
	throw new Error('VITE_CONVEX_SITE_URL environment variable is not set');
}

export const authClient = createAuthClient({
	baseURL: CONVEX_SITE_URL,
	plugins: [convexClient()]
});
