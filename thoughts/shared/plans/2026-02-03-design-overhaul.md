# Hyperbold Editorial Design Overhaul

## Overview

Full UI redesign moving from default shadcn-svelte styling to an editorial/magazine aesthetic. Inspired by bold poster typography — massive condensed type, acid yellow accent, flat/borderless layout. Dark mode is the hero aesthetic; light mode carries the same editorial boldness with inverted contrast.

## Current State

- Default shadcn slate theme with light/dark modes
- Standard `Card.Root` containers with borders and rounded corners everywhere
- `text-2xl font-bold` headings — conventional, small
- No custom fonts — using system stack
- `container mx-auto max-w-4xl` layout on all pages
- Standard shadcn buttons, inputs, dialogs
- Dark mode toggle via `.dark` class (existing infrastructure)

### Files to modify:
- `src/app.css` — theme tokens, fonts, base styles
- `src/app.html` — font preloads
- `src/routes/+layout.svelte` — layout structure
- `src/lib/components/Header.svelte` — navigation
- `src/routes/+page.svelte` — home/sessions list
- `src/routes/login/+page.svelte` — login
- `src/routes/register/+page.svelte` — register
- `src/routes/practice/+page.svelte` — practice mode
- `src/routes/session/[id]/+page.svelte` — session detail
- `src/routes/reveal/[id]/+page.svelte` — recall/reveal
- `src/routes/settings/+page.svelte` — settings
- `src/lib/components/ui/button/button.svelte` — button overrides
- `src/lib/components/ui/input/input.svelte` — input overrides
- `src/lib/components/ui/card/*.svelte` — card overrides (flatten)
- `src/lib/components/ui/dialog/*.svelte` — dialog overrides

## Desired End State

- **Dark mode (default):** near-black backgrounds, white text, acid yellow accents
- **Light mode:** off-white/warm gray backgrounds, near-black text, acid yellow accents (darker shade for contrast)
- Acid yellow/chartreuse as primary accent in both modes
- **Bebas Neue** for display headings (massive, condensed, all-caps)
- **Inter** for body/UI text (clean, modern)
- Headings at 4xl–8xl sizes with tight letter-spacing and leading
- Cards replaced with flat, borderless sections using spacing + typography hierarchy
- Buttons: flat, uppercase, bold — no rounded corners
- Inputs: bottom-border-only or minimal outline style
- Dialogs: large panel overlays on dark/light backdrop
- Overall feel: editorial magazine, not a SaaS dashboard

### Verification:
- App loads with Bebas Neue + Inter fonts
- Both dark and light modes render correctly with yellow accents
- No visible bordered cards
- Typography is dramatically larger on key headings
- Buttons and inputs match the flat/editorial style
- `npm run build` succeeds with no errors
- `npm run check` passes

## What We're NOT Doing

- No layout/routing changes — same pages, same data flow
- No backend/Convex changes
- No new components or features
- No animation overhaul (keep tw-animate-css as-is)

## Implementation Approach

Two phases: (1) design system foundation, (2) per-page restyling. Phase 1 sets up the tokens, fonts, and component-level overrides. Phase 2 applies the new aesthetic to each page template.

---

## Phase 1: Design System Foundation

### Overview
Replace theme tokens, load custom fonts, override shadcn component defaults. Both light and dark themes redesigned.

### Changes Required:

#### 1.1 Fonts — `src/app.html`

Add Google Fonts preloads for Bebas Neue and Inter:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
```

#### 1.2 Theme Tokens — `src/app.css`

Replace entire color system with both light and dark editorial palettes. Add font-family tokens.

```css
@import 'tailwindcss';
@import 'tw-animate-css';

@custom-variant dark (&:is(.dark *));

