import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environmentMatchGlobs: [
			// convex tests run in edge-runtime
			['convex/**', 'edge-runtime'],
		],
	},
});