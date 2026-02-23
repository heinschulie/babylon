# Styling System Overhaul — Tailwind v4 Best Practices

## Overview

Align the entire styling system with Tailwind v4 best practices: fully token-driven colors, unified dark mode, removal of hardcoded values, and a clean theme architecture that makes any design change a matter of editing CSS variables.

## Current State Analysis

The foundation is **strong** — `packages/shared/src/styles/recall.css` is the single source of truth, uses Tailwind v4's `@theme inline`, and both apps import it. Key issues:

1. **14 hardcoded `oklch(... 330)` pink values** in `.practice-record-btn`, `.practice-player`, `.feedback-banner` bypass the token system
2. **Dark mode conflict** — CSS vars use `@media (prefers-color-scheme: dark)`, but `@custom-variant dark` targets `.dark` class. Neither approach is complete; `dark:` utilities in 4 components are inert
3. **Vestigial `tailwind.config.ts`** in both apps — v3 stubs, unused by v4
4. **Arbitrary bracket values** in UI components (`text-[2rem]`, `tracking-[0.04em]`) — not themeable
5. **Hardcoded `#0f172a`** in `<meta theme-color>` doesn't match oklch tokens
6. **No theme toggle UI** — dark mode is OS-only with no user override

### Key Discoveries:

- `recall.css:6` — `@custom-variant dark (&:is(.dark *))` exists but `.dark` class is never applied
- `recall.css:53-80` — dark tokens use `@media (prefers-color-scheme: dark)` on `:root`
- `recall.css:385-436` — all hardcoded pink values live in practice/recording component styles
- `apps/web/tailwind.config.ts` and `apps/verifier/tailwind.config.ts` — empty v3 stubs
- `packages/ui/src/components/button/button.svelte:12,16` — uses `dark:` prefix (currently inert)
- `convex/schema.ts` `userPreferences` — has no theme field

## Desired End State

- **Every color, font, spacing, and radius value** flows through CSS custom properties defined in `:root`
- **Dark mode** works via `.dark` class on `<html>`, with system/light/dark preference stored in cookie + localStorage (no FOUC)
- **`dark:` Tailwind utilities** work correctly in all components
- **No hardcoded color literals** in component CSS rules — all use `var(--token)`
- **Typography scale** is tokenized — heading sizes, tracking, line-heights are theme vars
- **No vestigial config files**
- **`<meta theme-color>`** updates dynamically to match current mode

### Verification:
- Change `--theme-accent` in `:root` → entire app recolors
- Toggle `.dark` class on `<html>` → all tokens switch, `dark:` utilities activate
- Change `--theme-recording` → all recording UI recolors
- Change `--font-family-display` → all headings change font
- `bun run build` succeeds with no errors
- `bun run check` passes

## What We're NOT Doing

