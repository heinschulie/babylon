---
date: 2026-03-25T00:00:00+02:00
researcher: Claude
git_commit: 4a209d8
branch: hein/feature/issue-61
repository: babylon
topic: 'Testing infrastructure, patterns, and coverage'
tags: [research, codebase, testing, vitest, convex-test]
status: complete
last_updated: 2026-03-25
last_updated_by: Claude
---

# Research: Testing

## Research Question

How is testing set up, structured, and executed across the Babylon codebase?

## Summary

Babylon uses **Vitest** as the sole test runner across ~21 test files totalling ~1,622 lines. Backend (Convex) tests use **convex-test** for in-memory function testing with identity simulation. Frontend tests exist but are minimal — `@testing-library/svelte` is installed but unused. **No coverage reporting, E2E framework config, or snapshot tests** exist. CI runs tests via GitHub Actions on PR and push to main.

## Detailed Findings

### Test Framework & Configuration

- **Runner:** Vitest v4.0.17
- **Backend testing:** convex-test v0.0.41
- **Environments:** `edge-runtime` for Convex functions, `jsdom` for browser/Svelte tests
- Two identical vitest configs in `apps/web/vitest.config.ts` and `apps/verifier/vitest.config.ts`
- Both configs include `../../convex/**/*.{test,spec}.{js,ts}` — Convex tests run from both apps
- `convex-test` inlined as server dependency

### Test File Inventory (21 files)

**Convex backend (12 files in `convex/`):**
- `phrases.test.ts` (333 lines) — CRUD, session isolation, auth
- `sessions.test.ts` (228 lines) — creation, querying, user isolation
- `audioAssets.test.ts` (176 lines) — audio asset management, storage
- `billingWebhooks.test.ts` (131 lines) — webhook processing, state transitions
- `humanReviewFlags.test.ts` (121 lines) — review flag management
- `attempts.test.ts` (110 lines) — attempt tracking
- `testEmojiMutation.test.ts` (106 lines) — emoji submission validation
- `aiPipeline.test.ts` (104 lines) — AI pipeline, idempotency
- `billingDevToggle.test.ts` (101 lines) — billing feature flags
- `notifications.test.ts` — notification functionality
- `payfast.test.ts` — PayFast payment integration
- `fetchWithTimeout.test.ts` — HTTP timeout handling

**Frontend (2 files):**
- `apps/web/src/lib/stores/auth.test.ts` — auth store with mocked better-auth client
- `apps/web/src/routes/test/page.test.ts` — test route component validation

**ADW workflows (7 files in `adws/tests/`):**
- `agents.test.ts` — Claude Code agent integration (API key gated, 60s timeout)
- `parse-blockers.test.ts`, `step-recorder.test.ts`, `review-utils.test.ts`, `model-selection.test.ts`, `health-check.test.ts`, `webhook.test.ts`

### convex-test Patterns

**Initialization (every test):**
```typescript
const modules = import.meta.glob('./**/*.ts');
const t = convexTest(schema, modules);
const asUser = t.withIdentity({ subject: 'user1' });
```

**Key APIs used:**
- `t.withIdentity()` — bind operations to a user
- `asUser.mutation()` / `asUser.query()` / `asUser.action()` — execute Convex functions
- `t.run(async (ctx) => ...)` — raw DB/storage access for seeding and assertions
- `t.mutation(internal.xxx, ...)` — call internal functions

**Seeding pattern:** custom async helper functions per test file, e.g.:
- `seedAttemptWithAudio()` — `convex/aiPipeline.test.ts:8-34`
- `seedStorageAudio()`, `seedPhraseAndAttempt()` — `convex/audioAssets.test.ts:8-31`
- `seedActiveEntitlement()` — `convex/attempts.test.ts:8-18`
- `seedCompletedReviewRequest()` — `convex/humanReviewFlags.test.ts:8-63`

**Authorization testing pattern:**
```typescript
const asUser1 = t.withIdentity({ subject: 'user1' });
const asUser2 = t.withIdentity({ subject: 'user2' });
await expect(asUser2.mutation(api.phrases.remove, { id }))
  .rejects.toThrowError('Not authorized');
```

### Mocking Patterns

- **vi.mock()** — inline module mocking, no `__mocks__/` directories
  - Auth client mock: `apps/web/src/lib/stores/auth.test.ts:11-25`
  - Git ops mock: `adws/tests/step-recorder.test.ts:9-12`
- **vi.fn()** — function spies for loggers and async operations
- **No vi.spyOn usage** found
- **No snapshot tests** found

### Test Execution

**Local:**
- `bun run test` — watch mode via Turbo
- `bun run test:run` — single run via Turbo
- `just test` — Justfile convenience wrapper
- `bun run adw:test` — ADW tests only

**CI (GitHub Actions):** `.github/workflows/ci.yml`
- Triggers: PR + push to main
- Matrix: `@babylon/web`, `@babylon/verifier`
- Flow: install → typecheck → **test** → build
- Command: `bun run test:run -- --filter=${{ matrix.filter }}`

### What's Not Present

- **No coverage reporting** — no c8/Istanbul/vitest coverage config
- **No E2E tests** — Playwright v1.58.2 installed but no config or test files
- **No `@testing-library/svelte` usage** — installed (v5.3.1) but unused
- **No `.claude/docs/testing.md`** — no project testing documentation
- **No global test setup** — no `vitest.setup.ts` or `setupFilesAfterEnv`
- **No pre-commit hooks** running tests
- **No beforeAll/afterAll** — only minimal beforeEach/afterEach usage

## Code References

- `apps/web/vitest.config.ts` — Vitest config (dual environment setup)
- `apps/verifier/vitest.config.ts` — Identical Vitest config
- `convex/phrases.test.ts` — Largest test file, comprehensive CRUD + auth testing
- `convex/aiPipeline.test.ts:37-79` — Idempotency testing pattern
- `convex/billingWebhooks.test.ts:102-130` — Complex state transition validation
- `convex/billingDevToggle.test.ts:8-41` — Environment variable snapshot/restore pattern
- `apps/web/src/lib/stores/auth.test.ts:11-25` — vi.mock() with exported mock store
- `adws/tests/agents.test.ts:13` — API key gated integration test pattern
- `.github/workflows/ci.yml:41-42` — CI test execution
- `turbo.json:33-38` — Turbo pipeline for tests

## Architecture Documentation

**Patterns found:**
1. **Fresh instance per test** — each `it()` creates new `convexTest(schema, modules)`, no shared state
2. **Identity-based auth testing** — `.withIdentity({ subject })` is the standard pattern for multi-user scenarios
3. **Inline seeding** — helper functions defined per file, not centralized; typed via `ReturnType<typeof convexTest>`
4. **Dual environment** — edge-runtime for Convex, jsdom for browser — configured via `environmentMatchGlobs`
5. **Convex tests owned by both apps** — glob pattern `../../convex/**` means both web and verifier run all Convex tests
6. **Integration tests gated** — `describe.skipIf(!hasApiKey)` for tests requiring real API calls

## Open Questions

- Why is `@testing-library/svelte` installed but unused — planned or abandoned?
- Both apps run identical Convex tests — intentional duplication or oversight?
- No coverage thresholds — any plans to add?
- Playwright installed but unconfigured — E2E planned?
