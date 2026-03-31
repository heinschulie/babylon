---
date: 2026-03-31T00:00:00+02:00
researcher: Claude
git_commit: d65e376
branch: main
repository: babylon
topic: 'Why does `just dev` leave zombie processes after Ctrl+C?'
tags: [research, codebase, justfile, process-management, devx]
status: complete
last_updated: 2026-03-31
last_updated_by: Claude
---

# Research: `just dev` Zombie Processes

## Research Question

`just dev` spins up a bunch of processes when it is run. We have a situation where we have zombie processes running after I kill `just dev` in the terminal. Why is this, what are those processes, and how would we clean them up?

## Summary

`just dev` (justfile:10) launches **four processes** via shell `&` backgrounding in a single line. When you Ctrl+C, only the foreground process (`cloudflared`) receives SIGINT reliably. The three backgrounded processes (`bun run dev`, `bun run convex:dev`, `bun run adws/triggers/webhook.ts`) become orphans because `just` does not create a process group or trap signals for cleanup. The webhook server is the worst offender — it has zero signal handlers, so it keeps port 8001 bound indefinitely.

## Detailed Findings

### The four processes spawned by `just dev`

From `justfile:10`:
```
bun run dev & bun run convex:dev & bun run adws/triggers/webhook.ts & cloudflared tunnel run babylon-dev
```

| # | Command | What it runs | Port | Has signal handlers? |
|---|---------|-------------|------|---------------------|
| 1 | `bun run dev` | `turbo run dev --filter=@babylon/web` → `vite dev` (package.json:11) | 5173 | Vite handles SIGINT |
| 2 | `bun run convex:dev` | `bunx convex dev` (package.json:18) | Convex CLI-managed | Convex CLI handles SIGINT |
| 3 | `bun run adws/triggers/webhook.ts` | `Bun.serve()` HTTP server (webhook.ts:251) | 8001 | **None** |
| 4 | `cloudflared tunnel run babylon-dev` | Cloudflare Tunnel | N/A | cloudflared handles SIGINT |

### Why zombies happen

1. **`just` does not manage process groups.** It executes the recipe line in a child shell. The `&` operator backgrounds processes within that shell, but `just` doesn't create a dedicated process group or trap signals to forward them.

2. **Ctrl+C sends SIGINT to the foreground process group.** Only the last command in the chain (`cloudflared`) is the foreground process. The three `&`-backgrounded commands may or may not receive SIGINT depending on terminal/shell behavior — in practice they usually don't.

3. **The webhook server has no shutdown handlers.** Unlike `adws/triggers/cron.ts:222-223` which traps SIGINT/SIGTERM, `webhook.ts` has zero signal handling. It calls `Bun.serve()` at line 251 and never stores the server reference or attaches shutdown logic. It also spawns child workflow processes via `Bun.spawn()` (line 203) that are completely untracked.

4. **Turbo adds another layer.** `bun run dev` → `turbo run dev` → `vite dev`. Turbo is a persistent process (`turbo.json:10`, `persistent: true`) wrapping Vite. Even if SIGINT reaches Turbo, it needs to propagate through to Vite.

### Which processes are likely zombies

After killing `just dev`, you'll typically find:
- **`bun`** processes (from `bun run dev` and `bun run convex:dev`)
- **`node`** processes (from Turbo, Vite, or Convex CLI)
- **The webhook server** on port 8001 (most reliably orphaned since it has no signal handling)

### How to clean them up

Manual cleanup:
```bash
# Find what's holding the ports
lsof -i :5173 -i :8001 | grep LISTEN

# Kill all bun/node processes from dev
pkill -f "vite dev"
pkill -f "convex dev"
pkill -f "webhook.ts"
pkill -f "cloudflared tunnel"

# Nuclear option — kill everything on the dev ports
kill $(lsof -t -i :5173 -i :8001) 2>/dev/null
```

## Code References

- `justfile:10` — The `dev` recipe with four `&`-backgrounded commands
- `package.json:11` — `"dev": "turbo run dev --filter=@babylon/web"`
- `package.json:18` — `"convex:dev": "bunx convex dev"`
- `turbo.json:8-12` — Dev task config with `persistent: true`
- `apps/web/package.json:7` — `"dev": "vite dev"`
- `adws/triggers/webhook.ts:251-266` — `Bun.serve()` with no signal handlers
- `adws/triggers/webhook.ts:203` — `Bun.spawn()` for child workflows, untracked
- `adws/triggers/cron.ts:222-223` — Signal handlers (SIGINT/SIGTERM) — example of correct cleanup that webhook.ts lacks

## Architecture Documentation

The `just dev` recipe uses the simplest possible process orchestration: shell `&` backgrounding. This works for starting processes but provides no lifecycle management. The `just` command runner does not implement process group management or signal forwarding — it delegates entirely to the shell.

The codebase has two trigger servers (`webhook.ts` and `cron.ts`) with inconsistent signal handling. `cron.ts` traps SIGINT/SIGTERM and sets a `shutdownRequested` flag for graceful exit. `webhook.ts` has no equivalent.

## Open Questions

- Should `just dev` be replaced with a process manager (e.g., a shell trap + `wait`, or `concurrently`/`overmind`)?
- Should `webhook.ts` add SIGINT/SIGTERM handlers matching the pattern in `cron.ts`?
