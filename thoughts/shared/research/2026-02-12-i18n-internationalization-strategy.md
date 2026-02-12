---
date: 2026-02-12T06:29:02Z
researcher: heinschulie
git_commit: 6bb23446dbd8aa7001638be845d8fed107b0b8e3
branch: codex/extended-architecture
repository: babylon
topic: "Internationalization strategy — translating all UI chrome into user's language of choice (English, isiXhosa, extensible)"
tags: [research, codebase, i18n, internationalization, sveltekit, paraglide, xhosa]
status: complete
last_updated: 2026-02-12
last_updated_by: heinschulie
---

# Research: i18n / Deep UI Translation Strategy

**Date**: 2026-02-12T06:29:02Z
**Researcher**: heinschulie
**Git Commit**: 6bb23446dbd8aa7001638be845d8fed107b0b8e3
**Branch**: codex/extended-architecture
**Repository**: babylon

## Research Question

Best practices in 2026 for full internationalization of a SvelteKit 2 / Svelte 5 monorepo. Goal: every piece of UI text (navigation, buttons, labels, error messages, tooltips, loading states, etc.) — everything **except** the learning content itself — should render in the user's chosen language. Starting with English + isiXhosa, extensible to more languages.

## Summary

**Paraglide JS** (by Inlang) is the official Svelte-team-recommended i18n solution for SvelteKit in 2025-2026. It's a compiler-based library that generates typed message functions at build time, resulting in a ~300B runtime (70% smaller than alternatives), full tree-shaking, and complete type safety with IDE autocomplete. It integrates via `npx sv add paraglide` and handles URL-based locale routing, SSR, and language switching out of the box.

The Babylon codebase currently has **~230 unique user-facing English strings** spread across ~20 Svelte files and ~5 static files, with **zero existing i18n infrastructure**. All strings are hardcoded inline. The backend already has a well-architected language system (`convex/lib/languages.ts`) supporting 9 languages, but this is for target learning languages, not UI translation.

A `uiLocale` field on `userPreferences` would persist the user's UI language choice across sessions and devices.

---

## Detailed Findings

### 1. Current State of the Codebase

#### No i18n infrastructure exists
- No i18n library installed
- No translation files or locale directories
- No language context/store in layout
- All ~230 UI strings are hardcoded English in Svelte components
- No `+layout.ts` or `+layout.server.ts` for global state

#### Existing language infrastructure (for learning, not UI)
- `convex/lib/languages.ts` — defines 9 languages with BCP47, ISO639-1, display names, aliases
- `normalizeLanguage()` / `requireSupportedLanguage()` for validation
- Database stores language in 3 formats (BCP47, ISO639-1, display name)
- Xhosa (`xh-ZA`) hardcoded as fallback everywhere

#### User preferences system exists but lacks locale
- `userPreferences` table: `userId`, `quietHoursStart`, `quietHoursEnd`, `notificationsPerPhrase`, `pushSubscription`, `timeZone`
- No `uiLocale` or `preferredLanguage` field

#### String distribution (~230 strings total)
| Category | Approx Count | Examples |
|----------|-------------|----------|
| Page headers/titles | ~40 | "Phrase Library", "Practice Sessions", "Settings" |
| Button labels | ~60 | "Sign In", "Start Session", "Submit", "Cancel" |
| Form labels/placeholders | ~30 | "Email", "Password", "Type your phrase..." |
| Error messages | ~25 | "Login failed", "Failed to upload audio." |
| Loading/empty states | ~35 | "Loading phrases...", "No phrases yet" |
| Success/info messages | ~15 | "Saved!", "Notifications are enabled!" |
| Tooltips/aria-labels | ~10 | "Start practice", "Profile menu" |
| Notification text | ~5 | "Time to practice!" |
| Verifier guidance text | ~10 | Long descriptive paragraphs on scoring |

Apps affected:
- `apps/web/` — learner app (~150 strings across ~12 files)
- `apps/verifier/` — verifier app (~70 strings across ~6 files)
- `packages/ui/` — shared header (~10 strings in 1 file)
- Static files — `manifest.json`, `sw.js` (~5 strings)

---

### 2. 2026 Best Practices: Library Comparison

#### Paraglide JS — **Recommended**

| Aspect | Detail |
|--------|--------|
| Runtime | ~300B (compiler emits typed functions, no runtime parser) |
| Type safety | Full — IDE autocomplete, compile-time errors for missing keys |
| Tree-shaking | Yes — unused messages stripped by bundler |
| SSR | Yes — works with CSR, SSR, SSG |
| SvelteKit integration | Official — `npx sv add paraglide` |
| Pluralization | `Intl.PluralRules` (CLDR categories: zero/one/two/few/many/other) |
| URL routing | Localized URLs (`/en/settings`, `/xh/settings`) with `i18n.resolveRoute()` |
| Maintenance | Active, backed by Inlang/Opral |

**How it works**: Paraglide compiles `.json` message files into typed JS functions at build time. Instead of `$t('greeting', { name })` you call `m.greeting({ name })` — fully typed, tree-shakeable.

#### Alternatives (less recommended)

| Library | Pros | Cons |
|---------|------|------|
| svelte-i18n | Mature, full ICU MessageFormat | No tree-shaking, partial types, refactoring planned |
| typesafe-i18n | ~1KB, strong types | No updates in 2 years |
| sveltekit-i18n | Route-based loading | Looking for maintainers |
| Intlayer | Component-level dictionaries | Newer, less proven |

#### isiXhosa-specific considerations

