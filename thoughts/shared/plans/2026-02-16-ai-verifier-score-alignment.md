# AI-Verifier Score Alignment & Calibration Tracking

## Overview

Align the AI grading prompt with the verifier's 3-dimension rubric (soundAccuracy, rhythmIntonation, phraseAccuracy, each 1-5) so scores are directly comparable. Then build a per-phrase calibration table that tracks the delta between AI and human scores over time. No new UI — data queryable via Convex dashboard.

## Current State Analysis

- **Verifier grading**: 3 dimensions × 1-5 scale, validated at `convex/humanReviews.ts:11-19`
- **AI feedback**: Prose-only. `score`, `errorTags`, `confidence` fields in `aiFeedback` schema are **never populated**. Prompt at `convex/aiPipeline.ts:132-142` asks for free-text pronunciation coaching with no structured scoring.
- **Gap**: AI and human outputs are fundamentally incomparable — different format, different criteria.

### Key Discoveries:

- `aiFeedback.score` (single number) is unused — safe to replace with 3 dimensions
- AI prompt currently returns free text; needs to return JSON with scores + text
- `humanReviews.submitReview` at `convex/humanReviews.ts:382-581` is the natural hook point for calibration updates
- `humanReviewRequests.phraseId` already links reviews to phrases — no join gymnastics needed

## Desired End State

1. AI returns structured JSON: `{ soundAccuracy, rhythmIntonation, phraseAccuracy, feedbackText }` — same 3 dims as verifiers
2. `aiFeedback` schema stores 3 dimension scores instead of single `score`
3. New `aiCalibration` table accumulates per-phrase delta stats (count, sumDelta per dimension)
4. Calibration updated automatically when a human review completes on an attempt that has AI scores
5. Data queryable via Convex dashboard — no UI

### Verification:

- `npx convex dev --once` pushes schema + functions cleanly
- New attempts produce AI feedback with 3 structured scores
- After a human review completes, the `aiCalibration` row for that phrase updates
- Query `aiCalibration` table in dashboard shows running deltas

## What We're NOT Doing

- No calibration UI in verifier or web app
- No retroactive scoring of existing AI feedback records
- No changes to the verifier grading interface (it already works)
- No changes to dispute/escalation logic
- No per-user calibration tracking

## Implementation Approach

Two phases: (1) align AI output format + schema, (2) add calibration tracking.

---

## Phase 1: Align AI Scoring with Verifier Framework

### Overview

Rewrite the Claude prompt to return structured JSON with the same 3 scoring dimensions verifiers use, update the schema, and wire the scores through the pipeline.

### Changes Required:

#### 1.1 Schema: Replace `score` with 3 dimensions

**File**: `convex/schema.ts:186-196`
**Changes**: Replace `score: v.optional(v.number())` with `soundAccuracy`, `rhythmIntonation`, `phraseAccuracy` (all optional numbers). Keep `errorTags` and `confidence` as-is (harmless).

```typescript
aiFeedback: defineTable({
    attemptId: v.id('attempts'),
    transcript: v.optional(v.string()),
    confidence: v.optional(v.number()),
    errorTags: v.optional(v.array(v.string())),
    soundAccuracy: v.optional(v.number()),
    rhythmIntonation: v.optional(v.number()),
    phraseAccuracy: v.optional(v.number()),
    feedbackText: v.optional(v.string()),
    ttsAudioUrl: v.optional(v.string()),
    createdAt: v.number()
}).index('by_attempt', ['attemptId'])
```

#### 1.2 Update Claude prompt to return structured JSON

**File**: `convex/aiPipeline.ts:122-172`
**Changes**: Rewrite `generateFeedbackWithClaude` — new system prompt that:
- Frames evaluation around the 3 verifier dimensions with clear descriptions
- Asks for JSON output: `{ soundAccuracy, rhythmIntonation, phraseAccuracy, feedback }`
- Each score 1-5 integer
- `feedback` is the prose coaching text (same quality as before)
- Parse JSON response, extract scores + text

New prompt (system):

