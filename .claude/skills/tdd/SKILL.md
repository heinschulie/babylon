---
name: tdd
description: Test-driven development with red-green-refactor loop. Use when user wants to build features or fix bugs using TDD, mentions "red-green-refactor", wants integration tests, or asks for test-first development.
---

# Test-Driven Development

## Philosophy

**Core principle**: Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style: they exercise real code paths through public APIs. They describe _what_ the system does, not _how_ it does it. A good test reads like a specification - "user can checkout with valid cart" tells you exactly what capability exists. These tests survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation. They mock internal collaborators, test private methods, or verify through external means (like querying a database directly instead of using the interface). The warning sign: your test breaks when you refactor, but behavior hasn't changed. If you rename an internal function and tests fail, those tests were testing implementation, not behavior.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Anti-Pattern: Horizontal Slices

**DO NOT write all tests first, then all implementation.** This is "horizontal slicing" - treating RED as "write all tests" and GREEN as "write all code."

This produces **crap tests**:

- Tests written in bulk test _imagined_ behavior, not _actual_ behavior
- You end up testing the _shape_ of things (data structures, function signatures) rather than user-facing behavior
- Tests become insensitive to real changes - they pass when behavior breaks, fail when behavior is fine
- You outrun your headlights, committing to test structure before understanding the implementation

**Correct approach**: Vertical slices via tracer bullets. One test → one implementation → repeat. Each test responds to what you learned from the previous cycle. Because you just wrote the code, you know exactly what behavior matters and how to verify it.

```
WRONG (horizontal):
  RED:   test1, test2, test3, test4, test5
  GREEN: impl1, impl2, impl3, impl4, impl5

RIGHT (vertical):
  RED→GREEN: test1→impl1
  RED→GREEN: test2→impl2
  RED→GREEN: test3→impl3
  ...
```

## Workflow

### 1. Read the Specification

The issue body is your specification. It contains:

- **Interface Specification** — public API, function signatures, types
- **Behaviors to Test** — prioritized list of behaviors to verify
- **Mocking Boundaries** — what's real vs stubbed

Read the issue body carefully. Extract the interface spec, behaviors to test, and mocking boundaries. These replace any planning conversation — everything you need is in the issue.

Also consider:

- Opportunities for [deep modules](deep-modules.md) (small interface, deep implementation)
- [Interface design](interface-design.md) for testability

**The Behaviors to Test list is your complete work order.** You MUST implement every behavior in the list, top-to-bottom. Backend behaviors AND frontend behaviors. If the list has 12 items, you implement 12 items — not 7. Skipping behaviors is not allowed. If you cannot implement a behavior, your status is `fail`.

**Frontend behaviors are real work.** A behavior like "[Frontend] Reaction bar renders below each emoji entry" means you write the Svelte component code, wire the query, and verify it renders. It does not mean "acknowledge it exists and move on." Frontend behaviors require the same RED→GREEN cycle as backend behaviors: write a test (or verify visually via page load), then write the component code to make it pass.

### 2. Tracer Bullet

Write ONE test that confirms ONE thing about the system:

```
RED:   Write test for first behavior → test fails
GREEN: Write minimal code to pass → ALL validations pass (see below)
```

This is your tracer bullet - proves the path works end-to-end.

### 3. Incremental Loop

For each remaining behavior:

```
RED:   Write next test → fails
GREEN: Minimal code to pass → ALL validations pass (see below)
```

Rules:

- One test at a time
- Only enough code to pass current test
- Don't anticipate future tests
- Keep tests focused on observable behavior

### GREEN Validation Gate

GREEN means ALL of these pass — not just the test:

1. **Tests pass** — the new test and all existing tests
2. **Run `bun run adws/scripts/health-check.ts`** — this runs `bun run check` (types) + `bun run build` (Vite/SSR). Exit 0 = pass, exit 1 = fail. ALL must pass.
3. **Convex sync** — if any files under `convex/` were modified, run `npx convex dev --once` and confirm it succeeds
4. **Page loads** — read `DEV_TUNNEL_URL` from `.env.local`, fetch affected page route(s), confirm HTTP 200

**IMPORTANT: If the health check or any validation fails, fix the issue before proceeding to the next cycle. Do NOT report success until all validations pass.**

## Checklist Per Cycle

```
[ ] Test describes behavior, not implementation
[ ] Test uses public interface only
[ ] Test would survive internal refactor
[ ] Code is minimal for this test
[ ] No speculative features added
[ ] bun run adws/scripts/health-check.ts exits 0 (types + build)
[ ] If convex/ files changed, npx convex dev --once succeeds
[ ] Affected page(s) return 200 via DEV_TUNNEL_URL
```

## Completion Gate

Before reporting status, count the behaviors in the issue's "Behaviors to Test" list and count how many you implemented. If these numbers don't match, you are not done.

- **All behaviors implemented** → status: pass
- **Any behavior skipped or unimplemented** → status: fail

Do NOT report pass with "remaining frontend behaviors" or "frontend work left for follow-up." There is no follow-up. This is the only chance.

## Step Summary

IMPORTANT: You MUST end your output with this exact block. Fill in each field with a single line.

## Step Summary

- status: pass | fail
- action: <one line describing what you did>
- decision: <one line -- key choice and why>
- blockers: <one line, or "none">
- files_changed: <comma-separated list, or "none">
- behaviors_completed: <N/M — e.g. "12/12" or "7/12">
