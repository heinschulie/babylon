---
name: Babylon
description: Energetic, warm, bold product UI for spoken isiXhosa practice and human review.
colors:
  primary-lime: "oklch(0.75 0.25 116)"
  primary-lime-dark: "oklch(0.93 0.27 116)"
  primary-foreground: "oklch(0.12 0.02 260)"
  background: "oklch(0.97 0.005 80)"
  foreground: "oklch(0.12 0.02 260)"
  card: "oklch(0.94 0.005 80)"
  muted: "oklch(0.92 0.005 80)"
  muted-foreground: "oklch(0.45 0.03 260)"
  border: "oklch(0 0 0 / 8%)"
  recording-magenta: "oklch(0.70 0.32 330)"
  recording-foreground: "oklch(0.99 0.005 330)"
  destructive: "oklch(0.55 0.25 27)"
typography:
  display:
    fontFamily: "Bebas Neue, sans-serif"
    fontSize: "2rem"
    fontWeight: 400
    lineHeight: 0.88
    letterSpacing: "0.04em"
  headline:
    fontFamily: "Bebas Neue, sans-serif"
    fontSize: "clamp(1.55rem, min(46svh / 4.7, 11.8cqi), 5.2rem)"
    fontWeight: 400
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Public Sans, Avenir Next, Segoe UI, sans-serif"
    fontSize: "clamp(1rem, 0.95rem + 0.22vw, 1.08rem)"
    fontWeight: 400
    lineHeight: 1.52
  label:
    fontFamily: "Public Sans, Avenir Next, Segoe UI, sans-serif"
    fontSize: "0.82rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.12em"
rounded:
  none: "0px"
spacing:
  page-inline: "clamp(1rem, 2.6vw, 2.5rem)"
  page-block: "clamp(1.25rem, 2.4vw, 2.5rem)"
  content-gap: "clamp(1rem, 1.8vw, 1.5rem)"
  control-sm: "0.5rem"
  control-md: "0.88rem"
components:
  button-primary:
    backgroundColor: "{colors.primary-lime}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "2.5rem"
    padding: "0.625rem 1.25rem"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.primary-lime}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    height: "2.5rem"
    padding: "0.625rem 1.25rem"
  input-underline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    height: "2.5rem"
    padding: "0.5rem 0"
  card-flat:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.none}"
    padding: "1.25rem"
  practice-fab:
    backgroundColor: "{colors.primary-lime}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.none}"
    width: "3.5rem"
    height: "3.5rem"
---

# Design System: Babylon

## 1. Overview

**Creative North Star: "The Practice Poster"**

Babylon's interface behaves like a bright practice poster pinned inside a focused training room: large voice-led typography, direct square controls, visible state, and enough warmth to keep repetition from feeling clinical. The system is poster-bold but task-first. It should push learners into speaking, listening, and repeating without turning practice into a cartoon reward loop.

The product register stays restrained in structure and bold in moments. Routine UI uses flat surfaces, crisp borders, concise labels, and consistent spacing. High-energy moments, recording, feedback, current navigation, ready phrases, use saturated lime or magenta so the user always knows what is live.

This system explicitly rejects corporate edtech, generic SaaS learning dashboards, and Duolingo-style gamified cuteness. Motivation comes from clarity, rhythm, and progress, not mascots, patronizing badges, or stock classroom gloss.

**Key Characteristics:**
- Square, tactile controls with no-radius geometry.
- Bebas Neue display type for practice phrases, card titles, and bold status moments.
- Public Sans for all readable product work: body text, forms, settings, and scoring.
- OKLCH semantic tokens with light, dark, and mono skins.
- Flat by default, with depth expressed through tonal layers, borders, sticky bars, and state changes.

## 2. Colors

The palette is warm-neutral and product-readable, interrupted by active lime for practice momentum and voice magenta for recording states.

### Primary
- **Call-and-Response Green** (`primary-lime`): the action accent for primary buttons, active navigation, phrase highlights, streak numerals, verifier queue affordances, and selected states. Use it when the product is asking the user to act or notice the current state.

### Secondary
- **Live Mic Pink** (`recording-magenta`): reserved for recording, playback, live feedback banners, and microphone-adjacent states. This is not a decorative brand color. It means voice is active, captured, or ready to review.

### Neutral
- **Soft Studio** (`background`): the main light-mode field. It keeps the app warm without becoming parchment or lifestyle branding.
- **Ink Blue-Black** (`foreground`): primary copy and UI text. It must remain the default for readable content.
- **Practice Panel** (`card`): a subtle neutral layer for grouped content and card-like containers.
- **Quiet Instruction** (`muted-foreground`): secondary metadata, helper text, and lower-priority explanatory copy.
- **Hairline Structure** (`border`): dividers, button outlines, inputs, and score chips.

### Named Rules
**The Live Color Rule.** Lime and magenta mean state or action. If a color does not tell the user what is active, current, recording, selected, or next, remove it.

**The Warm Without Cute Rule.** Warmth comes from Soft Studio, human copy, and confident spacing. Never use candy colors, mascot palettes, or classroom clip-art tones.

## 3. Typography

**Display Font:** Bebas Neue with sans-serif fallback
**Body Font:** Public Sans with Avenir Next, Segoe UI, and sans-serif fallbacks
**Label/Mono Font:** Public Sans

