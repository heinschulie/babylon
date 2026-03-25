---
date: 2026-03-21T00:00:00+02:00
researcher: Claude
git_commit: 452e5a1
branch: al
repository: babylon
topic: 'billing'
tags: [research, codebase, billing, payfast, subscriptions, entitlements]
status: complete
last_updated: 2026-03-21
last_updated_by: Claude
---

# Research: Billing

## Research Question

How does billing work in the Babylon codebase?

## Summary

Babylon uses a **fully custom PayFast integration** (South African payment provider) with a three-tier model: Free (R0/mo, 0 min/day), AI (R150/mo, 10 min/day), Pro (R500/mo, 15 min/day). The architecture uses a dual-table pattern — `billingSubscriptions` tracks PayFast provider state while `entitlements` serves as the authoritative feature gate. Daily usage is tracked per-user in their local timezone. Webhooks drive state transitions with deduplication and audit logging. No third-party billing SDKs are used (Stripe, Paddle, etc.) — only `spark-md5` for PayFast signature hashing.

## Detailed Findings

### Plan Configuration

Defined in `convex/lib/billing.ts:5-20`:

| Tier | Price | Daily Minutes |
|------|-------|---------------|
| Free | R0/mo | 0 min/day |
| AI | R150/mo | 10 min/day |
| Pro | R500/mo | 15 min/day |

Type: `Tier = 'free' | 'ai' | 'pro'`

### Database Schema

Four billing-related tables in `convex/schema.ts`:

**billingSubscriptions** (lines 239-254) — PayFast provider state
- Fields: userId, provider, plan, status (pending|active|past_due|canceled), payfastReference, providerPaymentId, providerSubscriptionToken, lastPaymentAt, currentPeriodEnd
- Indexes: by_user, by_provider_reference, by_provider_payment

**entitlements** (lines 257-263) — Authoritative feature gating
- Fields: userId, tier (free|ai|pro), status (active|past_due|canceled), source (webhook|admin|seed), updatedAt
- Index: by_user

