# i18n — Full UI Internationalization (English + isiXhosa)

## Overview

Add Paraglide JS to both SvelteKit apps so every UI string renders in the user's chosen language. Starting with English (base) + isiXhosa, extensible to more. Cookie-only strategy (no URL prefix). ~230 strings across ~20 files.

## Current State

- Zero i18n infrastructure — all ~230 UI strings hardcoded in English
- Both apps have identical `hooks.server.ts` (auth token only)
- Neither app has `hooks.ts`
- `app.html` in both apps has `<html lang="en">` hardcoded
- `userPreferences` has no `uiLocale` field
- Backend `convex/lib/languages.ts` handles learning languages only
- CSS class `xhosa-phrase` used in 3 locations (language-specific naming)

## Desired End State

- User picks language in Settings, all UI chrome immediately switches
- Choice persists across sessions via cookie + `userPreferences.uiLocale`
- Every user-visible string (buttons, labels, errors, loading states, tooltips, headings) uses `m.key()` calls
- Zero hardcoded English strings remain in templates
- Adding a new language = creating one new JSON file + translating

### Verification

- Switch to isiXhosa in settings → every UI element renders in Xhosa
- Refresh page → language persists (cookie)
- Log in on new device → language persists (Convex `uiLocale`)
- `bun run check` passes in both apps (type safety on all message keys)
- `bun run build` succeeds in both apps

## What We're NOT Doing

- URL-based locale routing (no `/xh/practice` prefixes)
- Translating learning content (phrases, verifier feedback text from AI)
- Translating `manifest.json` or `sw.js` (deferred to polish phase)
- Translating the app name "Language Recall"
- Right-to-left (RTL) support (no RTL languages in scope)

## Implementation Approach

Install Paraglide per-app with shared message files in `packages/shared/messages/`. Each app also has app-specific messages. Cookie-only locale strategy. Strings extracted file-by-file, grouped by namespace convention in key names (e.g. `auth_`, `nav_`, `practice_`, `settings_`, `verifier_`).

---

## Phase 1: Paraglide Setup

### Overview

Install Paraglide in both apps, configure Vite plugin, hooks, and message file structure. No string extraction yet — just get the infrastructure working with a single test message.

### Changes Required

#### 1.1 Install Paraglide

Run in each app directory:
```bash
cd apps/web && npx sv add paraglide
cd apps/verifier && npx sv add paraglide
```

If `sv add` doesn't fully work in this monorepo, fall back to manual:
```bash
bun add -D @inlang/paraglide-js
```

#### 1.2 Create shared message files

**Directory**: `packages/shared/messages/`

**File**: `packages/shared/messages/en.json`
```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format",
  "nav_library": "Library",
  "nav_practice": "Practice",
  "nav_home": "Home",
  "nav_work": "Work",
  "nav_settings": "Settings",
  "nav_logout": "Logout",
  "aria_home": "Home",
  "aria_profile_menu": "Profile menu",
  "auth_email": "Email",
  "auth_password": "Password",
  "auth_name": "Name",
  "auth_sign_in": "Sign In",
  "auth_signing_in": "Signing in...",
  "auth_create_account": "Create Account",
  "auth_creating_account": "Creating account...",
  "auth_register": "Register",
  "auth_sign_in_link": "Sign in",
  "auth_no_account": "Don't have an account?",
  "auth_have_account": "Already have an account?",
  "auth_login_failed": "Login failed",
  "auth_registration_failed": "Registration failed",
  "btn_cancel": "Cancel",
  "btn_submit": "Submit",
  "btn_save": "Save Settings",
  "btn_saving": "Saving...",
  "btn_saved": "Saved!",
  "btn_skip": "Skip",
  "btn_discard": "Discard",
  "btn_release": "Release",
  "btn_releasing": "Releasing...",
  "btn_submitting": "Submitting...",
  "state_loading": "Loading...",
  "state_processing": "Processing...",
  "state_failed": "Failed",
  "state_playing": "Playing...",
  "error_enter_both": "Please enter both English and translation.",
  "error_failed_add_phrase": "Failed to add phrase"
}
```