```
You are a Xhosa pronunciation coach grading an English speaker's isiXhosa attempt.

A speech-to-text system transcribed the learner's audio. The transcript is the system's best guess at what the learner said while attempting the TARGET Xhosa phrase. Do NOT interpret it as a word in any other language. Always analyse it as an attempt at the target phrase.

Grade the attempt on three dimensions (1-5 integer each):

1. **Sound Accuracy** (soundAccuracy): How accurately the learner produces individual sounds — clicks (c, q, x), vowels, consonants. 5 = native-like sound production, 1 = most sounds unrecognisable.

2. **Rhythm & Intonation** (rhythmIntonation): Natural flow, stress patterns, syllable timing, and tonal contour. 5 = natural isiXhosa prosody, 1 = flat/choppy/wrong stress throughout.

3. **Phrase Accuracy** (phraseAccuracy): Overall correctness of the full phrase — right words in right order, no omissions or substitutions. 5 = complete and correct, 1 = mostly wrong or missing words.

If the transcript is empty or garbled, score all dimensions as 1 and encourage re-recording.

Also provide brief coaching feedback: one encouraging summary sentence, then a numbered list of specific corrections needed. Each item should name the word/sound, what was said vs target, and a tip. Spell out syllables e.g. "MA-si". Skip words that were fine. Be encouraging but honest.

Respond with ONLY valid JSON in this exact format:
{
  "soundAccuracy": <1-5>,
  "rhythmIntonation": <1-5>,
  "phraseAccuracy": <1-5>,
  "feedback": "<coaching text>"
}
```

Parse logic:

```typescript
const data = await response.json();
const text = data?.content?.[0]?.text ?? '';
try {
    const parsed = JSON.parse(text);
    return {
        soundAccuracy: clampScore(parsed.soundAccuracy),
        rhythmIntonation: clampScore(parsed.rhythmIntonation),
        phraseAccuracy: clampScore(parsed.phraseAccuracy),
        feedbackText: parsed.feedback ?? 'Feedback not available.'
    };
} catch {
    // Fallback: treat entire response as prose, no scores
    return { feedbackText: text || 'Feedback not available.' };
}
```

Helper:
```typescript
function clampScore(val: unknown): number | undefined {
    if (typeof val !== 'number') return undefined;
    return Math.max(1, Math.min(5, Math.round(val)));
}
```

#### 1.3 Update pipeline data flow

**File**: `convex/aiPipelineData.ts:45-65`
**Changes**: Replace `score` arg with 3 dimension args.

```typescript
export const insertAiFeedback = internalMutation({
    args: {
        attemptId: v.id('attempts'),
        transcript: v.optional(v.string()),
        confidence: v.optional(v.number()),
        errorTags: v.optional(v.array(v.string())),
        soundAccuracy: v.optional(v.number()),
        rhythmIntonation: v.optional(v.number()),
        phraseAccuracy: v.optional(v.number()),
        feedbackText: v.optional(v.string())
    },
    handler: async (ctx, args) => {
        await ctx.db.insert('aiFeedback', {
            attemptId: args.attemptId,
            transcript: args.transcript,
            confidence: args.confidence,
            errorTags: args.errorTags,
            soundAccuracy: args.soundAccuracy,
            rhythmIntonation: args.rhythmIntonation,
            phraseAccuracy: args.phraseAccuracy,
            feedbackText: args.feedbackText,
            createdAt: Date.now()
        });
    }
});
```

**File**: `convex/aiPipeline.ts:50-57`
**Changes**: Pass 3 scores instead of `score`.

```typescript
await ctx.runMutation(internal.aiPipelineData.insertAiFeedback, {
    attemptId: args.attemptId,
    transcript: transcriptResult.transcript ?? undefined,
    confidence: transcriptResult.confidence,
    errorTags: feedbackResult.errorTags,
    soundAccuracy: feedbackResult.soundAccuracy,
    rhythmIntonation: feedbackResult.rhythmIntonation,
    phraseAccuracy: feedbackResult.phraseAccuracy,
    feedbackText: feedbackResult.feedbackText
});
```

#### 1.4 Update `aiFeedback.ts` public mutation

**File**: `convex/aiFeedback.ts:5-37`
**Changes**: Replace `score` arg with 3 dimensions.

#### 1.5 Update attempt result builders

