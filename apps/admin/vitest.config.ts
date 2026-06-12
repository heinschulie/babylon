import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const libDir = fileURLToPath(new URL('./src/lib', import.meta.url));

export default defineConfig({
	plugins: [tailwindcss(), svelte({ hot: !process.env.VITEST })],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}', '../../convex/**/*.{test,spec}.{js,ts}'],
		environmentMatchGlobs: [
			['../../convex/**', 'edge-runtime'],
			['**', 'jsdom']
		],
		server: { deps: { inline: ['convex-test'] } }
	},
	resolve: {
		alias: {
			$lib: libDir
		}
	}
});
