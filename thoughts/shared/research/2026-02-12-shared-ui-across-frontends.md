---
date: 2026-02-12T03:56:16Z
researcher: Claude
git_commit: ae72ea1858c936ef23734ed22b154f4225374da2
branch: codex/extended-architecture
repository: babylon
topic: "Sharing UI components, styles, and utilities across frontend apps in a Turborepo monorepo"
tags: [research, codebase, turborepo, shared-ui, tailwind, svelte, monorepo]
status: complete
last_updated: 2026-02-12
last_updated_by: Claude
---

# Research: Sharing UI Components, Styles, and Utilities Across Frontend Apps

**Date**: 2026-02-12T03:56:16Z
**Researcher**: Claude
**Git Commit**: ae72ea1858c936ef23734ed22b154f4225374da2
**Branch**: codex/extended-architecture
**Repository**: babylon

## Research Question

We have two apps (web, verifier) and will soon add a third. The web app has mature styling and UI structure. We want to bring the verifier to the same level without duplicating components, classes, or layouts. What are the best practices for sharing UI across frontends in Turborepo?

## Summary

The monorepo already has the scaffolding for sharing (`@babylon/ui`, `@babylon/shared`) but neither package is wired up — both export `{}`. Meanwhile, the web and verifier apps contain **byte-for-byte identical** copies of 7 UI component families, a `utils.ts` file, and both import the same `recall.css` via a relative path. The only difference is web has a `dropdown-menu/` component that verifier lacks.

Turborepo's recommended approach — an **Internal Packages** pattern using the JIT (Just-in-Time) compilation strategy — maps cleanly onto this codebase. Since both apps are SvelteKit + Vite, the consuming bundler can compile TypeScript and Svelte directly from a workspace package. No build step needed in the shared package.

Below is a concrete mapping of what exists, what's duplicated, and how best practices apply.

---

## Detailed Findings

### 1. Current Monorepo Structure

```
babylon/
├── apps/
│   ├── web/           @babylon/web    (SvelteKit 2 + Svelte 5 + Tailwind 4)
│   └── verifier/      @babylon/verifier (SvelteKit 2 + Svelte 5 + Tailwind 4)
├── packages/
│   ├── ui/            @babylon/ui     (empty — exports {})
│   ├── shared/        @babylon/shared (only has recall.css)
│   └── convex/        @babylon/convex (actively used for API types)
├── turbo.json
└── package.json       (bun workspaces: apps/*, packages/*)
```

- **Package manager**: Bun 1.2.2 with `workspace:*` protocol
- **Build orchestration**: Turborepo via `turbo.json`
- **No PostCSS configs** — Tailwind integrated via `@tailwindcss/vite` plugin

### 2. Exact Duplication Between Apps

The following are **100% identical** between `apps/web` and `apps/verifier`:

| Asset | Web Location | Verifier Location |
|-------|-------------|-------------------|
| `utils.ts` (cn, types) | `src/lib/utils.ts` | `src/lib/utils.ts` |
| `button/` | `src/lib/components/ui/button/` | `src/lib/components/ui/button/` |
| `card/` (7 files) | `src/lib/components/ui/card/` | `src/lib/components/ui/card/` |
| `input/` | `src/lib/components/ui/input/` | `src/lib/components/ui/input/` |
| `label/` | `src/lib/components/ui/label/` | `src/lib/components/ui/label/` |
| `dialog/` (10 files) | `src/lib/components/ui/dialog/` | `src/lib/components/ui/dialog/` |
| `accordion/` (4 files) | `src/lib/components/ui/accordion/` | `src/lib/components/ui/accordion/` |
| `alert/` (3 files) | `src/lib/components/ui/alert/` | `src/lib/components/ui/alert/` |
| `app.css` (1 line) | `src/app.css` | `src/app.css` |
| `tailwind.config.ts` | `tailwind.config.ts` | `tailwind.config.ts` |
| `components.json` | `components.json` | `components.json` |
| `auth-client.ts` | `src/lib/auth-client.ts` | `src/lib/auth-client.ts` |
| `convex.ts` | `src/lib/convex.ts` | `src/lib/convex.ts` |
| `stores/auth.ts` | `src/lib/stores/auth.ts` | `src/lib/stores/auth.ts` |

**Only web has**: `src/lib/components/ui/dropdown-menu/` (17 sub-components)

### 3. Shared Styles — recall.css

Both apps import `packages/shared/src/styles/recall.css` via relative path:
```css
@import '../../../packages/shared/src/styles/recall.css';
```

