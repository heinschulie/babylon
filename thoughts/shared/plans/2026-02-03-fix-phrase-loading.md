# Fix Phrase Loading in Sessions

## Overview

Phrases not loading — shows "No phrases yet" despite data existing. Root cause: **client/backend format mismatch**. The client expects `{ phrases, session }` but the deployed Convex backend still returns a plain array.

## Root Cause

At commit `75dd4ac`, `listBySession` changed from returning a plain array to returning `{ phrases, session }`. The client at `src/routes/session/[id]/+page.svelte:18-19` destructures `.phrases` from the result. When the deployed backend returns an array, `array.phrases` is `undefined`, so the UI shows "No phrases yet."

A backward-compat fix exists at commit `a1b07b8` on branch `claude/interactive-translation-input-9sQEK` but was never merged to main.

## Desired End State

- Phrases load when opening a session
- Backend and client are in sync on the response format

## What We're NOT Doing

- Changing data model or auth
- Adding new features

## Phase 1: Deploy Convex Functions

### Overview

Re-deploy the Convex backend so the deployed `listBySession` matches the code on `main`.

### Steps

```bash
npx convex deploy
```

### Success Criteria

#### Manual Verification:

- [ ] Open a session with phrases — they load correctly
- [ ] Create a new phrase — appears immediately
- [ ] Practice page loads all phrases

---

## Phase 2: Fix Tests

### Overview

Tests in `convex/phrases.test.ts` still assert against the old array format.

### Changes Required

**File**: `convex/phrases.test.ts`

All `listBySession` assertions need updating to destructure `{ phrases, session }`:

```typescript
// Before:
const phrases = await asUser.query(api.phrases.listBySession, { sessionId });
expect(phrases).toEqual([]);

// After:
const result = await asUser.query(api.phrases.listBySession, { sessionId });
expect(result.phrases).toEqual([]);
expect(result.session).toBeDefined();
```

Lines to update: 19-20, 38-44, 63, 87-89, 153-155, 178-180, 251-252.

### Success Criteria

#### Automated Verification:

- [x] `npx vitest run` — all tests pass