**File**: `packages/shared/messages/xh.json`
```json
{
  "$schema": "https://inlang.com/schema/inlang-message-format",
  "nav_library": "Ithala Lamagama",
  "nav_practice": "Ziqeqeshe"
}
```

(Xhosa file starts sparse — filled in Phase 5)

#### 1.3 Create app-specific message directories

**File**: `apps/web/messages/en.json` — web-specific strings (created empty, populated in Phase 2)
**File**: `apps/verifier/messages/en.json` — verifier-specific strings (created empty, populated in Phase 3)

#### 1.4 Inlang project config per app

**File**: `apps/web/project.inlang/settings.json`
```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "baseLocale": "en",
  "locales": ["en", "xh"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-json@latest/dist/index.js"
  ],
  "plugin.inlang.json": {
    "pathPattern": [
      "../../packages/shared/messages/{locale}.json",
      "./messages/{locale}.json"
    ]
  }
}
```

**File**: `apps/verifier/project.inlang/settings.json` — identical content.

#### 1.5 Vite config — add Paraglide plugin

**File**: `apps/web/vite.config.ts`
```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js/vite';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const workspaceRoot = fileURLToPath(new URL('../..', import.meta.url));
const convexDir = fileURLToPath(new URL('../../convex', import.meta.url));

export default defineConfig({
  envDir: workspaceRoot,
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/lib/paraglide',
      strategy: ['cookie', 'baseLocale']
    }),
    tailwindcss(),
    sveltekit()
  ],
  server: {
    fs: {
      allow: [convexDir]
    }
  }
});
```

**File**: `apps/verifier/vite.config.ts` — identical changes.

#### 1.6 Hooks — add Paraglide middleware

**File**: `apps/web/src/hooks.server.ts`
```typescript
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { getToken } from '@mmailaender/convex-better-auth-svelte/sveltekit';
import { createAuth } from '$lib/server/auth';
import { paraglideMiddleware } from '$lib/paraglide/server';

const authHandle: Handle = async ({ event, resolve }) => {
  const token = await getToken(createAuth, event.cookies);
  event.locals.token = token;
  return resolve(event);
};

const i18nHandle: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ request: localizedRequest, locale }) => {
    event.request = localizedRequest;
    return resolve(event, {
      transformPageChunk: ({ html }) => html.replace('%lang%', locale)
    });
  });

export const handle = sequence(i18nHandle, authHandle);
```

**File**: `apps/verifier/src/hooks.server.ts` — identical structure.

#### 1.7 app.html — dynamic lang attribute

**File**: `apps/web/src/app.html`
Change `<html lang="en">` to `<html lang="%lang%">`

**File**: `apps/verifier/src/app.html` — same change.

#### 1.8 Smoke test

Add one test message to `packages/shared/messages/en.json`, import `m` in a component, verify it compiles and renders.

### Success Criteria

#### Automated Verification
- [x] `bun run build` succeeds in `apps/web`
- [x] `bun run build` succeeds in `apps/verifier`
- [x] `bun run check` passes in both apps
- [x] Generated `src/lib/paraglide/` directory exists in both apps
- [x] `m.nav_library()` resolves to `"Library"` in dev

#### Manual Verification
- [ ] Dev server starts without errors for both apps
- [ ] Test message renders correctly in browser

---

## Phase 2: Extract Web App Strings

### Overview

Replace all ~150 hardcoded English strings in `apps/web/` with `m.key()` calls. Populate `apps/web/messages/en.json` and `packages/shared/messages/en.json`.

### Changes Required

Every file listed below: import `import { m } from '$lib/paraglide/messages.js'` and replace hardcoded strings with message function calls.

#### 2.1 `apps/web/src/routes/+layout.svelte`

| Line | Old | New |
|------|-----|-----|
| 26 | `'Library'` | `m.nav_library()` |
| 27 | `'Practice'` | `m.nav_practice()` |

#### 2.2 `apps/web/src/routes/+page.svelte` (~25 strings)

