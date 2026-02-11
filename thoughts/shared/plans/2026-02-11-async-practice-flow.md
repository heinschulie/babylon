# Async Practice Flow Implementation Plan

## Overview

Replace the blocking record-wait-review loop with a fluid record-advance-review flow. Learner records phrases back-to-back without waiting for AI feedback. At end of phrase list, a reactive review screen shows feedback as it arrives, each item in an accordion.

## Current State Analysis

**Blocking bottleneck**: `practice/+page.svelte:200` — `handleSubmit()` awaits `api.aiPipeline.processAttempt` synchronously. Learner cannot advance until Whisper + Claude finish (~5-10s per phrase).

**AI prompt issue**: `convex/aiPipeline.ts:132-137` — system prompt doesn't instruct Claude to stay within the target language. It can misinterpret Xhosa attempts as words in other languages (e.g., Zulu, Swahili), producing demoralizing feedback.

### Key Discoveries:

- `processAttempt` is a Convex action that writes to `aiFeedback` table and patches attempt status to `feedback_ready` — already async-friendly, just needs to not be awaited client-side
- `listByPracticeSession` query (`convex/attempts.ts:256`) reactively returns all attempts with feedback — Convex subscriptions will push updates automatically
- Accordion components exist at `apps/web/src/lib/components/ui/accordion/` (bits-ui based)
- Practice player CSS (magenta hue 330) at `packages/shared/src/styles/recall.css:348-376`
- Header uses CSS grid-like flex layout: icon | nav | avatar at `recall.css:183-190`

## Desired End State

1. Learner starts session, sees phrase, records, submits — **immediately** sees next phrase
2. Queue mode toggle (shuffle / once / repeat) visible in session header, inline with session info
3. In "once" mode: after last phrase, auto-transition to review screen
4. In "shuffle" mode: learner goes until they choose to end
5. In "repeat" mode: list loops but learner can end anytime
6. Review screen: reactive list of attempts. Each attempt is an accordion item showing scores in trigger, full feedback + yellow verifier audio player on expand
7. Feedback items append to bottom as they arrive (no jank)
8. AI prompt improved: stay in Xhosa, never misinterpret as another language, positive-but-real tone

**Verification**: Start a session in "once" mode, record all phrases without any wait between them, auto-transition to review screen, watch feedback items populate one by one with accordion expand showing full detail + yellow audio player.

## What We're NOT Doing

- No changes to human review flow or verifier system
- No changes to audio recording/upload mechanics
- No offline/retry queue for failed AI processing
- No changes to the session detail page (`practice/session/[id]/+page.svelte`)
- No changes to billing/entitlement checks

## Implementation Approach

Three phases: backend prompt fix (quick win), frontend flow refactor (bulk of work), CSS/styling for review screen and mode toggle.

---

## Phase 1: AI Prompt Improvement

### Overview

Fix the Claude feedback prompt to never misinterpret learner attempts as words from other languages.

### Changes Required:

#### 1.1 Update Claude System Prompt

**File**: `convex/aiPipeline.ts`
**Changes**: Replace the system prompt in `generateFeedbackWithClaude` (line 132-137)

```typescript
const prompt = [
  'You are a Xhosa pronunciation coach for English speakers learning isiXhosa.',
  'The learner has attempted to say a specific Xhosa phrase. A speech-to-text system transcribed their attempt.',
  'IMPORTANT: The transcript is the system\'s best guess at what the learner said while attempting the TARGET Xhosa phrase. Do NOT interpret it as a word in any other language (Zulu, Swahili, English, etc.). Always analyse it as an attempt at the target Xhosa phrase.',
  'If the transcript is empty or garbled, assume the microphone didn\'t pick up clearly and encourage them to try again.',
  'Provide concise, instructive feedback (2-4 sentences). Be encouraging but honest — not sycophantic.',
  'Focus on specific pronunciation guidance: click sounds, vowel clarity, syllable stress, word separation.',
  'Format actionable tips with the target syllables spelled out, e.g. "Try: MA-si... HAM-be".'
].join(' ');
```

### Success Criteria:

#### Automated Verification:

- [x] `npx convex dev` compiles without errors
- [x] Existing attempt processing still works (no schema changes)

#### Manual Verification:

- [ ] Record a Xhosa phrase, verify AI feedback stays within Xhosa analysis
- [ ] Verify feedback tone matches the example: encouraging, specific, not sycophantic

