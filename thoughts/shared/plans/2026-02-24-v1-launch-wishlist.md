# V1 Launch Wishlist Implementation Plan

## Overview

Ship 6 features to make Babylon a compelling v1: practice-first UX with streaks, polished session history, fine-grained phrase categories, an isiXhosa theory page, profile pic uploads, and vocabulary flashcards with Unsplash images.

Phases 1-4 ship together as a cohesive v1 update. Phase 5 (flashcards) follows as a standalone feature.

## Current State Analysis

- **Routing**: `/` = Library, `/practice` = Practice. Library has a FAB linking to Practice.
- **Sessions**: Practice page shows a flat `<ul>` of past sessions with timestamp + phrase count. No scores on cards.
- **Categories**: 10 broad categories in `convex/lib/phraseCategories.ts` with keyword matching. `general_conversation` is the catch-all.
- **Profile**: No avatar system. Header uses hardcoded SVG silhouette. `userPreferences` has no image field.
- **Streaks**: No streak tracking. `usageDaily` exists but only for billing rate-limiting.
- **Theory/vocab**: Nothing exists.

### Key Discoveries

- Convex file storage already used for audio — same mechanism works for profile images (`convex/audioAssets.ts`)
- `practiceSessions` table has `endedAt` field — perfect for streak derivation (days with ≥1 ended session)
- `aiFeedback` table has `soundAccuracy`, `rhythmIntonation`, `phraseAccuracy` per attempt — can aggregate for session cards
- `practiceSessions.list` query already enriches with `attemptCount`/`phraseCount` — extend to include avg scores
- Header component accepts props from layout — can add `avatarUrl` + `theoryHref` + `theoryLabel`

## Desired End State

1. Practice page is the default landing page (`/`), Library moves to `/library`
2. Practice page shows a large streak number + motivational isiXhosa text, has a FAB that auto-starts sessions
3. Recent sessions are in a collapsible accordion, each card shows aggregate S/R/P scores out of 5
4. Phrases categorized into ~16 fine-grained categories instead of 10
5. `/theory` page with thorough isiXhosa primer accessible from profile dropdown
6. Profile pic upload in settings, displayed in header avatar
7. Vocabulary flashcard practice with Unsplash images, accessible from practice page

## What We're NOT Doing

- No spaced repetition integration for flashcards (v2)
- No flashcard-to-phrase-library pipeline yet (v2)
- No streak notifications/badges
- No leaderboard or social features
- No CMS for theory content — static i18n strings only
- No video/animation for click consonant demos (text + audio-first advice only)

---

## Phase 1: Practice-First UX + Session Polish

### Overview

Swap default route to Practice. Add streak display, session-start FAB, and collapsible recent sessions with aggregate scores.

### Changes Required

#### 1.1 Streak Query

**File**: `convex/practiceSessions.ts`
**Changes**: Add `getStreak` query

```ts
export const getStreak = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const prefs = await ctx.db
      .query('userPreferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    const tz = prefs?.timeZone ?? 'Africa/Johannesburg';

    // Fetch all ended sessions, most recent first
    const sessions = await ctx.db
      .query('practiceSessions')
      .withIndex('by_user_started', (q) => q.eq('userId', userId))
      .order('desc')
      .collect();

    const endedSessions = sessions.filter((s) => s.endedAt);
    if (endedSessions.length === 0) return { streak: 0 };

    // Collect unique practice days
    const practiceDays = new Set<string>();
    for (const session of endedSessions) {
      const dateKey = new Date(session.endedAt!).toLocaleDateString('en-CA', { timeZone: tz });
      practiceDays.add(dateKey);
    }

    // Count consecutive days backwards from today
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    let streak = 0;
    let checkDate = new Date(today + 'T12:00:00'); // noon to avoid DST issues

    // Allow today to not yet have a session (streak still counts from yesterday)
    if (!practiceDays.has(today)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
      const key = checkDate.toLocaleDateString('en-CA', { timeZone: tz });
      if (practiceDays.has(key)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return { streak };
  }
});
```

#### 1.2 Enrich Session List with Aggregate Scores

**File**: `convex/practiceSessions.ts`
**Changes**: Extend `list` query to fetch `aiFeedback` per attempt and compute average scores

In the `list` query's enrichment loop, after fetching attempts, also fetch `aiFeedback` for each attempt and compute:

```ts
// Inside the list query enrichment loop, after fetching attempts:
let totalSound = 0, totalRhythm = 0, totalPhrase = 0, scoredCount = 0;
for (const attempt of attempts) {
  const feedback = await ctx.db
    .query('aiFeedback')
    .withIndex('by_attempt', (q) => q.eq('attemptId', attempt._id))
    .unique();
  if (feedback?.soundAccuracy != null) {
    totalSound += feedback.soundAccuracy;
    totalRhythm += feedback.rhythmIntonation!;
    totalPhrase += feedback.phraseAccuracy!;
    scoredCount++;
  }
}
const avgScores = scoredCount > 0 ? {
  sound: Math.round((totalSound / scoredCount) * 10) / 10,
  rhythm: Math.round((totalRhythm / scoredCount) * 10) / 10,
  phrase: Math.round((totalPhrase / scoredCount) * 10) / 10,
} : null;

// Add avgScores to the enriched session object
```

#### 1.3 Route Swap — Move Library to `/library`

**Create**: `apps/web/src/routes/library/+page.svelte`
**Contents**: Exact current content of `apps/web/src/routes/+page.svelte` (the Library page), with these link updates:
- FAB `href` changes from `resolve('/practice')` → `resolve('/')`
- Feedback banner link stays as `/practice/session/<id>#feedback` (still valid path)

**Rewrite**: `apps/web/src/routes/+page.svelte`
**Contents**: Current content of `apps/web/src/routes/practice/+page.svelte`, with these changes:
- All `resolve('/practice')` → `resolve('/')`
- All `goto(resolve('/practice'))` → `goto(resolve('/'))`
- The `?run=` param logic stays the same
- Add streak display and FAB (see 1.4 and 1.5)

**Delete**: `apps/web/src/routes/practice/+page.svelte` (content moved to root)

**Keep**: `apps/web/src/routes/practice/session/[id]/+page.svelte` stays at its current path (session detail pages)

#### 1.4 Update Navigation Links