Messages to add to `apps/web/messages/en.json`:
```
library_kicker: "Daily Practice Setup"
library_title: "Phrase Library"
library_description: "Store phrases once, then train in short bursts when you have a spare minute."
library_add_phrase: "Add Phrase"
library_target_language: "Target language: Xhosa (`xh-ZA`)."
library_english_label: "English phrase"
library_english_placeholder: "e.g. Where is the taxi rank?"
library_translation_label: "Your Xhosa phrase"
library_translation_placeholder: "Type your phrase..."
library_adding: "Adding..."
library_loading: "Loading phrases..."
library_error_loading: "Error loading phrases: {message}"
library_no_phrases: "No phrases yet"
library_no_phrases_desc: "Add your first phrase to start building your library."
library_phrase_count: "{count} phrase(s)"
library_label_english: "English"
library_label_xhosa: "Xhosa"
library_feedback_banner: "Your verifier has reviewed your practice"
library_fab_label: "Start practice"
library_fab_unit: "min"
```

Replace every inline string with the corresponding `m.xxx()` call. Strings with interpolation like `{message}` use `m.library_error_loading({ message: phraseGroups.error.message })`.

#### 2.3 `apps/web/src/routes/login/+page.svelte` (~10 strings)

Shared auth strings already in `packages/shared/messages/en.json`. Web-specific:
```
login_kicker: "Fast Return"
login_title: "Welcome Back"
login_description: "Sign in and jump straight into your next phrase sprint."
```

#### 2.4 `apps/web/src/routes/register/+page.svelte` (~10 strings)

```
register_kicker: "Start Quickly"
register_title: "Create Account"
register_description: "Set up in under a minute, then build your first phrase deck."
```

#### 2.5 `apps/web/src/routes/settings/+page.svelte` (~50 strings)

This is the largest file. All settings strings:
```
settings_back: "Back to phrase library"
settings_kicker: "Keep Sessions Sustainable"
settings_title: "Settings"
settings_push_title: "Push Notifications"
settings_push_desc: "Enable push notifications to receive vocabulary reminders."
settings_push_enabled: "Notifications are enabled!"
settings_push_sending: "Sending..."
settings_push_test: "Test Notification"
settings_push_refreshing: "Refreshing..."
settings_push_refresh: "Refresh Subscription"
settings_push_enabling: "Enabling..."
settings_push_enable: "Enable Notifications"
settings_push_test_sent: "Test notification sent!"
settings_push_test_failed: "Failed to send test notification"
settings_prefs_title: "Notification Preferences"
settings_prefs_desc: "Configure when and how you receive reminders."
settings_prefs_loading: "Loading preferences..."
settings_prefs_error: "Error loading preferences"
settings_quiet_start: "Quiet Hours Start"
settings_quiet_start_help: "Hour (0-23) when quiet hours begin"
settings_quiet_end: "Quiet Hours End"
settings_quiet_end_help: "Hour (0-23) when quiet hours end"
settings_per_phrase: "Notifications Per Phrase"
settings_per_phrase_help: "Number of reminder notifications per phrase per day"
settings_sub_title: "Subscription"
settings_sub_desc: "Manage your plan and daily recording minutes."
settings_sub_loading: "Loading subscription..."
settings_sub_error: "Error loading subscription"
settings_sub_tier: "Current tier:"
settings_sub_status: "Status: {status}"
settings_sub_minutes: "Minutes used today: {used} / {limit}"
settings_sub_upgrade_ai: "Upgrade to AI (R150/mo)"
settings_sub_upgrade_pro: "Upgrade to Pro (R500/mo)"
settings_sub_redirecting: "Redirecting..."
settings_sub_checkout_error: "Failed to start checkout"
settings_dev_title: "Dev Tier Switch"
settings_dev_desc: "Instantly switch your current user between `free`, `ai`, and `pro` without checkout."
settings_dev_disabled: "Backend toggle is currently disabled. Enable `BILLING_DEV_TOGGLE=true` in Convex env."
settings_dev_free: "Free"
settings_dev_ai: "AI"
settings_dev_pro: "Pro"
settings_dev_switched: "Switched to {tier} tier (dev mode)."
settings_dev_error: "Failed to switch dev tier"
```

#### 2.6 `apps/web/src/routes/practice/+page.svelte` (~80 strings)

