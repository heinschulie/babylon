import { ConvexClient } from 'convex/browser';

const CONVEX_URL = import.meta.env.VITE_CONVEX_URL as string;

if (!CONVEX_URL) {
	throw new Error('VITE_CONVEX_URL environment variable is not set');
}

export const convexClient = new ConvexClient(CONVEX_URL);

export { CONVEX_URL };
