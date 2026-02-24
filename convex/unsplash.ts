import { action } from './_generated/server';
import { v } from 'convex/values';

export const getRandomPhoto = action({
	args: { query: v.string() },
	handler: async (_ctx, { query }) => {
		const accessKey = process.env.UNSPLASH_ACCESS_KEY;
		if (!accessKey) throw new Error('UNSPLASH_ACCESS_KEY not configured');

		const url = new URL('https://api.unsplash.com/photos/random');
		url.searchParams.set('query', query);
		url.searchParams.set('orientation', 'squarish');
		url.searchParams.set('content_filter', 'high');

		const res = await fetch(url.toString(), {
			headers: { Authorization: `Client-ID ${accessKey}` }
		});

		if (!res.ok) {
			return null;
		}

		const data = await res.json();
		return {
			url: data.urls.regular as string,
			thumbUrl: data.urls.small as string,
			alt: (data.alt_description as string) ?? query,
			photographerName: data.user.name as string,
			photographerUrl: data.user.links.html as string,
			unsplashUrl: data.links.html as string
		};
	}
});
