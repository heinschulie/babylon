import { ConvexClient } from 'convex/browser';
import { PUBLIC_CONVEX_URL } from '$env/static/public';

const CONVEX_URL = PUBLIC_CONVEX_URL;

if (!CONVEX_URL) {
	throw new Error('PUBLIC_CONVEX_URL environment variable is not set');
}

export const convexClient = new ConvexClient(CONVEX_URL);

export { CONVEX_URL };