**File**: `apps/web/src/routes/+layout.svelte`
**Changes**: Swap link order and hrefs

```svelte
<Header
  links={[
    { label: m.nav_practice(), href: '/' },
    { label: m.nav_library(), href: '/library' }
  ]}
  ...
/>
```

Also update settings page "back" link: `resolve('/')` → `resolve('/library')` or just `resolve('/')` (since Practice is now home).

**File**: `apps/web/src/routes/settings/+page.svelte`
**Changes**: Back link `href={resolve('/')}` is fine — now points to Practice (home).

#### 1.5 Streak Display on Practice Page

**File**: `apps/web/src/routes/+page.svelte` (the new Practice root)
**Changes**: Add streak query + display between heading and Quick Start card

```svelte
<!-- In script -->
const streak = useQuery(api.practiceSessions.getStreak, {});

<!-- In template, right after the <h1> -->
{#if streak.data}
  <div class="streak-display">
    <span class="streak-display__number">{streak.data.streak}</span>
    <span class="streak-display__label">isiqhelo siyayoyisa ingqondo</span>
  </div>
{/if}
```

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add streak display styles

```css
.streak-display {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.streak-display__number {
  font-family: var(--font-display);
  font-size: clamp(5rem, 15vw, 10rem);
  line-height: 0.85;
  letter-spacing: -0.02em;
  color: var(--primary);
}
.streak-display__label {
  font-size: var(--theme-kicker-size);
  letter-spacing: var(--theme-kicker-tracking);
  text-transform: uppercase;
  color: var(--muted-foreground);
  margin-top: 0.25rem;
}
```

#### 1.6 FAB on Practice Page

**File**: `apps/web/src/routes/+page.svelte` (Practice root)
**Changes**: Add FAB that auto-starts a session (replaces the simple link FAB from Library)

```svelte
<!-- At bottom of template, outside the main content div -->
{#if $isAuthenticated && !activePracticeSessionId}
  <button
    class="practice-fab"
    onclick={startPracticeSession}
    disabled={starting || !allPhrases.data || allPhrases.data.length === 0}
    aria-label={m.practice_fab_start()}
  >
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"
      fill="currentColor" stroke="none">
      <polygon points="5,3 19,12 5,21" />
    </svg>
  </button>
{/if}
```

The FAB uses a play icon (▶) and calls `startPracticeSession()` directly instead of navigating.

#### 1.7 Collapsible Recent Sessions with Scores

**File**: `apps/web/src/routes/+page.svelte` (Practice root)
**Changes**: Replace the flat `<ul>` recent sessions list with an `Accordion.Root`

```svelte
<Accordion.Root type="single" collapsible>
  <Accordion.Item value="recent">
    <Accordion.Trigger class="text-3xl sm:text-4xl font-display uppercase leading-heading tracking-heading hover:no-underline py-0 gap-2 text-start justify-start">
      <div>
        <span>{m.practice_recent()}</span>
        <p class="text-muted-foreground text-xs leading-relaxed font-body font-normal normal-case tracking-normal">
          {m.practice_recent_desc()}
        </p>
      </div>
    </Accordion.Trigger>
    <Accordion.Content>
      {#if practiceSessions.isLoading}
        <p class="meta-text">{m.practice_loading_sessions()}</p>
      {:else if !practiceSessions.data || practiceSessions.data.length === 0}
        <p class="meta-text">{m.practice_no_sessions()}</p>
      {:else}
        <ul class="space-y-3">
          {#each practiceSessions.data as session}
            <li>
              <a
                href={resolve(`/practice/session/${session._id}`)}
                class="flex items-center justify-between border border-border/60 bg-background/70 p-4 transition-colors hover:bg-background/90"
              >
                <div>
                  <span class="font-semibold">{relativeTime(session.startedAt)}</span>
                  <span class="meta-text ml-2">{m.library_phrase_count({ count: session.phraseCount })}</span>
                </div>
                {#if session.avgScores}
                  <div class="practice-review-trigger__scores">
                    <span class="practice-review-score" title={m.practice_score_sound()}>S{session.avgScores.sound}</span>
                    <span class="practice-review-score" title={m.practice_score_rhythm()}>R{session.avgScores.rhythm}</span>
                    <span class="practice-review-score" title={m.practice_score_phrase()}>P{session.avgScores.phrase}</span>
                  </div>
                {/if}
              </a>
            </li>
          {/each}
        </ul>
      {/if}
    </Accordion.Content>
  </Accordion.Item>
</Accordion.Root>
```

Note: Remove the wrapping `<Card.Root>` for recent sessions — the accordion replaces it. Keep the Card styling for Quick Start.

#### 1.8 i18n Keys

**Files**: `apps/web/messages/en.json`, `apps/web/messages/xh.json`
**Changes**: Add new keys

```json
// en.json additions
"practice_fab_start": "Start a new practice session",
"practice_streak_subtitle": "isiqhelo siyayoyisa ingqondo"

// xh.json additions
"practice_fab_start": "Qala iseshini entsha yokuziqeqesha",
"practice_streak_subtitle": "isiqhelo siyayoyisa ingqondo"
```

Note: The streak subtitle is already in isiXhosa by design — same in both locales.

#### 1.9 Update Internal Links

All references to old routes need updating:

| File | Old | New |
|---|---|---|
| `apps/web/src/routes/+page.svelte` (new Practice) | `resolve('/practice')` | `resolve('/')` |
| `apps/web/src/routes/library/+page.svelte` (new Library) | `resolve('/practice')` in FAB | `resolve('/')` |
| `apps/web/src/routes/practice/session/[id]/+page.svelte` | back link to `/practice` | back link to `/` |
| `apps/web/src/routes/session/[id]/+page.svelte` | if any links to `/` (Library) | `/library` |
| `apps/web/src/routes/settings/+page.svelte` | back link `resolve('/')` | fine — now points to Practice |

### Success Criteria

#### Automated Verification
- [x] `bun run build` succeeds
- [x] `bun run check` passes (pre-existing notifications.ts error only)
- [x] `npx convex dev --once` pushes schema + functions without error