:root {
  --radius: 0px;
  --font-display: 'Bebas Neue', sans-serif;
  --font-body: 'Inter', system-ui, sans-serif;

  /* Light mode — editorial with warm neutrals */
  --background: oklch(0.97 0.005 80);       /* warm off-white */
  --foreground: oklch(0.12 0.02 260);       /* near-black */
  --card: oklch(0.94 0.005 80);             /* slightly darker off-white */
  --card-foreground: oklch(0.12 0.02 260);
  --popover: oklch(0.97 0.005 80);
  --popover-foreground: oklch(0.12 0.02 260);
  --primary: oklch(0.75 0.25 116);          /* darker acid yellow for light bg contrast */
  --primary-foreground: oklch(0.12 0.02 260);
  --secondary: oklch(0.92 0.005 80);
  --secondary-foreground: oklch(0.12 0.02 260);
  --muted: oklch(0.92 0.005 80);
  --muted-foreground: oklch(0.45 0.03 260);
  --accent: oklch(0.75 0.25 116);
  --accent-foreground: oklch(0.12 0.02 260);
  --destructive: oklch(0.55 0.25 27);
  --border: oklch(0 0 0 / 8%);
  --input: oklch(0 0 0 / 10%);
  --ring: oklch(0.75 0.25 116);
}

.dark {
  --background: oklch(0.09 0.01 260);       /* near-black */
  --foreground: oklch(0.95 0.01 260);       /* off-white */
  --card: oklch(0.12 0.01 260);
  --card-foreground: oklch(0.95 0.01 260);
  --popover: oklch(0.12 0.01 260);
  --popover-foreground: oklch(0.95 0.01 260);
  --primary: oklch(0.93 0.27 116);          /* full acid yellow #CCFF00 */
  --primary-foreground: oklch(0.09 0.01 260);
  --secondary: oklch(0.18 0.01 260);
  --secondary-foreground: oklch(0.85 0.01 260);
  --muted: oklch(0.18 0.01 260);
  --muted-foreground: oklch(0.55 0.02 260);
  --accent: oklch(0.93 0.27 116);
  --accent-foreground: oklch(0.09 0.01 260);
  --destructive: oklch(0.65 0.25 25);
  --border: oklch(1 0 0 / 8%);
  --input: oklch(1 0 0 / 12%);
  --ring: oklch(0.93 0.27 116);
}

