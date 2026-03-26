---
date: 2026-03-25T00:00:00+02:00
researcher: Claude
git_commit: 4a209d8
branch: hein/feature/issue-61
repository: babylon
topic: 'billing'
tags: [research, codebase, billing, payfast, entitlements, subscriptions]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: Billing

## Research Question

How does billing work across the Babylon codebase?

## Summary

Babylon uses **PayFast** (South African payment provider) as its sole payment processor. The system implements a three-tier model (free/ai/pro) with webhook-driven subscription state management, daily usage metering in the user's timezone, deduplication, and audit logging. A dual-table pattern separates provider state (`billingSubscriptions`) from authoritative feature gating (`entitlements`).

## Detailed Findings

### Plan Configuration

**`convex/lib/billing.ts`**

| Plan | Price | Daily Recording Limit |
|------|-------|-----------------------|
| Free | R0/mo | 0 min/day |
| AI | R150/mo | 10 min/day |
| Pro | R500/mo | 15 min/day |

### Database Schema

**`convex/schema.ts`**

Four billing tables:

- **`billingSubscriptions`** (lines 239–254) — Provider-side subscription state. Fields: `userId`, `provider` (`payfast`), `plan` (`free|ai|pro`), `status` (`pending|active|past_due|canceled`), `payfastReference`, `providerPaymentId`, `providerSubscriptionToken`, `lastPaymentAt`, `currentPeriodEnd`. Indexes: `by_user`, `by_provider_reference`, `by_provider_payment`.

- **`entitlements`** (lines 257–263) — Authoritative access tier for feature gating. Single row per user. Fields: `userId`, `tier` (`free|ai|pro`), `status` (`active|past_due|canceled`), `source` (`webhook|admin|seed`), `updatedAt`. Index: `by_user`.

- **`usageDaily`** (lines 266–273) — Per-user daily recording usage tracked in user's local timezone. Fields: `userId`, `dateKey` (YYYY-MM-DD), `minutesRecorded`, `updatedAt`. Indexes: `by_user`, `by_user_date`.

- **`billingEvents`** (lines 276–286) — Raw webhook payloads for audit/debug. Fields: `provider`, `providerEventId`, `providerPaymentId`, `userId` (optional), `eventType`, `payload`, `receivedAt`. Indexes: `by_provider_event`, `by_provider_payment`.

### Public API

**`convex/billing.ts`**

| Function | Type | Lines | Purpose |
|----------|------|-------|---------|
| `getStatus` | Query | 126–144 | Returns tier, status, minutesUsed, minutesLimit, dateKey, devToggleEnabled |
| `createPayfastCheckout` | Mutation | 146–200 | Builds signed PayFast checkout form fields, creates pending subscription |
| `setMyTierForDev` | Mutation | 202–255 | Dev-only tier override (gated by environment) |
| `setEntitlement` | Internal Mutation | 257–301 | Upserts entitlement from webhook; enforces state machine |

### Billing Utilities

**`convex/lib/billing.ts`**