#### Manual Verification
- [ ] Authenticated user lands on Practice page at `/`
- [ ] Streak number displays correctly (0 for new users, increments with practice)
- [ ] FAB button starts a new session immediately
- [ ] Recent sessions accordion collapses/expands
- [ ] Session cards show S/R/P scores when feedback exists
- [ ] Library accessible at `/library` with all existing functionality
- [ ] All nav links work correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual testing before Phase 2.

---

## Phase 2: Fine-Grained Categories

### Overview

Expand phrase categories from 10 → 16 with more specific groupings. Re-categorize existing phrases.

### Changes Required

#### 2.1 Expand Category Definitions

**File**: `convex/lib/phraseCategories.ts`
**Changes**: Replace `PHRASE_CATEGORIES` array with expanded set

```ts
export const PHRASE_CATEGORIES: readonly PhraseCategory[] = [
  {
    key: 'formal_introductions',
    label: 'Formal Introductions',
    keywords: ['name is', 'introduce', 'pleased to meet', 'who are you', 'where are you from', 'i come from']
  },
  {
    key: 'daily_greetings',
    label: 'Day-to-Day Greetings',
    keywords: ['hello', 'hi', 'good morning', 'good evening', 'good night', 'how are you', 'i am fine', 'goodbye', 'see you', 'molo', 'molweni']
  },
  {
    key: 'polite_expressions',
    label: 'Polite Expressions',
    keywords: ['please', 'thank you', 'sorry', 'excuse me', 'pardon', 'you\'re welcome', 'no problem', 'bless']
  },
  {
    key: 'asking_about_family',
    label: 'Asking About Family',
    keywords: ['mother', 'father', 'brother', 'sister', 'child', 'children', 'wife', 'husband', 'parents', 'grandmother', 'grandfather', 'family', 'baby', 'son', 'daughter']
  },
  {
    key: 'friendships_social',
    label: 'Friendships & Social',
    keywords: ['friend', 'visit', 'together', 'invite', 'gathering', 'party', 'neighbour', 'neighbor', 'community']
  },
  {
    key: 'catching_up',
    label: 'Catching Up',
    keywords: ['how have you been', 'long time', 'what\'s new', 'tell me about', 'what happened', 'news', 'lately', 'miss you', 'haven\'t seen']
  },
  {
    key: 'making_plans',
    label: 'Making Plans',
    keywords: ['let\'s', 'shall we', 'weekend', 'meet up', 'appointment', 'plan', 'arrange', 'schedule', 'available']
  },
  {
    key: 'expressing_feelings',
    label: 'Expressing Feelings & Opinions',
    keywords: ['happy', 'sad', 'angry', 'love', 'afraid', 'think', 'feel', 'believe', 'worried', 'excited', 'tired', 'bored', 'hope', 'wish']
  },
  {
    key: 'directions_navigation',
    label: 'Directions & Finding Places',
    keywords: ['where is', 'left', 'right', 'straight', 'street', 'road', 'map', 'near', 'far', 'turn', 'corner', 'next to']
  },
  {
    key: 'daily_routines',
    label: 'Daily Routines',
    keywords: ['wake up', 'morning', 'night', 'home', 'work', 'sleep', 'eat breakfast', 'lunch', 'dinner', 'shower', 'school', 'office']
  },
  {
    key: 'food_drink',
    label: 'Food & Drink',
    keywords: ['food', 'eat', 'drink', 'water', 'tea', 'coffee', 'hungry', 'restaurant', 'menu', 'cook', 'bread', 'meat', 'rice', 'thirsty']
  },
  {
    key: 'shopping_money',
    label: 'Shopping & Money',
    keywords: ['buy', 'price', 'cost', 'money', 'pay', 'shop', 'cheap', 'expensive', 'rand', 'change', 'market', 'store']
  },
  {
    key: 'transport_travel',
    label: 'Transport & Travel',
    keywords: ['bus', 'taxi', 'car', 'train', 'airport', 'travel', 'ticket', 'station', 'drive', 'walk', 'trip', 'journey']
  },
  {
    key: 'health_safety',
    label: 'Health & Safety',
    keywords: ['help', 'doctor', 'hospital', 'pain', 'sick', 'medicine', 'emergency', 'police', 'headache', 'fever', 'clinic', 'hurt']
  },
  {
    key: 'time_weather',
    label: 'Time, Dates & Weather',
    keywords: ['time', 'clock', 'date', 'day', 'week', 'month', 'rain', 'sun', 'weather', 'today', 'tomorrow', 'yesterday', 'cold', 'hot', 'wind']
  },
  {
    key: 'general_conversation',
    label: 'General Conversation',
    keywords: ['yes', 'no', 'maybe', 'okay', 'what', 'why', 'how', 'can you', 'do you', 'i want', 'i need', 'i like']
  }
] as const;
```

Key splits:
- Old `introductions` → `formal_introductions` + `daily_greetings`
- Old `daily_basics` → `daily_routines` (+ keywords pulled into `time_weather`)
- Old `family_relationships` → `asking_about_family` + `friendships_social`
- Old `general_conversation` → `polite_expressions` + `catching_up` + `making_plans` + `expressing_feelings` + `general_conversation` (slimmed fallback)
- New: `catching_up`, `making_plans`, `expressing_feelings`

#### 2.2 Re-categorize Existing Phrases

**File**: `convex/phrases.ts`
**Changes**: Add a migration-style internal mutation

```ts
export const recategorizeAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const phrases = await ctx.db.query('phrases').collect();
    for (const phrase of phrases) {
      const category = inferPhraseCategory(phrase.english, phrase.translation);
      if (phrase.categoryKey !== category.key) {
        await ctx.db.patch(phrase._id, {
          categoryKey: category.key,
          categoryLabel: category.label
        });
      }
    }
  }
});
```

Run once after deploying the new categories: `npx convex run phrases:recategorizeAll`

Note: `inferPhraseCategory` is order-dependent. More specific categories are listed first so they match before the broader fallback. The keyword lists are designed to avoid false positives.

### Success Criteria

#### Automated Verification
- [x] `npx convex dev --once` pushes without error
- [x] `bun run build` succeeds

#### Manual Verification
- [ ] Library groups now show finer categories
- [ ] "How are you?" lands in `daily_greetings`, not `general_conversation`
- [ ] "My mother is..." lands in `asking_about_family`, not old broad `family_relationships`
- [ ] Existing phrases re-categorized correctly after running migration

