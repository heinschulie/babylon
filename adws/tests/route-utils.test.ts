import { describe, it, expect } from "vitest";
import { hasSvelteFiles, svelteFilesToRoutes } from "../src/route-utils";

describe("hasSvelteFiles", () => {
  it("returns true when .svelte files present", () => {
    expect(hasSvelteFiles(["src/lib/Foo.svelte", "README.md"])).toBe(true);
  });

  it("returns false when no .svelte files", () => {
    expect(hasSvelteFiles(["convex/schema.ts", "package.json"])).toBe(false);
  });

  it("returns false for empty list", () => {
    expect(hasSvelteFiles([])).toBe(false);
  });
});

describe("svelteFilesToRoutes", () => {
  it("maps page file to route", () => {
    expect(svelteFilesToRoutes(["apps/web/src/routes/test/+page.svelte"])).toEqual(["/test"]);
  });

  it("maps root page to /", () => {
    expect(svelteFilesToRoutes(["apps/web/src/routes/+page.svelte"])).toEqual(["/"]);
  });

  it("maps nested route", () => {
    expect(svelteFilesToRoutes(["apps/web/src/routes/foo/bar/+page.svelte"])).toEqual(["/foo/bar"]);
  });

  it("maps verifier app routes", () => {
    expect(svelteFilesToRoutes(["apps/verifier/src/routes/queue/+page.svelte"])).toEqual(["/queue"]);
  });

  it("maps layout files", () => {
    expect(svelteFilesToRoutes(["apps/web/src/routes/settings/+layout.svelte"])).toEqual(["/settings"]);
  });

  it("ignores non-page svelte files (components)", () => {
    expect(svelteFilesToRoutes([
      "apps/web/src/lib/components/Badge.svelte",
      "packages/ui/src/lib/Button.svelte",
    ])).toEqual([]);
  });

  it("ignores backend files", () => {
    expect(svelteFilesToRoutes(["convex/schema.ts", "adws/src/loop-runner.ts"])).toEqual([]);
  });

  it("extracts only route files from mixed list", () => {
    const files = [
      "apps/web/src/routes/test/+page.svelte",
      "apps/web/src/lib/components/Badge.svelte",
      "convex/schema.ts",
      "apps/web/src/routes/settings/+page.svelte",
    ];
    const routes = svelteFilesToRoutes(files);
    expect(routes).toContain("/test");
    expect(routes).toContain("/settings");
    expect(routes).toHaveLength(2);
  });

  it("deduplicates routes", () => {
    const files = [
      "apps/web/src/routes/test/+page.svelte",
      "apps/web/src/routes/test/+layout.svelte",
    ];
    expect(svelteFilesToRoutes(files)).toEqual(["/test"]);
  });
});