Largest component. Key strings:
```
practice_kicker: "On-the-Go Mode"
practice_title: "Practice Sessions"
practice_desc: "Start a short run now, review details later. Primary action first, history second."
practice_quick_start: "Quick Start"
practice_ready: "{count} phrases ready to train"
practice_tip: "Best results come from 5-10 minute daily sessions."
practice_starting: "Starting..."
practice_start: "Start Session"
practice_no_phrases: "No phrases yet"
practice_no_phrases_desc: "Add phrases first, then come back to start practicing."
practice_go_library: "Go to Phrase Library"
practice_recent: "Recent Sessions"
practice_recent_desc: "Open prior sessions to replay attempts and review corrections."
practice_loading_sessions: "Loading sessions..."
practice_no_sessions: "No practice sessions yet."
practice_loading_session: "Loading session..."
practice_no_phrases_title: "No Phrases Yet"
practice_no_phrases_body: "Add phrases in your phrase library first."
practice_back_library: "Back to Phrase Library"
practice_review_title: "Session Review"
practice_processing_count: "Processing {count} recording(s)..."
practice_all_received: "All feedback received."
practice_loading_results: "Loading results..."
practice_your_recording: "Your Recording"
practice_verifier_example: "Verifier Example"
practice_new_session: "New Session"
practice_ending: "Ending..."
practice_finish: "Finish"
practice_phrase_of: "Phrase {position} of {length}"
practice_session_started: "Session started {time}"
practice_queue_mode: "Queue mode: {mode}"
practice_stop_recording: "Stop Recording"
practice_start_recording: "Start Recording"
practice_uploading: "Uploading..."
practice_end_session: "End Session"
practice_upload_failed: "Failed to upload audio."
practice_submit_failed: "Failed to submit recording."
practice_browser_unsupported: "Audio recording not supported in this browser."
practice_record_failed: "Failed to start recording."
practice_score_sound: "Sound"
practice_score_rhythm: "Rhythm"
practice_score_phrase: "Phrase"
time_just_now: "Just now"
time_minutes_ago: "{count} Minute(s) Ago"
time_earlier_today: "Earlier Today"
time_yesterday: "Yesterday"
time_days_ago: "{count} Days Ago"
time_weeks_ago: "{count} Week(s) Ago"
```

Note: pluralization patterns like `{count} phrase(s)` should use Paraglide's plural syntax where possible. Simple approach: use separate keys or template strings for now, refactor to proper plural forms later.

#### 2.7 `apps/web/src/routes/practice/session/[id]/+page.svelte` (~15 strings)

```
session_back: "Back to Practice Sessions"
session_review: "Session Review"
session_attempt_count: "{count} attempt(s)"
session_loading: "Loading session..."
session_not_found: "Session not found."
session_back_btn: "Back to Sessions"
```

Plus reuses shared strings: `state_processing`, `state_failed`, `practice_your_recording`, `practice_verifier_example`, `state_playing`.

#### 2.8 `apps/web/src/routes/reveal/[id]/+page.svelte` (~15 strings)

```
reveal_title: "Time to Recall!"
reveal_desc: "Can you remember the translation?"
reveal_your_translation: "Your Translation"
reveal_placeholder: "Type your translation..."
reveal_check: "Check Answer"
reveal_your_answer: "Your Answer"
reveal_correct: "Correct!"
reveal_lets_see: "Let's see the correct answer..."
reveal_see_translation: "See Translation"
reveal_reveal: "Reveal Correct Answer"
reveal_correct_translation: "Correct Translation"
reveal_back: "Back to Sessions"
reveal_phrase_not_found: "Phrase not found"
reveal_label_english: "English"
```

#### 2.9 `apps/web/src/routes/billing/return/+page.svelte`

```
billing_complete: "Payment complete"
billing_complete_desc: "Thanks! Your payment is being confirmed. This can take a minute or two. You can close this page and continue practicing."
```

#### 2.10 `apps/web/src/routes/billing/cancel/+page.svelte`

```
billing_canceled: "Payment canceled"
billing_canceled_desc: "No problem — your payment was canceled. You can return to settings if you want to try again."
```

### Success Criteria

#### Automated Verification
- [x] `bun run build` succeeds in `apps/web`
- [x] `bun run check` passes — all `m.xxx()` calls type-safe
- [x] Zero hardcoded English strings remain in web app templates (grep verification)

