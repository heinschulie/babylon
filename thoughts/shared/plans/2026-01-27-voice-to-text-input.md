# Voice-to-Text Input Implementation Plan

## Overview

Add voice-to-text functionality to language learning input fields using the Web Speech API, with a "verify translation" button that opens Google Translate for manual verification.

## Current State Analysis

### Existing Input Component
- `src/lib/components/ui/input/input.svelte` - Standard shadcn-svelte input component
- Uses Svelte 5 `$props()` and `$bindable()` patterns
- Supports standard HTML input attributes

### Input Field Locations
1. **Target Language** (`src/routes/+page.svelte:78-82`) - New session dialog
2. **English Phrase** (`src/routes/session/[id]/+page.svelte:83`) - Add phrase dialog
3. **Translation** (`src/routes/session/[id]/+page.svelte:87`) - Add phrase dialog

### Key Discoveries:
- App uses Svelte 5 runes syntax (`$state`, `$props`, `$effect`)
- bits-ui primitives with tailwind-variants for styling
- No existing audio/speech functionality in codebase

## Desired End State

- All three text inputs have a microphone button inside the input field (right side)
- Clicking mic starts speech recognition via Web Speech API
- Visual feedback shows listening state (pulsing mic icon)
- Transcribed text populates the input field
- "Check Translation" button opens Google Translate in new tab with phrase pair
- Graceful fallback for unsupported browsers

### Verification:
- Manual: Test voice input on Chrome/Safari/Edge
- Manual: Verify "Check Translation" opens correct Google Translate URL
- Automated: TypeScript compiles, tests pass

## What We're NOT Doing

- Cloud-based speech APIs (Whisper, Google Cloud Speech) - using free Web Speech API
- Automatic translation verification via API - user manually checks via Google Translate link
- Voice input for login/register forms (inappropriate for passwords)
- Voice input for numeric settings fields (quiet hours, notifications per phrase)
- Continuous listening mode - single push-to-talk style interaction

## Implementation Approach

Create a new `VoiceInput` component that wraps the existing `Input` component, adding:
1. Mic button inside input (absolute positioned)
2. Web Speech API integration with state management
3. Language prop to set recognition language (English vs target language)
4. Optional "Check Translation" link generation

---

## Phase 1: Create VoiceInput Component

### Overview
Build the core VoiceInput component with Web Speech API integration.

### Changes Required:

#### 1.1 Create Voice Input Component

**File**: `src/lib/components/ui/voice-input/voice-input.svelte`
**Changes**: New component wrapping Input with mic button

```svelte
<script lang="ts">
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { cn, type WithElementRef } from '$lib/utils.js';
  import { Input } from '$lib/components/ui/input';
  import { Mic, MicOff, Loader2 } from '@lucide/svelte';

  type Props = WithElementRef<HTMLInputAttributes> & {
    lang?: string;
    onTranscript?: (text: string) => void;
  };

  let {
    ref = $bindable(null),
    value = $bindable(''),
    lang = 'en-US',
    onTranscript,
    class: className,
    ...restProps
  }: Props = $props();

  let isListening = $state(false);
  let isSupported = $state(false);
  let recognition: SpeechRecognition | null = null;

  $effect(() => {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    isSupported = !!SpeechRecognition;

    if (isSupported) {
      recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = lang;

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        value = transcript;
        onTranscript?.(transcript);
        isListening = false;
      };

      recognition.onerror = () => {
        isListening = false;
      };

      recognition.onend = () => {
        isListening = false;
      };
    }

    return () => {
      recognition?.abort();
    };
  });

  // Update lang when prop changes
  $effect(() => {
    if (recognition) {
      recognition.lang = lang;
    }
  });

  function toggleListening() {
    if (!recognition) return;

    if (isListening) {
      recognition.stop();
    } else {
      recognition.start();
      isListening = true;
    }
  }
</script>

<div class="relative">
  <Input
    bind:ref
    bind:value
    class={cn('pr-10', className)}
    {...restProps}
  />
  {#if isSupported}
    <button
      type="button"
      onclick={toggleListening}
      class={cn(
        'absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors',
        'hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring',
        isListening && 'text-destructive animate-pulse'
      )}
      aria-label={isListening ? 'Stop listening' : 'Start voice input'}
    >
      {#if isListening}
        <Mic class="h-4 w-4" />
      {:else}
        <Mic class="h-4 w-4 text-muted-foreground" />
      {/if}
    </button>
  {/if}
</div>
```

#### 1.2 Create Index Export

