---
date: 2026-02-12T03:57:16Z
researcher: Claude
git_commit: ae72ea1858c936ef23734ed22b154f4225374da2
branch: codex/extended-architecture
repository: babylon
topic: "Sharing UI components, styles, and utilities across monorepo frontends"
tags: [research, codebase, monorepo, turborepo, tailwind, sveltekit, shared-ui]
status: complete
last_updated: 2026-02-12
last_updated_by: Claude
---

# Research: Sharing UI Components, Styles, and Utilities Across Monorepo Frontends

**Date**: 2026-02-12T03:57:16Z
**Researcher**: Claude
**Git Commit**: ae72ea1858c936ef23734ed22b154f4225374da2
**Branch**: codex/extended-architecture
**Repository**: babylon

## Research Question

We have two apps (`web`, `verifier`) and will soon add a third. The web app has mature styling/structure. We want the verifier to match without duplicating components, classes, or layouts. What are the best practices for sharing across frontends in a Turborepo monorepo?

## Summary

**Current state**: The two apps already share a CSS design system via `packages/shared/src/styles/recall.css`, but UI components (button, card, dialog, input, label, accordion, alert), utility functions (`cn()`, type helpers), auth stores, convex client setup, provider interfaces, and notification utils are **copy-pasted identically** between both apps. A `packages/ui` placeholder exists but is empty.

**Best practice for this stack** (Turborepo + SvelteKit + Tailwind v4 + Bun): Create an internal Svelte component library in `packages/ui` using `@sveltejs/package`, export source `.svelte` files (compiled by consuming apps), and use Tailwind v4's CSS-first `@source` directive to ensure utility classes from shared packages are scanned. Move duplicated utilities into `packages/shared`.

---

## Detailed Findings

### 1. Current Monorepo Structure

```
babylon/
├── apps/
│   ├── web/          # @babylon/web  — SvelteKit, main learner app
│   └── verifier/     # @babylon/verifier — SvelteKit, human review queue
├── packages/
│   ├── convex/       # @babylon/convex — re-exports generated Convex API + types
│   ├── shared/       # @babylon/shared — recall.css design system (index.ts empty)
│   └── ui/           # @babylon/ui — placeholder (index.ts empty)
├── convex/           # Convex backend functions + schema
├── turbo.json
└── package.json      # workspaces: ["apps/*", "packages/*"], bun@1.2.2
```

### 2. What Is Already Shared

**`packages/shared/src/styles/recall.css`** — Both apps import this via relative path:
```css
/* apps/web/src/app.css and apps/verifier/src/app.css */
@import '../../../packages/shared/src/styles/recall.css';
```

This 630-line stylesheet contains:
- Tailwind v4 setup (`@import 'tailwindcss'`, `@import 'tw-animate-css'`, `@custom-variant dark`)
- Design tokens as CSS custom properties: fonts (`Bebas Neue`, `Public Sans`), zero border radius, OKLCH color palette, fluid spacing with `clamp()`
- `@theme inline` block mapping CSS vars to Tailwind utilities
- Light/dark mode color schemes
- Component-level CSS classes: `.page-shell`, `.page-stack`, `.info-kicker`, `.meta-text`, `.app-header__*`, `.xhosa-phrase`, `.practice-session`, `.practice-record-btn`, `.practice-player`, `.feedback-banner`, `.practice-fab`, `.practice-review-*`

**`packages/convex`** — Both apps depend on `@babylon/convex` via `workspace:*`:
```typescript
import { api, type Id } from '@babylon/convex';
```

### 3. What Is Duplicated Between Apps

The following files exist in **both** `apps/web/src/lib/` and `apps/verifier/src/lib/` with identical or near-identical content:

#### UI Components (`src/lib/components/ui/`)
| Component | Files | Notes |
|-----------|-------|-------|
| `button/` | `button.svelte`, `index.ts` | Identical variants, sizes, `cn()` usage |
| `card/` | 7 files (card, header, title, desc, content, footer, action) | Identical structure |
| `dialog/` | `dialog.svelte`, `dialog-content.svelte`, `dialog-overlay.svelte`, `index.ts` + more | Identical bits-ui wrappers |
| `input/` | `input.svelte`, `index.ts` | Identical underline-border pattern |
| `label/` | `label.svelte`, `index.ts` | Identical bits-ui wrapper |
| `accordion/` | Multiple files | Identical |
| `alert/` | `alert.svelte`, `index.ts` | Identical |

All follow shadcn-svelte pattern: bits-ui primitives + tailwind-variants + `cn()` class merging.

#### Utilities (`src/lib/`)
| File | Content |
|------|---------|
| `utils.ts` | `cn()` function + `WithoutChild`, `WithoutChildren`, `WithElementRef` type helpers |
| `convex.ts` | Convex client instantiation from `PUBLIC_CONVEX_URL` |
| `auth-client.ts` | `createAuthClient` with `organizationClient()` + `convexClient()` plugins |
| `notifications.ts` | `urlBase64ToUint8Array`, `requestNotificationPermission`, `getSubscription` |