**Character:** The pairing is loud in the practice moments and calm in the work moments. Bebas Neue gives isiXhosa phrases and key status blocks poster force; Public Sans keeps forms, scores, settings, and verifier work precise.

### Hierarchy
- **Display** (400, `2rem`, `0.88`): card titles, page headings, banners, and short status phrases. Always uppercase because the font is built for it.
- **Headline** (400, responsive phrase clamp, `1.05`): the target phrase in practice sessions. It may be large, but it must never overflow or obscure controls.
- **Title** (600, `1rem` to `1.125rem`, compact line-height): product section titles, scoring headings, and settings groups.
- **Body** (400 to 600, fluid base size, `1.52`): instructions, theory content, feedback text, and settings copy. Long prose should stay within 65 to 75 characters.
- **Label** (600, `0.82rem`, `0.12em`, uppercase): buttons, nav links, queue modes, small action labels, and compact chips.

### Named Rules
**The Voice-First Type Rule.** Bebas Neue is for practice phrases and high-signal headings, not dense instructions or form labels.

**The Readability Rule.** Public Sans owns every workflow decision. If a verifier must score it or a learner must understand it under pressure, use the body font.

## 4. Elevation

Babylon is flat by default. Depth comes from surface contrast, sticky positioning, borders, active fills, and small motion responses. Shadows are allowed only for overlays and transient menus inherited from the component library, not as decorative card lift.

### Shadow Vocabulary
- **Overlay Shadow** (`shadow-md` in dropdown menus): use only for floating menus, popovers, and overlays that must separate from the page plane.
- **Interactive Lift** (`transform: scale(1.06)` on `.practice-fab:hover`): use for the floating practice or verifier action only. Do not generalize this to all buttons.

### Named Rules
**The Flat Workbench Rule.** Cards and panels stay on the page plane. If a surface needs emphasis, use hierarchy, border, tonal fill, or active color before shadow.

## 5. Components

### Buttons
- **Shape:** square and direct, no radius (`0px`).
- **Primary:** Call-and-Response Green fill with Ink Blue-Black text; uppercase Public Sans label; compact height (`2.5rem`) and horizontal padding.
- **Hover / Focus:** hover darkens through opacity or tonal mix; focus uses the ring token and must remain visible in all skins.
- **Secondary / Ghost / Tertiary:** outline buttons use transparent backgrounds with lime borders; ghost buttons use tonal hover fills only when the surrounding surface is quiet.

### Chips
- **Style:** compact uppercase labels with hairline borders and muted text for inactive states.
- **State:** selected chips invert into the active lime fill or foreground border. Score chips must not rely on color alone; keep visible text or numerals.

### Cards / Containers
- **Corner Style:** square (`0px`).
- **Background:** transparent or Practice Panel depending on grouping. Avoid nested card stacks.
- **Shadow Strategy:** flat by default. Use borders, spacing, and typography for separation.
- **Border:** hairline structure only. No thick side stripes.
- **Internal Padding:** `1.25rem` to `1.5rem`, with `page-inline` for full-width practice and review areas.

### Inputs / Fields
- **Style:** transparent underline fields with a two-pixel bottom border.
- **Focus:** bottom border shifts to Call-and-Response Green.
- **Error / Disabled:** destructive bottom border for invalid input; disabled controls reduce opacity and must not trap focus.

### Navigation
- **Style:** sticky header with a subtly translucent Soft Studio or dark surface, compact uppercase links, and horizontal scrolling on small screens.
- **Active State:** active route uses the primary fill and primary foreground. Hover states adjust color or border only.
- **Mobile Treatment:** keep top navigation compact. Do not add heavy sidebars to learner practice flows.

### Practice Phrase
The target phrase is the signature component. It uses Bebas Neue, Call-and-Response Green, tight but safe tracking, container-aware sizing, and generous central placement. The phrase should command the screen without hiding recording controls.

### Recording Controls
Recording and playback controls use Live Mic Pink and clear progress fill. The recording state must feel immediate, visible, and reversible; it cannot look like a generic submit button.

### Verifier Work Surfaces
Verifier screens use the same square, flat vocabulary but with stricter density. Scoring controls, claim deadlines, AI audit status, and exemplar recording must be visually unambiguous and keyboard reachable.

## 6. Do's and Don'ts

### Do:
- **Do** use Call-and-Response Green only for active state, primary action, selection, or practice emphasis.
- **Do** reserve Live Mic Pink for recording, playback, voice feedback, and microphone-adjacent status.
- **Do** keep controls square (`0px`) unless the element is intrinsically circular, such as an avatar image.
- **Do** use Public Sans for forms, explanations, settings, billing, and verifier scoring.
- **Do** make score and status meaning available through text or numerals, not color alone.
- **Do** preserve strong contrast in light, dark, and mono skins.

### Don't:
- **Don't** make Babylon feel like corporate edtech, a generic SaaS learning dashboard, or Duolingo-style gamified cuteness.
- **Don't** add mascots, childish reward badges, stock classroom imagery, or patronizing streak copy.
- **Don't** use thick colored side-stripe borders on cards, alerts, or review items.
- **Don't** add decorative gradient text, glass cards, or soft shadow-and-border ghost cards.
- **Don't** use Bebas Neue for dense instructions, form helper text, or long theory paragraphs.
- **Don't** introduce rounded cards, pill-shaped panels, or ornamental shadows that conflict with the square workbench vocabulary.
