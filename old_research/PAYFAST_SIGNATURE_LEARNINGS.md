# PayFast Signature Integration: LLM Best-Practice Runbook

## Purpose
This document captures practical lessons from resolving persistent PayFast `signature mismatch` errors in sandbox and local testing. It is written for another LLM (or engineer) to apply directly.

## Integration Context
This app uses PayFast for web/PWA billing for `ai` and `pro` plans.

## Required Env Vars
Set the following in Convex environment:

- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_PASSPHRASE` (optional, but if set in dashboard it must match exactly)
- `PAYFAST_SANDBOX` (`true` for sandbox, `false` for live)
- `PAYFAST_RETURN_URL` (can be localhost in local testing)
- `PAYFAST_CANCEL_URL` (can be localhost in local testing)
- `PAYFAST_NOTIFY_URL` (must be publicly reachable; cannot be localhost)
- `PAYFAST_ENABLE_RECURRING` (`true` for subscriptions)
- `PAYFAST_MINIMAL_CHECKOUT` (`true` only for debugging/isolation)

## Runtime Flow
1. Client calls `billing.createPayfastCheckout` with plan (`ai` or `pro`).
2. Backend builds ordered PayFast fields and computes `signature`.
3. Browser posts form to PayFast process endpoint.
4. PayFast sends ITN webhook to `/webhooks/payfast`.
5. Webhook validates:
   - merchant id match
   - signature match
   - PayFast `/eng/query/validate` response
6. Backend updates:
   - `billingSubscriptions`
   - `entitlements`
   - `billingEvents`

## Final Outcome
- Minimal checkout worked.
- Full checkout initially failed with signature mismatch.
- Fixing field assembly order for signed parameters resolved full checkout.
- Recurring subscriptions worked after the same ordering fix.

## Core Finding
The dominant failure was **payload composition/order drift**, not hashing algorithm choice.

In this codebase, signature correctness required:
1. Stable field insertion order in checkout payload construction.
2. Signature built from the exact fields sent to PayFast (excluding `signature` itself).
3. Consistent URL encoding (`encodeURIComponent(...).replace(/%20/g, '+')`).

## Non-Negotiable Invariants
1. Never mutate signed field values after signature generation.
2. Build checkout fields in deterministic order before signing.
3. Keep `m_payment_id` present only when intended, and place it consistently in the ordered field set.
4. Treat blank/whitespace passphrase as unset.
5. Trim env vars before use.
6. Keep `notify_url` on a public endpoint and on the same active backend deployment handling checkout + webhook.

## Local Testing Truths
- `return_url` and `cancel_url` may point to localhost.
- `notify_url` cannot be localhost (PayFast ITN must reach a public endpoint).
- Localhost is usually not the direct cause of signature mismatch; signature mismatch usually indicates signing input differences.

## Working Debug Strategy (Use This Sequence)
1. **Minimal payload mode** (merchant + URLs + amount + item_name):
   - If this fails, investigate credentials/passphrase/env first.
2. **Full non-recurring mode**:
   - Add `m_payment_id` and other metadata.
   - If this fails while minimal passes, isolate ordering/content of added fields.
3. **Recurring mode**:
   - Enable `subscription_type`, `frequency`, `cycles` only after full non-recurring passes.

This progressive isolation avoids config thrash and pinpoints the exact failing field set.

## Field-Ordering Guidance
Construct form fields in a fixed PayFast-style order, then sign:
1. `merchant_id`
2. `merchant_key`
3. `return_url`
4. `cancel_url`
5. `notify_url`
6. `m_payment_id` (if used)
7. `amount`
8. `item_name`
9. recurring fields (if enabled): `subscription_type`, `frequency`, `cycles`
10. `signature` (computed last)

## Data Mapping Guidance
- Do not rely on fragile identifiers if provider parsing is uncertain.
- Use a provider-safe merchant reference token for `m_payment_id`.
- Resolve webhook records through indexed lookup on that reference.

## System Notes
- Webhook updates are authoritative for entitlement state.
- Duplicate ITNs are deduplicated by provider event id.
- Daily usage limits are enforced through `usageDaily`.
- Default entitlement is `free` when no active subscription exists.

## Configuration Safety Checklist
- `PAYFAST_SANDBOX=true` when using sandbox credentials.
- `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`, and `PAYFAST_PASSPHRASE` come from the same account/profile.
- `PAYFAST_PASSPHRASE` exactly matches dashboard passphrase (or blank on both sides).
- `PAYFAST_NOTIFY_URL` points to active deployment webhook route.
- No hidden whitespace/newlines in env values.

## Anti-Patterns to Avoid
- Reordering signed fields implicitly (or changing order across code paths).
- Adding “security hardening” transformations that alter signed values (e.g., unnecessary value mutation).
- Debugging recurring config before base non-recurring signature path is proven.
- Mixing deployment URLs (checkout from one backend, webhook configured to another).

## Recommended Ongoing Practice
- Keep a toggleable diagnostic mode:
  - minimal checkout
  - recurring on/off
- Retain a small signature unit test suite for:
  - canonical string behavior
  - passphrase handling
  - signature stability
- Document exact active env values used during successful tests.