@theme inline {
  --radius-sm: 0px;
  --radius-md: 0px;
  --radius-lg: 0px;
  --radius-xl: 0px;
  --font-family-display: var(--font-display);
  --font-family-body: var(--font-body);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground font-body;
  }
  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-display);
    text-transform: uppercase;
    letter-spacing: 0.02em;
    line-height: 0.9;
  }
}
```

**Light mode approach:** Same editorial boldness, but:
- Warm off-white background (not pure white — feels more editorial/print)
- Near-black text
- Slightly darker acid yellow (`oklch(0.75 0.25 116)`) so it's readable against light bg
- Borders use `oklch(0 0 0 / 8%)` instead of white-based

#### 1.3 Button Override — `src/lib/components/ui/button/button.svelte`

Change default variant styling:
- Remove border-radius (handled by `--radius: 0`)
- Uppercase text, font-body with font-semibold
- Primary variant: acid yellow bg, dark text (works in both modes via `primary` / `primary-foreground`)
- Outline variant: transparent bg, primary-colored border + text
- Ghost: transparent, foreground text

No structural changes — just class adjustments in the variant definitions.

#### 1.4 Input Override — `src/lib/components/ui/input/input.svelte`

Restyle to bottom-border-only:
- `border-0 border-b-2 border-border rounded-none bg-transparent`
- Focus: `border-b-primary`
- Font: body, tracking-wide
- Placeholder: muted-foreground

Uses theme tokens so it adapts to both light and dark.

#### 1.5 Card Override — `src/lib/components/ui/card/*.svelte`

Strip all visible card styling:
- `card.svelte`: remove `border`, `rounded-*`, `shadow` — just `bg-transparent` or very subtle `bg-card`
- `card-header.svelte`: remove padding adjustments — let page-level spacing handle it
- `card-title.svelte`: use `font-display text-3xl uppercase`
- `card-description.svelte`: use `text-muted-foreground font-body`

#### 1.6 Dialog Override — `src/lib/components/ui/dialog/*.svelte`

- `dialog-content.svelte`: `bg-background` (adapts to mode), no rounded corners, larger max-width
- `dialog-overlay.svelte`: darker overlay (`bg-black/80`)
- `dialog-title.svelte`: `font-display text-3xl uppercase`

### Success Criteria:

#### Automated:
- [x] `npm run build` succeeds
- [x] `npm run check` passes
- [ ] Fonts load from Google Fonts (check network tab)

#### Manual:
- [x] Dark mode: near-black bg, bright acid yellow accents, white text
- [x] Light mode: warm off-white bg, darker yellow accents, black text
- [x] Headings render in Bebas Neue (condensed, uppercase) in both modes
- [x] Body text renders in Inter
- [x] No visible card borders or rounded corners
- [x] Inputs have bottom-border-only style
- [x] Buttons are square-cornered, uppercase
- [x] Toggle between modes — both feel cohesive and editorial

**Pause here for manual verification before Phase 2.**

---

## Phase 2: Page-Level Restyling

### Overview
Apply the new design language to each page. Dramatic typography, editorial layouts, flat hierarchy. All pages use semantic theme tokens (`text-foreground`, `text-primary`, `bg-muted`, etc.) so they automatically adapt to light/dark mode.

### Changes Required:

#### 2.1 Header — `src/lib/components/Header.svelte`

```svelte
<header class="bg-background/80 backdrop-blur-sm border-b border-border">
  <div class="container mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
    <a href={resolve('/')} class="font-display text-3xl tracking-wide text-primary">RECALL</a>
    {#if $isAuthenticated}
      <nav class="flex items-center gap-6">
        <span class="text-xs uppercase tracking-widest text-muted-foreground">{$user?.name ?? $user?.email}</span>
        <a href={resolve('/settings')} class="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">Settings</a>
        <Button variant="ghost" size="sm" onclick={handleLogout} class="text-xs uppercase tracking-widest">Logout</Button>
      </nav>
    {/if}
  </div>
</header>
```

Key: Logo in Bebas Neue + acid yellow. Nav items small, uppercase, tracked-out. Uses `border-border` so it adapts to both modes.

#### 2.2 Home / Sessions — `src/routes/+page.svelte`

- Page title: `text-7xl font-display` — "SESSIONS" in massive condensed type
- Subtitle: small tracked-out body text below
- Session list: no cards, use a flat list with subtle dividers (`border-b border-border`)
- Each session row: language in `text-2xl font-display text-primary`, date in small muted text
- "New Session" button in accent yellow
- "Practice" button in outline/ghost style

```svelte
<div class="mx-auto max-w-6xl px-6 py-12">
  <div class="mb-12 flex items-end justify-between">
    <div>
      <h1 class="font-display text-7xl text-foreground">SESSIONS</h1>
      <p class="mt-2 text-sm uppercase tracking-widest text-muted-foreground">your learning sessions</p>
    </div>
    <div class="flex gap-3">
      <a href={resolve('/practice')}>
        <Button variant="outline">Practice</Button>
      </a>
      <Dialog.Trigger>...</Dialog.Trigger>
    </div>
  </div>

  <div class="divide-y divide-border">
    {#each sessions.data as session}
      <a href="..." class="group flex items-center justify-between py-6 transition-colors hover:bg-muted/50">
        <span class="font-display text-3xl text-primary">{session.targetLanguage}</span>
        <span class="text-sm text-muted-foreground">{session.date}</span>
      </a>
    {/each}
  </div>
</div>
```

#### 2.3 Login — `src/routes/login/+page.svelte`

- Full-screen centered
- "LOGIN" in massive type (text-8xl font-display) above form
- Form below: minimal, bottom-border inputs
- Remove Card wrapper entirely — use raw div with max-w
- "Sign In" button full-width, acid yellow
- Register link in small tracked-out text

#### 2.4 Register — `src/routes/register/+page.svelte`

Same treatment as login:
- "REGISTER" in massive type
- Bottom-border inputs, no card
- Full-width accent button

#### 2.5 Practice — `src/routes/practice/+page.svelte`

- "PRACTICE" in massive display type at top
- Target language shown in acid yellow
- English phrase displayed at text-4xl or larger, centered
- Input: full-width, bottom-border
- Check/Skip buttons: side by side, accent primary and ghost
- Result states: use color blocks (green/orange) but flat, no hard borders
- Correct answer shown in primary color when revealed
- "Next Phrase" button: full-width accent

#### 2.6 Session Detail — `src/routes/session/[id]/+page.svelte`

- Session language name in text-6xl display type, primary color
- Date small and tracked
- Phrase list: flat dividers, no cards
- Each phrase: English in text-xl, translation in muted text below
- Delete button: ghost, small, destructive on hover
- "Add Phrase" dialog: overlay, large panel

#### 2.7 Reveal — `src/routes/reveal/[id]/+page.svelte`

- "RECALL" in massive display type
- English word displayed very large (text-4xl+)
- Input: bottom-border, centered
- Result feedback: colored background blocks (no card border)
- Correct translation in primary color

#### 2.8 Settings — `src/routes/settings/+page.svelte`

- "SETTINGS" in massive display type
- Replace cards with flat sections separated by subtle dividers
- Section titles in display font
- Inputs: bottom-border style
- Buttons: flat, accent style

### Important note on mode-awareness:

All page markup uses semantic Tailwind tokens (`text-foreground`, `text-primary`, `bg-muted`, `border-border`, `text-muted-foreground`, etc.) rather than hardcoded colors. This means both light and dark modes work automatically from the token definitions in Phase 1 — no per-page conditional styling needed.

### Success Criteria:

#### Automated:
- [ ] `npm run build` succeeds
- [ ] `npm run check` passes

#### Manual:
- [ ] Home page shows "SESSIONS" in massive condensed type
- [ ] Session list uses flat dividers, no cards
- [ ] Login/Register pages show massive headings, no card wrappers
- [ ] Practice page has editorial layout with dramatic typography
- [ ] Session detail shows language name in large primary-colored type
- [ ] Settings uses flat section layout
- [ ] All pages feel cohesive in dark mode — dark editorial aesthetic
- [ ] All pages feel cohesive in light mode — warm, bold, same typography
- [ ] Interactive elements (buttons, inputs, dialogs) work correctly in both modes
- [ ] Yellow accent is visible on primary actions across all pages in both modes

---

## Testing Strategy

### Automated:
- `npm run build` — no build errors
- `npm run check` — svelte-check passes
- Existing functionality unchanged (same data flow, same routes)

### Manual:
1. Navigate all routes in dark mode — verify bg + yellow accent + condensed type
2. Toggle to light mode — verify warm bg + darker yellow + same typography
3. Create a session — dialog opens, styled correctly, submission works
4. Add phrases — dialog styled, verification flow works
5. Practice mode — cycling works, input/reveal styled
6. Reveal page — all 3 steps render correctly with new styles
7. Settings — save preferences, test notifications
8. Login/Register — forms submit correctly
9. Mobile viewport — check responsive behavior (condensed type scales)

## Performance Considerations

- Two Google Fonts loaded (Bebas Neue ~15kb, Inter ~100kb variable). Use `display=swap` for no layout shift.
- Could self-host fonts later for better perf, but Google Fonts is fine for now.
- No new JS, no new components — purely CSS/class changes.

## References

- Inspiration: Kanye West editorial poster (dark, acid yellow, condensed type)
- Fonts: [Bebas Neue](https://fonts.google.com/specimen/Bebas+Neue), [Inter](https://fonts.google.com/specimen/Inter)
- shadcn-svelte component source: `src/lib/components/ui/`

## Unresolved Questions

None — all design decisions resolved via user input.