#### Manual Verification
- [ ] All pages render identically to before (English still shows)
- [ ] No visual regressions — text, spacing, formatting unchanged

---

## Phase 3: Extract Verifier App Strings

### Overview

Replace all ~70 hardcoded English strings in `apps/verifier/` with `m.key()` calls.

### Changes Required

#### 3.1 `apps/verifier/src/routes/+layout.svelte`

| Line | Old | New |
|------|-----|-----|
| 26 | `'Home'` | `m.nav_home()` |
| 27 | `'Work'` | `m.nav_work()` |

#### 3.2 `apps/verifier/src/routes/+page.svelte` (~30 strings, mostly long guidance text)

```
verifier_guide_kicker: "Verification Guide"
verifier_guide_title: "Recall Verifier"
verifier_guide_desc: "Your reviews shape how learners hear and correct themselves. Read the guidance below before you begin."
verifier_approach_title: "Approach Every Recording Fresh"
verifier_approach_desc: "You don't need a teaching background — just a fair ear and a clear method."
verifier_listen_title: "Listen First, Score Second"
verifier_listen_desc: "Play the learner's recording fully at least once before touching any score. Snap judgements drift over time."
verifier_consistent_title: "Be Consistent, Not Lenient"
verifier_consistent_desc: "A 3 means \"understood with effort.\" A 5 means a native speaker wouldn't blink. Anchor each session to these markers and you'll stay calibrated across hundreds of reviews."
verifier_empathetic_title: "Be Empathetic, Not Generous"
verifier_empathetic_desc: "Learners improve fastest from honest scores paired with a good exemplar recording. A generous 5 today robs them of progress tomorrow."
verifier_scoring_title: "Scoring Dimensions"
verifier_sound_title: "Sound Accuracy"
verifier_sound_desc: "Are the individual sounds (clicks, vowels, consonants) correctly produced? Ignore rhythm and word choice — focus only on the raw phonetics."
verifier_rhythm_title: "Rhythm & Intonation"
verifier_rhythm_desc: "Does the phrase flow naturally? Stress, pauses, and pitch patterns matter here. A learner might pronounce every sound right but still sound robotic."
verifier_phrase_title: "Phrase Accuracy"
verifier_phrase_desc: "Did the learner say the right words in the right order? Dropped or substituted words lower this score even if individual sounds are perfect."
verifier_ai_title: "AI Analysis"
verifier_ai_desc: "Our AI provides a transcript and feedback for every recording. Mark whether the AI's analysis is correct or incorrect — this helps us improve the system."
verifier_exemplar_title: "The Exemplar Recording"
verifier_exemplar_desc: "After scoring, record yourself saying the phrase correctly. This exemplar is sent back to the learner alongside your scores so they can hear what they're aiming for."
verifier_fab_label: "Start verification"
verifier_fab_item: "{count, plural, one {item} other {items}}"
```

#### 3.3 `apps/verifier/src/routes/login/+page.svelte`

Reuses shared auth strings. Only verifier-specific:
```
verifier_login_desc: "Sign in and jump directly into your next queue review."
```

#### 3.4 `apps/verifier/src/routes/register/+page.svelte`

```
verifier_register_desc: "Set up in under a minute, then activate your verifier profile."
```

#### 3.5 `apps/verifier/src/routes/settings/+page.svelte` (~20 strings)

```
vsettings_back: "Back home"
vsettings_kicker: "Verifier Configuration"
vsettings_title: "Settings"
vsettings_total: "Total Verifications"
vsettings_today: "Today"
vsettings_language_title: "Language Team"
vsettings_language_label: "Language"
vsettings_active: "Active verifier: {name}"
vsettings_activate_title: "Activate Verifier Access"
vsettings_activate_desc: "Set your visible identity and join this language team."
vsettings_first_name: "First Name"
vsettings_first_name_placeholder: "e.g. Lwazi"
vsettings_image_label: "Profile Image URL (optional)"
vsettings_activate_btn: "Activate"
vsettings_activated: "Verifier profile activated."
vsettings_name_required: "Please enter a first name."
vsettings_save_failed: "Failed to save."
```

