# Auto-Translate, Phonetics, Header Fix & Banner Bug — Implementation Plan

## Overview

Five changes: (1) auto-translate English→Xhosa via Claude on phrase creation, (2) show phonetic breakdown on library cards, (3) single LLM call for both translation+phonetics, (4) sticky header, (5) fix feedback banner not disappearing after viewing.

## Current State

- Add-phrase dialog requires manual English + Xhosa (`+page.svelte:72-103`)
- No phonetics anywhere — `phoneticTags` field in schema never populated or read
- Google Translate only used in legacy `/session/[id]` route, not library page
- Anthropic API already integrated (`aiPipeline.ts`) with `ANTHROPIC_API_KEY`
- Header in normal document flow (`recall.css:280-284`), no sticky/fixed
- Banner dismiss mechanism exists (`markFeedbackSeen`) but has two bugs

## Desired End State

1. Learner enters only English phrase → dialog closes → phrase appears immediately with "Translating…" placeholder → LLM fills translation + phonetics async
2. Library cards show phonetic breakdown below Xhosa translation, same font size/weight as English text
3. Single Claude call returns both translation and phonetic breakdown — no Google Translate, no duplicate calls
4. Header sticks to top of viewport on scroll
5. Viewing a session review reliably dismisses the feedback banner

### Verification:
- Add a phrase with only English text → translation + phonetics appear within ~3s
- Library cards render phonetics below Xhosa phrase with correct styling
- Header stays fixed at top when scrolling library page
- Click feedback banner → view session → navigate back → banner gone

## What We're NOT Doing

- Removing Google Translate from legacy session route (separate cleanup)
- Adding phonetics to practice cards or session review
- IPA notation — using simple syllable pronunciation (e.g. "MOH-loh")
- Letting user edit the auto-translation inline (future feature)

## Implementation Approach

Single Claude API call per phrase creation returns JSON with `{ translation, phonetic }`. Phrase is inserted immediately with empty translation/phonetic fields and a `translationStatus` marker. A scheduled action calls Claude, then patches the phrase via internal mutation. Convex reactivity updates the library page automatically.

---

## Phase 1: Schema + Backend (Translation Action)

### Overview

Add `phonetic` and `translationStatus` fields to schema. Create new Convex action that calls Claude for translation + phonetics. Create internal mutation to patch phrase after LLM responds. Modify `createDirect` to accept optional translation and schedule the action.

### Changes Required:

#### 1.1 Schema Update

**File**: `convex/schema.ts`
**Changes**: Add `phonetic` string field and `translationStatus` field to `phrases` table

```ts
// Add to phrases table definition (after line 22):
phonetic: v.optional(v.string()),            // syllable pronunciation guide
translationStatus: v.optional(v.string()),   // pending | ready | failed
```

#### 1.2 Translation Action

**File**: `convex/translatePhrase.ts` (new)
**Changes**: Create Convex node action that calls Claude for translation + phonetics in one call

```ts
'use node';

import { v } from 'convex/values';
import { action } from './_generated/server';
import { internal } from './_generated/api';

export const translateAndPhoneticize = action({
  args: {
    phraseId: v.id('phrases'),
    english: v.string(),
    languageCode: v.string()
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.translatePhraseData.patchTranslation, {
        phraseId: args.phraseId,
        translation: args.english, // fallback to English
        phonetic: '',
        status: 'failed'
      });
      return;
    }

    const prompt = [
      'You are a language translation assistant specialising in isiXhosa.',
      '',
      'Given an English phrase, provide:',
      '1. The isiXhosa translation',
      '2. A phonetic pronunciation guide using simple syllable breakdown',
      '',
      'Phonetic rules:',
      '- Use UPPERCASE for stressed syllables',
      '- Separate syllables with hyphens within words',
      '- Separate words with spaces',
      '- Use English-approximation sounds (not IPA)',
      '- For clicks: c = dental click (like tsk), q = palatal click, x = lateral click',
      '',
      'Example: "Hello, how are you?" → { "translation": "Molo, unjani?", "phonetic": "MOH-loh, oon-JAH-nee" }',
      '',
      'Respond with ONLY valid JSON: {"translation": "...", "phonetic": "..."}'
    ].join('\n');

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 300,
          system: prompt,
          messages: [{ role: 'user', content: `Translate to isiXhosa: "${args.english}"` }]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API error: ${await response.text()}`);
      }

      const data = await response.json();
      const text = data?.content?.[0]?.text ?? '';
      const parsed = JSON.parse(text);

      await ctx.runMutation(internal.translatePhraseData.patchTranslation, {
        phraseId: args.phraseId,
        translation: parsed.translation ?? args.english,
        phonetic: parsed.phonetic ?? '',
        status: 'ready'
      });
    } catch (error) {
      console.error('Translation error:', error);
      await ctx.runMutation(internal.translatePhraseData.patchTranslation, {
        phraseId: args.phraseId,
        translation: args.english,
        phonetic: '',
        status: 'failed'
      });
    }
  }
});
```

#### 1.3 Internal Mutation for Patching

**File**: `convex/translatePhraseData.ts` (new)
**Changes**: Internal mutation to update phrase with translation + phonetics

```ts
import { v } from 'convex/values';
import { internalMutation } from './_generated/server';

