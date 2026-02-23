# Monochrome + Amber Skin Implementation Plan

## Overview

Add a second interchangeable "skin" to the app — a monochrome palette with a single warm amber accent colour. Skins are independent of dark/light mode (4 total states). User picks skin in settings, stored in Convex + localStorage.

## Current State Analysis

- All tokens live in `packages/shared/src/styles/recall.css` — oklch-based, dark mode via `.dark` class on `<html>`
- FOUC script in both `app.html` files reads `localStorage.theme` and applies `.dark` class
- `userPreferences` table has no skin field
- Settings page has no appearance section
- Body has `background-image` gradients tinted with `var(--primary)`

### Key Discoveries:
- `recall.css:8-69` — light tokens with warm hue 80/260 neutrals
- `recall.css:71-102` — dark tokens in `:root.dark`
- `recall.css:150-163` — body `background-image` uses `var(--primary)` gradients
- `convex/schema.ts:214-222` — `userPreferences` table, no skin field
- `convex/preferences.ts:41-83` — upsert mutation, no skin arg
- `apps/web/src/routes/settings/+page.svelte` — no appearance card
- Both `app.html` FOUC scripts only handle `localStorage.theme` → `.dark` class
- Root layouts (`+layout.svelte`) sync locale from Convex prefs on load — same pattern needed for skin

## Desired End State

- `[data-skin="mono"]` on `<html>` overrides all colour tokens to achromatic greys + amber accent
- Both light and dark modes work with the mono skin (4 states total)
- Body background is flat (no gradients) when mono skin active
- User selects skin in settings → stored in Convex `uiSkin` field + `localStorage.skin`
- FOUC script applies `data-skin` attribute before first paint
- Layout syncs skin from Convex prefs on first load (same pattern as locale sync)

### Verification:
- Toggle skin in settings → entire app recolours instantly
- Reload → no flash of wrong skin (FOUC script handles it)
- Dark mode toggle works independently in both skins
- `bun run build` succeeds
- `bun run check` passes

## What We're NOT Doing