**File**: `convex/attempts.ts:105-130` (`buildAttemptResult`)
**Changes**: Replace `score: feedback?.score ?? null` with 3 dimension fields:

```typescript
aiSoundAccuracy: feedback?.soundAccuracy ?? null,
aiRhythmIntonation: feedback?.rhythmIntonation ?? null,
aiPhraseAccuracy: feedback?.phraseAccuracy ?? null,
```

#### 1.6 Update verifier assignment builder

**File**: `convex/humanReviews.ts:162-169` (`buildAssignment`)
**Changes**: Replace `score` in aiFeedback object with 3 dimensions:

```typescript
aiFeedback: aiFeedback
    ? {
        transcript: aiFeedback.transcript ?? null,
        confidence: aiFeedback.confidence ?? null,
        soundAccuracy: aiFeedback.soundAccuracy ?? null,
        rhythmIntonation: aiFeedback.rhythmIntonation ?? null,
        phraseAccuracy: aiFeedback.phraseAccuracy ?? null,
        feedbackText: aiFeedback.feedbackText ?? null,
        errorTags: aiFeedback.errorTags ?? []
    }
    : null,
```

#### 1.7 Update verifier UI to show AI scores per dimension

**File**: `apps/verifier/src/routes/work/[id]/+page.svelte:301-303`
**Changes**: Replace single `claim.aiFeedback.score` display with 3-dimension display matching the verifier's own scoring labels.

```svelte
{#if claim.aiFeedback.soundAccuracy != null}
    <div class="flex gap-3 text-sm">
        <span>S{claim.aiFeedback.soundAccuracy}</span>
        <span>R{claim.aiFeedback.rhythmIntonation}</span>
        <span>P{claim.aiFeedback.phraseAccuracy}</span>
    </div>
{/if}
```

#### 1.8 Update learner session review

**File**: `apps/web/src/routes/practice/session/[id]/+page.svelte`
**Changes**: If the learner-facing UI displays `attempt.score`, update it to show the 3 AI dimensions instead. Use same S/R/P badge pattern.

#### 1.9 i18n — add message keys if needed

Check if `claim_ai_score` message is used and add new keys for per-dimension AI display if needed. Likely just replace the single score message.

### Success Criteria:

#### Automated Verification:

- [x] `npx convex dev --once` deploys schema + functions without error
- [x] `bun run check` passes (svelte-check)
- [x] `bun run build` succeeds

#### Manual Verification:

- [ ] Record a practice attempt → AI feedback shows 3 scores + prose
- [ ] Verifier grading page shows AI's 3 scores alongside their own scoring buttons
- [ ] Old attempts with no AI scores still render without errors

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: AI Calibration Tracking

### Overview

New `aiCalibration` table that accumulates per-phrase delta stats between AI and human scores. Updated automatically when a human review completes.

### Changes Required:

#### 2.1 Schema: New `aiCalibration` table

**File**: `convex/schema.ts`
**Changes**: Add new table after `aiFeedback`:

```typescript
aiCalibration: defineTable({
    phraseId: v.id('phrases'),
    comparisonCount: v.number(),
    sumDeltaSoundAccuracy: v.number(),      // sum of (ai - human) per comparison
    sumDeltaRhythmIntonation: v.number(),
    sumDeltaPhraseAccuracy: v.number(),
    sumAbsDeltaSoundAccuracy: v.number(),   // sum of |ai - human| (for MAE)
    sumAbsDeltaRhythmIntonation: v.number(),
    sumAbsDeltaPhraseAccuracy: v.number(),
    lastUpdatedAt: v.number()
}).index('by_phrase', ['phraseId'])
```

This allows computing:
- **Mean bias** (signed): `sumDelta / comparisonCount` — positive = AI overrates
- **Mean absolute error**: `sumAbsDelta / comparisonCount` — overall accuracy
- Both per dimension

#### 2.2 Internal mutation to update calibration

**File**: `convex/aiCalibration.ts` (new file)
**Changes**: Internal mutation that receives AI scores + human scores + phraseId, upserts the calibration row.