---

## Phase 2: Async Submit + Queue Mode + Auto-Transition

### Overview

Refactor `handleSubmit` to fire-and-forget the AI action. Add queue mode toggle (shuffle/once/repeat). Auto-transition to review screen when list exhausted in "once" mode.

### Changes Required:

#### 2.1 Refactor handleSubmit to fire-and-forget

**File**: `apps/web/src/routes/practice/+page.svelte`
**Changes**: Split current `handleSubmit` into upload-only (sync) + AI processing (fire-and-forget). After upload completes, immediately advance to next phrase.

```typescript
// New state
let queueMode = $state<'shuffle' | 'once' | 'repeat'>('once');
let sessionDone = $state(false);
let pendingSubmissions = $state(0);

async function handleSubmit() {
  if (!audioBlob || !currentPhrase || !activePracticeSessionId) return;

  processing = true;
  recordError = '';

  try {
    const phraseSnapshot = { ...currentPhrase };
    const blobSnapshot = audioBlob;
    const durationSnapshot = durationMs;

    // 1. Create attempt + upload audio (must be sync — need IDs)
    const attemptId = await client.mutation(api.attempts.create, {
      phraseId: phraseSnapshot._id,
      practiceSessionId: activePracticeSessionId,
      durationMs: durationSnapshot
    });

    const uploadUrl = await client.mutation(api.audioUploads.generateUploadUrl, {});
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': blobSnapshot.type || 'audio/webm' },
      body: blobSnapshot
    });

    if (!uploadResponse.ok) throw new Error('Failed to upload audio.');

    const uploadResult = await uploadResponse.json();
    const storageId = uploadResult.storageId as string;

    const audioAssetId = await client.mutation(api.audioAssets.create, {
      storageKey: storageId,
      contentType: blobSnapshot.type || 'audio/webm',
      phraseId: phraseSnapshot._id,
      attemptId,
      durationMs: durationSnapshot
    });

    await client.mutation(api.attempts.attachAudio, {
      attemptId,
      audioAssetId
    });

    // 2. Fire-and-forget AI processing
    pendingSubmissions++;
    client.action(api.aiPipeline.processAttempt, {
      attemptId,
      phraseId: phraseSnapshot._id,
      englishPrompt: phraseSnapshot.english,
      targetPhrase: phraseSnapshot.translation
    }).finally(() => {
      pendingSubmissions--;
    });

    // 3. Immediately advance
    advanceToNext();
  } catch (err) {
    recordError = err instanceof Error ? err.message : 'Failed to submit recording.';
  } finally {
    processing = false;
  }
}
```

#### 2.2 New advanceToNext + queue mode logic

**File**: `apps/web/src/routes/practice/+page.svelte`
**Changes**: Replace `handleNext` with `advanceToNext` that respects queue mode.

```typescript
function advanceToNext() {
  const nextIndex = currentIndex + 1;

  if (nextIndex >= queue!.length) {
    if (queueMode === 'once') {
      // Auto-transition to review
      sessionDone = true;
      resetRecordingState();
      return;
    } else if (queueMode === 'shuffle') {
      queue = shuffle(queue!);
      currentIndex = 0;
    } else {
      // repeat — restart from 0 without reshuffle
      currentIndex = 0;
    }
  } else {
    currentIndex = nextIndex;
  }

  resetRecordingState();
}

function resetRecordingState() {
  recording = false;
  recordError = '';
  feedbackText = null;
  audioChunks = [];
  audioBlob = null;
  audioUrl = null;
  durationMs = 0;
  if (playerEl) {
    playerEl.pause();
    playerEl = null;
  }
  playing = false;
  playProgress = 0;
}
```

#### 2.3 handleSkip simplification

**File**: `apps/web/src/routes/practice/+page.svelte`
**Changes**: Skip just advances, no submission.

```typescript
function handleSkip() {
  advanceToNext();
}
```

#### 2.4 Remove `submitted` state gate

**File**: `apps/web/src/routes/practice/+page.svelte`
**Changes**: Remove the `submitted` state variable and the feedback/history panel that showed after submit. The phrase area now always shows the current phrase (no feedback interstitial). Remove the "Next Phrase" / "End Session" post-submit button group. The controls area always shows record/submit/skip.

#### 2.5 Queue mode toggle in session header