**Implementation Note**: Pause for manual verification of category accuracy before Phase 3.

---

## Phase 3: Theory Page

### Overview

Static `/theory` page with a thorough isiXhosa language primer. Accessible from profile dropdown.

### Changes Required

#### 3.1 Create Theory Route

**Create**: `apps/web/src/routes/theory/+page.svelte`

Static page with i18n'd content covering:
1. **Welcome** — what to expect, audio-first mindset
2. **Click consonants** — the 3 clicks (c, q, x), why audio > text for learning these
3. **Agglutinative structure** — how words build by stacking prefixes/suffixes
4. **Noun classes** — 15+ classes, concordial agreement, pattern-based grammar
5. **Vowel system** — 5 pure vowels, pronunciation guide
6. **Tone** — meaningful pitch differences
7. **Common patterns** — subject concords, verb structure, negation

Layout: single scrollable page using `page-shell page-shell--narrow page-stack`, with `<h2>` section headers and `<p>` body text. Use existing typography classes.

```svelte
<script lang="ts">
  import { resolve } from '$app/paths';
  import * as m from '$lib/paraglide/messages.js';
</script>

<div class="page-shell page-shell--narrow page-stack">
  <header class="page-stack">
    <a href={resolve('/')} class="meta-text underline">&larr; {m.theory_back()}</a>
    <p class="info-kicker">{m.theory_kicker()}</p>
    <h1 class="text-5xl sm:text-6xl">{m.theory_title()}</h1>
    <p class="meta-text mt-3 max-w-2xl">{m.theory_intro()}</p>
  </header>

  <!-- Sections rendered from i18n message keys -->
  <!-- theory_section_clicks_title, theory_section_clicks_body, etc. -->
  ...
</div>
```

#### 3.2 Add Theory Link to Profile Dropdown

**File**: `packages/ui/src/components/header/Header.svelte`
**Changes**: Add `theoryHref` and `theoryLabel` props, render as dropdown item above Settings

```ts
// Add to Props interface
theoryHref?: string;
theoryLabel?: string;
```

```svelte
<!-- Add before Settings item -->
{#if theoryLabel}
  <DropdownMenu.Item onclick={() => goto(r(theoryHref ?? '/theory'))} style="padding: 10px; margin: 0 8px; font-size: 1rem;">
    {theoryLabel}
  </DropdownMenu.Item>
{/if}
```

**File**: `apps/web/src/routes/+layout.svelte`
**Changes**: Pass theory props to Header

```svelte
<Header
  ...
  theoryLabel={m.nav_theory()}
  theoryHref="/theory"
/>
```

#### 3.3 i18n Keys

**Files**: All 4 message files (en + xh for both shared and web)

Shared (`packages/shared/messages/`):
```json
"nav_theory": "How isiXhosa Works"
// xh: "Indlela isiXhosa Esisebenza Ngayo"
```

Web (`apps/web/messages/`):
```json
"theory_back": "Back",
"theory_kicker": "Language Overview",
"theory_title": "How isiXhosa Works",
"theory_intro": "isiXhosa is a Nguni Bantu language spoken by ~8 million people in South Africa. Understanding a few core patterns will transform how you hear and speak it.",

"theory_section_clicks_title": "Click Consonants",
"theory_section_clicks_body": "isiXhosa has three click sounds, written as 'c', 'q', and 'x'. Each represents a different tongue placement...",
// (full body text for each section — approximately 8-10 paragraphs total)

"theory_section_agglutination_title": "Words Build Like Lego",
"theory_section_agglutination_body": "isiXhosa is agglutinative — words are built by stacking meaningful pieces together...",

"theory_section_noun_classes_title": "15+ Noun Classes",
"theory_section_noun_classes_body": "Where English has 'the' and 'a', isiXhosa has noun classes. Each class has its own prefix...",

"theory_section_vowels_title": "Five Pure Vowels",
"theory_section_vowels_body": "isiXhosa has five vowels: a, e, i, o, u. Each is always pronounced the same way...",

"theory_section_tone_title": "Tone Matters",
"theory_section_tone_body": "isiXhosa is a tonal language. The pitch of a syllable can change the meaning of a word entirely...",

"theory_section_patterns_title": "Grammar is Patterns, Not Rules",
"theory_section_patterns_body": "The subject concord (a prefix on the verb) agrees with the noun class of the subject..."
```

Xhosa translations prefixed with `[TODO]` where needed.

### Success Criteria

#### Automated Verification
- [x] `bun run build` succeeds
- [x] `bun run check` passes

#### Manual Verification
- [ ] Theory page accessible from profile dropdown
- [ ] All sections render with proper typography
- [ ] Page scrolls cleanly on mobile
- [ ] Back link returns to Practice (home)

---

## Phase 4: Profile Picture Upload

### Overview

Add profile image storage, upload flow in settings, and display in header avatar.

### Changes Required

#### 4.1 Schema Update

**File**: `convex/schema.ts`
**Changes**: Add `profileImageStorageId` to `userPreferences`

```ts
userPreferences: defineTable({
  ...existing fields,
  profileImageStorageId: v.optional(v.string()) // Convex storage ID
}).index('by_user', ['userId']),
```

#### 4.2 Upload Mutations

**File**: `convex/preferences.ts`
**Changes**:
- Add `profileImageStorageId` to `upsert` mutation args
- Add a `getProfileImageUrl` query that resolves the storage URL

```ts
export const getProfileImageUrl = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const prefs = await ctx.db
      .query('userPreferences')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (!prefs?.profileImageStorageId) return null;
    return await ctx.storage.getUrl(prefs.profileImageStorageId);
  }
});
```

Add `profileImageStorageId` to the `upsert` mutation's args and patch/insert logic (same pattern as existing fields).

#### 4.3 Settings Upload UI

**File**: `apps/web/src/routes/settings/+page.svelte`
**Changes**: Add a Profile Picture card section (first card, before Language)