```typescript
import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import { getAuthUserId } from './lib/auth';

export const recordComparison = internalMutation({
    args: {
        phraseId: v.id('phrases'),
        aiSoundAccuracy: v.number(),
        aiRhythmIntonation: v.number(),
        aiPhraseAccuracy: v.number(),
        humanSoundAccuracy: v.number(),
        humanRhythmIntonation: v.number(),
        humanPhraseAccuracy: v.number()
    },
    handler: async (ctx, args) => {
        const dS = args.aiSoundAccuracy - args.humanSoundAccuracy;
        const dR = args.aiRhythmIntonation - args.humanRhythmIntonation;
        const dP = args.aiPhraseAccuracy - args.humanPhraseAccuracy;

        const existing = await ctx.db
            .query('aiCalibration')
            .withIndex('by_phrase', (q) => q.eq('phraseId', args.phraseId))
            .unique();

        if (existing) {
            await ctx.db.patch(existing._id, {
                comparisonCount: existing.comparisonCount + 1,
                sumDeltaSoundAccuracy: existing.sumDeltaSoundAccuracy + dS,
                sumDeltaRhythmIntonation: existing.sumDeltaRhythmIntonation + dR,
                sumDeltaPhraseAccuracy: existing.sumDeltaPhraseAccuracy + dP,
                sumAbsDeltaSoundAccuracy: existing.sumAbsDeltaSoundAccuracy + Math.abs(dS),
                sumAbsDeltaRhythmIntonation: existing.sumAbsDeltaRhythmIntonation + Math.abs(dR),
                sumAbsDeltaPhraseAccuracy: existing.sumAbsDeltaPhraseAccuracy + Math.abs(dP),
                lastUpdatedAt: Date.now()
            });
        } else {
            await ctx.db.insert('aiCalibration', {
                phraseId: args.phraseId,
                comparisonCount: 1,
                sumDeltaSoundAccuracy: dS,
                sumDeltaRhythmIntonation: dR,
                sumDeltaPhraseAccuracy: dP,
                sumAbsDeltaSoundAccuracy: Math.abs(dS),
                sumAbsDeltaRhythmIntonation: Math.abs(dR),
                sumAbsDeltaPhraseAccuracy: Math.abs(dP),
                lastUpdatedAt: Date.now()
            });
        }
    }
});

// Dashboard query: list all calibration data
export const listAll = query({
    args: {},
    handler: async (ctx) => {
        await getAuthUserId(ctx); // auth gate
        const rows = await ctx.db.query('aiCalibration').collect();
        return rows.map((row) => ({
            phraseId: row.phraseId,
            comparisonCount: row.comparisonCount,
            meanBias: {
                soundAccuracy: row.sumDeltaSoundAccuracy / row.comparisonCount,
                rhythmIntonation: row.sumDeltaRhythmIntonation / row.comparisonCount,
                phraseAccuracy: row.sumDeltaPhraseAccuracy / row.comparisonCount
            },
            meanAbsError: {
                soundAccuracy: row.sumAbsDeltaSoundAccuracy / row.comparisonCount,
                rhythmIntonation: row.sumAbsDeltaRhythmIntonation / row.comparisonCount,
                phraseAccuracy: row.sumAbsDeltaPhraseAccuracy / row.comparisonCount
            },
            lastUpdatedAt: row.lastUpdatedAt
        }));
    }
});
```

#### 2.3 Hook into `submitReview` to trigger calibration

**File**: `convex/humanReviews.ts:478-494` (after review insert, before status update)
**Changes**: After inserting the human review (line ~494), look up AI feedback for the same attempt. If AI scores exist, call the calibration mutation.

Insert after the `ctx.db.insert('humanReviews', ...)` call:

```typescript
// Record AI vs human calibration if AI scores exist
const aiFeedback = await ctx.db
    .query('aiFeedback')
    .withIndex('by_attempt', (q) => q.eq('attemptId', request.attemptId))
    .unique();

if (
    aiFeedback?.soundAccuracy != null &&
    aiFeedback?.rhythmIntonation != null &&
    aiFeedback?.phraseAccuracy != null
) {
    await recordCalibrationComparison(ctx, {
        phraseId: request.phraseId,
        aiSoundAccuracy: aiFeedback.soundAccuracy,
        aiRhythmIntonation: aiFeedback.rhythmIntonation,
        aiPhraseAccuracy: aiFeedback.phraseAccuracy,
        humanSoundAccuracy: args.soundAccuracy,
        humanRhythmIntonation: args.rhythmIntonation,
        humanPhraseAccuracy: args.phraseAccuracy
    });
}
```

