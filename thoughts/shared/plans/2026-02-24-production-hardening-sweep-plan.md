# Production Hardening Sweep Plan (Performance, Security, Legibility)

## Overview

This plan converts the codebase review findings into a phased execution plan that hardens Babylon for production without changing the visible look and feel of either app.

Primary goals:

- Improve production safety (auth, abuse resistance, data integrity, billing correctness)
- Improve performance and scalability (query shape, batching, background jobs, memory cleanup)
- Improve maintainability/legibility in high-risk modules (especially review and practice flows)

Constraint:

- No UI redesigns and no visual changes beyond smoother/faster behavior and better reliability.

## Scope (from review)

In-scope areas:

- Convex backend: auth, billing/webhooks, attempts, phrases, human reviews, notifications, AI actions
- SvelteKit apps (`web`, `verifier`): runtime headers, client memory/perf cleanup, correctness of claim flow
- Shared browser helpers: push subscription handling
- Production runtime hardening: timeouts, error handling, observability hooks

Out of scope for this plan:

- Feature additions unrelated to hardening
- Visual redesigns
- Product behavior changes that alter user-facing workflows (unless necessary to fix a bug)

## Delivery Strategy

Ship in sweeps that each produce a meaningful risk reduction:

1. **Sweep A (P0/P1 security + correctness)**: close abuse vectors and idempotency/data-integrity holes
2. **Sweep B (runtime/network hardening)**: timeouts, security headers, safer logging/error handling
3. **Sweep C (backend performance)**: remove high-cost query patterns and cron spikes
4. **Sweep D (frontend smoothness + behavior correctness)**: memory leaks, route correctness, promise handling
5. **Sweep E (legibility/type hardening)**: split large files, remove `any`, test coverage

Each sweep should be independently deployable.

---

## Phase 0: Baseline, Guardrails, and Tracking

### Objective

Create a safe starting point and make progress visible across multiple context windows.

### Tasks

- Create a tracking checklist in this file (see "Execution Tracker" section below) and update it as sweeps land.
- Capture baseline metrics before changes:
  - API latency p50/p95 for key Convex queries (`practiceSessions.list`, attempts list queries, `phrases.listAllByUser`)
  - Action failure rate for AI/notifications
  - Webhook success/error counts (PayFast)
  - Client memory behavior during repeated recording flows
- Define production-safe logging policy:
  - redact secrets/API keys
  - avoid logging raw third-party response bodies unless explicitly sanitized
- Confirm deployment environments and secrets:
  - production vs staging env separation
  - ensure dev-only toggles are disabled in production

### Deliverables

- Baseline measurements recorded (can be in PR description or ops notes)
- This plan file used as the source of truth for phased execution

### Acceptance Criteria

- Team can compare before/after performance for top 3 hot paths
- Everyone knows which toggles/envs are safe in production

---

## Phase 1 (Sweep A): Security and Data Integrity First

### Objective

Fix the highest-risk issues that can cause abuse, quota burn, incorrect billing state, or cross-user data integrity problems.

### 1.1 Lock down cost-bearing/public actions

Files:

- `convex/translateNode.ts`
- `convex/unsplash.ts`

Tasks:

- Require authentication for these actions unless there is a deliberate public use case.
- Add server-side authorization checks (use existing auth helper pattern for actions).
- Add coarse rate limits / quotas per user (or per session/IP at edge if available).
- Validate and bound inputs:
  - max length on `english`, `userTranslation`, `query`
  - reject empty/whitespace-only values
- Return sanitized errors (no provider internals leaked to clients).

Acceptance criteria:

- Unauthenticated callers cannot invoke quota-burning actions.
- Requests beyond size/rate thresholds are rejected safely.

### 1.2 Enforce phrase ownership in attempt creation

File:

- `convex/attempts.ts`

Tasks:

