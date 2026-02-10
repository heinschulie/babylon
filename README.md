# Babylon Monorepo

Babylon now uses a monorepo layout so multiple front ends can share common code and assets.

## Structure

- `apps/web`: learner SvelteKit application
- `apps/verifier`: verifier SvelteKit application
- `convex`: shared Convex backend (single source for all frontends)
- `packages/convex`: shared frontend exports for Convex generated API/types
- `packages/ui`: shared UI package (placeholder)
- `packages/shared`: shared utils/types/assets package (placeholder)

## Tooling

- Turborepo orchestrates workspace tasks from the repo root.
- Bun is set as the preferred package manager in the root `package.json`.

## Commands (from repo root)

```sh
bun run dev
bun run dev:verifier
bun run build
bun run build:verifier
bun run test
bun run lint
```

To run only the web app build:

```sh
bun run build:web
```

If Bun is unavailable in your environment, use `npm run <script>` as a fallback.

## Convex (from repo root)

```sh
bun run convex:dev
bun run convex:codegen
bun run convex:deploy
bun run convex:logs
```

To verify generated Convex artifacts are committed:

```sh
bun run convex:check-generated
```

## CI/CD

- CI (`.github/workflows/ci.yml`) runs on every push/PR and validates both apps
- Deploys are handled by Netlify natively (not GitHub Actions)
- Each app has its own Netlify site linked to this repo
- Netlify uses `Package directory` to find `apps/web/netlify.toml` or `apps/verifier/netlify.toml`
- Builds run from repo root so workspace dependencies resolve correctly

### Netlify site setup

For each app, create a Netlify site linked to this repo with:
- **Base directory**: _(leave blank — defaults to repo root)_
- **Package directory**: `apps/web` or `apps/verifier`
- Build command and publish dir are read from the app's `netlify.toml`
- Set env vars (`PUBLIC_CONVEX_URL`, `BETTER_AUTH_SECRET`, etc.) in Netlify UI

## Local Push Guard

Install local git hooks once:

```sh
bun run hooks:install
```

The pre-push hook runs:

```sh
bun run lockfile:check
```

This blocks pushes when `bun.lock` is out of sync with workspace manifests.