#### 3.6 `apps/verifier/src/routes/work/+page.svelte` (~20 strings)

```
work_kicker: "First Come, First Serve"
work_title: "Available Work"
work_desc: "Pick a learner attempt from the queue. Once you claim it, you have 5 minutes to complete your review."
work_queue_status: "Queue Status"
work_pending_count: "{count} pending review(s)"
work_claim_hint: "Claim any item below to begin."
work_not_activated: "Not Activated"
work_not_activated_desc: "Go to Settings to activate your verifier profile for this language."
work_go_settings: "Go to Settings"
work_loading_queue: "Loading queue..."
work_queue_empty: "Queue Empty"
work_queue_empty_desc: "No learner attempts need review right now. Check back soon."
work_pending_title: "Pending Reviews"
work_pending_desc: "Tap an item to claim and begin reviewing."
work_unknown_phrase: "Unknown phrase"
work_dispute: "Dispute"
time_just_now_short: "Just now"
time_m_ago: "{m}m ago"
time_h_ago: "{h}h ago"
time_d_ago: "{d}d ago"
```

#### 3.7 `apps/verifier/src/routes/work/[id]/+page.svelte` (~25 strings)

```
claim_loading: "Loading claim..."
claim_dispute_review: "Dispute Review"
claim_learner_attempt: "Learner Attempt"
claim_time_remaining: "Time remaining: {time}"
claim_learner_audio: "Learner Audio"
claim_scoring_title: "Audio Scoring"
claim_sound_accuracy: "Sound Accuracy"
claim_rhythm_intonation: "Rhythm & Intonation"
claim_phrase_accuracy: "Phrase Accuracy"
claim_ai_title: "AI Analysis"
claim_transcript: "Transcript"
claim_feedback: "Feedback"
claim_ai_score: "AI Score: {score}/5"
claim_ai_correct_q: "Is this analysis correct?"
claim_ai_incorrect: "Incorrect"
claim_ai_correct: "Correct"
claim_original_review: "Original Review by {name}"
claim_original_scores: "Sound {sound}/5 • Rhythm {rhythm}/5 • Phrase {phrase}/5"
claim_dispute_progress: "Dispute checks: {completed}/2"
claim_record_exemplar: "Record Exemplar"
claim_discard_recording: "Discard Recording"
claim_stop_recording: "Stop Recording"
claim_audio_unsupported: "Audio recording not supported."
claim_record_failed: "Failed to start recording."
claim_release_failed: "Failed to release."
claim_upload_failed: "Failed to upload exemplar audio."
claim_submit_failed: "Failed to submit review."
```

### Success Criteria

#### Automated Verification
- [x] `bun run build` succeeds in `apps/verifier`
- [x] `bun run check` passes
- [x] Zero hardcoded English strings remain in verifier templates

#### Manual Verification
- [ ] All verifier pages render identically to before
- [ ] Guidance text, scoring UI, work queue all unchanged visually

---

## Phase 4: Extract Shared UI Strings

### Overview

Replace hardcoded strings in `packages/ui/` Header component. These are already in `packages/shared/messages/en.json` from Phase 1.

### Changes Required

#### 4.1 `packages/ui/src/components/header/Header.svelte`