- In `attempts.create`, fetch the phrase and verify `phrase.userId === authUserId`.
- Reject invalid/non-owned phrases before inserting an attempt.
- Add tests for:
  - own phrase succeeds
  - another user's phrase fails

Acceptance criteria:

- A user cannot create attempts referencing another user's phrase ID.

### 1.3 Harden `audioAssets.create` linkage validation

File:

- `convex/audioAssets.ts`

Tasks:

- Validate caller ownership of referenced `attemptId` and/or `phraseId`.
- If both are supplied, verify they match each other (attempt belongs to phrase/user).
- Validate `storageKey` shape and existence if possible before insert.
- Restrict allowed content types to an allowlist:
  - learner/verifier audio: audio MIME types only
  - profile upload path should remain separate and validate image MIME types elsewhere
- Add optional size/duration bounds via metadata checks where feasible.

Acceptance criteria:

- Users cannot register arbitrary assets linked to other users' attempts/phrases.
- Invalid content type/linkage is rejected server-side.

### 1.4 Make AI processing idempotent and duplicate-safe

Files:

- `convex/aiPipeline.ts`
- `convex/aiPipelineData.ts`
- `convex/attempts.ts`
- `convex/practiceSessions.ts`

Problem addressed:

- Duplicate `aiFeedback` rows and repeated upstream API calls when `processAttempt` is retried/re-run.

Tasks:

- Introduce an idempotency/processing claim step via internal mutation before external calls.
  - Example approach: store AI processing state on `attempts` (`aiProcessingStatus`, `aiProcessingStartedAt`, `aiProcessedAt`, `aiRunId`)
  - Only one runner can claim processing for an attempt
- Ensure `insertAiFeedback` is upsert-like or reject duplicates by attempt (single feedback row per attempt)
  - If keeping multiple rows for audit, add a canonical/latest pointer and update readers to avoid `.unique()` ambiguity
- Update readers (`attempts`, `practiceSessions`) to use a deterministic latest/canonical feedback fetch
- Add retry-safe behavior:
  - if already `feedback_ready`, return early without calling providers
  - if in progress and fresh, no-op
  - if stale in-progress, allow takeover with guard
- Add tests for duplicate invocation/race scenarios

Acceptance criteria:

- Repeated action calls do not create duplicate user-visible results or repeated provider charges for the same attempt.

### 1.5 Webhook idempotency and billing state transition hardening

Files:

- `convex/billingNode.ts`
- `convex/billingEvents.ts`
- `convex/billingSubscriptions.ts`
- `convex/billing.ts`

Tasks:

- Make webhook processing idempotent at the business-logic level (not only best-effort event insert dedupe):
  - repeated delivery of same event should be a no-op after first successful transition
  - state transitions should be monotonic/validated (`pending -> active`, etc.)
- Add transition guards in subscription/entitlement mutations to prevent flip-flopping on duplicate/out-of-order events.
- Persist a processed marker on subscription state (e.g., last processed provider event/payment status tuple) or keep event replay logic explicitly idempotent.
- Add structured logging/metrics for webhook outcomes:
  - duplicate
  - invalid signature
  - validation failed
  - no mapping
  - processed
- Add tests for duplicate and out-of-order webhook payloads.

Acceptance criteria:

- Duplicate/retried webhook deliveries do not re-apply side effects.
- Out-of-order events cannot corrupt entitlement state.

### 1.6 Disable or strongly gate dev billing toggle in non-dev environments

File:

- `convex/billing.ts`

Tasks:

- Require an explicit admin allowlist or role for `setMyTierForDev`.
- Make the env check fail-closed (default disabled) outside local/dev.
- Optionally compile out or hide mutation behind `NODE_ENV !== 'production'`.
- Add audit logs if it remains available in staging.

Acceptance criteria:

- No accidental production entitlement escalation via dev toggle.

### 1.7 Prevent duplicate flags on the same human review request

File:

- `convex/humanReviews.ts`