```svelte
<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
  <Card.Header>
    <Card.Title>{m.settings_profile_pic_title()}</Card.Title>
    <Card.Description>{m.settings_profile_pic_desc()}</Card.Description>
  </Card.Header>
  <Card.Content class="flex items-center gap-6">
    <div class="settings-avatar">
      {#if profileImageUrl.data}
        <img src={profileImageUrl.data} alt="" class="settings-avatar__img" />
      {:else}
        <svg ...><!-- same silhouette SVG as header --></svg>
      {/if}
    </div>
    <div>
      <input type="file" accept="image/*" id="avatar-upload" class="hidden" onchange={handleAvatarUpload} />
      <Button variant="outline" onclick={() => document.getElementById('avatar-upload')?.click()} disabled={uploadingAvatar}>
        {uploadingAvatar ? m.settings_profile_pic_uploading() : m.settings_profile_pic_change()}
      </Button>
    </div>
  </Card.Content>
</Card.Root>
```

Upload handler:
```ts
async function handleAvatarUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  uploadingAvatar = true;
  try {
    const uploadUrl = await client.mutation(api.audioUploads.generateUploadUrl, {});
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: { 'Content-Type': file.type },
      body: file
    });
    const { storageId } = await res.json();
    await client.mutation(api.preferences.upsert, { profileImageStorageId: storageId });
  } finally {
    uploadingAvatar = false;
  }
}
```

Note: Reuses existing `audioUploads.generateUploadUrl` — it's a generic Convex upload URL generator, not audio-specific.

#### 4.4 Header Avatar Display

**File**: `packages/ui/src/components/header/Header.svelte`
**Changes**: Add `avatarUrl` prop, conditionally render image instead of SVG

```ts
// Add to Props
avatarUrl?: string | null;
```

```svelte
<DropdownMenu.Trigger class="app-header__avatar" aria-label={profileAriaLabel}>
  {#if avatarUrl}
    <img src={avatarUrl} alt="" class="app-header__avatar-img" />
  {:else}
    <svg ...><!-- existing silhouette --></svg>
  {/if}
</DropdownMenu.Trigger>
```

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add avatar image styles

```css
.app-header__avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.settings-avatar {
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  overflow: hidden;
  background: var(--muted);
  display: flex;
  align-items: center;
  justify-content: center;
}
.settings-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

**File**: `apps/web/src/routes/+layout.svelte`
**Changes**: Query profile image URL and pass to Header

```svelte
const profileImage = useQuery(api.preferences.getProfileImageUrl, () =>
  $isAuthenticated ? {} : 'skip'
);

<Header
  ...
  avatarUrl={profileImage.data ?? null}
/>
```

#### 4.5 i18n Keys

```json
// en.json
"settings_profile_pic_title": "Profile Picture",
"settings_profile_pic_desc": "Upload a photo for your profile.",
"settings_profile_pic_change": "Change Photo",
"settings_profile_pic_uploading": "Uploading..."

// xh.json
"settings_profile_pic_title": "[TODO] Profile Picture",
"settings_profile_pic_desc": "[TODO] Upload a photo for your profile.",
"settings_profile_pic_change": "[TODO] Change Photo",
"settings_profile_pic_uploading": "[TODO] Uploading..."
```

### Success Criteria

#### Automated Verification
- [x] `npx convex dev --once` pushes schema without error
- [x] `bun run build` succeeds
- [x] `bun run check` passes (pre-existing notifications.ts error only)

#### Manual Verification
- [ ] Upload flow works in settings — selecting image uploads and displays
- [ ] Avatar shows in header after upload
- [ ] Fallback SVG shows when no image uploaded
- [ ] Image persists across page refreshes

**Implementation Note**: Pause for manual verification before Phase 5.

---

## Phase 5: Vocabulary Flashcards

### Overview

Hardcoded vocabulary sets with Unsplash images in a flashcard UI accessible from the Practice page. ~15 categories, ~10-20 items each.

### Changes Required

#### 5.1 Vocabulary Data

**Create**: `convex/lib/vocabularySets.ts`

Hardcoded vocabulary data structure:

```ts
export interface VocabularyItem {
  english: string;
  xhosa: string;
  searchTerm: string; // for Unsplash query (may differ from english, e.g. "3 three" → "three")
}

export interface VocabularySet {
  key: string;
  label: string;
  icon: string; // emoji for visual identity in the picker
  items: VocabularyItem[];
}

