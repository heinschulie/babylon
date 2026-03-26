---
date: 2026-03-25T00:00:00+02:00
researcher: Claude
git_commit: 4a209d8
branch: hein/feature/issue-61
repository: babylon
topic: 'Runtime configuration and execution environments'
tags: [research, codebase, runtime, bun, convex, sveltekit, vitest, typescript]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: Runtime

## Research Question

What runtime environments exist in the Babylon monorepo, how are they configured, and how do they interact?

## Summary

Babylon has **four distinct runtime environments**: (1) **Bun 1.2.2** as the primary local runtime and package manager, (2) **Convex serverless** for backend functions (with a `'use node'` escape hatch for actions needing Node APIs), (3) **SvelteKit/Vite** dev servers for the two frontend apps, and (4) **Vitest** for testing with dual environments (`jsdom` for Svelte, `edge-runtime` for Convex). Turbo orchestrates all workspace tasks. Netlify deploys the SvelteKit Node adapter output, running production via `bun build/index.js`.

## Detailed Findings

### 1. Bun — Primary Runtime & Package Manager

- **Version**: 1.2.2, enforced via `packageManager` field (`package.json:5`) + `engine-strict=true` (`.npmrc`)
- **Lockfile**: `bun.lock` (text format, 161K)
- **Type defs**: `@types/bun: ^1.3.10` in root devDependencies
- **Direct Bun APIs**: Used in `adws/` subsystem — `Bun.serve()`, `Bun.spawn()`, `Bun.file()`, `Bun.write()`, `Bun.argv`
- **Production start**: Both apps run `bun build/index.js` (`apps/web/package.json:18`, `apps/verifier/package.json:18`)
- **No .nvmrc/.node-version** — Bun version is the sole constraint

### 2. Convex — Serverless Backend Runtime

- **Config**: `convex.json` points to `convex/` directory
- **App config**: `convex/convex.config.ts` — defines app, integrates Better Auth plugin
- **Function types**: `query`, `mutation`, `internalMutation`, `action`, `internalAction`, `httpAction` (via `convex/_generated/server.d.ts`)
- **Node runtime escape**: Files with `'use node'` directive run in Node.js environment (e.g., `convex/aiPipeline.ts:1`, `convex/notificationsNode.ts`, `convex/translateNode.ts`) — needed for external API calls (Whisper, Claude)
- **Default runtime**: Convex V8 isolate (no Node APIs) for queries/mutations
- **TypeScript**: `convex/tsconfig.json` — ESNext target/module, `isolatedModules: true`, `noEmit: true` (all Convex-required)
- **Schema**: 19 tables, 40+ indexes (`convex/schema.ts`)
- **Cron**: `convex/crons.ts` — daily job at 06:00 UTC for spaced-repetition rescheduling
- **HTTP router**: `convex/http.ts` — auth routes + PayFast webhooks
- **Local dev**: `bunx convex dev` (watches + deploys), `bunx convex deploy` for production

### 3. SvelteKit / Vite — Frontend Runtime

- **Adapter**: `@sveltejs/adapter-node` v5.0.0 (both apps) — `svelte.config.js:1,34`
- **Vite plugins**: Paraglide i18n, Tailwind CSS 4, SvelteKit
- **Env directory**: Root workspace (`vite.config.ts:11`) — monorepo-wide `.env` access
- **Dev ports**: 5173 (web), 5178 (verifier)
- **Allowed dev hosts**: `dev.schulie.com` (web), `verifier.schulie.com` (verifier)
- **i18n strategy**: `['cookie', 'baseLocale']` — cookie-only locale, no URL prefixes
- **CSP**: Auto mode with directives for fonts, images, connect-src (`svelte.config.js:5-40`)
- **Security headers**: HSTS in prod (31536000s), referrer policy, permissions policy (`hooks.server.ts`)
- **Netlify deploy**: `build/_redirects` routes all requests through `/.netlify/functions/sveltekit-render`; immutable 1-year cache for `/_app/immutable/*`

### 4. Vitest — Test Runtime

- **Version**: `^4.0.17`
- **Config**: `apps/web/vitest.config.ts`, `apps/verifier/vitest.config.ts` (identical)
- **Dual environments**:
  - `jsdom` (default) — Svelte component/route tests
  - `edge-runtime` — Convex backend function tests (`@edge-runtime/vm: ^5.0.0`)
- **convex-test**: `^0.0.41`, inlined via `server.deps.inline` to avoid hoisting issues
- **Test locations**:
  - `convex/**/*.test.ts` — 10+ backend tests (phrases, billing, audio, notifications, payfast, human reviews)
  - `adws/tests/**/*.test.ts` — 7 ADW integration tests (env-gated with `describe.skipIf`)
  - `apps/web/src/routes/test/page.test.ts` — 48+ Svelte route tests