#### Stores (`src/lib/stores/`)
| File | Content |
|------|---------|
| `auth.ts` | `session`, `isAuthenticated`, `isLoading`, `user` derived stores |

#### Providers (`src/lib/providers/`)
| File | Content |
|------|---------|
| `stt.ts` | `SttProvider` interface + `NoopSttProvider` |
| `llm.ts` | `LlmProvider` interface + `NoopLlmProvider` |
| `tts.ts` | `TtsProvider` interface + `NoopTtsProvider` |
| `index.ts` | Re-exports |

#### Server (`src/lib/server/`)
| File | Content |
|------|---------|
| `auth.ts` | `createAuth` factory (identical structure, verifier adds extra trusted origins) |

#### Config Files
| File | Identical? |
|------|-----------|
| `svelte.config.js` | Yes — adapter-node, env dir `../..` |
| `vite.config.ts` | Yes — tailwindcss + sveltekit plugins, convex fs allow |
| `vitest.config.ts` | Yes — edge-runtime for convex, jsdom for UI |
| `tailwind.config.ts` | Yes — minimal, just content paths |
| `components.json` | Yes — shadcn-svelte config pointing to `$lib` aliases |
| `app.html` | Yes — same fonts, PWA meta, theme color |
| `hooks.server.ts` | Yes — auth token extraction |

#### Other Duplicated Files
| File | Notes |
|------|-------|
| `src/routes/login/+page.svelte` | Same login form, same `authClient.signIn.email` call |
| `src/routes/register/+page.svelte` | Same registration form |
| `src/routes/+layout.svelte` | Same Convex + auth setup |
| `src/routes/api/auth/[...all]/+server.ts` | Same Better Auth catch-all handler |
| `static/sw.js` | Identical service worker |
| `static/manifest.json` | Same structure (just name differs) |

### 4. Best Practices: Shared Svelte Component Library in Turborepo

#### Internal Package Pattern (Recommended)

Turborepo's recommended approach for SvelteKit is an **internal package** that exports source `.svelte` files, compiled by the consuming app. This is the pattern used by the [official with-svelte example](https://github.com/vercel/turborepo/tree/main/examples/with-svelte).

**How it works**:
1. `@sveltejs/package` processes the shared package's `src/lib/` into `dist/`
2. TypeScript is transpiled, preprocessors run, but Svelte compilation is deferred
3. Consuming apps' Vite + Svelte plugin handles final compilation
4. This ensures a single Svelte runtime and proper HMR

**UI package structure**:
```
packages/ui/
├── src/
│   └── lib/
│       ├── components/
│       │   ├── button/
│       │   │   ├── button.svelte
│       │   │   └── index.ts
│       │   ├── card/
│       │   ├── dialog/
│       │   ├── input/
│       │   ├── label/
│       │   ├── accordion/
│       │   └── alert/
│       ├── utils.ts          # cn(), type helpers
│       └── index.ts          # barrel exports
├── package.json
└── svelte.config.js
```

**package.json for UI package**:
```json
{
  "name": "@babylon/ui",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "build": "svelte-package",
    "dev": "svelte-package --watch"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "svelte": "./dist/index.js"
    },
    "./button": {
      "types": "./dist/components/button/index.d.ts",
      "svelte": "./dist/components/button/index.js"
    }
  },
  "svelte": "./dist/index.js",
  "files": ["dist"],
  "peerDependencies": {
    "svelte": "^5.0.0"
  },
  "devDependencies": {
    "@sveltejs/package": "^2.0.0",
    "svelte": "^5.45.6"
  },
  "dependencies": {
    "bits-ui": "^2.15.4",
    "tailwind-merge": "^3.4.0",
    "tailwind-variants": "^3.2.2",
    "clsx": "^2.1.1"
  }
}
```

The `"svelte"` condition in exports tells Svelte-aware tooling this is a component library.

#### Tailwind v4 and `@source`

Tailwind v4 uses CSS-first configuration. The critical piece for monorepos is the `@source` directive, which tells Tailwind where to scan for utility classes beyond the current package.

In `packages/shared/src/styles/recall.css`, add:
```css
@source '../../apps/*/src/**/*.{svelte,js,ts}';
@source '../../packages/*/src/**/*.{svelte,js,ts}';
@source '../../packages/*/dist/**/*.{svelte,js}';
```

This ensures that utility classes used in shared components get generated in the final CSS.

#### Watch Mode in Development

For live development, the UI package needs `svelte-package --watch` running alongside app dev servers. Turborepo handles this:

```json
// turbo.json
{
  "tasks": {
    "dev": {
      "cache": false,
      "persistent": true,
      "dependsOn": ["^dev"]
    }
  }
}
```

#### Apps Consume via Workspace Dependency

```json
// apps/web/package.json
{
  "dependencies": {
    "@babylon/ui": "workspace:*"
  }
}
```

```svelte
<!-- In any app component -->
<script>
  import { Button, Card, Dialog } from '@babylon/ui';
</script>
```

### 5. What to Move to `packages/shared`

Non-Svelte utilities and TypeScript modules that both apps use identically:

```
packages/shared/src/
├── styles/
│   └── recall.css           # Already here
├── utils.ts                 # cn(), WithoutChild, WithoutChildren, WithElementRef
├── convex.ts                # ConvexClient setup
├── auth-client.ts           # createAuthClient config
├── notifications.ts         # Push notification utilities
├── stores/
│   └── auth.ts              # session, isAuthenticated, isLoading, user
├── providers/
│   ├── index.ts
│   ├── stt.ts
│   ├── llm.ts
│   └── tts.ts
└── index.ts                 # barrel exports
```

**Note**: `auth-client.ts` and `stores/auth.ts` import from `better-auth/svelte` and `svelte/store`, so they use Svelte runtime. They can still live in `packages/shared` as long as the package declares `svelte` as a peer dependency and the consuming app compiles them.

**Server-side auth** (`lib/server/auth.ts`) differs slightly between apps (verifier has extra trusted origins), so it should remain per-app or accept configuration.

### 6. Avoiding SvelteKit-Specific Imports in Shared Code

The SvelteKit packaging docs warn against using `$app/*` imports (like `$app/environment`, `$app/navigation`) in shared packages unless targeting only SvelteKit apps. In this codebase:

- `convex.ts` uses `$env/static/public` — this is SvelteKit-specific
- `auth.ts` (server) uses `$env/static/private` and `$env/dynamic/private`

**Options**:
1. Accept values as function parameters instead of importing env directly
2. Since all apps are SvelteKit, the imports will work — but makes the package non-portable

### 7. Common Pitfalls to Watch For

1. **Missing `@source` directive** — Tailwind v4 won't scan shared packages automatically. Classes used only in shared components will be purged.

2. **Duplicate `@import 'tailwindcss'`** — Should only appear once (in `recall.css`). Apps import `recall.css`, not Tailwind directly.

3. **Watch mode rebuilds** — `svelte-package --watch` must run for the UI package during development. Without `"dependsOn": ["^dev"]` in turbo.json, apps may not pick up changes.

4. **Single Svelte runtime** — Shared components must be compiled by the consuming app, not pre-compiled. The `"svelte"` export condition ensures this.

5. **CSS layer ordering** — Use `@layer components` for shared component styles, `@layer base` for app-level only. The current `recall.css` uses `@layer base` which is fine since it's the single CSS entry.

## Code References

- `package.json:6-9` — workspace config: `"apps/*"`, `"packages/*"`
- `turbo.json:1-39` — task definitions
- `apps/web/src/app.css:1` — imports shared CSS
- `apps/verifier/src/app.css:1` — imports shared CSS (identical)
- `packages/shared/src/styles/recall.css:1-629` — full design system
- `packages/shared/src/index.ts:1-2` — empty placeholder
- `packages/ui/src/index.ts:1-2` — empty placeholder
- `apps/web/src/lib/utils.ts:1-14` — `cn()` + type helpers (duplicated)
- `apps/verifier/src/lib/utils.ts:1-14` — `cn()` + type helpers (duplicated)
- `apps/web/src/lib/components/ui/button/button.svelte:6-32` — button variants (duplicated)
- `apps/verifier/src/lib/components/ui/button/button.svelte:1-82` — button variants (duplicated)
- `apps/web/src/lib/stores/auth.ts:1-24` — auth stores (duplicated)
- `apps/verifier/src/lib/stores/auth.ts:1-24` — auth stores (duplicated)
- `apps/web/src/lib/convex.ts:1-12` — convex client (duplicated)
- `apps/verifier/src/lib/convex.ts:1-12` — convex client (duplicated)

## Architecture Documentation

### Current Pattern
- **CSS sharing**: Direct `@import` of relative path to `packages/shared/src/styles/recall.css`
- **Convex sharing**: `@babylon/convex` package re-exports generated API + types
- **UI components**: Copy-pasted shadcn-svelte components in each app
- **Utilities**: Copy-pasted `cn()`, auth stores, providers in each app

### Turborepo Best Practice Pattern
- **CSS sharing**: `@source` directives in shared CSS to scan all workspace packages
- **UI components**: `@babylon/ui` package using `@sveltejs/package`, consumed via `workspace:*`
- **Utilities**: `@babylon/shared` exports TypeScript modules consumed by all apps
- **Dev workflow**: `turbo dev` runs `svelte-package --watch` for UI, vite dev for apps

## Related Research

- `thoughts/shared/research/2026-02-10-monorepo-deployment-appraisal.md`
- `thoughts/shared/research/2026-02-10-netlify-to-railway-migration.md`

## Open Questions

- Move `@lucide/svelte` icons to `@babylon/ui` peer deps, or keep per-app?
- Should `Header.svelte` be shared? Web has nav links (Library, Practice), verifier has (Queue) — structurally similar but content differs
- Login/register pages nearly identical — share as route-level components or accept minor duplication?
- `server/auth.ts` differs by trusted origins — parameterize in shared, or keep per-app?
- With third app incoming — worth investing in a shared SvelteKit "app shell" package (layout, auth routes, PWA setup)?