The Header component receives `links` as props (labels come from each app's layout). The hardcoded strings in Header itself:

| Line | Old | New |
|------|-----|-----|
| 38 | `aria-label="Home"` | `aria-label={m.aria_home()}` |
| 42 | `aria-label="Primary"` | `aria-label={m.aria_primary_nav()}` |
| 55 | `aria-label="Profile menu"` | `aria-label={m.aria_profile_menu()}` |
| 63 | `Settings` | `{m.nav_settings()}` |
| 67 | `Logout` | `{m.nav_logout()}` |

**Challenge**: The Header is in `packages/ui/`, which doesn't have its own Paraglide compilation. Two options:

**Option A (recommended)**: Pass translated strings as props from each app's layout:
```svelte
<!-- +layout.svelte -->
<Header
  links={[
    { label: m.nav_library(), href: '/' },
    { label: m.nav_practice(), href: '/practice' }
  ]}
  settingsLabel={m.nav_settings()}
  logoutLabel={m.nav_logout()}
/>
```

Extend `Header.svelte` props:
```typescript
interface Props {
  links?: NavLink[];
  settingsHref?: string;
  settingsLabel?: string;
  logoutLabel?: string;
  homeAriaLabel?: string;
  profileAriaLabel?: string;
}
```

**Option B**: Import Paraglide messages directly in the UI package (requires configuring Paraglide compilation for packages/ui/).

Option A is simpler and keeps the UI package framework-agnostic.

### Success Criteria

#### Automated Verification
- [x] `bun run build` succeeds in both apps
- [x] `bun run check` passes

#### Manual Verification
- [ ] Header renders correctly in both apps
- [ ] Dropdown menu shows translated Settings/Logout

---

## Phase 5: isiXhosa Translations

### Overview

Create complete `xh.json` translation files for all extracted strings.

### Changes Required

#### 5.1 `packages/shared/messages/xh.json`

Translate all shared strings (nav, auth, common buttons, states).

#### 5.2 `apps/web/messages/xh.json`

Translate all web-app-specific strings (~100 keys).

#### 5.3 `apps/verifier/messages/xh.json`

Translate all verifier-specific strings (~60 keys).

### Notes

- Translations should be done by a native isiXhosa speaker or carefully reviewed by one
- Machine translation (e.g. Google Translate) can provide a starting draft but MUST be reviewed
- Some technical terms (e.g. "AI", "Push Notifications") may stay in English or use loan words
- The verifier guidance text (long paragraphs) needs particular care

### Success Criteria

#### Automated Verification
- [x] `bun run build` succeeds (Paraglide compiles both locales)
- [x] No missing keys in `xh.json` vs `en.json` (Paraglide warns on missing)

#### Manual Verification
- [ ] A native speaker reviews all translations for accuracy and naturalness

**Implementation Note**: Pause here for manual review of translations before proceeding.

---

## Phase 6: Language Switcher + Persistence

### Overview

Add a language picker to Settings in both apps. Persist choice to cookie (automatic via Paraglide) and to `userPreferences.uiLocale` in Convex.

### Changes Required

#### 6.1 Add `uiLocale` to Convex schema

**File**: `convex/schema.ts`
```typescript
userPreferences: defineTable({
  userId: v.string(),
  quietHoursStart: v.number(),
  quietHoursEnd: v.number(),
  notificationsPerPhrase: v.number(),
  pushSubscription: v.optional(v.string()),
  timeZone: v.optional(v.string()),
  uiLocale: v.optional(v.string())  // <-- add this
}).index('by_user', ['userId']),
```

#### 6.2 Update `convex/preferences.ts`

Add `uiLocale` to the `upsert` mutation args and handler:
```typescript
args: {
  // ... existing args
  uiLocale: v.optional(v.string())
},
```

Add to the `get` query return defaults:
```typescript
uiLocale: prefs?.uiLocale ?? 'en'
```

#### 6.3 Language switcher component

**File**: `apps/web/src/routes/settings/+page.svelte` — add a new Card section:

```svelte
<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
  <Card.Header>
    <Card.Title>{m.settings_language_title()}</Card.Title>
    <Card.Description>{m.settings_language_desc()}</Card.Description>
  </Card.Header>
  <Card.Content>
    <select
      value={getLocale()}
      onchange={(e) => switchLanguage(e.currentTarget.value)}
      class="w-full border border-input bg-background px-3 py-2.5 text-base"
    >
      {#each locales as locale}
        <option value={locale}>{localeDisplayName(locale)}</option>
      {/each}
    </select>
  </Card.Content>
</Card.Root>
```

Script additions:
```typescript
import { getLocale, setLocale, locales } from '$lib/paraglide/runtime';

const localeNames: Record<string, string> = {
  en: 'English',
  xh: 'isiXhosa'
};

function localeDisplayName(locale: string): string {
  return localeNames[locale] ?? locale;
}

async function switchLanguage(locale: string) {
  // Persist to Convex
  await client.mutation(api.preferences.upsert, { uiLocale: locale });
  // Paraglide switches locale + sets cookie + reloads
  setLocale(locale);
}
```

Add message keys:
```
settings_language_title: "Language"
settings_language_desc: "Choose your preferred UI language."
```

#### 6.4 Same switcher in verifier settings

Add identical language switcher card to `apps/verifier/src/routes/settings/+page.svelte`.

#### 6.5 Sync cookie from Convex on login

When a user logs in, their `uiLocale` should be read from Convex and applied. In `hooks.server.ts`, after auth resolves, if the user has a `uiLocale` preference that differs from the current cookie, update the cookie. This ensures cross-device persistence.

This can be done by querying `userPreferences` in the hook or by having the client-side layout check preferences and call `setLocale()` if mismatched.

Simpler approach: in `+layout.svelte`, after auth loads, check if `getLocale()` matches the user's `uiLocale` from Convex. If not, call `setLocale(prefs.uiLocale)` which triggers a reload with the correct locale.

### Success Criteria

#### Automated Verification
- [x] `bun run build` succeeds in both apps
- [x] `bun run check` passes
- [ ] Convex schema deploys without errors

#### Manual Verification
- [ ] Switch to isiXhosa in settings → full page reload → all UI in Xhosa
- [ ] Switch back to English → all UI in English
- [ ] Close browser, reopen → language persists (cookie)
- [ ] Log in on incognito → language syncs from Convex preferences

**Implementation Note**: Pause for manual testing before proceeding.

---

## Phase 7: Polish

### Overview

Clean up language-specific CSS classes, address remaining hardcoded references.

### Changes Required

#### 7.1 Rename `xhosa-phrase` CSS class

**Files**: All files using `class="xhosa-phrase"` → rename to `class="target-phrase"`
- `apps/web/src/routes/+page.svelte:150`
- `apps/web/src/routes/practice/+page.svelte:686`
- `apps/verifier/src/routes/work/[id]/+page.svelte:213`

Update corresponding CSS in `packages/shared/` or app stylesheets.

#### 7.2 Remove hardcoded "Xhosa" references

The phrase "Your Xhosa phrase" (line 88 of `+page.svelte`) should already be translated via `m.library_translation_label()`. But the label itself references Xhosa — it should be dynamic based on the user's target learning language, not the UI language. This is a separate concern from i18n (it's about the learning target language being configurable).

