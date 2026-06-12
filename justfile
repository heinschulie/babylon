# Babylon (Thetha) — Bun monorepo
set dotenv-load := true

# List all recipes
default:
  @just --list

# Dev: web app + Convex backend + Cloudflare Tunnel
dev:
  trap 'kill 0' EXIT; bun run dev & bun run convex:dev & cloudflared tunnel run babylon-dev & wait

# Dev: web app only
web:
  bun run dev

# Dev: verifier app only
verifier:
  bun run dev:verifier

# Dev: Cloudflare Tunnel only
tunnel:
  cloudflared tunnel run babylon-dev

# Dev: Convex backend (watch mode)
convex:
  bun run convex:dev

# Deploy Convex backend
convex-deploy:
  bun run convex:deploy

# Convex logs
convex-logs:
  bun run convex:logs

# Build all
build:
  bun run build

# Build web only
build-web:
  bun run build:web

# Build verifier only
build-verifier:
  bun run build:verifier

# Type check all packages
check:
  bun run check

# Run all tests
test:
  bun run test:run

# Format all files
format:
  bun run format

# Lint all packages
lint:
  bun run lint

# Install dependencies + setup tunnels
install:
  bun install
  ./scripts/setup-tunnels.sh

# Reset artifacts
reset:
  rm -rf node_modules
  rm -rf apps/web/node_modules apps/verifier/node_modules
  rm -rf packages/*/node_modules
  rm -rf apps/web/.svelte-kit apps/verifier/.svelte-kit
  rm -rf .claude/hooks/*.log
