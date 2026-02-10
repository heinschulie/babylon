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

- CI (`.github/workflows/ci.yml`) runs on every push/PR and validates both apps:
  - `@babylon/web`
  - `@babylon/verifier`
- CD (`.github/workflows/deploy-netlify.yml`) runs on pushes to `main` and deploys both Netlify sites from the monorepo:
  - Web site id: `8f1a8221-30dc-4b2e-a37d-6f783785cf60`
  - Verifier site id: `70b4f89f-0f3b-4f0e-9bbb-31bb6c58a006`
- Required GitHub secret:
  - `NETLIFY_AUTH_TOKEN`: personal/team Netlify token with deploy permissions

This setup makes deployments deterministic in a monorepo: each app is built from its own workspace output and deployed independently on every merge to `main`.