For now, the i18n message key handles this: the English message says "Your Xhosa phrase" and the Xhosa message says whatever the Xhosa translation is. When multi-language learning support is added, this label should use interpolation: `m.library_translation_label({ language: targetLanguageName })`.

#### 7.3 Add `.gitignore` entries

Add `src/lib/paraglide/` to `.gitignore` in both apps (generated files).

### Success Criteria

#### Automated Verification
- [x] `bun run build` succeeds
- [x] `bun run check` passes
- [x] No `xhosa-phrase` class references remain (grep check)

#### Manual Verification
- [ ] Phrase cards still styled correctly with renamed class
- [ ] Full walkthrough in both languages — no English leaks in Xhosa mode

---

## Testing Strategy

### Automated
- `bun run check` in both apps — Paraglide type-checks all `m.xxx()` calls
- `bun run build` in both apps — catches missing keys at compile time
- Grep for remaining hardcoded strings: `grep -rn '"[A-Z][a-z]' apps/*/src/routes/ --include="*.svelte"` to find likely untranslated text

### Manual
1. Switch to isiXhosa, navigate every page in both apps
2. Verify no English text leaks through (except learning content)
3. Test language persistence: cookie survives browser restart
4. Test cross-device sync: log in elsewhere, locale matches

## Performance Considerations

- Paraglide adds ~2KB to bundle (after tree-shaking) — negligible
- Cookie-only strategy means no extra URL parsing overhead
- No async loading — translations compiled into bundle
- Both locale variants ship per page (~230 × 2 × ~50B = ~23KB total, split across pages)

## References

- Research: `thoughts/shared/research/2026-02-12-i18n-internationalization-strategy.md`
- Paraglide JS docs: https://inlang.com/m/gerre34r/library-inlang-paraglideJs
- SvelteKit Paraglide: https://svelte.dev/docs/cli/paraglide
- Paraglide v2 migration: https://dropanote.de/en/blog/20250506-paraglide-migration-2-0-sveltekit/