- No new UI components (the toggle itself is out of scope — just the infrastructure)
- No design changes (colors, fonts stay the same — we're just making them configurable)
- No changes to Convex schema (theme preference in `userPreferences` is a future task)
- No responsive breakpoint changes
- No layout restructuring

## Implementation Approach

Work bottom-up: tokens first, then dark mode unification, then hardcoded value extraction, then cleanup. Each phase is independently shippable.

---

## Phase 1: Extract Recording Tokens + Remove Hardcoded Colors

### Overview

Replace all 14 hardcoded `oklch(... 330)` pink/magenta values with new `--theme-recording-*` CSS custom properties and map them into `@theme inline`.

### Changes Required:

#### 1.1 Add recording tokens to `:root`

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add new recording tokens after the existing accent tokens (after line 30)

```css
/* Recording / playback accent */
--theme-recording: oklch(0.70 0.32 330);
--theme-recording-foreground: oklch(0.99 0.005 330);
--theme-recording-border: oklch(0.60 0.30 330);
--theme-recording-hover: oklch(0.65 0.32 330);
--theme-recording-fill: oklch(0.50 0.30 330);
```

#### 1.2 Add dark mode overrides for recording tokens

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add inside `@media (prefers-color-scheme: dark) :root { ... }` block

```css
--theme-recording: oklch(0.65 0.30 330);
--theme-recording-foreground: oklch(0.98 0.005 330);
--theme-recording-border: oklch(0.55 0.28 330);
--theme-recording-hover: oklch(0.60 0.30 330);
--theme-recording-fill: oklch(0.45 0.28 330);
```

#### 1.3 Map recording tokens into `@theme inline`

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add to `@theme inline` block

```css
--color-recording: var(--theme-recording);
--color-recording-foreground: var(--theme-recording-foreground);
```

#### 1.4 Replace all hardcoded oklch values in component rules

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Replace hardcoded values in `.practice-record-btn`, `.practice-player`, `.practice-player__fill`, `.practice-player__label`, `.feedback-banner`, `.feedback-banner:hover`

Before:
```css
.practice-record-btn {
    background: oklch(0.70 0.32 330) !important;
    color: oklch(0.99 0.005 330) !important;
    border-color: oklch(0.60 0.30 330) !important;
}
```

After:
```css
.practice-record-btn {
    background: var(--theme-recording) !important;
    color: var(--theme-recording-foreground) !important;
    border-color: var(--theme-recording-border) !important;
}
```

Same pattern for:
- `.practice-record-btn:hover` → `var(--theme-recording-hover)`
- `.practice-player` → `var(--theme-recording)`
- `.practice-player__fill` → `var(--theme-recording-fill)`
- `.practice-player__label` → `var(--theme-recording-foreground)`
- `.feedback-banner` → `var(--theme-recording)`, `var(--theme-recording-foreground)`, `var(--theme-recording-border)`
- `.feedback-banner:hover` → `var(--theme-recording-hover)`

#### 1.5 Remove standalone dark `.feedback-banner` block

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Delete the `@media (prefers-color-scheme: dark) .feedback-banner` block at lines 627-636 — no longer needed since tokens handle dark mode.

### Success Criteria:

#### Automated Verification:
- [x] `bun run build` succeeds
- [x] `bun run check` passes
- [x] No `oklch(` literals remain in component rules (only in `:root` token definitions)

#### Manual Verification:
- [ ] Recording button, player, and feedback banner still render pink/magenta
- [ ] Changing `--theme-recording` in devtools recolors all recording UI
- [ ] Dark mode (OS) still works for recording elements

---

## Phase 2: Unify Dark Mode Strategy

### Overview

Switch from `@media (prefers-color-scheme: dark)` to `.dark` class on `<html>`. Add a tiny inline script to prevent FOUC. This makes `dark:` Tailwind utilities work and enables future manual toggle.

### Changes Required:

#### 2.1 Convert dark mode tokens from media query to `.dark` class

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Replace `@media (prefers-color-scheme: dark) { :root { ... } }` with `:root.dark { ... }`

Before:
```css
@media (prefers-color-scheme: dark) {
:root {
    --theme-accent: oklch(0.93 0.27 116);
    /* ... */
}
}
```

After:
```css
:root.dark {
    --theme-accent: oklch(0.93 0.27 116);
    /* ... all dark tokens including new --theme-recording-* ... */
}
```

#### 2.2 Add inline FOUC-prevention script to app.html

**File**: `apps/web/src/app.html`
**File**: `apps/verifier/src/app.html`
**Changes**: Add inline script in `<head>` that reads preference and sets `.dark` class before paint

```html
<script>
    (function() {
        var d = document.documentElement;
        var t = localStorage.getItem('theme');
        if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
            d.classList.add('dark');
        }
    })();
</script>
```

This runs synchronously before any rendering. Logic:
- If `localStorage.theme === 'dark'` → add `.dark`
- If no preference stored → follow OS via `matchMedia`
- If `localStorage.theme === 'light'` → no class (light is default)

#### 2.3 Update `<meta theme-color>` to use a sensible default + script

**File**: `apps/web/src/app.html`, `apps/verifier/src/app.html`
**Changes**: Replace hardcoded `#0f172a` with light default and update in the FOUC script

```html
<meta name="theme-color" content="#f5f5f0" id="theme-color" />
```

Add to the inline script:
```js
if (d.classList.contains('dark')) {
    document.getElementById('theme-color').content = '#171717';
}
```

#### 2.4 Verify existing `dark:` utilities still work

No code changes needed — the existing `@custom-variant dark (&:is(.dark *))` at `recall.css:6` already targets `.dark` class. Once `.dark` is applied to `<html>`, all existing `dark:` utilities in these files will activate:
- `packages/ui/src/components/button/button.svelte:7,12,16`
- `packages/ui/src/components/dropdown-menu/dropdown-menu-item.svelte:23`
- `apps/web/src/routes/session/[id]/+page.svelte:165-166`
- `apps/web/src/routes/reveal/[id]/+page.svelte:79,83,85,96,100`

### Success Criteria:

#### Automated Verification:
- [x] `bun run build` succeeds
- [x] `bun run check` passes
- [x] No `@media (prefers-color-scheme: dark)` blocks remain in `recall.css`

#### Manual Verification:
- [ ] Set OS to dark mode → app renders dark (FOUC script applies `.dark` from `matchMedia`)
- [ ] Set `localStorage.theme = 'dark'` → app renders dark on reload regardless of OS
- [ ] Set `localStorage.theme = 'light'` → app renders light regardless of OS
- [ ] Remove `localStorage.theme` → falls back to OS preference
- [ ] `dark:` utilities in button, dropdown-menu, session, reveal pages now activate in dark mode
- [ ] No flash of wrong theme on page load

---

## Phase 3: Tokenize Typography Scale

### Overview

Promote hardcoded font sizes, tracking, and line heights from arbitrary bracket values in UI components into named CSS custom properties and `@theme inline` tokens.

### Changes Required:

#### 3.1 Add typography tokens to `:root`

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add after font-family vars

```css
/* Typography scale */
--theme-heading-size: 2rem;
--theme-heading-size-sm: 2.2rem;
--theme-heading-leading: 0.9;
--theme-heading-tracking: 0.04em;
--theme-body-desc-size: 0.97rem;
--theme-button-size: 0.82rem;
--theme-button-tracking: 0.12em;
--theme-kicker-size: 0.82rem;
--theme-kicker-tracking: 0.14em;
```

#### 3.2 Map typography tokens into `@theme inline`

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Add to `@theme inline` block

```css
--font-size-heading: var(--theme-heading-size);
--font-size-heading-sm: var(--theme-heading-size-sm);
--leading-heading: var(--theme-heading-leading);
--tracking-heading: var(--theme-heading-tracking);
--font-size-body-desc: var(--theme-body-desc-size);
--font-size-button: var(--theme-button-size);
--tracking-button: var(--theme-button-tracking);
```

#### 3.3 Update UI components to use tokens

**File**: `packages/ui/src/components/card/card-title.svelte`
**Changes**: Replace `text-[2rem] ... leading-[0.9] tracking-[0.04em] sm:text-[2.2rem]` with `text-heading leading-heading tracking-heading sm:text-heading-sm`

**File**: `packages/ui/src/components/dialog/dialog-title.svelte`
**Changes**: Same replacement as card-title

**File**: `packages/ui/src/components/card/card-description.svelte`
**Changes**: Replace `text-[0.97rem]` with `text-body-desc`

**File**: `packages/ui/src/components/dialog/dialog-description.svelte`
**Changes**: Replace `text-[0.97rem]` with `text-body-desc`

**File**: `packages/ui/src/components/button/button.svelte`
**Changes**: Replace `text-[0.82rem]` with `text-button`, `tracking-[0.12em]` with `tracking-button`, `focus-visible:ring-[3px]` → keep as-is (ring width is a one-off, not typography)

**File**: `packages/ui/src/components/input/input.svelte`
**Changes**: `tracking-[0.01em]` — keep as-is (subtle input tracking, not worth tokenizing)

### Success Criteria:

#### Automated Verification:
- [x] `bun run build` succeeds
- [x] `bun run check` passes

#### Manual Verification:
- [ ] Card titles, dialog titles, buttons render identically to before
- [ ] Changing `--theme-heading-size` in devtools resizes all headings
- [ ] Changing `--theme-button-size` in devtools resizes all buttons

---

## Phase 4: Cleanup

### Overview

Remove vestigial files and tighten up remaining loose ends.

### Changes Required:

#### 4.1 Delete vestigial Tailwind v3 config files

**Delete**: `apps/web/tailwind.config.ts`
**Delete**: `apps/verifier/tailwind.config.ts`

These are empty v3 stubs. Tailwind v4 uses the CSS-first config in `recall.css`. The `content` glob is handled by `@source` in `recall.css:4` and the Vite plugin.

#### 4.2 Add `@source` directives if needed

**File**: `packages/shared/src/styles/recall.css`
**Changes**: Verify `@source` covers both apps' templates. Currently line 4 only sources the UI package:

```css
@source "../../ui/src/**/*.{svelte,ts,js}";
```

Each app's Vite plugin already scans its own `src/` — no additional `@source` needed. But confirm builds pass after config deletion.

#### 4.3 Update `<meta theme-color>` values to match actual tokens

Already handled in Phase 2.3 — just verify the hex approximations are reasonable:
- Light: `#f5f5f0` ≈ `oklch(0.97 0.005 80)`
- Dark: `#171717` ≈ `oklch(0.09 0.01 260)`

### Success Criteria:

#### Automated Verification:
- [x] `bun run build` succeeds (both apps, no regressions from config deletion)
- [x] `bun run check` passes
- [x] No `tailwind.config.ts` files exist in the repo

#### Manual Verification:
- [ ] Both apps render correctly in dev mode
- [ ] Hot reload still works

---

## Testing Strategy

### Manual Testing Steps:

1. Open app in Chrome, toggle OS dark mode → theme switches
2. Open devtools, set `localStorage.theme = 'dark'`, reload → dark mode regardless of OS
3. Set `localStorage.theme = 'light'`, reload → light mode regardless of OS
4. Remove `localStorage.theme`, reload → follows OS
5. Edit `--theme-accent` in devtools → all accent colors change
6. Edit `--theme-recording` in devtools → all recording UI changes
7. Edit `--theme-heading-size` in devtools → all headings resize
8. Navigate through practice, session, verifier, reveal pages in both modes
9. Check no FOUC on page load in either mode

## Performance Considerations

- Inline FOUC script is ~200 bytes, runs synchronously — negligible impact
- CSS custom properties are resolved at paint time — no JS runtime cost
- Removing `@media (prefers-color-scheme: dark)` blocks and using class-based switching is equally performant

## References

- Tailwind v4 theme docs: CSS-first configuration
- shadcn-svelte theming: class-based dark mode with `@custom-variant`
- Current tokens: `packages/shared/src/styles/recall.css`
- Existing dark mode infra: `recall.css:6` (`@custom-variant dark`)
