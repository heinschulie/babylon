/**
 * Vitest config for adws tests.
 *
 * pool: 'forks' is required — without it, vi.mock() in one test file
 * replaces the module globally, breaking imports in other files.
 * bun's built-in test runner has this problem and no isolation option.
 * Run tests with `npx vitest run` from adws/, not `bun test`.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "forks",
    include: ["tests/**/*.test.ts"],
  },
});