**File**: `src/lib/components/ui/voice-input/index.ts`
**Changes**: Export component

```typescript
import VoiceInput from './voice-input.svelte';

export { VoiceInput };
```

#### 1.3 Add TypeScript Declarations for Web Speech API

**File**: `src/lib/types/speech.d.ts`
**Changes**: Type declarations for SpeechRecognition

```typescript
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export {};
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `pnpm check`
- [ ] Build succeeds: `pnpm build`
- [ ] Tests pass: `pnpm test:run`

#### Manual Verification:
- [ ] Component renders mic button inside input
- [ ] Clicking mic triggers speech recognition (Chrome)
- [ ] Transcribed text appears in input field
- [ ] Mic button shows listening state (pulsing)
- [ ] No mic button shown on unsupported browsers

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Integrate VoiceInput in Session Page

### Overview
Replace Input components with VoiceInput for English phrase and Translation fields.

### Changes Required:

#### 2.1 Update Session Detail Page

**File**: `src/routes/session/[id]/+page.svelte`
**Changes**:
- Import VoiceInput
- Replace Input with VoiceInput for english and translation fields
- Pass appropriate `lang` prop (English for english field, session's targetLanguage for translation)

```diff
- import { Input } from '$lib/components/ui/input';
+ import { Input } from '$lib/components/ui/input';
+ import { VoiceInput } from '$lib/components/ui/voice-input';

// In dialog:
- <Input id="english" placeholder="Enter English phrase" bind:value={english} />
+ <VoiceInput id="english" placeholder="Enter English phrase" bind:value={english} lang="en-US" />

- <Input id="translation" placeholder="Enter translation" bind:value={translation} />
+ <VoiceInput id="translation" placeholder="Enter translation" bind:value={translation} lang={/* need session targetLanguage */} />
```

#### 2.2 Fetch Session Data for Language

**File**: `src/routes/session/[id]/+page.svelte`
**Changes**: Query session to get targetLanguage for translation voice recognition

Need to add a query to get the session's targetLanguage, or modify listBySession to include it.

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `pnpm check`
- [ ] Build succeeds: `pnpm build`

#### Manual Verification:
- [ ] Voice input works for English field (speaks English, transcribes correctly)
- [ ] Voice input works for Translation field (speaks target language)
- [ ] Fallback to regular input on unsupported browsers

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Integrate VoiceInput in Home Page

### Overview
Add VoiceInput for target language field in new session dialog.

### Changes Required:

#### 3.1 Update Home Page

**File**: `src/routes/+page.svelte`
**Changes**: Replace Input with VoiceInput for targetLanguage field

```diff
- import { Input } from '$lib/components/ui/input';
+ import { Input } from '$lib/components/ui/input';
+ import { VoiceInput } from '$lib/components/ui/voice-input';

// In dialog:
- <Input
-   id="targetLanguage"
-   placeholder="e.g., Spanish, French, German"
-   bind:value={targetLanguage}
- />
+ <VoiceInput
+   id="targetLanguage"
+   placeholder="e.g., Spanish, French, German"
+   bind:value={targetLanguage}
+   lang="en-US"
+ />
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `pnpm check`
- [ ] Build succeeds: `pnpm build`

#### Manual Verification:
- [ ] Voice input works for target language field
- [ ] Can say "Spanish" or "French" and it populates correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Add Translation Verification

### Overview
Add "Check Translation" button that opens Google Translate with the phrase pair.

### Changes Required:

#### 4.1 Create Translation Verification Helper

**File**: `src/lib/utils/translation.ts`
**Changes**: Helper function to generate Google Translate URL

```typescript
/**
 * Generate Google Translate URL for verification
 * @param text - Source text to translate
 * @param sourceLang - Source language code (e.g., 'en')
 * @param targetLang - Target language name (e.g., 'Spanish')
 */
export function getGoogleTranslateUrl(
  text: string,
  sourceLang: string = 'en',
  targetLang: string = 'auto'
): string {
  const targetCode = getLanguageCode(targetLang);
  const encodedText = encodeURIComponent(text);
  return `https://translate.google.com/?sl=${sourceLang}&tl=${targetCode}&text=${encodedText}&op=translate`;
}

/**
 * Map common language names to Google Translate codes
 */
