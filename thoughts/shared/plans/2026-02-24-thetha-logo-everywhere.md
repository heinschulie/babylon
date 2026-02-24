# Thetha Logo Everywhere — Implementation Plan

## Overview

Replace all placeholder/Svelte logos with `thetha_logo.avif` across both apps. Use AVIF for browser-rendered contexts (favicon, header); keep PNG references for PWA/notification icons (user replaces PNG files separately).

## Current State

- **Favicon**: Both apps import `src/lib/assets/favicon.svg` — the default **Svelte logo**
- **Header**: `packages/ui/.../Header.svelte:59` renders `<span class="app-header__icon-placeholder">` — a bordered empty box
- **PWA manifest**: Both `static/manifest.json` reference `icon-192.png` / `icon-512.png` — keep as-is
- **apple-touch-icon**: Both `app.html:29` reference `icon-192.png` — keep as-is
- **Notification icon**: Both `sw.js:10` reference `icon-192.png` — keep as-is

## What We're NOT Doing

- Not converting AVIF → PNG (user handles PNG replacement separately)
- Not changing manifest.json, apple-touch-icon, or sw.js icon references

## Phase 1: Favicon — Replace Svelte SVG with thetha_logo.avif

### Changes Required:

#### 1.1 `apps/web/src/routes/+layout.svelte`

Remove the SVG favicon import, use static AVIF instead:

```diff
- import favicon from '$lib/assets/favicon.svg';
```

```diff
- <link rel="icon" href={favicon} />
+ <link rel="icon" href="/thetha_logo.avif" type="image/avif" />
```

#### 1.2 `apps/verifier/src/routes/+layout.svelte`

Same change as 1.1.

#### 1.3 Delete old favicon SVGs

- `apps/web/src/lib/assets/favicon.svg`
- `apps/verifier/src/lib/assets/favicon.svg`

## Phase 2: Header Logo — Replace placeholder with actual image

### Changes Required:

#### 2.1 `packages/ui/src/components/header/Header.svelte`

Add `logoSrc` prop and replace the placeholder span with an `<img>`:

**Props interface** — add:
```ts
logoSrc?: string;
```

**Destructure** — add:
```ts
logoSrc,
```

**Template** — replace:
```svelte
<span class="app-header__icon-placeholder"></span>
```
with:
```svelte
{#if logoSrc}
  <img src={logoSrc} alt="" class="app-header__logo-img" />
{:else}
  <span class="app-header__icon-placeholder"></span>
{/if}
```

#### 2.2 `packages/shared/src/styles/recall.css`

Add CSS for the logo image after the `.app-header__icon-placeholder` block:

```css
.app-header__logo-img {
  width: 1.5rem;
  height: 1.5rem;
  object-fit: contain;
}
```

#### 2.3 `apps/web/src/routes/+layout.svelte`

Pass `logoSrc` to Header:

```svelte
<Header
  logoSrc="/thetha_logo.avif"
  ...
/>
```

#### 2.4 `apps/verifier/src/routes/+layout.svelte`

Same — pass `logoSrc="/thetha_logo.avif"` to Header.

## Success Criteria

### Automated:

- [ ] `bun run build` passes
- [ ] `bun run check` passes

### Manual:

- [ ] Browser tab shows thetha logo as favicon (both apps)
- [ ] Header displays thetha logo image instead of empty box (both apps)
- [ ] PWA install icon still works (unchanged PNGs)
- [ ] Push notifications still show icon (unchanged PNGs)

## Follow-up (Out of Scope)

- Replace `icon-192.png` and `icon-512.png` in both `static/` dirs with correct thetha logo PNGs
- Replace `badge-72.png` with correct badge