**File**: `apps/web/src/routes/practice/+page.svelte`
**Changes**: Add mode toggle to the header area. Restructure the session header into a CSS grid: left column for session info, right column for mode toggle (vertically aligned with profile icon above).

```svelte
<div class="practice-session__header">
  <div class="practice-session__header-info">
    <p class="info-kicker">Phrase {queuePosition} of {queueLength}</p>
    <p class="meta-text">
      Session started {new Date(activePracticeSession.data?.startedAt ?? Date.now()).toLocaleTimeString()}
    </p>
  </div>
  <div class="practice-session__header-mode">
    <button
      class="practice-mode-btn"
      class:active={queueMode === 'once'}
      onclick={() => (queueMode = 'once')}
      aria-label="Play once"
    >1x</button>
    <button
      class="practice-mode-btn"
      class:active={queueMode === 'shuffle'}
      onclick={() => { queueMode = 'shuffle'; queue = shuffle(queue!); }}
      aria-label="Shuffle"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.7l-.327-.517"/></svg>
    </button>
    <button
      class="practice-mode-btn"
      class:active={queueMode === 'repeat'}
      onclick={() => (queueMode = 'repeat')}
      aria-label="Repeat"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
    </button>
  </div>
</div>
```

#### 2.6 Controls area update

**File**: `apps/web/src/routes/practice/+page.svelte`
**Changes**: Remove the post-submit controls. Add "End Session" as a secondary action alongside Skip. The controls are always: Record/Stop → Submit + Discard/Skip, with End Session accessible.

```svelte
<div class="practice-session__controls">
  {#if recordError}
    <p class="text-destructive text-sm">{recordError}</p>
  {/if}

  {#if audioUrl}
    <!-- playback bar (unchanged) -->
    <div class="practice-player" onclick={togglePlayback}>
      <div class="practice-player__fill" style="width: {playProgress * 100}%"></div>
      <span class="practice-player__label">
        {playing ? 'Playing...' : formatDuration(durationMs)}
      </span>
    </div>
    <audio bind:this={playerEl} src={audioUrl} ontimeupdate={onTimeUpdate}
      onplay={() => (playing = true)} onpause={() => (playing = false)} onended={onPlayEnded}></audio>
  {:else if recording}
    <Button onclick={stopRecording} size="lg" class="practice-record-btn w-full">
      Stop Recording
    </Button>
  {:else}
    <Button onclick={startRecording} size="lg" class="practice-record-btn w-full">
      Start Recording
    </Button>
  {/if}

  <div class="flex gap-2">
    <Button onclick={handleSubmit} class="flex-1" size="lg" disabled={!audioBlob || processing}>
      {processing ? 'Uploading...' : 'Submit'}
    </Button>
    {#if audioUrl}
      <Button onclick={discardRecording} variant="outline" size="lg">Discard</Button>
    {:else}
      <Button onclick={handleSkip} variant="outline" size="lg">Skip</Button>
    {/if}
  </div>

  <button class="meta-text underline text-center" onclick={endPracticeSession}>
    {ending ? 'Ending...' : 'End Session'}
  </button>
</div>
```

### Success Criteria:

#### Automated Verification:

- [x] App builds without errors: `cd apps/web && npm run build`
- [x] No TypeScript errors: `cd apps/web && npm run check`

#### Manual Verification:

- [ ] Record a phrase → immediately see next phrase (no wait)
- [ ] Queue mode toggle visible, aligned right in session header
- [ ] "Once" mode: after last phrase, auto-transitions to review screen
- [ ] "Shuffle" mode: reshuffles at end, keeps going
- [ ] "Repeat" mode: restarts list without reshuffle
- [ ] Skip advances without creating an attempt
- [ ] End Session works from any point

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 3: Review Screen with Reactive Accordion Feedback

### Overview

Build the post-session review screen. Uses Convex reactive query to show feedback as it arrives. Each attempt is an accordion item with scores in the trigger and full feedback + yellow verifier audio on expand.

### Changes Required:

#### 3.1 Reactive session attempts query

**File**: `apps/web/src/routes/practice/+page.svelte`
**Changes**: Add a reactive query for all attempts in the current session. This fires when `sessionDone` is true.

```typescript
const sessionAttempts = useQuery(
  api.attempts.listByPracticeSession,
  () => (activePracticeSessionId ? { practiceSessionId: activePracticeSessionId } : 'skip')
);
```