Standard ICU MessageFormat supports pluralization (zero/one/two/few/many/other) which covers most Xhosa plural patterns. Xhosa's noun class system (15+ classes) is more complex than simple gender, but for **UI strings** (not linguistic content), standard plural rules suffice. UI strings like "3 phrases" or "Loading..." don't require noun class morphology.

---

### 3. Recommended Architecture

#### Translation file structure
```
messages/
  en.json          # English (default/source)
  xh.json          # isiXhosa
  af.json           # (future) Afrikaans
  zu.json           # (future) isiZulu
```

Each file:
```json
{
  "nav_library": "Phrase Library",
  "nav_practice": "Practice",
  "btn_sign_in": "Sign In",
  "btn_signing_in": "Signing in...",
  "error_login_failed": "Login failed",
  "practice_phrase_count": "{count, plural, one {# phrase} other {# phrases}}",
  ...
}
```

#### Language detection priority
1. **URL prefix** (`/xh/practice`) — explicit, SEO-friendly, shareable
2. **User preference** (`userPreferences.uiLocale`) — persisted across devices
3. **`Accept-Language` header** — browser default for first visit
4. **Fallback**: English

#### Persistence
- Add `uiLocale: v.optional(v.string())` to `userPreferences` schema
- On language switch, save to Convex + set cookie for SSR
- `+layout.server.ts` reads cookie/header, passes locale to client

#### Monorepo considerations
Both `apps/web` and `apps/verifier` need i18n. Options:
- **Shared messages**: `packages/shared/messages/en.json` for common strings (nav, auth, errors)
- **App-specific messages**: `apps/web/messages/en.json` for learner-specific, `apps/verifier/messages/en.json` for verifier-specific
- Paraglide supports multiple message directories

#### What changes per app
- Root `+layout.server.ts` — detect locale, pass to client
- Root `+layout.svelte` — set `<html lang={locale}>`, provide locale context
- Every component with hardcoded strings — replace with `m.key_name()` calls
- `manifest.json` — may need per-locale variants
- `sw.js` — notification text needs locale-aware messages

---

### 4. Specific Hardcoded References to Fix

Beyond string extraction, these structural items need attention:

| Item | Location | Issue |
|------|----------|-------|
| `languageCode: 'xh-ZA'` | `apps/web/src/routes/+page.svelte:48` | Hardcoded target language |
| `"Your Xhosa phrase"` | `apps/web/src/routes/+page.svelte:88` | Language name in label |
| `class="xhosa-phrase"` | 3 locations | Language-specific CSS class name |
| `"Language Recall"` | `manifest.json` (both apps) | App name in manifest |
| `"Time to practice!"` | `sw.js` | Notification body |
| Relative time strings | `practice/+page.svelte:13-33` | "Just now", "X Days Ago" etc. |
| Verifier guidance text | `verifier/+page.svelte:57-105` | Long paragraphs of guidance |

---

### 5. Implementation Approach (high level)

**Phase 1: Setup**
1. `npx sv add paraglide` in both apps (or at monorepo root)
2. Create `messages/en.json` with all extracted strings
3. Add `uiLocale` to `userPreferences` schema
4. Add `+layout.server.ts` for locale detection

**Phase 2: String extraction**
1. Replace all hardcoded strings with `m.key_name()` calls
2. Group by namespace if desired (auth, nav, practice, settings, verifier)
3. Handle pluralization patterns (`{count, plural, ...}`)
4. Handle interpolation (`{name}`, `{count}`, etc.)

**Phase 3: isiXhosa translations**
1. Create `messages/xh.json` with all translations
2. Add language switcher to settings (and possibly header)
3. Persist choice to `userPreferences.uiLocale`

**Phase 4: Polish**
1. Rename `xhosa-phrase` CSS class to `target-phrase`
2. Make `manifest.json` locale-aware
3. Localize service worker notification text
4. Test SSR locale detection

---

## Code References

- `convex/lib/languages.ts` — language definitions and resolution
- `convex/schema.ts` — database schema with language fields
- `convex/preferences.ts` — user preferences (needs `uiLocale` field)
- `apps/web/src/routes/+layout.svelte` — root layout (no i18n context yet)
- `apps/web/src/routes/+page.svelte:48` — hardcoded `'xh-ZA'`
- `apps/web/src/routes/practice/+page.svelte` — largest file, ~80 strings
- `apps/verifier/src/routes/+page.svelte` — verifier guidance text
- `packages/ui/src/components/header/Header.svelte` — shared nav strings

## Architecture Documentation

**Current pattern**: All UI text is English, hardcoded inline in Svelte components. No abstraction layer exists between string content and component rendering.

**Target pattern**: Paraglide compiler generates typed message functions from JSON files. Components call `m.key_name()` instead of inline strings. Locale resolved server-side via URL/cookie/header, passed through layout chain.

## Related Research

- `thoughts/shared/research/2026-02-12-shared-ui-across-frontends.md` — relevant for understanding how shared UI components work across apps
- `thoughts/shared/research/2026-02-12-shared-ui-monorepo-strategy.md` — monorepo structure context

## Open Questions

- Should URL routing include locale prefix (`/xh/practice`) or use cookie-only? URL prefix is better for SEO but this is a logged-in app, so SEO may not matter.
- Should the verifier app share the same message files as the learner app, or have completely separate translations?
- Do we need to translate the app name ("Language Recall") and PWA manifest per locale?
- Who will provide isiXhosa translations for the ~230 strings? Manual translation vs. machine + review?
- Should `manifest.json` localization be in scope for phase 1?