export const VOCABULARY_SETS: readonly VocabularySet[] = [
  {
    key: 'colors',
    label: 'Colours',
    icon: '🎨',
    items: [
      { english: 'Red', xhosa: 'Bomvu', searchTerm: 'red color' },
      { english: 'Blue', xhosa: 'Luhlaza okwesibhakabhaka', searchTerm: 'blue color' },
      { english: 'Green', xhosa: 'Luhlaza', searchTerm: 'green color' },
      { english: 'Yellow', xhosa: 'Mthubi', searchTerm: 'yellow color' },
      { english: 'Black', xhosa: 'Mnyama', searchTerm: 'black color' },
      { english: 'White', xhosa: 'Mhlophe', searchTerm: 'white color' },
      { english: 'Orange', xhosa: 'Orenji', searchTerm: 'orange color' },
      { english: 'Purple', xhosa: 'Mfusa', searchTerm: 'purple color' },
      { english: 'Brown', xhosa: 'Mdaka', searchTerm: 'brown color' },
      { english: 'Pink', xhosa: 'Pinki', searchTerm: 'pink color' },
    ]
  },
  {
    key: 'numbers',
    label: 'Numbers (1-20)',
    icon: '🔢',
    items: [
      { english: '1 — One', xhosa: 'Nye', searchTerm: 'one' },
      { english: '2 — Two', xhosa: 'Mbini', searchTerm: 'two' },
      // ... through 20
    ]
  },
  {
    key: 'animals',
    label: 'Animals',
    icon: '🦁',
    items: [
      { english: 'Dog', xhosa: 'Inja', searchTerm: 'dog' },
      { english: 'Cat', xhosa: 'Ikati', searchTerm: 'cat' },
      { english: 'Cow', xhosa: 'Inkomo', searchTerm: 'cow' },
      { english: 'Horse', xhosa: 'Ihashe', searchTerm: 'horse' },
      { english: 'Chicken', xhosa: 'Inkuku', searchTerm: 'chicken' },
      { english: 'Lion', xhosa: 'Ingonyama', searchTerm: 'lion' },
      { english: 'Elephant', xhosa: 'Indlovu', searchTerm: 'elephant' },
      // ... 12-15 items
    ]
  },
  {
    key: 'transport',
    label: 'Transport',
    icon: '🚌',
    items: [
      { english: 'Car', xhosa: 'Imoto', searchTerm: 'car' },
      { english: 'Bus', xhosa: 'Ibhasi', searchTerm: 'bus' },
      { english: 'Taxi', xhosa: 'Iteksi', searchTerm: 'taxi minibus' },
      { english: 'Train', xhosa: 'Uloliwe', searchTerm: 'train' },
      { english: 'Bicycle', xhosa: 'Ibhayisekile', searchTerm: 'bicycle' },
      { english: 'Aeroplane', xhosa: 'Inqwelomoya', searchTerm: 'airplane' },
      // ... 10 items
    ]
  },
  {
    key: 'body_parts',
    label: 'Body Parts',
    icon: '🦴',
    items: [
      { english: 'Head', xhosa: 'Intloko', searchTerm: 'head face' },
      { english: 'Hand', xhosa: 'Isandla', searchTerm: 'hand' },
      { english: 'Eye', xhosa: 'Iliso', searchTerm: 'eye' },
      { english: 'Mouth', xhosa: 'Umlomo', searchTerm: 'mouth' },
      { english: 'Foot', xhosa: 'Unyawo', searchTerm: 'foot' },
      // ... 12 items
    ]
  },
  {
    key: 'clothing',
    label: 'Clothing',
    icon: '👕',
    items: [
      { english: 'Shirt', xhosa: 'Ihempe', searchTerm: 'shirt' },
      { english: 'Trousers', xhosa: 'Ibhulukhwe', searchTerm: 'trousers' },
      { english: 'Shoes', xhosa: 'Izihlangu', searchTerm: 'shoes' },
      { english: 'Hat', xhosa: 'Umnqwazi', searchTerm: 'hat' },
      { english: 'Dress', xhosa: 'Ilokhwe', searchTerm: 'dress' },
      // ... 10 items
    ]
  },
  {
    key: 'food',
    label: 'Food',
    icon: '🍞',
    items: [
      { english: 'Bread', xhosa: 'Isonka', searchTerm: 'bread' },
      { english: 'Meat', xhosa: 'Inyama', searchTerm: 'meat' },
      { english: 'Rice', xhosa: 'Irayisi', searchTerm: 'rice' },
      { english: 'Milk', xhosa: 'Ubisi', searchTerm: 'milk' },
      { english: 'Egg', xhosa: 'Iqanda', searchTerm: 'egg' },
      // ... 12 items
    ]
  },
  {
    key: 'drinks',
    label: 'Drinks',
    icon: '☕',
    items: [
      { english: 'Water', xhosa: 'Amanzi', searchTerm: 'glass of water' },
      { english: 'Tea', xhosa: 'Iti', searchTerm: 'cup of tea' },
      { english: 'Coffee', xhosa: 'Ikofu', searchTerm: 'coffee cup' },
      { english: 'Juice', xhosa: 'Ijusi', searchTerm: 'juice' },
      // ... 8 items
    ]
  },
  {
    key: 'fruits_vegetables',
    label: 'Fruits & Vegetables',
    icon: '🍎',
    items: [
      { english: 'Apple', xhosa: 'I-apile', searchTerm: 'apple fruit' },
      { english: 'Banana', xhosa: 'Ibhanana', searchTerm: 'banana' },
      { english: 'Tomato', xhosa: 'Itumato', searchTerm: 'tomato' },
      { english: 'Potato', xhosa: 'Itapile', searchTerm: 'potato' },
      { english: 'Onion', xhosa: 'Itswele', searchTerm: 'onion' },
      // ... 12 items
    ]
  },
  {
    key: 'family_members',
    label: 'Family Members',
    icon: '👨‍👩‍👧‍👦',
    items: [
      { english: 'Mother', xhosa: 'UMama', searchTerm: 'mother' },
      { english: 'Father', xhosa: 'UTata', searchTerm: 'father' },
      { english: 'Brother', xhosa: 'Umntakwethu (m)', searchTerm: 'brother' },
      { english: 'Sister', xhosa: 'Udadewethu (f)', searchTerm: 'sister' },
      { english: 'Grandmother', xhosa: 'UMakhulu', searchTerm: 'grandmother' },
      { english: 'Grandfather', xhosa: 'UTatomkhulu', searchTerm: 'grandfather' },
      // ... 10 items
    ]
  },
  {
    key: 'days_of_week',
    label: 'Days of the Week',
    icon: '📅',
    items: [
      { english: 'Monday', xhosa: 'UMvulo', searchTerm: 'monday' },
      { english: 'Tuesday', xhosa: 'ULwesibini', searchTerm: 'tuesday' },
      { english: 'Wednesday', xhosa: 'ULwesithathu', searchTerm: 'wednesday' },
      { english: 'Thursday', xhosa: 'ULwesine', searchTerm: 'thursday' },
      { english: 'Friday', xhosa: 'ULwesihlanu', searchTerm: 'friday' },
      { english: 'Saturday', xhosa: 'UMgqibelo', searchTerm: 'saturday' },
      { english: 'Sunday', xhosa: 'ICawa', searchTerm: 'sunday' },
    ]
  },
  {
    key: 'weather',
    label: 'Weather',
    icon: '🌤️',
    items: [
      { english: 'Sun', xhosa: 'Ilanga', searchTerm: 'sun sky' },
      { english: 'Rain', xhosa: 'Imvula', searchTerm: 'rain' },
      { english: 'Wind', xhosa: 'Umoya', searchTerm: 'wind' },
      { english: 'Cloud', xhosa: 'Ilifu', searchTerm: 'cloud' },
      { english: 'Cold', xhosa: 'Kubanda', searchTerm: 'cold weather' },
      { english: 'Hot', xhosa: 'Kushushu', searchTerm: 'hot weather sun' },
      // ... 8 items
    ]
  },
  {
    key: 'household',
    label: 'Household Items',
    icon: '🏠',
    items: [
      { english: 'Table', xhosa: 'Itafile', searchTerm: 'table furniture' },
      { english: 'Chair', xhosa: 'Isitulo', searchTerm: 'chair' },
      { english: 'Bed', xhosa: 'Ibhedi', searchTerm: 'bed' },
      { english: 'Door', xhosa: 'Ucango', searchTerm: 'door' },
      { english: 'Window', xhosa: 'Ifestile', searchTerm: 'window' },
      // ... 10 items
    ]
  },
  {
    key: 'emotions',
    label: 'Emotions',
    icon: '😊',
    items: [
      { english: 'Happy', xhosa: 'Onwabile', searchTerm: 'happy person' },
      { english: 'Sad', xhosa: 'Lusizi', searchTerm: 'sad person' },
      { english: 'Angry', xhosa: 'Nomsindo', searchTerm: 'angry person' },
      { english: 'Scared', xhosa: 'Oyikayo', searchTerm: 'scared person' },
      { english: 'Tired', xhosa: 'Udiniwe', searchTerm: 'tired person' },
      { english: 'Surprised', xhosa: 'Umangalisiwe', searchTerm: 'surprised person' },
      // ... 8 items
    ]
  },
  {
    key: 'places',
    label: 'Places',
    icon: '📍',
    items: [
      { english: 'Home', xhosa: 'Ikhaya', searchTerm: 'home house' },
      { english: 'School', xhosa: 'Isikolo', searchTerm: 'school' },
      { english: 'Church', xhosa: 'Icawe', searchTerm: 'church' },
      { english: 'Shop', xhosa: 'Ivenkile', searchTerm: 'shop store' },
      { english: 'Hospital', xhosa: 'Isibhedlele', searchTerm: 'hospital' },
      // ... 10 items
    ]
  }
];
```

**~15 sets, ~10-15 items each = ~150-200 vocabulary items total**

#### 5.2 Unsplash API Integration

**Create**: `convex/unsplash.ts`

Convex action that fetches a random photo from Unsplash:

```ts
import { action } from './_generated/server';
import { v } from 'convex/values';