Tasks:

- Before inserting a new `humanReviewFlag`, check for existing open flag on the same request.
- Make repeated submissions idempotent (return existing open flag / no-op).
- Add tests.

Acceptance criteria:

- Repeated flag clicks/calls do not create duplicate open flags or repeatedly reset review state.

---

## Phase 2 (Sweep B): Runtime Hardening, Timeouts, Headers, and Safer Errors

### Objective

Reduce outage blast radius and harden the web runtime against common production risks.

### 2.1 Add timeouts/abort control to all external `fetch` calls

Files (non-exhaustive high priority):

- `convex/billingNode.ts`
- `convex/aiPipeline.ts`
- `convex/translatePhrase.ts`
- `convex/translateNode.ts`
- `convex/unsplash.ts`

Tasks:

- Implement a shared `fetchWithTimeout` helper for node actions/http actions.
- Set service-specific timeout budgets:
  - webhook validation: short timeout + fail closed
  - AI/transcription: longer timeout with explicit error classification
  - utility APIs (Unsplash/Google Translate): moderate timeout
- Normalize retry policy (only retry safe/idempotent calls, never blindly retry webhook side effects).
- Record timeout metrics and distinguish timeout vs provider error in logs.

Acceptance criteria:

- Upstream hangs no longer block actions indefinitely.
- Error logs clearly identify timeout vs response failure.

### 2.2 Security headers and CSP for both SvelteKit apps

Files:

- `apps/web/src/hooks.server.ts`
- `apps/verifier/src/hooks.server.ts`
- `apps/web/src/app.html`
- `apps/verifier/src/app.html`

Tasks:

- Add response headers in SvelteKit `handle` or at proxy layer:
  - `Content-Security-Policy`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Strict-Transport-Security` (proxy/prod only)
- Handle existing inline theme bootstrap script:
  - nonce-based CSP (preferred) or hash-based CSP
- Document allowed origins for fonts/auth/Convex and minimize them.
- Verify service worker still functions with CSP.

Acceptance criteria:

- Both apps serve with a restrictive CSP that still supports existing functionality.
- Security headers present in production responses.

### 2.3 Safer error exposure and log sanitization

Files:

- `convex/aiPipeline.ts`
- `convex/translatePhrase.ts`
- `convex/translateNode.ts`
- `convex/notificationsNode.ts`
- `convex/billingNode.ts`

Tasks:

- Avoid returning raw provider response bodies to end users.
- Sanitize/log redact:
  - API keys
  - request signatures
  - raw push subscription payloads
  - large webhook payloads (truncate or structured summarize)
- Standardize error taxonomy (e.g., `timeout`, `auth`, `upstream_invalid_response`, `quota`, `validation`).

Acceptance criteria:

- User-facing errors are safe and actionable.
- Logs are useful for debugging without leaking secrets/sensitive payloads.

### 2.4 Auth hardening defaults

File:

- `convex/auth.ts`

Tasks:

- Re-evaluate `requireEmailVerification: false` for production.
- If enabling verification immediately is too disruptive:
  - add phased rollout plan
  - enforce verification for new high-risk actions first (billing, verifier onboarding)
- Audit trusted origins list and ensure prod-only config is explicit.

Acceptance criteria:

- Auth config is explicitly production-safe and documented.

---

## Phase 3 (Sweep C): Backend Performance and Scalability

### Objective

Reduce query cost and latency in the most frequently used and most expensive backend paths.

### Guiding principles

- Eliminate unbounded `.collect()` on user histories where possible
- Remove N+1 loops over sessions/attempts/feedback/reviews
- Prefer indexed access patterns and bounded result sizes
- Precompute/denormalize hot summaries when cheaper than repeated joins

### 3.1 Optimize `practiceSessions.list` (high impact)

File:

- `convex/practiceSessions.ts`

Current issue:

- Unbounded session fetch + per-session attempts fetch + per-attempt feedback fetch.

Tasks:

- Add pagination or explicit cap (e.g., recent N sessions).
- Denormalize session aggregates on write:
  - `attemptCount`
  - `phraseCount`
  - avg AI scores (or running sums/counts)
- Update aggregates when attempts/AI feedback are created/updated.
- If denormalization is too large for one sweep, at minimum batch and cap queries.

Acceptance criteria:

- `practiceSessions.list` time is stable as history grows.
- Session list no longer performs nested N+1 scans.

### 3.2 Optimize attempts result enrichment (`listByPracticeSession*`, `listByPhrase`)

File:

- `convex/attempts.ts`

Current issue:

- Per-attempt DB fetches for phrase, audio, aiFeedback, human review + storage URL generation.

Tasks:

- Split "summary list" and "detailed attempt" shapes (only fetch heavy fields when needed).
- Batch related fetches where possible (collect IDs then load dependent docs in grouped passes).
- Avoid repeated `ctx.storage.getUrl` generation when not needed for collapsed lists.
- Cache/reuse computed human review summary data or denormalize onto request/attempt if stable enough.
- Add limits/pagination for history endpoints.

Acceptance criteria:

- Practice session review queries scale with number of attempts without severe latency growth.

### 3.3 Optimize phrase listing for practice startup

File:

- `convex/phrases.ts`

Current issue:

- `listAllByUser` is unbounded and does per-phrase session metadata lookup + repeated category inference.

Tasks:

- Add a lean practice query that returns only fields needed to practice (`_id`, `english`, `translation`, maybe language/category) and no legacy session enrichment.
- Cache/denormalize category fields consistently so inference isn't repeated on read.
- Bound or paginate admin/library views separately from practice bootstrap.
- Consider archiving legacy session fallback path behind one migration/backfill.

Acceptance criteria:

- Starting a practice session remains fast even for large phrase libraries.

### 3.4 Optimize notifications cron and notification fan-out queries

Files:

- `convex/notifications.ts`
- `convex/notificationsNode.ts`

Current issues:

- Full-table scans and nested per-user/per-phrase/per-review queries.

Tasks:

- Replace `query('userPreferences').collect()` with a push-enabled indexed access path.
  - Add schema field/index to query push-enabled users directly (e.g., `hasPushSubscription`)
- Cap work per cron execution and page through users (chunked rescheduling)
- Avoid per-phrase latest-attempt query loops; use denormalized last-attempt timestamps or a dedicated per-user phrase stats table
- Deduplicate verifier notification sends per session/language/user
- Cache/set VAPID details once per action execution instead of repeated setup in loops

Acceptance criteria:

- Daily rescheduler runtime is bounded and does not spike with total user count.
- Verifier notification fan-out avoids redundant DB calls and sends.

### 3.5 Optimize human review queue/query paths

File:

- `convex/humanReviews.ts`

Priority targets:

- `claimNext`
- `getUnseenFeedback`
- `markFeedbackSeen`
- `listEscalated`
- `getAttemptHumanReview`

Tasks:

- Replace collect-then-filter patterns with better indexes and bounded queries.
- Add indexes that match common filters (examples, exact design to validate):
  - learner completed/unseen review requests
  - escalated by language/status
  - request flags by request+status
- Reduce repeated review/audio fetch loops in `getAttemptHumanReview` with grouped loading.
- Consider storing `feedbackSeenAt` / final summary shortcuts on attempt or request for simpler reads.
- Break out helper modules to make optimization safer (see Phase 5).

Acceptance criteria:

- Queue claim and review detail endpoints remain responsive under larger verifier workloads.

### 3.6 Smaller backend wins (same sweep if time permits)

Files:

- `convex/verifierAccess.ts`
- `convex/aiCalibration.ts`

Tasks:

- `getMyStats`: compute "today" count with indexed lower-bound query instead of collecting all reviews.
- `aiCalibration.listAll`: add pagination/admin-only guard if this can grow large.

Acceptance criteria:

- No obviously unbounded user-history scan remains in common user flows.

---

## Phase 4 (Sweep D): Frontend Smoothness and Behavior Correctness (Invisible UX Improvements)

### Objective

Improve perceived performance and correctness without changing the interface design.

### 4.1 Fix object URL memory leaks in recording flows

Files:

- `apps/web/src/routes/+page.svelte`
- `apps/verifier/src/routes/work/[id]/+page.svelte`

Tasks:

- Track the current object URL and call `URL.revokeObjectURL(...)` when:
  - recording is discarded
  - a new recording replaces the old one
  - component unmounts
  - practice session resets

Acceptance criteria:

- Repeated record/discard cycles do not show steady memory growth in browser profiling.

### 4.2 Handle fire-and-forget AI action errors explicitly

File:

- `apps/web/src/routes/+page.svelte`

Tasks:

- Add `.catch(...)` on `client.action(api.aiPipeline.processAttempt, ...)` to prevent unhandled rejection noise.
- Log/telemetry only (no UI redesign required).
- Keep pending counter behavior intact.

Acceptance criteria:

- No unhandled promise rejection warnings from background AI submission path.

### 4.3 Fix verifier queue/detail route correctness

Files:

- `apps/verifier/src/routes/work/+page.svelte`
- `apps/verifier/src/routes/work/[id]/+page.svelte`

Tasks:

- Make click behavior deterministic:
  - either remove unused `requestId` parameter and label button accordingly ("Claim next")
  - or support claiming a specific item if product requires it
- In detail route, ensure route param matches held claim; redirect if mismatched.
- Avoid route/claim drift where URL implies one request but data shows another.

Acceptance criteria:

- Clicking a queue item behaves consistently and predictably.
- `/work/[id]` always reflects the claim in the URL or redirects cleanly.

### 4.4 Push subscription flow efficiency cleanup

File:

- `packages/shared/src/notifications.ts`

Tasks:

- Reuse existing valid subscription when VAPID key matches instead of always unsubscribe/re-subscribe.
- Add defensive handling for missing/invalid VAPID key in browser helper.

Acceptance criteria:

- Enabling notifications performs fewer redundant operations and is more reliable on repeat visits.

### 4.5 Font loading optimization (same look, faster render)

Files:

- `apps/web/src/app.html`
- `apps/verifier/src/app.html`

Tasks:

- Replace render-blocking font CSS path with equivalent non-visual-change optimization:
  - self-host fonts and preload
  - or preconnect + preload font styles/assets carefully
- Validate no FOUT/FOIT regression and no design change.

Acceptance criteria:

- Faster first render with unchanged typography appearance.

---

## Phase 5 (Sweep E): Legibility, Type Safety, and Refactor for Safer Future Changes

### Objective

Reduce maintenance risk in the largest modules and make future production fixes safer and faster.

### 5.1 Split `convex/humanReviews.ts` into focused modules

Current pain:

- Very large file mixes queue claiming, submission, dispute resolution, learner reads, admin/escalation reads, and helper logic.

Refactor targets (suggested):

- `convex/humanReviews/queue.ts`
- `convex/humanReviews/submit.ts`
- `convex/humanReviews/learner.ts`
- `convex/humanReviews/admin.ts`
- `convex/humanReviews/helpers.ts`

Tasks:

- Preserve external function names/API surface during refactor.
- Add targeted tests around extracted helpers.
- Remove duplicated state patch blocks by centralizing status transition helpers.

Acceptance criteria:

- File size/complexity reduced substantially with no behavior change.

### 5.2 Reduce `any` usage in high-risk Convex code

Priority files:

- `convex/humanReviews.ts`
- `convex/attempts.ts`

Tasks:

- Introduce typed helper return shapes for assignment/review summaries.
- Replace `ctx: any`, `request: any`, etc. with narrowed types using generated types where possible.
- Eliminate `as any` in critical paths.

Acceptance criteria:

- Type checker catches more regressions in queue/review logic.

### 5.3 Break up oversized Svelte pages without visual changes

Priority files:

- `apps/web/src/routes/+page.svelte`
- `apps/verifier/src/routes/work/[id]/+page.svelte`

Tasks:

- Extract non-visual logic/helpers:
  - recorder utilities
  - audio player state helpers
  - timing/format helpers
  - submission orchestration helpers
- Optionally extract subcomponents only if it reduces complexity without changing styles/markup structure.

Acceptance criteria:

- Easier to review/test logic changes in practice and verifier claim flows.

---

## Phase 6: Validation, Load Testing, and Rollout

### Objective

Prove the hardening work improved real production behavior and did not regress the experience.

### 6.1 Test coverage additions

Add tests for:

- authz checks (`attempts.create`, `audioAssets.create`, public actions)
- webhook duplicate/out-of-order processing
- AI processing idempotency
- duplicate flag prevention
- key human review transitions

### 6.2 Performance validation

Before/after benchmarks on staging:

- `practiceSessions.list`
- `attempts.listByPracticeSessionAsc`
- practice startup query (`phrases` path)
- `humanReviews.claimNext`
- daily notifications rescheduler runtime

Targets:

- p95 latency reduced and stable with larger datasets
- no obvious N+1 behavior on profiling traces

### 6.3 Rollout strategy

- Deploy Phase 1 first (highest risk reduction)
- Deploy Phase 2 next (headers/timeouts/logging)
- Deploy Phase 3 behind careful monitoring (query/index changes)
- Deploy Phase 4/5 after backend stabilization
- Use staged rollout if possible (staging -> limited prod -> full)

### 6.4 Monitoring / alerts to add

- Webhook error rate spike
- AI action failure rate/timeouts
- Notification send failure rate
- Convex query latency for hot endpoints
- Browser error rate for recording flows (unhandled rejections)

---

## Execution Tracker (Update Across Context Windows)

Use this section as the handoff/status board.

### Sweep Status

- [x] Sweep A: Security + data integrity
- [x] Sweep B: Runtime/network hardening
- [ ] Sweep C: Backend performance
- [ ] Sweep D: Frontend smoothness/correctness
- [ ] Sweep E: Legibility/type refactor
- [ ] Phase 6 validation and rollout complete

### High-Risk Items Checklist

- [x] Public quota-burning actions require auth + limits
- [x] `attempts.create` phrase ownership enforced
- [x] `audioAssets.create` linkage/content validation
- [x] AI processing idempotency implemented
- [x] Billing webhook side effects idempotent
- [x] Dev billing toggle locked down
- [x] Duplicate human review flags are idempotent
- [x] External fetch timeouts/abort control added
- [x] Security headers/CSP deployed
- [ ] Top 3 backend N+1 hotspots fixed
- [ ] Object URL leaks fixed
- [ ] Verifier claim route correctness fixed

### Handoff Notes Template

When resuming in a new context window, append:

- **Date / Branch**
- **Current sweep**
- **What landed**
- **What remains**
- **Blocked by**
- **Next 1-2 tasks**

---

## Recommended Implementation Order (Pragmatic)

If bandwidth is limited, do the following in order for maximum risk reduction per effort:

1. Sweep A items 1.1-1.6
2. Phase 2.1 timeouts
3. Phase 3.1 + 3.2 + 3.3 (biggest user-facing performance wins)
4. Phase 4.1 + 4.2 + 4.3 (cheap/high-value client fixes)
5. Phase 3.4 + 3.5 (background + verifier scale)
6. Phase 2.2 CSP/headers
7. Phase 5 refactors and type hardening

This sequence prioritizes preventing abuse/corruption first, then reducing latency and operational risk, then maintainability.
