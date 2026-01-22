import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [tailwindcss(), svelte({ hot: !process.env.VITEST })],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}', 'convex/**/*.{test,spec}.{js,ts}'],
		environmentMatchGlobs: [
			['convex/**', 'edge-runtime'],
			['**', 'jsdom']
		],
		server: { deps: { inline: ['convex-test'] } }
	},
	resolve: {
		alias: {
			$lib: '/src/lib'
		}
	}
});