export const getRandomPhoto = action({
  args: { query: v.string() },
  handler: async (ctx, { query }) => {
    const accessKey = process.env.UNSPLASH_ACCESS_KEY;
    if (!accessKey) throw new Error('UNSPLASH_ACCESS_KEY not configured');

    const url = new URL('https://api.unsplash.com/photos/random');
    url.searchParams.set('query', query);
    url.searchParams.set('orientation', 'squarish');
    url.searchParams.set('content_filter', 'high'); // safe content only

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Client-ID ${accessKey}` }
    });

    if (!res.ok) {
      // Fallback — return null, UI will show a placeholder
      return null;
    }

    const data = await res.json();
    return {
      url: data.urls.regular, // 1080w
      thumbUrl: data.urls.small, // 400w
      alt: data.alt_description ?? query,
      photographerName: data.user.name,
      photographerUrl: data.user.links.html,
      unsplashUrl: data.links.html
    };
  }
});
```

**Env var needed**: `UNSPLASH_ACCESS_KEY` — set via `npx convex env set UNSPLASH_ACCESS_KEY <key>`

Unsplash free tier: 50 requests/hour. Since `photos/random` returns a different image each time, this naturally gives a fresh image per flashcard view.

#### 5.3 Flashcard UI — Set Picker

**Create**: `apps/web/src/routes/vocabulary/+page.svelte`

Grid of set cards, each showing the emoji icon + label + item count:

```svelte
<script lang="ts">
  import { resolve } from '$app/paths';
  import * as m from '$lib/paraglide/messages.js';
  // Import vocabulary sets data (via a Convex query that returns the static data,
  // or import directly if we make it a shared package)
</script>

<div class="page-shell page-shell--narrow page-stack">
  <header class="page-stack">
    <a href={resolve('/')} class="meta-text underline">&larr; {m.vocab_back()}</a>
    <p class="info-kicker">{m.vocab_kicker()}</p>
    <h1 class="text-5xl sm:text-6xl">{m.vocab_title()}</h1>
    <p class="meta-text mt-3">{m.vocab_desc()}</p>
  </header>

  <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
    {#each vocabularySets as set}
      <a
        href={resolve(`/vocabulary/${set.key}`)}
        class="vocab-set-card"
      >
        <span class="vocab-set-card__icon">{set.icon}</span>
        <span class="vocab-set-card__label">{set.label}</span>
        <span class="vocab-set-card__count">{set.items.length} words</span>
      </a>
    {/each}
  </div>
</div>
```

#### 5.4 Flashcard UI — Card View

**Create**: `apps/web/src/routes/vocabulary/[set]/+page.svelte`

Swipeable/tappable flashcard flow:

```svelte
<script lang="ts">
  import { page } from '$app/state';
  import { resolve } from '$app/paths';
  import { useConvexClient } from 'convex-svelte';
  import { api } from '@babylon/convex';
  import { fly } from 'svelte/transition';
  import * as m from '$lib/paraglide/messages.js';

  const client = useConvexClient();
  const setKey = $derived(page.params.set);
  // Look up vocabulary set from static data
  // ...

  let currentIndex = $state(0);
  let imageData = $state<{ url: string; alt: string; photographerName: string; photographerUrl: string } | null>(null);
  let imageLoading = $state(false);

  const currentItem = $derived(set?.items[currentIndex] ?? null);

  // Fetch Unsplash image when card changes
  $effect(() => {
    if (currentItem) {
      loadImage(currentItem.searchTerm);
    }
  });

  async function loadImage(searchTerm: string) {
    imageLoading = true;
    try {
      const result = await client.action(api.unsplash.getRandomPhoto, { query: searchTerm });
      imageData = result;
    } catch {
      imageData = null;
    } finally {
      imageLoading = false;
    }
  }

  function next() {
    if (currentIndex < set.items.length - 1) currentIndex++;
  }
  function prev() {
    if (currentIndex > 0) currentIndex--;
  }
</script>

<div class="vocab-session">
  <div class="vocab-session__header">
    <a href={resolve('/vocabulary')} class="meta-text underline">&larr; {m.vocab_back_to_sets()}</a>
    <p class="info-kicker">{set.icon} {set.label}</p>
    <p class="meta-text">{currentIndex + 1} / {set.items.length}</p>
  </div>

  <div class="vocab-session__card">
    {#key currentIndex}
      <div class="vocab-flashcard" in:fly={{ x: 200, duration: 320 }} out:fly={{ x: -200, duration: 320 }}>
        <div class="vocab-flashcard__image">
          {#if imageLoading}
            <div class="vocab-flashcard__placeholder">...</div>
          {:else if imageData}
            <img src={imageData.url} alt={imageData.alt} />
            <p class="vocab-flashcard__attribution">
              Photo by <a href={imageData.photographerUrl} target="_blank" rel="noopener">{imageData.photographerName}</a>
            </p>
          {:else}
            <div class="vocab-flashcard__placeholder">{currentItem?.english}</div>
          {/if}
        </div>
        <div class="vocab-flashcard__text">
          <p class="text-2xl font-semibold">{currentItem?.english}</p>
          <p class="target-phrase font-black mt-2">{currentItem?.xhosa}</p>
        </div>
      </div>
    {/key}
  </div>

  <div class="vocab-session__controls">
    <button onclick={prev} disabled={currentIndex === 0}>← Prev</button>
    <button onclick={next} disabled={currentIndex >= set.items.length - 1}>Next →</button>
  </div>
</div>
```

#### 5.5 Link from Practice Page

**File**: `apps/web/src/routes/+page.svelte` (Practice root)
**Changes**: Add a "Vocabulary" card below the Quick Start card when no active session

```svelte
<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
  <Card.Content>
    <div class="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
      <div class="space-y-2">
        <p class="info-kicker">{m.practice_vocab_kicker()}</p>
        <p class="text-xl font-semibold">{m.practice_vocab_title()}</p>
        <p class="meta-text">{m.practice_vocab_desc()}</p>
      </div>
      <a href={resolve('/vocabulary')} class="inline-flex items-center justify-center ...button-styles...">
        {m.practice_vocab_go()}
      </a>
    </div>
  </Card.Content>
</Card.Root>
```

#### 5.6 CSS

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add vocabulary flashcard styles

```css
.vocab-set-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.5rem 1rem;
  border: 1px solid var(--border);
  background: var(--background);
  transition: background 0.15s;
}
.vocab-set-card:hover { background: var(--secondary); }
.vocab-set-card__icon { font-size: 2rem; }
.vocab-set-card__label { font-family: var(--font-display); font-size: 1.1rem; text-transform: uppercase; letter-spacing: 0.05em; }
.vocab-set-card__count { font-size: 0.75rem; color: var(--muted-foreground); }

.vocab-session { display: grid; grid-template-rows: auto 1fr auto; min-height: 80vh; padding: var(--page-block) var(--page-inline); max-width: 40rem; margin: 0 auto; }
.vocab-flashcard { text-align: center; }
.vocab-flashcard__image { aspect-ratio: 1; max-height: 50vh; overflow: hidden; margin-bottom: 1.5rem; }
.vocab-flashcard__image img { width: 100%; height: 100%; object-fit: cover; }
.vocab-flashcard__placeholder { width: 100%; height: 100%; background: var(--muted); display: flex; align-items: center; justify-content: center; font-size: 3rem; color: var(--muted-foreground); }
.vocab-flashcard__attribution { font-size: 0.65rem; color: var(--muted-foreground); margin-top: 0.25rem; }
.vocab-flashcard__attribution a { text-decoration: underline; }
.vocab-session__controls { display: flex; justify-content: center; gap: 1rem; padding: 1rem 0; }
```

#### 5.7 i18n Keys

```json
// en.json additions
"vocab_back": "Back to Practice",
"vocab_kicker": "Build Your Vocabulary",
"vocab_title": "Vocabulary Sets",
"vocab_desc": "Learn isiXhosa words by category with visual flashcards.",
"vocab_back_to_sets": "Back to Sets",
"practice_vocab_kicker": "Vocabulary",
"practice_vocab_title": "Learn New Words",
"practice_vocab_desc": "Build vocabulary with visual flashcards before practicing phrases.",
"practice_vocab_go": "Browse Sets"
```

### Success Criteria

#### Automated Verification
- [x] `npx convex dev --once` pushes without error (Unsplash action)
- [x] `bun run build` succeeds
- [x] `bun run check` passes
- [ ] `UNSPLASH_ACCESS_KEY` env var set in Convex

#### Manual Verification
- [ ] Vocabulary card visible on Practice page
- [ ] Set picker grid shows all ~15 sets
- [ ] Clicking a set opens flashcard view
- [ ] Unsplash images load for each card (different each time)
- [ ] Prev/Next navigation works
- [ ] Attribution displays correctly
- [ ] Fallback placeholder shows when Unsplash fails
- [ ] Mobile layout works

---

## Testing Strategy

### Automated
- Convex function type checking via `npx convex dev --once`
- SvelteKit build + svelte-check for type errors
- Existing test suite (if any) via `bun run test`

### Manual Testing Steps
1. Fresh login → lands on Practice page (not Library)
2. Practice session → end → streak increments to 1
3. Next day practice → streak shows 2
4. Check Library at `/library` — categories are more specific
5. Profile dropdown → Theory page → read through sections
6. Settings → upload profile pic → header shows it
7. Practice page → Vocabulary card → pick Colors → flip through flashcards
8. Verify all flows on mobile viewport

## Performance Considerations

- **Streak query**: Fetches all user sessions. For power users with 100s of sessions this could be slow. Optimization path: add a `streakDays` field on `userPreferences` and update it in the `end` mutation. Not needed for v1.
- **Session list scores**: Now fetches `aiFeedback` per attempt per session. Paginate `list` query to 20 most recent sessions max.
- **Unsplash rate limit**: 50 req/hour on free tier. For a single user flipping through ~15 cards per set, this is fine. If multiple concurrent users hit it, consider caching results in a Convex table.

## Migration Notes

- Route change (`/` → `/library`, `/practice` → `/`) may break bookmarks. Consider adding a redirect: `apps/web/src/routes/practice/+page.ts` that does `redirect(301, '/')`.
- Existing phrases get re-categorized via `recategorizeAll` internal mutation — run once after deploy.
- `UNSPLASH_ACCESS_KEY` env var must be set before flashcards work.

## References

- Convex file storage: used by `convex/audioUploads.ts` (existing pattern)
- Unsplash API docs: `https://unsplash.com/documentation`
- Existing category system: `convex/lib/phraseCategories.ts`
- Practice page: `apps/web/src/routes/practice/+page.svelte`
- Header component: `packages/ui/src/components/header/Header.svelte`