This file (628 lines) contains:
- **Tailwind 4 imports** + `tw-animate-css`
- **Design tokens** as CSS custom properties (OKLCH color space)
- **`@theme inline`** block mapping CSS vars to Tailwind utilities
- **Layout classes**: `.page-shell`, `.page-shell--narrow`, `.page-shell--compact`, `.page-stack`
- **Typography classes**: `.info-kicker`, `.meta-text`
- **App header system**: `.app-header` + BEM children (`__bar`, `__icon`, `__nav`, `__link`, `__avatar`)
- **App-specific styles**: `.phrase-card`, `.xhosa-phrase`, `.practice-session`, `.practice-player`, `.feedback-banner`, `.practice-fab`
- **Verifier-specific overrides**: `.audio-playback--verifier`, `.practice-player--verifier` (lines 520-536)
- **Light/dark mode** via `@media (prefers-color-scheme: dark)`

### 4. shadcn-svelte Configuration

Both apps use identical `components.json` pointing to `shadcn-svelte.com/registry`:
```json
{
  "aliases": {
    "components": "$lib/components",
    "utils": "$lib/utils",
    "ui": "$lib/components/ui"
  }
}
```

This means the shadcn CLI currently generates components into each app's local `$lib/components/ui/` — producing the duplication.

### 5. Existing Package Infrastructure

**`@babylon/ui`** (`packages/ui/package.json`):
```json
{ "name": "@babylon/ui", "private": true, "version": "0.0.1", "type": "module" }
```
- No `exports` field
- `src/index.ts` contains `export {}`

**`@babylon/shared`** (`packages/shared/package.json`):
```json
{ "name": "@babylon/shared", "private": true, "version": "0.0.1", "type": "module" }
```
- No `exports` field
- `src/index.ts` contains `export {}`
- `src/styles/recall.css` is the only real asset

**`@babylon/convex`** — working reference for how packages are consumed:
```json
{ "exports": { ".": "./src/index.ts" } }
```
Apps import it as `import { api } from '@babylon/convex'`.

---

## Best Practices from Turborepo

### Strategy 1: Internal Packages with JIT Compilation (Recommended)

Turborepo's docs describe three compilation strategies. For this codebase, **JIT (Just-in-Time)** is ideal:

- Both apps use Vite which can compile TypeScript and Svelte directly
- No build step needed in the shared package
- Source code in `packages/ui/src/` is used as-is by consuming apps' bundlers
- Simplest setup, minimal config

**How it works**: Set `exports` in `package.json` to point at raw `.svelte` and `.ts` files. The consuming app's Vite resolves and compiles them.

**Trade-off**: No Turborepo caching benefit for the package itself (but the package has no build step to cache).

