import adapter from '@sveltejs/adapter-netlify';

const isProduction = process.env.NODE_ENV === 'production';

/** @type {import('@sveltejs/kit').CspDirectives} */
const cspDirectives = {
	'default-src': ["'self'"],
	'base-uri': ["'self'"],
	'frame-ancestors': ["'none'"],
	'form-action': ["'self'"],
	'object-src': ["'none'"],
	'frame-src': ["'none'"],
	'manifest-src': ["'self'"],
	'script-src': ["'self'"],
	'script-src-attr': ["'none'"],
	'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
	'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
	'img-src': ["'self'", 'data:', 'blob:', 'https:'],
	'media-src': ["'self'", 'data:', 'blob:', 'https:'],
	'connect-src': ["'self'", 'https:', 'wss:', 'http:', 'ws:'],
	'worker-src': ["'self'", 'blob:']
};

if (isProduction) {
	cspDirectives['upgrade-insecure-requests'] = true;
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		env: {
			dir: '../..'
		},
			adapter: adapter(),
		csp: {
			mode: 'auto',
			directives: cspDirectives
		}
	}
};

export default config;
