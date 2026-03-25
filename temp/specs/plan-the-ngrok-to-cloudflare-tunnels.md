# Plan: Migrate ngrok to Cloudflare Tunnels

## Metadata

adw_id: `the`
prompt: `Migrate from ngrok to Cloudflare Tunnels based on grill-me decision log`
conversation_id: `grill-me-ngrok-cf-tunnels-2026-03-24`
task_type: chore
complexity: medium

## Task Description

Replace the ngrok free-tier tunnel with Cloudflare Tunnels using the `schulie.com` domain. Expose three local services via stable subdomains, update the GitHub webhook, add dynamic auth trusted origins, and integrate tunnel startup into the `just dev` command.

## Objective

When complete:
1. `just dev` starts web app, Convex backend, and Cloudflare Tunnel in parallel
2. Three subdomains route to local services: `dev.schulie.com:5173`, `verifier.schulie.com:5178`, `webhook.schulie.com:8001`
3. GitHub webhook delivers to `https://webhook.schulie.com/gh-webhook`
4. Auth accepts tunnel origins via `AUTH_EXTRA_TRUSTED_ORIGINS` env var
5. All ngrok references removed from codebase

## Problem Statement

ngrok free-tier URLs are ephemeral and unstable — they change on restart, causing failures in external tool integrations (Firecrawl screenshots, GitHub webhooks). Cloudflare Tunnels provide stable, named subdomains under a domain the user owns.

## Solution Approach

Create a single Cloudflare Tunnel (`babylon-dev`) with three ingress rules mapped to subdomains on `schulie.com`. Update all references from ngrok to the new stable URLs. Add `AUTH_EXTRA_TRUSTED_ORIGINS` env var for dynamic trusted origin management.

## Relevant Files

- `convex/auth.ts` — trusted origins logic, remove `5180`, add `AUTH_EXTRA_TRUSTED_ORIGINS` parsing
- `.env.local` — update `DEV_TUNNEL_URL`, add `AUTH_EXTRA_TRUSTED_ORIGINS`
- `.env.example` — update docs/comments for tunnel and new env var
- `justfile` — add `tunnel` recipe, update `dev` recipe
- `adws/triggers/webhook.ts` — no code changes, but the service exposed via tunnel
- `temp/specs/plan-step-recorder-extraction.md` — contains prior ngrok references (clean up)

### New Files

- `~/.cloudflared/config.yml` — Cloudflare Tunnel ingress config (outside repo, on user's machine)

## Implementation Phases

### Phase 1: Cloudflare Tunnel Setup

Create tunnel, DNS routes, and config file via `cloudflared` CLI.

### Phase 2: Codebase Changes

Update auth, env vars, justfile, and GitHub webhook.

### Phase 3: Cleanup & Validation

Remove ngrok references, validate all three services are reachable.

## Step by Step Tasks

### 1. Cloudflare Tunnel Creation

- Verify `cloudflared` auth: `cloudflared tunnel list` (if fails, prompt user to run `cloudflared login`)
- Create tunnel: `cloudflared tunnel create babylon-dev`
- Create DNS routes:
  - `cloudflared tunnel route dns babylon-dev dev.schulie.com`
  - `cloudflared tunnel route dns babylon-dev verifier.schulie.com`
  - `cloudflared tunnel route dns babylon-dev webhook.schulie.com`
- Write `~/.cloudflared/config.yml`:

```yaml
tunnel: babylon-dev
credentials-file: ~/.cloudflared/<tunnel-id>.json

ingress:
  - hostname: dev.schulie.com
    service: http://localhost:5173
  - hostname: verifier.schulie.com
    service: http://localhost:5178
  - hostname: webhook.schulie.com
    service: http://localhost:8001
  - service: http_status:404
```

### 2. Add `AUTH_EXTRA_TRUSTED_ORIGINS` to `convex/auth.ts`

- Remove `http://localhost:5180` from `LOCAL_TRUSTED_ORIGINS`
- In `readAuthEnv()`, parse `AUTH_EXTRA_TRUSTED_ORIGINS` (comma-separated string → array)
- In `buildTrustedOrigins()`, merge extra origins into candidates

### 3. Update Environment Files

- `.env.local`: set `DEV_TUNNEL_URL=https://dev.schulie.com`, add `AUTH_EXTRA_TRUSTED_ORIGINS=https://dev.schulie.com,https://verifier.schulie.com`
- `.env.example`: add documented `AUTH_EXTRA_TRUSTED_ORIGINS=` entry with comment

### 4. Update Justfile

- Update `dev` recipe: `bun run dev & bun run convex:dev & cloudflared tunnel run babylon-dev`
- Add standalone `tunnel` recipe: `cloudflared tunnel run babylon-dev`

### 5. Update GitHub Webhook

- `gh api repos/heinschulie/babylon/hooks/601921098 -X PATCH -f 'config[url]=https://webhook.schulie.com/gh-webhook' -f 'config[content_type]=json'`

### 6. Remove ngrok References

- `.env.local`: remove ngrok URL comment (`# Start with: ngrok http 5173`)
- `temp/specs/plan-step-recorder-extraction.md`: update ngrok references to reflect completed migration

### 7. Validate

- Start tunnel: `cloudflared tunnel run babylon-dev`
- Curl each subdomain's health/test endpoint
- Trigger a test webhook delivery: `gh api repos/heinschulie/babylon/hooks/601921098/test -X POST`
- Run `bun run check` to verify type safety

## Testing Strategy

- Manual validation: curl each subdomain to confirm routing
- GitHub webhook: trigger test delivery, verify `webhook.ts` receives it
- Auth: no automated test needed — `AUTH_EXTRA_TRUSTED_ORIGINS` is additive and only affects runtime origin checks

## Acceptance Criteria

- [ ] `cloudflared tunnel list` shows `babylon-dev`
- [ ] `dev.schulie.com`, `verifier.schulie.com`, `webhook.schulie.com` DNS records exist
- [ ] `just dev` starts all three processes (web, convex, tunnel)
- [ ] `just tunnel` starts tunnel standalone
- [ ] GitHub webhook URL is `https://webhook.schulie.com/gh-webhook`
- [ ] `AUTH_EXTRA_TRUSTED_ORIGINS` parsed and merged in `convex/auth.ts`
- [ ] No references to `ngrok` remain in codebase (excluding git history)
- [ ] `bun run check` passes

## Validation Commands

- `cloudflared tunnel list` — confirm tunnel exists
- `cloudflared tunnel info babylon-dev` — confirm routes
- `gh api repos/heinschulie/babylon/hooks/601921098 --jq '.config.url'` — confirm webhook URL
- `grep -r ngrok . --include='*.ts' --include='*.md' --include='*.json' --exclude-dir=node_modules --exclude-dir=.git` — confirm no ngrok refs
- `bun run check` — type safety

## Notes

- User must run `cloudflared login` interactively if not already authenticated (cannot be automated)
- The `~/.cloudflared/config.yml` file lives outside the repo — not version-controlled
- Cloudflare free tier supports unlimited tunnels with no bandwidth limits
- If user later wants HTTPS-only access (no localhost), `AUTH_ALLOW_LOCALHOST_ORIGINS=false` can be set independently
