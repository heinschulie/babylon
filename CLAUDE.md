# Babylon

## Stack

- **Monorepo**: Bun workspaces + Turbo — `apps/web`, `apps/verifier`, `packages/ui`, `packages/shared`, `packages/convex`
- **Frontend**: SvelteKit 2 (Svelte 5), Tailwind CSS 4, shadcn-svelte (bits-ui)
- **Backend**: Convex (serverless DB + functions, schema in `convex/`)
- **Auth**: Better Auth + `@convex-dev/better-auth` + `convex-better-auth-svelte`
- **Runtime**: Bun
- **i18n**: Paraglide JS (cookie-only locale strategy, no URL prefixes)
- **Icons**: Lucide (`@lucide/svelte`)
- **Testing**: Vitest + convex-test
- **Deploy**: Netlify (SvelteKit Node adapter)

## Commands

Run from project root unless noted:

- `bun run dev` / `bun run dev:verifier` — dev server
- `bun run build` — full build (or `--filter=./apps/web`)
- `bun run check` — svelte-check type checking
- `bun run format` — prettier
- `npx convex dev` — Convex backend dev (watches + deploys)
- `npx convex dev --once` — single Convex push (no watch)

## i18n Rules

**All user-facing strings MUST use Paraglide message functions.** Never hardcode English strings in `.svelte` templates.

### How it works

- Message files: `packages/shared/messages/{locale}.json` (shared), `apps/web/messages/{locale}.json`, `apps/verifier/messages/{locale}.json`
- Supported locales: `en`, `xh`
- Paraglide compiles messages into `src/lib/paraglide/` (gitignored, generated at build)
- Import messages: `import * as m from '$lib/paraglide/messages.js'`
- Import runtime: `import { getLocale, setLocale, locales, isLocale } from '$lib/paraglide/runtime.js'`

### Adding new strings

1. Add key to `en.json` in the appropriate message file
2. Add corresponding key to `xh.json` (use English as placeholder if no translation, prefix with `[TODO] `)
3. Use `m.your_key()` in the template

### String placement

- Shared (nav, auth, buttons, common labels) → `packages/shared/messages/`
- Web-app-specific → `apps/web/messages/`
- Verifier-specific → `apps/verifier/messages/`

### `packages/ui` components

The UI package does NOT have its own Paraglide compilation. Pass translated strings as props from app layouts. See `Header.svelte` for the pattern.

### Locale persistence

- Cookie: set automatically by `setLocale()`
- Convex: `userPreferences.uiLocale` field, synced from settings page
- Layout sync: `+layout.svelte` reads Convex prefs **once** on load and calls `setLocale()` if mismatched

## Project Structure

```
apps/web/           — Main learner-facing SvelteKit app
apps/verifier/      — Verifier SvelteKit app (same stack, separate routes)
packages/shared/    — Auth client, stores, styles, shared utils
packages/ui/        — shadcn-svelte components (no i18n — props only)
packages/convex/    — Convex type exports
convex/             — Backend: schema, mutations, queries, actions
docs/               — Architecture docs, setup guides
thoughts/           — Plans and research docs
```

## Conventions

- **TypeScript strict mode** across all packages
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`) — no legacy `let` reactivity
- **shadcn-svelte** for all UI components — check existing components before creating new ones
- **Convex-first**: no REST/GraphQL — all backend logic in Convex functions
- **CSS class `target-phrase`** for styled phrase text (not `xhosa-phrase`)

## Nested Docs

Task-specific guidance in `.claude/docs/`:
- `architecture.md` — System design, data flow, component relationships
- `auth.md` — Better Auth + Convex integration notes
- `schema.md` — Database schema and relationships
- `testing.md` — Vitest + convex-test patterns and best practices
- `https://docs.convex.dev/llms.txt` — For any work with Convex or design/architecture of the schema, db, or backend
- `https://svelte.dev/llms-small.txt` — For any work with Svelte (the library)
- `https://svelte.dev/docs/kit/llms-small.txt` — For any work with Sveltekit (the framework)
- `docs/sveltekit-convex-betterauth-setup-prompt.md` — For a guide on how to set up auth
- `https://www.better-auth.com/llms.txt` — For any BetterAuth related work
- `https://github.com/mmailaender/convex-auth-svelte/blob/main/src/lib/sveltekit/README.md` — Library that simplifies BetterAuth and SvelteKit integration with Convex
- `https://shadcn-svelte.com/llms.txt` — For all the UI and charting componentry
