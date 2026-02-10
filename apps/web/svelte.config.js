import adapter from '@sveltejs/adapter-netlify';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		env: {
			dir: '../..'
		},
		adapter: adapter()
	}
};

export default config;
