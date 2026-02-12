import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const convexDir = fileURLToPath(new URL('../../convex', import.meta.url));

export default defineConfig({
	envDir: workspaceRoot,
	plugins: [
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide',
			strategy: ['cookie', 'baseLocale']
		}),
		tailwindcss(),
		sveltekit()
	],
	server: {
		fs: {
			allow: [convexDir]
		}
	}
});