Note: This query already exists for the session detail page and returns `feedbackText`, `score`, `humanReview` with scores and audio URLs. Convex reactivity means it auto-updates as `aiFeedback` rows are written and attempt status changes to `feedback_ready`.

#### 3.2 Review screen template

**File**: `apps/web/src/routes/practice/+page.svelte`
**Changes**: When `sessionDone === true`, show the review screen instead of the phrase/controls layout.

```svelte
{:else if sessionDone}
  <div class="page-shell page-shell--narrow page-stack">
    <div class="page-stack">
      <h1 class="text-5xl sm:text-6xl">Session Review</h1>
      <p class="meta-text">
        {#if pendingSubmissions > 0}
          Processing {pendingSubmissions} recording{pendingSubmissions === 1 ? '' : 's'}...
        {:else}
          All feedback received.
        {/if}
      </p>
    </div>

    {#if sessionAttempts.isLoading}
      <p class="meta-text">Loading results...</p>
    {:else if sessionAttempts.data}
      <Accordion.Root type="single" collapsible>
        {#each sessionAttempts.data.attempts as attempt (attempt._id)}
          <Accordion.Item value={attempt._id}>
            <Accordion.Trigger class="practice-review-trigger">
              <div class="practice-review-trigger__content">
                <p class="font-semibold">{attempt.phraseTranslation}</p>
                <p class="meta-text">{attempt.phraseEnglish}</p>
              </div>
              {#if attempt.status === 'feedback_ready' && attempt.score != null}
                <div class="practice-review-trigger__scores">
                  <span class="practice-review-score">{attempt.score}/5</span>
                </div>
              {:else if attempt.status === 'processing'}
                <span class="meta-text">Processing...</span>
              {:else if attempt.status === 'failed'}
                <span class="text-destructive text-sm">Failed</span>
              {/if}
              {#if attempt.humanReview?.initialReview}
                <div class="practice-review-trigger__scores">
                  <span class="practice-review-score" title="Sound">S{attempt.humanReview.initialReview.soundAccuracy}</span>
                  <span class="practice-review-score" title="Rhythm">R{attempt.humanReview.initialReview.rhythmIntonation}</span>
                  <span class="practice-review-score" title="Phrase">P{attempt.humanReview.initialReview.phraseAccuracy}</span>
                </div>
              {/if}
            </Accordion.Trigger>
            <Accordion.Content>
              <div class="practice-review-detail">
                {#if attempt.feedbackText}
                  <p class="text-sm">{attempt.feedbackText}</p>
                {/if}
                {#if attempt.audioUrl}
                  <div>
                    <p class="info-kicker mb-1">Your Recording</p>
                    <audio controls src={attempt.audioUrl} class="audio-playback w-full"></audio>
                  </div>
                {/if}
                {#if attempt.humanReview?.initialReview?.audioUrl}
                  <div>
                    <p class="info-kicker mb-1">Verifier Example</p>
                    <div class="practice-player practice-player--verifier">
                      <!-- Reuse playback pattern but with yellow styling -->
                      <audio controls src={attempt.humanReview.initialReview.audioUrl}
                        class="audio-playback audio-playback--verifier w-full"></audio>
                    </div>
                  </div>
                {/if}
              </div>
            </Accordion.Content>
          </Accordion.Item>
        {/each}
      </Accordion.Root>

      <div class="grid grid-cols-2 gap-2">
        <Button onclick={() => { sessionDone = false; initialized = false; startPracticeSession(); }} size="lg">
          New Session
        </Button>
        <Button onclick={endPracticeSession} variant="outline" size="lg" disabled={ending}>
          {ending ? 'Ending...' : 'Finish'}
        </Button>
      </div>
    {/if}
  </div>
```

#### 3.3 Yellow verifier audio player CSS

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add verifier variant of the player and review-specific styles.

