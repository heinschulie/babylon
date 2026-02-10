import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const convexDir = fileURLToPath(new URL('../../convex', import.meta.url));

export default defineConfig({
	envDir: workspaceRoot,
	plugins: [tailwindcss(), sveltekit()],
	build: {
		rollupOptions: {
			output: {
				// Netlify normalizes uploaded file paths to lowercase.
				// Use lowercase-only hashes so HTML asset links remain valid after deploy.
				hashCharacters: 'hex'
			}
		}
	},
	server: {
		fs: {
			allow: [convexDir]
		}
	}
});