function getLanguageCode(langName: string): string {
  const map: Record<string, string> = {
    spanish: 'es',
    french: 'fr',
    german: 'de',
    italian: 'it',
    portuguese: 'pt',
    dutch: 'nl',
    russian: 'ru',
    chinese: 'zh-CN',
    japanese: 'ja',
    korean: 'ko',
    arabic: 'ar',
    hindi: 'hi',
    // Add more as needed
  };
  return map[langName.toLowerCase()] || 'auto';
}
```

#### 4.2 Add Check Translation Button to Session Page

**File**: `src/routes/session/[id]/+page.svelte`
**Changes**: Add button below translation input that opens Google Translate

```svelte
<script>
  import { getGoogleTranslateUrl } from '$lib/utils/translation';
  import { ExternalLink } from '@lucide/svelte';

  // ... existing code ...
</script>

<!-- After translation input -->
{#if english.trim() && translation.trim()}
  <a
    href={getGoogleTranslateUrl(english, 'en', /* session.targetLanguage */)}
    target="_blank"
    rel="noopener noreferrer"
    class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
  >
    <ExternalLink class="h-3 w-3" />
    Check translation online
  </a>
{/if}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compiles: `pnpm check`
- [ ] Build succeeds: `pnpm build`
- [ ] Tests for translation helper pass: `pnpm test:run`

#### Manual Verification:
- [ ] "Check translation" link appears when both fields have content
- [ ] Clicking opens Google Translate in new tab
- [ ] Correct source text and target language in Google Translate

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Add Tests and Error Handling

### Overview
Add unit tests and improve error handling/UX.

### Changes Required:

#### 5.1 Add Translation Helper Tests

**File**: `src/lib/utils/translation.test.ts`
**Changes**: Unit tests for getGoogleTranslateUrl

```typescript
import { describe, it, expect } from 'vitest';
import { getGoogleTranslateUrl } from './translation';

describe('getGoogleTranslateUrl', () => {
  it('generates correct URL for Spanish', () => {
    const url = getGoogleTranslateUrl('hello', 'en', 'Spanish');
    expect(url).toBe('https://translate.google.com/?sl=en&tl=es&text=hello&op=translate');
  });

  it('encodes special characters', () => {
    const url = getGoogleTranslateUrl('hello world', 'en', 'French');
    expect(url).toContain('text=hello%20world');
  });

  it('defaults to auto for unknown languages', () => {
    const url = getGoogleTranslateUrl('test', 'en', 'Klingon');
    expect(url).toContain('tl=auto');
  });
});
```

#### 5.2 Add VoiceInput Component Tests

**File**: `src/lib/components/ui/voice-input/voice-input.test.ts`
**Changes**: Component tests

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import VoiceInput from './voice-input.svelte';

describe('VoiceInput', () => {
  it('renders input with mic button when supported', () => {
    // Mock SpeechRecognition
    window.SpeechRecognition = vi.fn().mockImplementation(() => ({
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
    }));

    const { container } = render(VoiceInput, { props: { placeholder: 'Test' } });
    expect(container.querySelector('input')).toBeTruthy();
    expect(container.querySelector('button')).toBeTruthy();
  });

  it('hides mic button when not supported', () => {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;

    const { container } = render(VoiceInput, { props: { placeholder: 'Test' } });
    expect(container.querySelector('input')).toBeTruthy();
    expect(container.querySelector('button')).toBeFalsy();
  });
});
```

### Success Criteria:

#### Automated Verification:
- [ ] All tests pass: `pnpm test:run`
- [ ] TypeScript compiles: `pnpm check`
- [ ] Build succeeds: `pnpm build`

#### Manual Verification:
- [ ] Error message shown if speech recognition fails
- [ ] Graceful handling when user denies microphone permission

---

## Testing Strategy

### Unit Tests:
- Translation URL generation helper
- VoiceInput component rendering (with/without browser support)

### Integration Tests:
- Component interaction with Svelte 5 bindings

### Manual Testing Steps:
1. Open session detail page in Chrome
2. Click mic button on English input, speak a phrase
3. Verify transcription appears in input
4. Click mic button on Translation input, speak in target language
5. Verify transcription appears
6. With both fields filled, click "Check translation online"
7. Verify Google Translate opens with correct text and languages
8. Test on Safari to verify webkit prefix works
9. Test on Firefox to verify graceful fallback (no mic button)

## Performance Considerations

- Speech recognition runs client-side, no API latency
- No additional bundle size beyond existing lucide icons
- Lazy initialization of SpeechRecognition (only when component mounts)

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome | Full |
| Safari | Full (webkit prefix) |
| Edge | Full |
| Firefox | No support (graceful fallback) |

## References

- Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- Google Translate URL structure: https://translate.google.com/
- Existing Input component: `src/lib/components/ui/input/input.svelte`