Note: Since `submitReview` is already a mutation, we can call a helper function directly (no need to schedule). Extract the calibration logic into a reusable async function in `humanReviews.ts` or import from `aiCalibration.ts`.

Since Convex internal mutations can't be called from within another mutation directly (they're for cross-function calls), we'll inline the calibration upsert logic as a helper function within `humanReviews.ts`.

```typescript
async function updateAiCalibration(
    ctx: { db: any },
    phraseId: any,
    ai: { soundAccuracy: number; rhythmIntonation: number; phraseAccuracy: number },
    human: { soundAccuracy: number; rhythmIntonation: number; phraseAccuracy: number }
) {
    const dS = ai.soundAccuracy - human.soundAccuracy;
    const dR = ai.rhythmIntonation - human.rhythmIntonation;
    const dP = ai.phraseAccuracy - human.phraseAccuracy;

    const existing = await ctx.db
        .query('aiCalibration')
        .withIndex('by_phrase', (q: any) => q.eq('phraseId', phraseId))
        .unique();

    if (existing) {
        await ctx.db.patch(existing._id, {
            comparisonCount: existing.comparisonCount + 1,
            sumDeltaSoundAccuracy: existing.sumDeltaSoundAccuracy + dS,
            sumDeltaRhythmIntonation: existing.sumDeltaRhythmIntonation + dR,
            sumDeltaPhraseAccuracy: existing.sumDeltaPhraseAccuracy + dP,
            sumAbsDeltaSoundAccuracy: existing.sumAbsDeltaSoundAccuracy + Math.abs(dS),
            sumAbsDeltaRhythmIntonation: existing.sumAbsDeltaRhythmIntonation + Math.abs(dR),
            sumAbsDeltaPhraseAccuracy: existing.sumAbsDeltaPhraseAccuracy + Math.abs(dP),
            lastUpdatedAt: Date.now()
        });
    } else {
        await ctx.db.insert('aiCalibration', {
            phraseId,
            comparisonCount: 1,
            sumDeltaSoundAccuracy: dS,
            sumDeltaRhythmIntonation: dR,
            sumDeltaPhraseAccuracy: dP,
            sumAbsDeltaSoundAccuracy: Math.abs(dS),
            sumAbsDeltaRhythmIntonation: Math.abs(dR),
            sumAbsDeltaPhraseAccuracy: Math.abs(dP),
            lastUpdatedAt: Date.now()
        });
    }
}
```

### Success Criteria:

#### Automated Verification:

- [x] `npx convex dev --once` deploys cleanly
- [x] `bun run check` passes
- [x] `bun run build` succeeds

#### Manual Verification:

- [ ] Practice an attempt → get AI scores → verifier reviews it → `aiCalibration` row appears for that phrase
- [ ] Second attempt on same phrase → calibration row updates (count increments, deltas accumulate)
- [ ] Query `aiCalibration.listAll` in Convex dashboard returns computed bias/MAE per phrase

---

## Testing Strategy

### Manual Testing Steps:

1. Record a practice attempt on a known phrase
2. Confirm AI feedback JSON has 3 scores + prose text
3. Claim and grade the attempt as a verifier
4. Check `aiCalibration` table in Convex dashboard — row should exist for that phraseId
5. Repeat for same phrase — confirm `comparisonCount` increments
6. Verify mean bias direction makes sense (e.g., if AI gave 4 and human gave 3, bias should be positive)

## References

- Verifier scoring validation: `convex/humanReviews.ts:11-19`
- AI pipeline: `convex/aiPipeline.ts:122-172`
- AI data storage: `convex/aiPipelineData.ts:45-65`
- Schema: `convex/schema.ts:186-196`
- Verifier grading UI: `apps/verifier/src/routes/work/[id]/+page.svelte:226-282`

## Unresolved Questions

None — all design decisions resolved.