- **Execution**: `turbo run test` (watch), `turbo run test:run` (single), `vitest run adws/tests/` (ADW only)

### 5. ADW (AI Design Workflows) — Bun Direct Runtime

- **tsconfig**: `adws/tsconfig.json` — `types: ["bun-types"]`, ESNext target/module
- **Triggers**: `adws/triggers/webhook.ts` (Bun.serve HTTP server), `adws/triggers/cron.ts` (Bun.spawn)
- **Workflows**: Direct `bun run` execution of TypeScript files
- **Tests**: Vitest with 60s timeout for API calls, conditional skip without API keys

### 6. Turbo — Task Orchestration

- **Config**: `turbo.json`
- **Cached tasks**: `build` (outputs: `build/**`, `.svelte-kit/**`, `dist/**`), `check`, `typecheck`, `lint`
- **Persistent tasks**: `dev`, `preview` (non-cached)
- **Test tasks**: `test`, `test:run` — workspace dependency aware
- **Root scripts**: All invoked via `bun run <task>` which delegates to Turbo

### 7. TypeScript Configuration

| Workspace | Target | Module | moduleResolution | Strict | Special |
|-----------|--------|--------|-----------------|--------|---------|
| `apps/web` | SvelteKit default | SvelteKit default | bundler | ✓ | extends `.svelte-kit/tsconfig.json` |
| `apps/verifier` | SvelteKit default | SvelteKit default | bundler | ✓ | identical to web |
| `convex/` | ESNext | ESNext | Bundler | ✓ | isolatedModules, noEmit (Convex-required) |
| `adws/` | esnext | esnext | bundler | ✓ | `types: ["bun-types"]` |

### 8. Environment Variables

| Variable | Scope | Purpose |
|----------|-------|---------|
| `PUBLIC_CONVEX_URL` | Client | Convex cloud endpoint |
| `PUBLIC_CONVEX_SITE_URL` | Client | Convex HTTP actions endpoint |
| `SITE_URL` | Server | Better Auth callback origin |
| `VERIFIER_SITE_URL` | Server | Verifier app origin for trusted origins |
| `BETTER_AUTH_SECRET` | Server | Auth signing secret |
| `VITE_VAPID_PUBLIC_KEY` | Client | Web push notifications |
| `VAPID_PRIVATE_KEY` | Server | Web push signing |
| `PAYFAST_*` | Server/Convex | Billing webhook validation |

## Code References

- `package.json:5` — `packageManager: "bun@1.2.2"`
- `package.json:18-24` — Convex scripts (bunx convex dev/deploy/logs)
- `.npmrc` — `engine-strict=true`
- `convex.json` — `"functions": "convex/"`
- `convex/convex.config.ts:1-7` — App definition + Better Auth plugin
- `convex/tsconfig.json:16-21` — Convex-required TS settings
- `convex/aiPipeline.ts:1` — `'use node'` directive for Node runtime
- `convex/crons.ts:1-12` — Daily cron at 06:00 UTC
- `apps/web/svelte.config.js:1,34` — adapter-node
- `apps/web/vite.config.ts:11,16,21-26` — envDir, Paraglide strategy, dev server
- `apps/web/vitest.config.ts:11-16` — Dual test environments (jsdom + edge-runtime)
- `apps/web/src/hooks.server.ts:8-45` — Security headers + auth + i18n handles
- `adws/tsconfig.json:13` — `types: ["bun-types"]`
- `turbo.json` — Task orchestration config
- `build/_redirects` — Netlify SvelteKit routing

## Architecture Documentation

**Runtime layering pattern**: Bun sits at the base as package manager and local script runner. Turbo orchestrates workspace tasks on top. SvelteKit/Vite provides the frontend dev/build pipeline. Convex runs serverless in the cloud with its own V8 isolate runtime (Node.js opt-in per file). Vitest simulates both browser (jsdom) and serverless (edge-runtime) contexts for testing.

**Env var convention**: `PUBLIC_` prefix for client-accessible, `VITE_` for Vite-specific client vars, unprefixed for server-only. Root `.env` shared across all apps via Vite's `envDir` pointing to workspace root.

**Deploy pattern**: SvelteKit builds to Node adapter output → Netlify runs as serverless function via `/.netlify/functions/sveltekit-render`. Static assets get 1-year immutable cache.

## Open Questions

- None — runtime configuration is well-defined across all layers.