export const patchTranslation = internalMutation({
  args: {
    phraseId: v.id('phrases'),
    translation: v.string(),
    phonetic: v.string(),
    status: v.string()
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.phraseId, {
      translation: args.translation,
      phonetic: args.phonetic,
      translationStatus: args.status
    });
  }
});
```

#### 1.4 Modify `createDirect` Mutation

**File**: `convex/phrases.ts`
**Changes**: Make `translation` optional. When omitted, set placeholder and schedule translation action.

```ts
export const createDirect = mutation({
  args: {
    english: v.string(),
    translation: v.optional(v.string()),  // now optional
    languageCode: v.optional(v.string())
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const language = requireSupportedLanguage(args.languageCode ?? 'xh-ZA');
    const needsTranslation = !args.translation?.trim();
    const category = inferPhraseCategory(args.english, args.translation ?? '');

    const phraseId = await ctx.db.insert('phrases', {
      userId,
      english: args.english,
      translation: args.translation?.trim() ?? '',
      languageCode: language.bcp47,
      categoryKey: category.key,
      categoryLabel: category.label,
      translationStatus: needsTranslation ? 'pending' : 'ready',
      createdAt: Date.now()
    });

    if (needsTranslation) {
      await ctx.scheduler.runAfter(0, internal.translatePhrase.translateAndPhoneticize, {
        phraseId,
        english: args.english,
        languageCode: language.bcp47
      });
    }

    // existing notification scheduling...
    const prefs = await ctx.db.query('userPreferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (prefs?.pushSubscription) {
      await ctx.scheduler.runAfter(0, internal.notifications.scheduleForPhrase, {
        phraseId, userId
      });
    }

    return phraseId;
  }
});
```

### Success Criteria:

#### Automated Verification:

- [x] `npx convex dev --once` succeeds (schema + new files deploy)
- [x] `bun run check` passes

#### Manual Verification:

- [ ] Add phrase with only English → phrase appears in library with empty translation
- [ ] Within ~3s, translation + phonetic fill in via Convex reactivity
- [ ] Add phrase with both English + Xhosa → works same as before (no LLM call)

**Implementation Note**: Pause here for manual confirmation before Phase 2.

---

## Phase 2: Library Page UI (Phonetics Display + Dialog Simplification)

### Overview

Simplify the add-phrase dialog to only require English. Display phonetic breakdown on library cards. Show "Translating…" placeholder for pending phrases.

### Changes Required:

#### 2.1 Simplify Add-Phrase Dialog

**File**: `apps/web/src/routes/+page.svelte`
**Changes**:
- Remove translation input field from dialog
- Remove `translation` state variable
- Update `createPhrase()` to only send `english`
- Update validation to only check `english`

```svelte
<!-- Simplified dialog — single input -->
<Dialog.Content>
  <Dialog.Header>
    <Dialog.Title>{m.library_add_phrase()}</Dialog.Title>
    <Dialog.Description>{m.library_add_phrase_desc()}</Dialog.Description>
  </Dialog.Header>
  <div class="space-y-4 py-4">
    <div class="space-y-2">
      <Label for="english">{m.library_english_label()}</Label>
      <Input id="english" bind:value={english} placeholder={m.library_english_placeholder()} />
    </div>
    {#if error}
      <p class="text-sm text-destructive">{error}</p>
    {/if}
  </div>
  <Dialog.Footer>
    <Button variant="outline" onclick={() => (dialogOpen = false)}>{m.btn_cancel()}</Button>
    <Button onclick={createPhrase} disabled={creating}>
      {creating ? m.library_adding() : m.library_add_phrase()}
    </Button>
  </Dialog.Footer>
</Dialog.Content>
```

Update `createPhrase()`:
```ts
async function createPhrase() {
  if (!english.trim()) {
    error = m.error_enter_english();
    return;
  }
  creating = true;
  error = '';
  try {
    await client.mutation(api.phrases.createDirect, {
      english: english.trim(),
      languageCode: 'xh-ZA'
    });
    dialogOpen = false;
    english = '';
  } catch (e) {
    error = e instanceof Error ? e.message : m.error_failed_add_phrase();
  } finally {
    creating = false;
  }
}
```

#### 2.2 Display Phonetics on Library Cards

**File**: `apps/web/src/routes/+page.svelte`
**Changes**: Add phonetic line below Xhosa translation. Show "Translating…" for pending phrases.

```svelte
{#each group.phrases as phrase (phrase._id)}
  <li class="phrase-card border border-border/60 bg-background/70 p-4 sm:p-5">
    <p class="info-kicker">{m.library_label_english()}</p>
    <p class="mt-2 text-xl font-semibold leading-tight sm:text-2xl">{phrase.english}</p>
    <p class="info-kicker mt-5">{m.library_label_xhosa()}</p>
    {#if phrase.translationStatus === 'pending'}
      <p class="target-phrase mt-2 font-black opacity-40">{m.library_translating()}</p>
    {:else}
      <p class="target-phrase mt-2 font-black">{phrase.translation}</p>
    {/if}
    {#if phrase.phonetic}
      <p class="mt-2 text-xl font-semibold leading-tight sm:text-2xl text-muted-foreground">
        {phrase.phonetic}
      </p>
    {/if}
  </li>
{/each}
```

The phonetic line uses the same classes as the English text line: `text-xl font-semibold leading-tight sm:text-2xl`, with `text-muted-foreground` to differentiate.

#### 2.3 i18n Keys

**File**: `apps/web/messages/en.json`
**New keys**:
```json
"library_add_phrase_desc": "Enter an English phrase and we'll translate it for you.",
"library_translating": "Translating..."
```

**File**: `apps/web/messages/xh.json`
**New keys**:
```json
"library_add_phrase_desc": "Faka ibinzana lesiNgesi kwaye siza kuguqulela.",
"library_translating": "Iyaguqulela..."
```

**File**: `packages/shared/messages/en.json`
**New key**:
```json
"error_enter_english": "Please enter an English phrase."
```

**File**: `packages/shared/messages/xh.json`
**New key**:
```json
"error_enter_english": "Nceda ufake ibinzana lesiNgesi."
```

### Success Criteria:

#### Automated Verification:

- [x] `bun run build` succeeds
- [x] `bun run check` passes

#### Manual Verification:

- [ ] Dialog shows only English input field
- [ ] Submitting dialog creates phrase, shows "Translating…" placeholder
- [ ] Translation + phonetics appear after ~3s
- [ ] Phonetic text renders below Xhosa with same size/weight as English text
- [ ] Existing phrases (no phonetic) render fine (no blank line)

**Implementation Note**: Pause here for manual confirmation before Phase 3.

---

## Phase 3: Sticky Header

### Overview

Make `.app-header` stick to top of viewport on scroll.

### Changes Required:

#### 3.1 Add Sticky Positioning

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add `position: sticky`, `top: 0`, `z-index: 40` to `.app-header` (line 280)

```css
.app-header {
  position: sticky;
  top: 0;
  z-index: 40;
  border-bottom: 1px solid var(--theme-header-border);
  background: color-mix(in oklab, var(--theme-header-surface) 95%, transparent);
  backdrop-filter: blur(10px);
}
```

The existing `backdrop-filter: blur(10px)` and semi-transparent background already create a nice frosted-glass effect when content scrolls behind it. No additional changes needed.

### Success Criteria:

#### Automated Verification:

- [x] `bun run build` succeeds

#### Manual Verification:

- [ ] Header stays at top when scrolling on library page
- [ ] Header stays at top when scrolling on practice page
- [ ] Content scrolls behind header with blur effect
- [ ] Dropdown menu still works correctly (z-index)
- [ ] No layout shift when page loads

**Implementation Note**: Pause here for manual confirmation before Phase 4.

---

## Phase 4: Fix Feedback Banner Dismissal

### Overview

Two bugs found in the banner flow:

**Bug 1**: `markFeedbackSeen` is fire-and-forget (no `await`, no `.catch()`). If it fails silently, `feedbackSeenAt` is never set, banner persists forever.

**Bug 2**: `getUnseenFeedback` returns only the latest unseen request. If that request's attempt has no `practiceSessionId` (legacy data), the banner doesn't render BUT the unseen request blocks all newer unseen requests from appearing. The user can never see the feedback banner again.

### Changes Required:

#### 4.1 Fix Fire-and-Forget Mutation

**File**: `apps/web/src/routes/practice/session/[id]/+page.svelte`
**Changes**: Add error handling to `markFeedbackSeen` call. Don't set `markedSeen = true` until mutation succeeds.

```ts
$effect(() => {
  if (sessionData.data && !markedSeen) {
    const hasReview = sessionData.data.attempts.some((a) => a.humanReview?.initialReview);
    if (hasReview) {
      markedSeen = true;
      client.mutation(api.humanReviews.markFeedbackSeen, {
        practiceSessionId
      }).catch((err) => {
        console.error('Failed to mark feedback seen:', err);
        markedSeen = false; // allow retry on next reactive update
      });
    }
  }
});
```

#### 4.2 Fix `getUnseenFeedback` — Skip Orphaned Requests

**File**: `convex/humanReviews.ts`
**Changes**: In `getUnseenFeedback`, find the first unseen request whose attempt actually has a `practiceSessionId`. This prevents legacy orphaned requests from blocking the banner.

```ts
export const getUnseenFeedback = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    const requests = await ctx.db
      .query('humanReviewRequests')
      .withIndex('by_learner_created', (q) => q.eq('learnerUserId', userId))
      .order('desc')
      .collect();

    const unseen = requests.filter(
      (r) =>
        (r.status === 'completed' || r.status === 'dispute_resolved') &&
        r.feedbackSeenAt === undefined
    );

    if (unseen.length === 0) return null;

    // Find first unseen request whose attempt has a practiceSessionId
    for (const req of unseen) {
      const attempt = await ctx.db.get(req.attemptId);
      if (attempt?.practiceSessionId) {
        return {
          practiceSessionId: attempt.practiceSessionId,
          attemptId: req.attemptId,
          count: unseen.length
        };
      }
    }

    return null;
  }
});
```

### Success Criteria:

#### Automated Verification:

- [x] `npx convex dev --once` succeeds
- [x] `bun run check` passes

#### Manual Verification:

- [ ] View a session with human reviews → navigate back → banner gone
- [ ] If multiple unseen sessions exist, banner updates to next unseen
- [ ] No console errors from markFeedbackSeen

**Implementation Note**: Pause here for manual confirmation.

---

## Testing Strategy

### Manual Testing Steps:

1. Add phrase with only English → verify translation + phonetics arrive
2. Add phrase with both fields → verify no LLM call, phonetic stays empty
3. Scroll library page → verify header is sticky
4. Trigger a human review → verify banner appears, click it, verify banner disappears on return
5. Check verifier app → ensure header also sticky and correct

## Performance Considerations

- Claude API call adds ~2-3s latency per phrase creation, but user sees immediate feedback (phrase appears right away)
- `getUnseenFeedback` now does N db lookups for orphaned requests (worst case) — acceptable since unseen count is typically < 5
- Single LLM call for translation+phonetics saves a round trip vs separate Google Translate + phonetics calls

## References

- AI pipeline pattern: `convex/aiPipeline.ts` + `convex/aiPipelineData.ts`
- Library page: `apps/web/src/routes/+page.svelte`
- Header CSS: `packages/shared/src/styles/recall.css:280-284`
- Banner flow: `convex/humanReviews.ts:841-903`
