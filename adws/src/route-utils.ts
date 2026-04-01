/**
 * Route derivation utilities.
 *
 * Maps changed .svelte page/layout files to URL routes
 * for targeted verify + screenshot passes.
 */

const PAGE_ROUTE_RE = /^apps\/[^/]+\/src\/routes\/(.+\/)?(\+page|(\+layout))\.svelte$/;

/** Check if any files are .svelte files. */
export function hasSvelteFiles(files: string[]): boolean {
  return files.some((f) => f.endsWith(".svelte"));
}

/**
 * Extract URL routes from changed page/layout .svelte files.
 *
 * `apps/web/src/routes/test/+page.svelte` → `/test`
 * `apps/web/src/routes/+page.svelte` → `/`
 * `apps/verifier/src/routes/queue/+page.svelte` → `/queue`
 *
 * Non-page .svelte files (components, lib) are ignored.
 */
export function svelteFilesToRoutes(files: string[]): string[] {
  const routes = new Set<string>();

  for (const file of files) {
    const match = file.match(PAGE_ROUTE_RE);
    if (!match) continue;

    // match[1] is the path segment before +page/+layout (e.g. "test/" or "foo/bar/" or undefined for root)
    const segment = match[1];
    const route = segment ? `/${segment.replace(/\/$/, "")}` : "/";
    routes.add(route);
  }

  return [...routes];
}
