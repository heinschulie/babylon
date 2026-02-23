# Design Overhaul Implementation Plan

## Overview

Six UI fixes: style profile dropdown, simplify library card nesting, remove card borders, fix descender clipping, fix header spacing, wrap phrase groups in accordions.

## Current State Analysis

### Key Discoveries:

- Profile dropdown uses default shadcn `DropdownMenu` with tiny `py-1.5 px-2` touch targets (`dropdown-menu-item.svelte:23`)
- Library page (`apps/web/src/routes/+page.svelte:130-160`) wraps each category in `Card.Root` with `border border-border/60`, and each phrase `<li>` also has `border border-border/60` — double nesting
- `.target-phrase` has `line-height: 0.9` (`recall.css:385`) which clips descenders (g, y, p, q, j)
- Headings have `line-height: 0.88` (`recall.css:238`) — same descender problem
- `.app-header__nav` has `flex: 1` + `justify-content: space-between` (`recall.css:316-324`), spreading nav links across full width — user sees this as "space-around" behavior
- Accordion components already exist in `packages/ui/src/components/accordion/`

## What We're NOT Doing

- Changing colors, fonts, or overall theme
- Restructuring the data flow or Convex queries
- Modifying the practice page or verifier app
- Adding new i18n strings (accordion uses existing group labels)

## Implementation Approach

All changes are CSS/template-level. No backend changes. Single phase.

---

## Phase 1: All Six Fixes

### Changes Required:

#### 1.1 Style Profile Dropdown Menu

**File**: `packages/ui/src/components/dropdown-menu/dropdown-menu-item.svelte`
**Changes**: Increase padding from `px-2 py-1.5` to `px-4 py-3` for 48px+ touch targets. Bump text from `text-sm` to `text-base`.

**File**: `packages/ui/src/components/dropdown-menu/dropdown-menu-content.svelte`
**Changes**: Increase `p-1` to `p-2` for breathing room. Add `min-w-[12rem]` instead of `min-w-[8rem]`.

#### 1.2 Simplify Library Cards + Remove Borders

**File**: `apps/web/src/routes/+page.svelte`
**Changes**:
- Remove `Card.Root` / `Card.Header` / `Card.Content` wrappers from phrase groups
- Remove `border border-border/60 bg-background/85 backdrop-blur-sm` from outer card
- Remove `border border-border/60 bg-background/70` from inner `<li>` phrase cards
- Keep phrase `<li>` with just `phrase-card p-4 sm:p-5`
- Replace Card-based group wrappers with Accordion (see 1.5)
- For empty state card: also remove `border border-border/60 bg-background/85 backdrop-blur-sm`

#### 1.3 Fix Descender Clipping

**File**: `packages/shared/src/styles/recall.css`
**Changes**:
- `.target-phrase` line 385: change `line-height: 0.9` → `line-height: 1.0` (enough room for descenders without visually changing layout much)
- Add `padding-bottom: 0.08em` to `.target-phrase` as extra descender safety
- Headings (line 238): change `line-height: 0.88` → `line-height: 0.95` — Bebas Neue is all-caps so descenders shouldn't be an issue there, but this change is safe

Actually — Bebas Neue is uppercase-only and has no descenders. The `.target-phrase` uses the body font (Public Sans) at large sizes. The clipping comes from `line-height: 0.9` combined with `overflow: hidden` + `max-block-size`. Fix: bump `line-height` to `1.05` on `.target-phrase`.

#### 1.4 Fix Header Spacing

**File**: `packages/shared/src/styles/recall.css`
**Changes**:
- `.app-header__bar` (line 289): add `justify-content: space-between`
- `.app-header__nav` (line 316): remove `flex: 1` and `justify-content: space-between`, replace with `gap: 0.28rem` only (links cluster naturally)

This pushes the icon left, nav center, avatar right — with the nav links sitting together instead of spread across the full width.

#### 1.5 Accordion for Phrase Groups (Default Open)

**File**: `apps/web/src/routes/+page.svelte`
**Changes**:
- Import `* as Accordion from '@babylon/ui/accordion'` instead of `* as Card from '@babylon/ui/card'` (keep Card import only if still needed for empty state)
- Wrap `<Accordion.Root type="multiple">` around the groups list, with `value` bound to all group keys so all are open by default
- Each group becomes `<Accordion.Item value={group.key}>`
- The group label becomes `<Accordion.Trigger>` containing the same title text
- The phrase list becomes `<Accordion.Content>`

**Critical**: Override accordion trigger styles to match current card header appearance exactly:
- Title: `text-3xl sm:text-4xl` + `font-display uppercase leading-heading tracking-heading` (from Card.Title)
- Description (phrase count): stays as separate element inside trigger area
- Remove default accordion trigger `text-sm font-medium` — override with custom classes
- Remove default `hover:underline` from trigger
- Remove `border-b` from accordion item (default shadcn adds this)

**File**: `packages/ui/src/components/accordion/accordion-trigger.svelte`
**Changes**: No changes needed — we'll override via class props.

**File**: `packages/ui/src/components/accordion/accordion-item.svelte`
**Changes**: The default has `border-b last:border-b-0`. We'll override via class prop per-instance.

**File**: `packages/ui/src/components/accordion/accordion-content.svelte`
**Changes**: Default inner div has `pt-0 pb-4` and outer has `text-sm` — override via class props.

### Detailed Template Structure (post-change):

```svelte
<!-- compute all keys for default-open -->
{@const allKeys = phraseGroups.data.map(g => g.key)}

<Accordion.Root type="multiple" value={allKeys}>
  {#each phraseGroups.data as group (group.key)}
    <Accordion.Item value={group.key} class="border-none">
      <Accordion.Trigger class="text-3xl sm:text-4xl font-display uppercase leading-heading tracking-heading hover:no-underline py-0 gap-2">
        <div>
          <span>{group.label}</span>
          <p class="text-muted-foreground text-body-desc leading-relaxed font-body normal-case tracking-normal">
            {m.library_phrase_count({ count: group.phrases.length })}
          </p>
        </div>
      </Accordion.Trigger>
      <Accordion.Content class="text-base">
        <ul class="space-y-3">
          {#each group.phrases as phrase (phrase._id)}
            <li class="phrase-card p-4 sm:p-5">
              <!-- same inner content as before -->
            </li>
          {/each}
        </ul>
      </Accordion.Content>
    </Accordion.Item>
  {/each}
</Accordion.Root>
```

### Success Criteria:

#### Automated Verification:

- [x] Type check passes: `bun run check` (web passes; verifier has pre-existing Uint8Array error)
- [x] Build succeeds: `bun run build`
- [ ] Dev server starts without errors: `bun run dev`

#### Manual Verification:

- [ ] Profile dropdown items have comfortable 48px+ touch targets
- [ ] Library page shows no nested card borders — clean, flat layout
- [ ] No card outlines visible anywhere on library page
- [ ] Descenders (g, y, p, q, j) in target phrases are not clipped
- [ ] Header: icon left, nav links clustered center, avatar right (space-between)
- [ ] Accordion sections default open, can be collapsed/expanded
- [ ] Font sizes, weights, and visual hierarchy unchanged after accordion swap

## Unresolved Questions

- The `line-height: 0.88` on all headings (h1-h6): should we bump this too? Bebas Neue is all-caps so no descenders, but numbers might clip. Safe to leave at 0.88?
- Should accordion chevron icon be visible or hidden? Default shadcn shows a chevron — keep it?