- No additional skins beyond "mono" (architecture supports more later)
- No dark mode toggle UI (that's a separate task — using existing localStorage/OS mechanism)
- No font changes between skins (same Bebas Neue + Public Sans)
- No layout or spacing changes between skins

## Implementation Approach

Bottom-up: CSS tokens first, then persistence layer, then FOUC script, then settings UI, then layout sync.

---

## Phase 1: Mono Skin CSS Tokens

### Overview

Add `[data-skin="mono"]` and `[data-skin="mono"].dark` variable override blocks to `recall.css`. Override body background to flat for mono skin.

### Changes Required:

#### 1.1 Add mono skin light mode tokens

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add after the `:root.dark` block (after line 102), before `@theme inline`

```css
/* ── Mono skin: light ── */
[data-skin="mono"] {
	--theme-accent: oklch(0.72 0.17 65);
	--theme-accent-foreground: oklch(0.13 0 0);
	--theme-header-surface: oklch(0.96 0 0);
	--theme-header-ink: oklch(0.18 0 0);
	--theme-header-border: oklch(0 0 0 / 10%);
	--theme-header-rail: oklch(0.93 0 0);
	--theme-recording: oklch(0.65 0.16 55);
	--theme-recording-foreground: oklch(0.98 0 0);
	--theme-recording-border: oklch(0.55 0.15 55);
	--theme-recording-hover: oklch(0.60 0.16 55);
	--theme-recording-fill: oklch(0.48 0.14 55);
	--background: oklch(0.975 0 0);
	--foreground: oklch(0.13 0 0);
	--card: oklch(0.94 0 0);
	--card-foreground: oklch(0.13 0 0);
	--popover: oklch(0.975 0 0);
	--popover-foreground: oklch(0.13 0 0);
	--primary: var(--theme-accent);
	--primary-foreground: var(--theme-accent-foreground);
	--secondary: oklch(0.92 0 0);
	--secondary-foreground: oklch(0.13 0 0);
	--muted: oklch(0.92 0 0);
	--muted-foreground: oklch(0.44 0 0);
	--accent: var(--theme-accent);
	--accent-foreground: var(--theme-accent-foreground);
	--destructive: oklch(0.55 0.22 27);
	--border: oklch(0 0 0 / 10%);
	--input: oklch(0 0 0 / 12%);
	--ring: var(--theme-accent);
}
```

#### 1.2 Add mono skin dark mode tokens

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add immediately after the mono light block

```css
/* ── Mono skin: dark ── */
[data-skin="mono"].dark {
	--theme-accent: oklch(0.80 0.18 65);
	--theme-accent-foreground: oklch(0.10 0 0);
	--theme-header-surface: oklch(0.12 0 0);
	--theme-header-ink: oklch(0.90 0 0);
	--theme-header-border: oklch(1 0 0 / 12%);
	--theme-header-rail: oklch(0.15 0 0);
	--theme-recording: oklch(0.70 0.17 55);
	--theme-recording-foreground: oklch(0.98 0 0);
	--theme-recording-border: oklch(0.60 0.15 55);
	--theme-recording-hover: oklch(0.65 0.17 55);
	--theme-recording-fill: oklch(0.52 0.14 55);
	--background: oklch(0.09 0 0);
	--foreground: oklch(0.93 0 0);
	--card: oklch(0.13 0 0);
	--card-foreground: oklch(0.93 0 0);
	--popover: oklch(0.13 0 0);
	--popover-foreground: oklch(0.93 0 0);
	--primary: var(--theme-accent);
	--primary-foreground: var(--theme-accent-foreground);
	--secondary: oklch(0.18 0 0);
	--secondary-foreground: oklch(0.85 0 0);
	--muted: oklch(0.18 0 0);
	--muted-foreground: oklch(0.55 0 0);
	--accent: var(--theme-accent);
	--accent-foreground: var(--theme-accent-foreground);
	--destructive: oklch(0.65 0.22 25);
	--border: oklch(1 0 0 / 10%);
	--input: oklch(1 0 0 / 14%);
	--ring: var(--theme-accent);
}
```

#### 1.3 Override body background for mono skin

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add inside `@layer base`, after the existing `body` rule (after line 163)

```css
[data-skin="mono"] body {
	background-image: none;
}
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run build` succeeds
- [x] `bun run check` passes

#### Manual Verification:
- [ ] Add `data-skin="mono"` to `<html>` in devtools → all colours switch to achromatic + amber
- [ ] Add `.dark` class alongside `data-skin="mono"` → dark mono skin activates
- [ ] Remove `data-skin` → reverts to current skin
- [ ] Body gradient gone in mono skin, present in default skin

**Implementation Note**: Pause for manual verification before Phase 2.

---

## Phase 2: Convex Schema + Preferences

### Overview

Add `uiSkin` field to `userPreferences` and update the get/upsert functions.

### Changes Required:

#### 2.1 Add `uiSkin` to schema

**File**: `convex/schema.ts`
**Changes**: Add `uiSkin` field to `userPreferences` table (after `uiLocale` on line 221)

```typescript
uiSkin: v.optional(v.string()) // UI skin (e.g. "default", "mono")
```

#### 2.2 Update preferences query default

**File**: `convex/preferences.ts`
**Changes**: In the `get` handler's default return (line 25-33), add `uiSkin`:

```typescript
return {
	userId,
	quietHoursStart: 22,
	quietHoursEnd: DEFAULT_PREFERENCES.quietHoursEnd,
	notificationsPerPhrase: DEFAULT_PREFERENCES.notificationsPerPhrase,
	pushSubscription: undefined,
	timeZone: DEFAULT_PREFERENCES.timeZone,
	uiLocale: 'en',
	uiSkin: 'default'
};
```

And update the return with existing prefs (line 36):

```typescript
return { ...prefs, uiLocale: prefs.uiLocale ?? 'en', uiSkin: prefs.uiSkin ?? 'default' };
```

#### 2.3 Update preferences upsert

**File**: `convex/preferences.ts`
**Changes**: Add `uiSkin` to the mutation args and the patch/insert logic

Args (add after `uiLocale` arg):
```typescript
uiSkin: v.optional(v.string())
```

In the `existing` patch block:
```typescript
...(args.uiSkin !== undefined && { uiSkin: args.uiSkin }),
```

In the insert block:
```typescript
uiSkin: args.uiSkin
```

### Success Criteria:

#### Automated Verification:
- [x] `npx convex dev --once` pushes schema successfully
- [x] `bun run check` passes

#### Manual Verification:
- [ ] Call `preferences.upsert({ uiSkin: 'mono' })` from Convex dashboard → stored
- [ ] `preferences.get` returns `uiSkin: 'mono'`

**Implementation Note**: Pause for manual verification before Phase 3.

---

## Phase 3: FOUC Script + Meta Theme Color

### Overview

Update inline scripts in both `app.html` files to read `localStorage.skin` and apply `data-skin` attribute before first paint. Update meta theme-color values for mono skin.

### Changes Required:

#### 3.1 Update FOUC script in both app.html files

**File**: `apps/web/src/app.html`
**File**: `apps/verifier/src/app.html`
**Changes**: Replace the existing FOUC inline script with an expanded version

```html
<script>
    (function() {
        var d = document.documentElement;
        var t = localStorage.getItem('theme');
        var s = localStorage.getItem('skin');
        if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
            d.classList.add('dark');
            document.getElementById('theme-color').content = '#171717';
        }
        if (s && s !== 'default') {
            d.setAttribute('data-skin', s);
        }
    })();
</script>
```

The skin logic is 3 lines — reads `localStorage.skin`, sets `data-skin` attribute if not default. Runs synchronously before paint alongside the existing dark mode logic.

### Success Criteria:

#### Automated Verification:
- [x] `bun run build` succeeds

#### Manual Verification:
- [ ] Set `localStorage.skin = 'mono'` in console, reload → mono skin applied with no FOUC
- [ ] Set `localStorage.skin = 'default'`, reload → default skin, no FOUC
- [ ] Remove `localStorage.skin`, reload → default skin (fallback)
- [ ] Combine with `localStorage.theme = 'dark'` → dark mono, no FOUC

**Implementation Note**: Pause for manual verification before Phase 4.

---

## Phase 4: Settings UI — Appearance Card

### Overview

Add an "Appearance" card to the settings page with a skin picker. Add i18n strings.

### Changes Required:

#### 4.1 Add i18n strings

**File**: `apps/web/messages/en.json`
**Changes**: Add after `settings_language_desc` key

```json
"settings_appearance_title": "Appearance",
"settings_appearance_desc": "Choose your visual theme.",
"settings_skin_default": "Recall",
"settings_skin_mono": "Monochrome"
```

**File**: `apps/web/messages/xh.json`
**Changes**: Add matching keys

```json
"settings_appearance_title": "[TODO] Appearance",
"settings_appearance_desc": "[TODO] Choose your visual theme.",
"settings_skin_default": "Recall",
"settings_skin_mono": "[TODO] Monochrome"
```

#### 4.2 Add skin state and switcher function to settings page

**File**: `apps/web/src/routes/settings/+page.svelte`
**Changes**: In the `<script>` block, add skin state and a `switchSkin` function

After the locale-related code (after the `switchLanguage` function, ~line 41):

```typescript
const SKINS = ['default', 'mono'] as const;
type Skin = (typeof SKINS)[number];

let currentSkin = $state<Skin>('default');

function applySkin(skin: Skin) {
    const el = document.documentElement;
    if (skin === 'default') {
        el.removeAttribute('data-skin');
    } else {
        el.setAttribute('data-skin', skin);
    }
    localStorage.setItem('skin', skin);
}

async function switchSkin(skin: Skin) {
    currentSkin = skin;
    applySkin(skin);
    await client.mutation(api.preferences.upsert, { uiSkin: skin });
}
```

Update the `$effect` that syncs preferences (the existing one at ~line 43) to also read `uiSkin`:

```typescript
$effect(() => {
    if (preferences.data) {
        quietStart = preferences.data.quietHoursStart;
        quietEnd = preferences.data.quietHoursEnd;
        perPhrase = preferences.data.notificationsPerPhrase;
        timeZone = preferences.data.timeZone ?? timeZone;
        if (preferences.data.uiSkin) {
            currentSkin = preferences.data.uiSkin as Skin;
        }
    }
});
```

#### 4.3 Add Appearance card to settings template

**File**: `apps/web/src/routes/settings/+page.svelte`
**Changes**: Add after the Language card (after line 182), before the Push Notifications card

```svelte
<Card.Root class="border border-border/60 bg-background/85 backdrop-blur-sm">
    <Card.Header>
        <Card.Title>{m.settings_appearance_title()}</Card.Title>
        <Card.Description>{m.settings_appearance_desc()}</Card.Description>
    </Card.Header>
    <Card.Content>
        <div class="flex gap-3">
            {#each SKINS as skin}
                <button
                    onclick={() => switchSkin(skin)}
                    class="flex-1 border-2 p-4 text-center transition-colors {currentSkin === skin
                        ? 'border-primary bg-primary/10'
                        : 'border-border hover:border-muted-foreground'}"
                >
                    <span class="font-display text-lg uppercase tracking-wide">
                        {skin === 'default' ? m.settings_skin_default() : m.settings_skin_mono()}
                    </span>
                </button>
            {/each}
        </div>
    </Card.Content>
</Card.Root>
```

### Success Criteria:

#### Automated Verification:
- [x] `bun run build` succeeds
- [x] `bun run check` passes

#### Manual Verification:
- [ ] Appearance card visible in settings with two options
- [ ] Clicking "Monochrome" → entire app recolours to achromatic + amber
- [ ] Clicking "Recall" → reverts to default skin
- [ ] Active option has primary border highlight
- [ ] Reload page → skin persists (localStorage + Convex)

**Implementation Note**: Pause for manual verification before Phase 5.

---

## Phase 5: Layout Sync

### Overview

Update both root layouts to sync the stored skin preference from Convex → `data-skin` attribute on first load, mirroring the existing locale sync pattern.

### Changes Required:

#### 5.1 Add skin sync to web layout

**File**: `apps/web/src/routes/+layout.svelte`
**Changes**: Add a skin sync `$effect` alongside the existing locale sync (after line 37)

```typescript
let skinSynced = false;
$effect(() => {
    if (preferences.data?.uiSkin && !skinSynced) {
        skinSynced = true;
        const saved = preferences.data.uiSkin;
        const current = document.documentElement.getAttribute('data-skin') ?? 'default';
        if (saved !== current) {
            if (saved === 'default') {
                document.documentElement.removeAttribute('data-skin');
            } else {
                document.documentElement.setAttribute('data-skin', saved);
            }
            localStorage.setItem('skin', saved);
        }
    }
});
```

#### 5.2 Add skin sync to verifier layout

**File**: `apps/verifier/src/routes/+layout.svelte`
**Changes**: Identical skin sync `$effect` block as web layout

### Success Criteria:

#### Automated Verification:
- [x] `bun run build` succeeds
- [x] `bun run check` passes

#### Manual Verification:
- [ ] Clear localStorage, set skin to 'mono' in Convex dashboard → reload → mono skin applied after hydration
- [ ] Verify no visible flash (FOUC script handles localStorage, layout sync handles Convex → localStorage reconciliation)
- [ ] Switch skin in web app settings → open verifier → verifier also uses mono skin (after its layout syncs from shared Convex preference)

---

## Testing Strategy

### Manual Testing Steps:

1. Open settings → click Monochrome → entire page recolours to greyscale + amber
2. Navigate to practice, library, session pages → all use mono skin
3. Toggle OS dark mode → mono skin switches between light/dark variants
4. Click Recall in settings → reverts to warm green-yellow skin
5. Set mono, reload → no flash of wrong skin
6. Open verifier app → mono skin also applied
7. Clear localStorage, reload → skin syncs from Convex after hydration
8. In devtools: change `--theme-accent` on `[data-skin="mono"]` → all amber elements recolour
9. Check recording button, player, feedback banner → amber-tinted (not pink)
10. Check phrase display text → amber (not green-yellow)
11. Check body background → flat (no gradients) in mono skin

## Performance Considerations

- FOUC script adds ~100 bytes (3 lines of JS) — negligible
- CSS selector `[data-skin="mono"]` has same specificity as `:root.dark` — no performance concern
- No JavaScript theme switching at runtime — all done via CSS custom property inheritance

## References

- Existing tokens: `packages/shared/src/styles/recall.css`
- Preferences: `convex/preferences.ts`, `convex/schema.ts:214-222`
- Settings page: `apps/web/src/routes/settings/+page.svelte`
- FOUC scripts: `apps/web/src/app.html:9-18`, `apps/verifier/src/app.html:9-18`
- Layout sync pattern: `apps/web/src/routes/+layout.svelte:29-37` (locale sync)
