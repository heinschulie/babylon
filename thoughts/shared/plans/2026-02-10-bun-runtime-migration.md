# Bun Runtime Migration Plan

## Overview

Swap all Node.js runtime usage to Bun. Keep `@sveltejs/adapter-node` (officially maintained, Bun-compatible) but run its output with `bun` instead of `node`. Leave Convex `'use node'` actions untouched (Convex-managed infra).

## Current State

- Package manager: already Bun (`bun@1.2.2`)
- Build/CI: already Bun (`bun install`, `bun run build`)
- Runtime: Node.js (`node build/index.js` in both apps)
- Railway start commands: `node apps/{app}/build/index.js`

## Desired End State

Every `node` invocation replaced with `bun`. Both Railway services start with `bun`. CI doesn't reference Node.js. Local dev runs on Bun (already does). Adapter-node stays — its output is a standard server that Bun runs natively.

## What We're NOT Doing

- Replacing `@sveltejs/adapter-node` with `svelte-adapter-bun` (CSRF bugs, stalled maintenance)
- Replacing Vitest with `bun test`
- Replacing Turbo with Bun workspace scripts
- Touching Convex `'use node'` actions (Convex-managed runtime)
- Changing Vite config `node:url` imports (Bun supports `node:` protocol)

## Implementation Approach

Single phase — this is a small, low-risk change. Swap `node` → `bun` in 4 files + verify Railway picks up Bun runtime.

## Phase 1: Swap Node.js Runtime to Bun

### Changes Required

#### 1.1 Railway Start Commands

**File**: `apps/web/railway.toml:7`
**Change**: `node` → `bun` in startCommand

```toml
# Before
startCommand = "node apps/web/build/index.js"

# After
startCommand = "bun apps/web/build/index.js"
```

**File**: `apps/verifier/railway.toml:7`
**Change**: `node` → `bun` in startCommand

```toml
# Before
startCommand = "node apps/verifier/build/index.js"

# After
startCommand = "bun apps/verifier/build/index.js"
```

#### 1.2 Package.json Start Scripts

**File**: `apps/web/package.json:18`
**Change**: `node` → `bun` in start script

```json
"start": "bun build/index.js"
```

**File**: `apps/verifier/package.json:18`
**Change**: `node` → `bun` in start script

```json
"start": "bun build/index.js"
```

### Success Criteria

#### Automated Verification

- [ ] Build succeeds: `bun run build`
- [ ] Tests pass: `bun run test:run`
- [ ] Typecheck passes: `bun run check`
- [ ] Local start works: `cd apps/web && bun run build && bun run start` (server responds on localhost)
- [ ] Same for verifier: `cd apps/verifier && bun run build && bun run start`

#### Manual Verification

- [ ] Deploy web to Railway — healthcheck passes, app loads
- [ ] Deploy verifier to Railway — healthcheck passes, app loads
- [ ] Auth flow works (login/register) — confirms no CSRF issues with adapter-node under Bun
- [ ] Push notifications still fire
- [ ] Billing flow works (PayFast redirect + return)

**Implementation Note**: After automated verification passes locally, deploy to Railway and confirm healthchecks + auth flow before considering done.

## Railway + Bun Compatibility Note

Railway's Railpack builder detects Bun via `bun.lock` and `packageManager` field in `package.json`. The build phase already uses Bun (`bun run build:web`). For the deploy phase, Railpack installs Bun in the runtime image when it detects Bun usage, so `bun` is available in `startCommand`. No Dockerfile or nixpacks config needed.

## Rollback

If Bun runtime causes issues on Railway, revert the 4 lines back to `node`. Zero-risk rollback.

## References

- Bun Node.js compatibility: https://bun.sh/docs/runtime/nodejs-apis
- Bun SvelteKit guide: https://bun.sh/docs/guides/ecosystem/sveltekit
- Railway Railpack Bun support: Railpack auto-detects via `bun.lock`
- svelte-adapter-bun deprecation concerns: https://github.com/gornostay25/svelte-adapter-bun/issues/74