- `getEntitlement()` — Fetch user's tier+status (defaults to free)
- `getDailyUsage()` — Minutes used in current day (user's timezone)
- `getUserTimeZone()` — From `userPreferences`; defaults to `Africa/Johannesburg`
- `getDateKeyForTimeZone()` — Format YYYY-MM-DD in user's timezone
- `assertRecordingAllowed()` — Pre-flight: valid tier + within daily limit
- `consumeRecordingMinutes()` — Atomically deduct from daily quota
- `getPlanFromTier()` — Lookup plan details by tier

### PayFast Integration

**`convex/lib/payfast.ts`** — Cryptography & parsing:
- `buildPayfastSignature()` — MD5 hash of canonical param string (spark-md5)
- `buildPayfastCanonicalString()` — Ordered `param=value&...` string
- `normalizePayfastPassphrase()` — Trim/handle blank passphrases
- `parseFormBody()` — URL-decode webhook form data

**`convex/billingNode.ts`** (lines 48–257) — HTTP action `payfastWebhook` at `POST /webhooks/payfast`:

Validation pipeline:
1. Parse form body
2. Validate merchant ID matches config
3. Verify MD5 signature
4. Call PayFast validation endpoint (4s timeout)
5. Deduplicate by signature hash
6. Lookup subscription by `payfastReference`
7. Validate plan + user + amount

State transitions on payment status:
- `COMPLETE` → subscription active, entitlement active
- `FAILED` → subscription past_due, entitlement past_due
- `CANCELLED` → subscription canceled, entitlement free+canceled

### Subscription State Machine

**`convex/billingSubscriptions.ts`**

`setStatus()` (lines 57–117) enforces:
- Canceled is terminal (no transitions out)
- No regression to pending
- Allows metadata updates on duplicate status (for payment ID updates)

### Dev Toggle Hardening

**`convex/billing.ts`** (lines 76–124)

`canUseDevBillingToggle()`:
- Test env: always enabled
- Local dev (localhost + non-prod): enabled by default
- Non-local: requires `BILLING_DEV_TOGGLE=true` + allowlist
- Production: additionally requires `BILLING_DEV_TOGGLE_ALLOW_PRODUCTION=true`

### Frontend UI

**Settings page** — `apps/web/src/routes/settings/+page.svelte` (lines 370–452):
- Subscription card: current tier, status, daily minutes used/limit
- Upgrade buttons for AI (R150/mo) and Pro (R500/mo)
- `startCheckout()` builds hidden form, submits directly to PayFast
- Dev tier switcher (gated by `devToggleEnabled`)

**Library page** — `apps/web/src/routes/library/+page.svelte` (line 16):
- Queries `billing.getStatus` for `minutesRemaining` derived value

**Callback pages:**
- `apps/web/src/routes/billing/return/+page.svelte` — Success confirmation
- `apps/web/src/routes/billing/cancel/+page.svelte` — Cancellation page
- Duplicated in `apps/verifier/src/routes/billing/` (same pages)

### i18n

**`apps/web/messages/en.json`** + **`xh.json`** (lines 55–73, 142–151):
- Subscription keys: `settings_sub_title`, `settings_sub_tier`, `settings_sub_status`, `settings_sub_minutes`, `settings_sub_upgrade_ai`, `settings_sub_upgrade_pro`
- Dev keys: `settings_dev_title`, `settings_dev_desc`, `settings_dev_free/ai/pro`
- Billing pages: `billing_complete`, `billing_canceled` (+ descriptions)

### Environment Variables

**`.env.example`** (lines 35–50):

| Variable | Purpose |
|----------|---------|
| `PAYFAST_MERCHANT_ID` | Merchant account ID (sandbox: `10000100`) |
| `PAYFAST_MERCHANT_KEY` | Auth key (sandbox: `46f0cd694581a`) |
| `PAYFAST_PASSPHRASE` | Webhook signature passphrase |
| `PAYFAST_SANDBOX` | Sandbox mode flag |
| `PAYFAST_RETURN_URL` | Checkout success redirect |
| `PAYFAST_CANCEL_URL` | Checkout cancel redirect |
| `PAYFAST_NOTIFY_URL` | Webhook endpoint (Convex HTTP) |
| `PAYFAST_ENABLE_RECURRING` | Recurring subscription mode |
| `BILLING_DEV_TOGGLE` | Enable dev tier switching |
| `BILLING_DEV_TOGGLE_ALLOWLIST` | User IDs for non-local dev toggle |
| `BILLING_DEV_TOGGLE_ALLOW_PRODUCTION` | Explicitly allow in production |

### Dependencies

**`apps/web/package.json`**:
- `spark-md5@3.0.2` — MD5 hashing for PayFast signatures
- `@types/spark-md5@3.0.5`

No Stripe, Paddle, or other payment SDKs.

### Tests

- `convex/billingWebhooks.test.ts` — Event dedup, state transitions, out-of-order safety, canceled-is-terminal
- `convex/billingDevToggle.test.ts` — Environment gating (local, production default-off, production with allowlist)
- `convex/payfast.test.ts` — Signature gen, passphrase handling, form body parsing

### Documentation

- `docs/billing.md` (157 lines) — Architecture doc covering all of the above

## Code References

- `convex/schema.ts:239-286` — Billing table definitions
- `convex/billing.ts:126-301` — Public API + entitlement mutation
- `convex/lib/billing.ts` — Plan config + billing utilities
- `convex/lib/payfast.ts` — PayFast crypto + parsing
- `convex/billingNode.ts:48-257` — Webhook handler
- `convex/billingSubscriptions.ts:57-117` — Subscription state machine
- `convex/billingEvents.ts:4-33` — Event dedup + audit insert
- `convex/http.ts` — HTTP route registration
- `apps/web/src/routes/settings/+page.svelte:370-452` — Billing UI
- `apps/web/src/routes/library/+page.svelte:16` — Usage query
- `apps/web/src/routes/billing/return/+page.svelte` — Success page
- `apps/web/src/routes/billing/cancel/+page.svelte` — Cancel page
- `.env.example:35-50` — PayFast env vars

## Architecture Documentation

Key patterns:

1. **Dual-table pattern** — `billingSubscriptions` (provider state) vs `entitlements` (authoritative feature gate). Webhooks update both; application code reads only `entitlements`.
2. **Webhook-driven state machine** — All tier changes flow through PayFast webhooks. No client-side tier mutations in production.
3. **Deduplication** — `billingEvents.providerEventId` + signature hashes prevent duplicate processing.
4. **Out-of-order safety** — State machine blocks invalid transitions; canceled is terminal to prevent webhook replay attacks.
5. **Timezone-aware daily metering** — Usage resets at midnight in user's local timezone (`Africa/Johannesburg` default).
6. **Hardened dev toggle** — Multi-layer gating (env check → allowlist → production opt-in) for testing without payment.

## Open Questions

None — the billing system is well-documented in `docs/billing.md` and the codebase is consistent with that doc.
