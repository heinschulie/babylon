# Babylon (Thetha) — Bun monorepo
set dotenv-load := true

# List all recipes
default:
  @just --list

# Dev: web app + Convex backend
dev:
  bun run dev & bun run convex:dev

# Dev: web app only
web:
  bun run dev

# Dev: verifier app only
verifier:
  bun run dev:verifier

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

# Install dependencies
install:
  bun install

# Reset artifacts
reset:
  rm -rf node_modules
  rm -rf apps/web/node_modules apps/verifier/node_modules
  rm -rf packages/*/node_modules
  rm -rf apps/web/.svelte-kit apps/verifier/.svelte-kit
  rm -rf .claude/hooks/*.log

# Agentic claude session
claude:
  claude --model opus --dangerously-skip-permissions

# Deterministic codebase setup
cldi:
  CLAUDE_SETUP=init claude --model opus --dangerously-skip-permissions

# Deterministic codebase maintenance
cldm:
  CLAUDE_SETUP=maintenance claude --model opus --dangerously-skip-permissions

# Agentic codebase setup
cldii:
  CLAUDE_SETUP=init claude --model opus --dangerously-skip-permissions "/install"

# Agentic codebase setup interactive
cldit:
  CLAUDE_SETUP=init claude --model opus --dangerously-skip-permissions "/install true"

# Agentic codebase maintenance
cldmm:
  CLAUDE_SETUP=maintenance claude --model opus --dangerously-skip-permissions "/maintenance"

# Generate docs + README from codebase research
docs adw-id="docs-run":
  bun run adws/workflows/research-codebase_produce-readme_update-prime.ts --adw-id {{adw-id}}
