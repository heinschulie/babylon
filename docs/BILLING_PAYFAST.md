# PayFast Billing Setup

This app uses PayFast for web/PWA subscriptions (AI and Pro tiers).

## Required Env Vars

Set the following in your Convex environment:

- `PAYFAST_MERCHANT_ID`
- `PAYFAST_MERCHANT_KEY`
- `PAYFAST_PASSPHRASE` (optional, but recommended)
- `PAYFAST_SANDBOX` (`true` for sandbox, `false` for live)
- `PAYFAST_RETURN_URL` (e.g. `https://app.example.com/billing/return`)
- `PAYFAST_CANCEL_URL` (e.g. `https://app.example.com/billing/cancel`)
- `PAYFAST_NOTIFY_URL` (e.g. `https://api.example.com/webhooks/payfast`)

## Flow

1. Client calls `billing.createPayfastCheckout` with plan `ai` or `pro`.
2. The server generates a PayFast form payload with signature.
3. Client POSTs form to PayFast.
4. PayFast sends ITN to `/webhooks/payfast`.
5. Webhook validates merchant, validates signature, validates with PayFast, then updates:
   - `billingSubscriptions`
   - `entitlements`
   - `billingEvents` (audit)

## Notes

- Webhook updates are authoritative for entitlements.
- Duplicate ITNs are ignored using deduplication keyed by provider event id.
- Daily recording limits are enforced via `usageDaily` in Convex.
- Entitlements default to `free` when no subscription exists.
