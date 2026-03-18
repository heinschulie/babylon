import { action } from './_generated/server';
import { v } from 'convex/values';
import { getAuthUserId } from './lib/auth';
import { classifyExternalFetchError, fetchWithTimeout } from './lib/fetchWithTimeout';
import {
	assertMaxLength,
	enforceLocalRateLimit,
	requireNonEmptyTrimmed
} from './lib/publicActionGuards';

const MAX_QUERY_LENGTH = 120;
const UNSPLASH_TIMEOUT_MS = 8_000;

export const getRandomPhoto = action({
	args: { query: v.string() },
	handler: async (ctx, { query }) => {
		const userId = await getAuthUserId(ctx);
		enforceLocalRateLimit({
			bucket: 'unsplash.getRandomPhoto',
			subject: userId,
			limit: 30,
			windowMs: 60_000
		});

		const normalizedQuery = requireNonEmptyTrimmed(query, 'query');
		assertMaxLength(normalizedQuery, 'query', MAX_QUERY_LENGTH);

		const accessKey = process.env.UNSPLASH_ACCESS_KEY;
		if (!accessKey) {
			console.warn('Unsplash photo lookup unavailable: missing access key');
			return null;
		}

		try {
			const url = new URL('https://api.unsplash.com/photos/random');
			url.searchParams.set('query', normalizedQuery);
			url.searchParams.set('orientation', 'squarish');
			url.searchParams.set('content_filter', 'high');

			const res = await fetchWithTimeout(url.toString(), {
				headers: { Authorization: `Client-ID ${accessKey}` },
				timeoutMs: UNSPLASH_TIMEOUT_MS,
				service: 'unsplash',
				operation: 'random_photo',
				retries: 1,
				retryDelayMs: 200
			});

			if (!res.ok) {
				console.error('Unsplash API error', {
					errorType: 'provider_response',
					status: res.status,
					statusText: res.statusText
				});
				return null;
			}

			const data = await res.json();
			return {
				url: data.urls.regular as string,
				thumbUrl: data.urls.small as string,
				alt: (data.alt_description as string) ?? normalizedQuery,
				photographerName: data.user.name as string,
				photographerUrl: data.user.links.html as string,
				unsplashUrl: data.links.html as string
			};
		} catch (error) {
			console.error('Unsplash photo lookup failed', {
				errorType: classifyExternalFetchError(error),
				error: error instanceof Error ? error.message : 'unknown'
			});
			return null;
		}
	}
});