**usageDaily** (lines 266-273) — Per-day recording minute tracking
- Fields: userId, dateKey (YYYY-MM-DD in user's timezone), minutesRecorded, updatedAt
- Indexes: by_user, by_user_date

**billingEvents** (lines 276-286) — Raw webhook audit log
- Fields: userId (optional), provider, providerEventId, providerPaymentId, eventType, payload, receivedAt
- Indexes: by_provider_event, by_provider_payment

### Public API

`convex/billing.ts` exposes:

- **`getStatus`** (query, line ~126) — Returns tier, status, minutesUsed, minutesLimit, dateKey, devToggleEnabled
- **`createPayfastCheckout`** (mutation, line ~146) — Builds PayFast form fields with MD5 signature, creates pending subscription
- **`setMyTierForDev`** (mutation, line ~202) — Dev-only tier override, gated by `BILLING_DEV_TOGGLE` env var + allowlist
- **`setEntitlement`** (internal mutation, line ~257) — Applies tier/status changes from webhooks; blocks out-of-order transitions

### Billing Utilities

`convex/lib/billing.ts` exports:
- `getEntitlement()` — Fetch user's current tier+status; defaults to 'free'
- `getDailyUsage()` — Minutes used today
- `getUserTimeZone()` — From userPreferences; defaults to Africa/Johannesburg
- `getDateKeyForTimeZone()` — YYYY-MM-DD in user's timezone
- `assertRecordingAllowed()` — Pre-flight check: tier + daily minute limit
- `consumeRecordingMinutes()` — Atomically deduct minutes from daily usage
- `minutesFromMs()` — Convert ms to decimal minutes (3 decimals)

### PayFast Integration

**Crypto utilities** (`convex/lib/payfast.ts`):
- `buildPayfastSignature()` — MD5 hash via spark-md5
- `buildPayfastCanonicalString()` — Ordered param=value string for signing
- `normalizePayfastPassphrase()` — Handles blank passphrases
- `parseFormBody()` — URL-decode webhook form data

**Webhook handler** (`convex/billingNode.ts:48-257`):
1. Validates merchant ID and MD5 signature
2. Calls PayFast validation endpoint (4s timeout)
3. Deduplicates by signature hash
4. Looks up subscription by merchant reference
5. Validates amount matches plan price
6. Handles payment statuses:
   - `COMPLETE` → subscription active, entitlement active
   - `FAILED` → subscription past_due, entitlement past_due
   - `CANCELLED` → subscription canceled, entitlement free/canceled
7. Comprehensive logging with sanitization

**HTTP route** (`convex/http.ts:10-14`): `POST /webhooks/payfast`

**Subscription state machine** (`convex/billingSubscriptions.ts:57-117`):
- `setStatus()` enforces terminal canceled state
- Prevents regression to pending
- Allows metadata-only updates on duplicate status

### Frontend UI

**Settings page** (`apps/web/src/routes/settings/+page.svelte:370-452`):
- Subscription management card showing tier, status, daily minutes used/limit
- Upgrade buttons for AI (R150/mo) and Pro (R500/mo)
- `startCheckout()` function (lines 155-182) builds hidden form and submits to PayFast
- Dev tier switcher (lines 405-449) gated by environment

**Payment callbacks:**
- `apps/web/src/routes/billing/return/+page.svelte` — Success confirmation
- `apps/web/src/routes/billing/cancel/+page.svelte` — Cancellation page

**Verifier app** has no billing UI.

### i18n

All billing strings are fully translated in English and isiXhosa:
- `apps/web/messages/en.json` (lines 55-73, 66-73, 142-151)
- `apps/web/messages/xh.json` (same line ranges)

Key message keys: `settings_sub_title`, `settings_sub_tier`, `settings_sub_status`, `settings_sub_minutes`, `settings_sub_upgrade_ai`, `settings_sub_upgrade_pro`, `billing_complete`, `billing_canceled`

### Environment Variables

PayFast config (see `.env.example` lines 28-43):
- `PAYFAST_SANDBOX`, `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, `PAYFAST_PASSPHRASE`
- `PAYFAST_RETURN_URL`, `PAYFAST_CANCEL_URL`, `PAYFAST_NOTIFY_URL`
- `PAYFAST_ENABLE_RECURRING` (default: true), `PAYFAST_MINIMAL_CHECKOUT`

Dev toggle:
- `BILLING_DEV_TOGGLE`, `BILLING_DEV_TOGGLE_ALLOWLIST`, `BILLING_DEV_TOGGLE_ADMIN_ALLOWLIST`, `BILLING_DEV_TOGGLE_ALLOW_PRODUCTION`

### Tests

- `convex/billingWebhooks.test.ts` — Deduplication, state transitions, out-of-order resilience, terminal state enforcement
- `convex/billingDevToggle.test.ts` — Dev toggle safety across environments
- `convex/payfast.test.ts` — Signature generation validation

### Documentation

- `docs/billing.md` — 157-line architecture doc covering schema, plans, API, webhooks, crypto, frontend, i18n, env vars, and tests

## Code References

- `convex/schema.ts:239-286` — Four billing tables
- `convex/billing.ts` — Public billing API (getStatus, createPayfastCheckout, setMyTierForDev, setEntitlement)
- `convex/billingNode.ts:48-257` — PayFast webhook handler
- `convex/billingSubscriptions.ts:57-117` — Subscription state machine
- `convex/billingEvents.ts:4-33` — Event audit log + dedup
- `convex/lib/billing.ts:5-130` — Plan config + utilities
- `convex/lib/payfast.ts` — Signature + form parsing
- `convex/http.ts:10-14` — Webhook route registration
- `apps/web/src/routes/settings/+page.svelte:155-452` — Billing UI
- `apps/web/src/routes/billing/return/+page.svelte` — Payment success page
- `apps/web/src/routes/billing/cancel/+page.svelte` — Payment cancel page
- `apps/web/messages/en.json:55-73,142-151` — Billing i18n (English)
- `apps/web/messages/xh.json:55-73,142-151` — Billing i18n (Xhosa)
- `.env.example:28-43` — PayFast env vars
- `docs/billing.md` — Architecture documentation

## Architecture Documentation

**Dual-table pattern**: `billingSubscriptions` stores raw PayFast provider state; `entitlements` is the authoritative gate for feature access. This decouples payment processor concerns from application logic.

**Webhook-driven state machine**: All tier changes flow through PayFast webhooks → `billingNode.ts` → internal mutations. The frontend never directly sets entitlements (except dev toggle).

**Daily usage tracking**: Per-user, per-day in user's local timezone (defaults to Africa/Johannesburg). `assertRecordingAllowed()` + `consumeRecordingMinutes()` enforce tier limits atomically.

**Checkout flow**: Frontend builds a hidden form with signed fields and submits directly to PayFast (no server-side redirect). PayFast redirects back to `/billing/return` or `/billing/cancel`.

**Deduplication**: `billingEvents` deduplicates by `providerEventId`; webhook handler also deduplicates by signature hash.

## Open Questions

None — billing system is well-documented and comprehensively tested.