```css
/* Verifier audio player — yellow variant */
.audio-playback--verifier {
  background-color: color-mix(in oklab, var(--background) 80%, oklch(0.75 0.18 85) 20%);
  border: 1px solid color-mix(in oklab, var(--border) 60%, oklch(0.75 0.18 85) 40%);
}

.practice-player--verifier {
  background: oklch(0.75 0.18 85);
}

.practice-player--verifier .practice-player__fill {
  background: oklch(0.60 0.18 85);
}

.practice-player--verifier .practice-player__label {
  color: oklch(0.15 0.02 85);
}

/* Session header grid */
.practice-session__header {
  /* override existing flex layout */
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: start;
  padding-top: var(--page-block);
  gap: 0.5rem;
}

.practice-session__header-info {
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  grid-column: 1 / -1;
  grid-row: 1;
}

.practice-session__header-mode {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  gap: 0.25rem;
  align-self: center;
  z-index: 1;
}

.practice-mode-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--muted-foreground);
  border: 1px solid var(--border);
  background: transparent;
  cursor: pointer;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
}

.practice-mode-btn:hover {
  color: var(--foreground);
  border-color: var(--foreground);
}

.practice-mode-btn.active {
  color: var(--primary-foreground);
  background: var(--primary);
  border-color: color-mix(in oklab, var(--primary) 85%, black 15%);
}

/* Review screen */
.practice-review-trigger {
  /* override default accordion trigger padding */
}

.practice-review-trigger__content {
  flex: 1;
  text-align: left;
}

.practice-review-trigger__scores {
  display: flex;
  gap: 0.35rem;
}

.practice-review-score {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0.15rem 0.4rem;
  border: 1px solid var(--border);
  color: var(--muted-foreground);
}

.practice-review-detail {
  display: grid;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
}
```

#### 3.4 Ensure attempts display in submission order (bottom-append)

The `listByPracticeSession` query currently orders by `desc`. We need `asc` so new feedback appends to the bottom.

**File**: `convex/attempts.ts`
**Changes**: The review screen should show oldest-first. Add a new query or use a sort param. Simplest: add a dedicated query for the review screen.

```typescript
export const listByPracticeSessionAsc = query({
  args: {
    practiceSessionId: v.id('practiceSessions')
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const practiceSession = await ctx.db.get(args.practiceSessionId);
    if (!practiceSession || practiceSession.userId !== userId) {
      throw new Error('Practice session not found or not authorized');
    }

    const attempts = await ctx.db
      .query('attempts')
      .withIndex('by_practice_session', (q) => q.eq('practiceSessionId', args.practiceSessionId))
      .order('asc')
      .collect();

    const results = [];
    for (const attempt of attempts) {
      results.push(await buildAttemptResult(ctx, attempt));
    }

    return {
      practiceSession,
      attempts: results
    };
  }
});
```

Then in the review screen, use `api.attempts.listByPracticeSessionAsc` instead.

### Success Criteria:

#### Automated Verification:

- [x] App builds: `cd apps/web && npm run build`
- [x] Type check: `cd apps/web && npm run check`
- [x] Convex compiles: `npx convex dev` (or deploy dry-run)

#### Manual Verification:

- [ ] After last phrase in "once" mode, review screen appears
- [ ] Feedback items appear as accordion items, newest at bottom
- [ ] Accordion trigger shows phrase + scores
- [ ] Expanding shows full feedback text + learner audio + verifier audio (if available)
- [ ] Verifier audio player is yellow, not magenta
- [ ] "Processing..." shown for attempts still being analyzed
- [ ] Items update in-place when feedback arrives (no page jank)
- [ ] "New Session" starts a fresh session; "Finish" ends and goes to practice list

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation.

---

## Testing Strategy

### Unit Tests:

- None needed — Convex functions are integration-tested by nature

### Integration Tests:

- Full session flow: start → record 3 phrases → auto-transition → verify 3 accordion items appear

### Manual Testing Steps:

1. Start session in "once" mode with 3+ phrases
2. Record and submit each phrase — verify immediate advance
3. Verify review screen appears after last phrase
4. Watch feedback items populate (check network tab for reactive updates)
5. Expand accordion items — verify feedback text and audio players
6. Test "shuffle" mode — verify reshuffle at end, no auto-transition
7. Test "repeat" mode — verify restart without reshuffle
8. Test skip — verify no attempt created
9. Test End Session mid-flow — verify clean exit
10. Verify AI feedback doesn't misinterpret Xhosa as other languages

## Performance Considerations

- Fire-and-forget `processAttempt` means multiple Convex actions may run in parallel — this is fine, Convex handles action concurrency
- `listByPracticeSessionAsc` query runs on every attempt status change — acceptable for session sizes (typically 5-30 phrases)
- `pendingSubmissions` counter is client-side only, used for UX messaging — doesn't affect correctness

## Migration Notes

- No schema changes required
- Adding `listByPracticeSessionAsc` is additive
- Existing session detail page (`practice/session/[id]/+page.svelte`) unchanged — still uses `listByPracticeSession` (desc)