Source: [Turborepo - Internal Packages](https://turborepo.dev/docs/core-concepts/internal-packages)

### Strategy 2: Explicit Exports Over Barrel Files

Turborepo recommends **explicit per-component exports** rather than re-exporting everything from `index.ts`:

```json
{
  "exports": {
    "./button": "./src/components/ui/button/index.ts",
    "./card": "./src/components/ui/card/index.ts",
    "./dialog": "./src/components/ui/dialog/index.ts",
    "./utils": "./src/utils.ts",
    "./styles": "./src/styles/recall.css"
  }
}
```

This enables proper tree-shaking and clear dependency boundaries.

Source: [Turborepo Best Practices: Packages](https://github.com/vercel/turborepo/blob/main/skills/turborepo/references/best-practices/packages.md)

### Strategy 3: shadcn/ui Monorepo Pattern

shadcn/ui (and shadcn-svelte) now supports monorepo setups. The pattern:

1. **One `components.json` per workspace** — but UI aliases point to `packages/ui`
2. The CLI installs components into `packages/ui/src/components/`
3. Apps import from the workspace package: `import { Button } from '@babylon/ui/button'`

Source: [shadcn/ui - Monorepo Documentation](https://ui.shadcn.com/docs/monorepo)

### Strategy 4: Shared Tailwind Configuration

Since Tailwind v4 uses CSS-first configuration (`@theme inline`), the pattern is:

1. Keep `recall.css` in `@babylon/shared` (or `@babylon/ui`)
2. Export it via `package.json` exports rather than relative path
3. Apps import it as `@import '@babylon/shared/styles'` instead of `@import '../../../packages/shared/src/styles/recall.css'`
4. Tailwind content paths in each app must include the shared package: `'../../packages/ui/src/**/*.{svelte,ts}'`

Source: [Turborepo - Tailwind CSS Guide](https://turborepo.dev/docs/guides/tools/tailwind)

### Strategy 5: Package Organization Principle

Turborepo's guidance: *"Create packages that have a single purpose"* and *"If two apps need it, it becomes a package."*

Recommended package split for this codebase:

| Package | Purpose |
|---------|---------|
| `@babylon/ui` | Svelte UI components (button, card, dialog, etc.) + `cn()` utility |
| `@babylon/shared` | CSS styles (recall.css), design tokens, shared TS utilities, auth client, Convex client setup |
| `@babylon/convex` | Convex schema and API types (already working) |

Source: [Turborepo - Structuring a Repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)

---

## Code References

- `packages/ui/package.json` — Empty UI package scaffold
- `packages/ui/src/index.ts` — Placeholder export
- `packages/shared/package.json` — Empty shared package scaffold
- `packages/shared/src/index.ts` — Placeholder export
- `packages/shared/src/styles/recall.css` — All shared design tokens and layout classes (628 lines)
- `packages/convex/package.json` — Working example of internal package with exports field
- `apps/web/src/lib/components/ui/` — 8 component families (source of truth)
- `apps/verifier/src/lib/components/ui/` — 7 component families (duplicates, missing dropdown-menu)
- `apps/web/src/lib/utils.ts` — cn() utility and TS types (duplicated)
- `apps/verifier/src/lib/utils.ts` — Exact copy
- `apps/web/src/app.css:1` — Relative import of recall.css
- `apps/verifier/src/app.css:1` — Same relative import
- `apps/web/components.json` — shadcn-svelte config (identical in both apps)
- `apps/web/src/lib/auth-client.ts` — Better Auth client setup (duplicated)
- `apps/web/src/lib/convex.ts` — Convex client setup (duplicated)
- `apps/web/src/lib/stores/auth.ts` — Auth stores (duplicated)

## Architecture Documentation

### Current Pattern
- Both apps are SvelteKit 2 + Svelte 5 + Tailwind CSS 4 with identical dependency versions
- UI components use **bits-ui** headless primitives wrapped with custom Tailwind styling
- Component variants use **tailwind-variants** (e.g., button variants)
- Class merging via **clsx** + **tailwind-merge** through `cn()` helper
- All components use `data-slot` attributes for CSS targeting
- Multi-part components use **barrel exports** with `index.ts`
- Layout uses semantic CSS classes (`.page-shell`, `.page-stack`) rather than pure utility-class composition
- Design tokens live in CSS custom properties using **OKLCH color space**
- Tailwind v4's `@theme inline` maps CSS vars to Tailwind utilities
- Both apps share identical auth setup (Better Auth + Convex integration)

### Dependency Architecture
```
apps/web ──────┐
               ├──→ @babylon/convex (API types — working)
apps/verifier ─┤
               ├──→ @babylon/shared (recall.css via relative path — partially working)
               └──→ @babylon/ui (empty — not wired up)
```

## Related Research

- [2026-02-10 Monorepo Deployment Appraisal](./2026-02-10-monorepo-deployment-appraisal.md)

## External Sources

- [Turborepo - Internal Packages](https://turborepo.dev/docs/core-concepts/internal-packages)
- [Turborepo - Creating an Internal Package](https://turborepo.dev/docs/crafting-your-repository/creating-an-internal-package)
- [Turborepo - Tailwind CSS Guide](https://turborepo.dev/docs/guides/tools/tailwind)
- [Turborepo - shadcn/ui Guide](https://turborepo.dev/docs/guides/tools/shadcn-ui)
- [Turborepo - TypeScript Guide](https://turborepo.dev/docs/guides/tools/typescript)
- [Turborepo - Structuring a Repository](https://turborepo.dev/docs/crafting-your-repository/structuring-a-repository)
- [Turborepo Best Practices: Packages](https://github.com/vercel/turborepo/blob/main/skills/turborepo/references/best-practices/packages.md)
- [shadcn/ui - Monorepo Documentation](https://ui.shadcn.com/docs/monorepo)
- [Medium - Setting up Tailwind CSS v4 in Turbo Monorepo](https://medium.com/@philippbtrentmann/setting-up-tailwind-css-v4-in-a-turbo-monorepo-7688f3193039)

## Open Questions

- shadcn-svelte monorepo support: does its CLI support generating into `packages/ui` the same way shadcn for React does? Need to verify `shadcn-svelte@canary`
- Should app-specific styles (`.practice-session`, `.feedback-banner`) stay in `recall.css` or move to app-level CSS?
- Third app framework — will it also be SvelteKit? If not, Svelte components won't be directly reusable and the strategy would shift toward design tokens + CSS only
- Vite's `server.fs.allow` — will it need updating to resolve `packages/ui/` source files during dev?
- `tailwind.config.ts` content paths — do they need to scan `../../packages/ui/src/**/*.{svelte,ts}` for Tailwind to detect classes used in shared components?
