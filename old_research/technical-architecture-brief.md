# Technical Architecture Brief: Xhosa Language Production App

## Document Purpose

You are the technical architect responsible for designing the system architecture of a language learning application. This document provides the complete business context, theoretical foundations, financial constraints, and operational requirements you must satisfy. Your role is to translate these requirements into a robust, scalable technical system.

Do not deviate from the core principles outlined here. Every architectural decision must serve the learning outcomes and business model described.

---

## Part 1: Vision and Intent

### The Problem We Solve

Hundreds of thousands of English-speaking South Africans hear Xhosa daily — from colleagues, domestic workers, service staff, neighbours — yet cannot speak it. They exist in a passive comprehension limbo: familiar with the sounds, unable to produce them.

Existing solutions fail them:

- Duolingo and similar apps optimise for recognition, not production. They teach you to tap the correct answer, not to open your mouth.
- Traditional courses require synchronous attendance and cost thousands of rands.
- Xhosa specifically presents challenges that European-language-optimised apps ignore: click consonants requiring specific mouth positions, agglutinative grammar where prefixes carry meaning, tonal and prosodic patterns that determine comprehension.

### What We Build

An audio-first mobile application that trains spoken Xhosa production through daily recall practice with verified feedback.

The user does not read flashcards. The user speaks. The user is heard — first by AI, then by real Xhosa speakers who confirm whether they would be understood.

### The User

English-speaking South Africans who already hear Xhosa in their environment. They do not need "hello, how are you" — they need to decode and reproduce what they hear around them daily. They are motivated by social integration, professional necessity, or personal conviction. They will pay for something that actually works.

### The Outcome We Optimise For

Functional spoken production. The user can say something, and a native Xhosa speaker understands them. We do not optimise for test scores, streak counts, or gamification metrics. We optimise for the moment a user speaks Xhosa in the real world and is understood.

---

## Part 2: Theoretical Foundations

You must understand why the app works, not just what it does. Every feature traces back to established research in language acquisition, cognitive psychology, and neuroscience.

### 2.1 The Testing Effect (Retrieval-Based Learning)

**Principle:** Retrieval is the learning event, not a measurement of it. Every time a learner struggles to recall something, they physically strengthen the neural pathway. Passive review (reading notes, watching videos) produces weak encoding compared to active recall under difficulty.

**Implication for architecture:** The system must create retrieval opportunities, not exposure opportunities. The user must produce before they receive. Never show the answer before demanding an attempt.

### 2.2 Spaced Repetition and the Forgetting Curve

**Principle:** Memory decays predictably over time. Optimal learning occurs when retrieval is attempted at the moment of near-forgetting. Items that are difficult for a specific user should appear more frequently; items that are easy should appear less frequently.

**Implication for architecture:** You must implement a spaced repetition algorithm — specifically FSRS (Free Spaced Repetition Scheduler), which is open source and outperforms legacy SM-2 implementations. Each item must have per-user difficulty tracking. The system must predict optimal review timing at the individual item level.

### 2.3 Desirable Difficulty

**Principle:** Learning that feels hard produces stronger encoding than learning that feels easy. Interruption context (being prompted mid-life rather than in a dedicated study session) increases difficulty and therefore encoding strength.

**Implication for architecture:** Push notifications must interrupt daily life. The user should not be able to "batch" their practice into a single session as easily as they can respond to prompts distributed throughout the day. The UX should create mild productive struggle, not frictionless consumption.

### 2.4 Production vs Recognition Asymmetry

**Principle:** The ability to recognise a word when heard (L2→L1) and the ability to produce a word when needed (L1→L2) are neurologically distinct skills. Most apps train recognition. We train production.

**Implication for architecture:** The primary interaction is: user receives prompt in English → user must produce Xhosa audio. The reverse direction (hearing Xhosa, understanding it) is secondary and may be trained separately, but production is the core loop.

### 2.5 Emotional Salience and Memory

**Principle:** The brain prioritises encoding of emotionally significant events. Information delivered with stakes, social meaning, or personal relevance is retained far better than affectively neutral information.

**Implication for architecture:** The knowledge that a real human will hear your attempt changes the psychology of production. This is not incidental — it is core to the learning mechanism. The HITL (human-in-the-loop) verification is not just quality assurance; it is a pedagogical feature. The system must make the human verification salient to the user.

### 2.6 Phonetic Challenges Specific to Xhosa

**Principle:** Xhosa contains three click consonants (c, q, x) that do not exist in English. These are produced with specific tongue positions that English speakers have never practiced. Learning clicks requires audio modelling and proprioceptive feedback, not text. Additionally, Xhosa is agglutinative: the word "ndiyakuthanda" contains subject marker, tense marker, object marker, and verb root. Grammar is encoded in prefix chains, not word order.

**Implication for architecture:** Text is secondary to audio throughout the system. Phoneme-level feedback on clicks must be possible even if full transcription is imperfect. Grammar instruction must surface through pattern exposure in phrases, not through explicit rule presentation.

### 2.7 The i+1 Hypothesis (Comprehensible Input)

**Principle:** Acquisition occurs when the learner encounters input slightly beyond their current level — not too easy (no learning), not too hard (no comprehension). This is known as i+1.

**Implication for architecture:** The system must track user level and serve content calibrated to their current ability plus a small stretch. This requires content tagging by difficulty and dynamic selection based on user state.

---

## Part 3: The Financial Model

You must design a system that is financially viable. The following unit economics are non-negotiable constraints.

### 3.1 Pricing Tiers

| Tier | Monthly Price | Features                                                                                    |
| ---- | ------------- | ------------------------------------------------------------------------------------------- |
| AI   | R150          | 10 minutes per day of audio recording with AI-powered transcription, analysis, and feedback |
| Pro  | R500          | 10 minutes per day AI + 5 minutes per day human-verified with voice note corrections        |

There is no free tier with recording capability. A free tier may exist for notification-only recall prompts without audio capture, serving as a conversion funnel.

### 3.2 Cost Structure: AI Tier

| Component                              | Unit Cost      | Monthly (10 min/day, 30 days) |
| -------------------------------------- | -------------- | ----------------------------- |
| Speech-to-text (Whisper or equivalent) | ~R0.11/min     | R33                           |
| LLM analysis and feedback generation   | ~R0.20/session | R6                            |
| Text-to-speech for audio feedback      | ~R0.15/session | R4.50                         |
| Storage                                | Flat           | R4                            |
| **Total**                              |                | **R47.50**                    |

**Revenue:** R150  
**Profit:** R102.50  
**Margin:** 68%

### 3.3 Cost Structure: Pro Tier

| Component                                                    | Unit Cost        | Monthly     |
| ------------------------------------------------------------ | ---------------- | ----------- |
| AI components (10 min/day)                                   | As above         | R47.50      |
| Human verifier (5 min user audio = 15 min verifier time/day) | R28/hr × 7.5 hrs | R210        |
| Storage (higher retention)                                   | Flat             | R6          |
| **Total**                                                    |                  | **R263.50** |

**Revenue:** R500  
**Profit:** R236.50  
**Margin:** 47%

### 3.4 Human Verifier Economics

Verifiers are paid at South African minimum wage (R28/hour). A verifier working 8 hours per day can service 16 Pro users. Verifiers are not employees; they are gig workers paid per verified clip or per time block.

The verifier interface must be dead simple: hear clip → rate (correct / almost / wrong) → optionally record voice note correction → next clip. Verifier quality is tracked via seeded known-good clips and trust scores.

### 3.5 Lifetime Value Model

| Phase        | Duration | Revenue | Cost      | Profit        |
| ------------ | -------- | ------- | --------- | ------------- |
| AI tier      | 6 months | R900    | R285      | R615          |
| Pro tier     | 3 months | R1,500  | R790.50   | R709.50       |
| **Lifetime** | 9 months | R2,400  | R1,075.50 | **R1,324.50** |

**Blended LTV margin:** 55%  
**Target CAC:** R480 (5:1 LTV:CAC ratio)

### 3.6 Cost Evolution Expectation

The data flywheel (described in Part 5) will reduce HITL costs over time as the AI model improves. Architecture must support a future state where HITL is used only for edge cases flagged by AI uncertainty, not for 100% of Pro clips.

| Year | AI accuracy | HITL coverage | Pro cost |
| ---- | ----------- | ------------- | -------- |
| 1    | 60%         | 100%          | R263     |
| 2    | 80%         | 50%           | ~R160    |
| 3    | 90%         | 20%           | ~R100    |

Design for this progression. Do not lock the architecture into 100% HITL forever.

---

## Part 4: Core System Components

### 4.1 Content Management System

The system must store and manage learning content with the following attributes:

**Phrases:**

- English text (prompt)
- Xhosa text (target)
- Native speaker audio recording (reference)
- Difficulty rating (beginner / intermediate / advanced)
- Grammatical tags (noun class, tense, prefix pattern)
- Phonetic tags (which clicks present, prosodic pattern)
- Contextual tags (domain: household, workplace, social, transactional)

Phrases are the atomic unit of learning. Single words exist only as components of phrases. The system does not teach vocabulary in isolation.

**Content must be extensible.** Users on Pro tier may request custom phrases relevant to their life context. The architecture must support user-generated content that enters their personal learning queue.

### 4.2 User State Management

Each user has:

- A personal phrase library (subset of master content + custom additions)
- Per-phrase learning state:
  - Last reviewed timestamp
  - Next scheduled review timestamp
  - Difficulty factor (FSRS parameters)
  - Attempt history (recordings, scores, feedback)
- Global proficiency estimate (derived from attempt success rates)
- Subscription tier and billing state
- Daily usage tracking (minutes recorded today)

This data must be durable, consistent, and queryable for analytics.

### 4.3 Notification and Scheduling Engine

The system must deliver push notifications containing recall prompts at distributed intervals throughout the day.

**Requirements:**

- Notifications must respect user-configured quiet hours
- Notification timing should be pseudo-random within user's active window, not predictable
- Each notification presents one phrase for recall
- User can respond immediately (opens app to record) or dismiss
- Dismissed prompts are rescheduled according to SRS algorithm
- The system must track notification delivery, open rates, and completion rates

**Critical:** Notifications are not reminders to open the app. They are the learning event. The notification itself contains the English prompt. The user's job is to produce the Xhosa before opening the app.

### 4.4 Audio Recording Pipeline

**User recording flow:**

1. User sees English prompt
2. User taps to record
3. User speaks Xhosa attempt
4. Recording is captured, compressed, uploaded
5. User sees processing state
6. User receives feedback (AI immediately; HITL async)

**Technical requirements:**

- Recording must work offline and sync when connection available
- Audio format must balance quality with bandwidth (consider opus or AAC)
- Maximum recording length enforced (prevents abuse, controls costs)
- Daily recording quota enforced at client and server
- Recordings must be timestamped and associated with the prompt phrase

### 4.5 AI Feedback Pipeline

**For each recording, the AI pipeline must:**

1. **Transcribe:** Convert audio to text using speech-to-text (Whisper or equivalent fine-tuned on Xhosa)
2. **Compare:** Evaluate transcription against target phrase
3. **Analyse:** Identify specific errors:
   - Missing or incorrect clicks
   - Wrong prefix (grammar error)
   - Mispronunciation of vowels
   - Prosodic errors (stress, tone)
4. **Generate feedback:** Produce natural language feedback explaining what was correct and what needs work
5. **Synthesise audio (optional):** Generate TTS of correct pronunciation for comparison
6. **Score:** Assign a correctness score for SRS algorithm input

**Critical constraint:** Transcription engines struggle with South African English accents speaking Xhosa. The architecture must not assume perfect transcription. Alternative approaches to consider:

- **Acoustic fingerprinting:** Compare waveform similarity to reference audio without transcription
- **Click detection:** Binary classification of whether clicks were produced, independent of full transcription
- **Phoneme isolation:** Grade specific phonemes rather than entire utterances
- **Confidence thresholds:** Flag low-confidence transcriptions for HITL review rather than providing uncertain AI feedback

### 4.6 Human-in-the-Loop Verification Pipeline

**For Pro tier users:**

1. User recording enters verification queue
2. Verifier receives:
   - User's audio recording
   - Target phrase (text and reference audio)
   - AI's preliminary assessment (optional — may bias verifier)
3. Verifier actions:
   - Rate: correct / almost / wrong
   - (Optional) Record voice note with correction or encouragement
   - (Optional) Flag content issues
4. Verification is stored and associated with original recording
5. User receives notification that human feedback is ready
6. Feedback displayed in app with playable voice note

**Verifier management requirements:**

- Onboarding flow: language proficiency verification, training on rating criteria
- Trust scoring: seed known-good clips, track agreement with consensus
- Quality control: flag and review verifiers with anomalous patterns
- Payment tracking: per-clip or per-hour compensation, payout management
- Capacity planning: match verifier supply to user demand

**Latency requirements:**

- Target: feedback delivered within 4-12 hours
- Acceptable: within 24 hours
- Unacceptable: more than 24 hours

The SRS algorithm must accommodate async feedback. A phrase is not considered "reviewed" until feedback is delivered and viewed.

### 4.7 Spaced Repetition Engine

Implement FSRS (Free Spaced Repetition Scheduler). This is non-negotiable. Do not invent a custom algorithm or use SM-2.

FSRS requires:

- Recording of each review outcome (score/rating)
- Per-item state: difficulty, stability, retrievability
- Scheduling function that predicts optimal next review time
- Handling of overdue items

The scheduler must integrate with the notification engine to distribute reviews throughout the day.

### 4.8 Analytics and Reporting

**User-facing:**

- Daily/weekly/monthly practice time
- Phrases learned vs in progress vs struggling
- Accuracy trends over time
- Streak tracking (if used — consider carefully whether gamification aligns with pedagogy)

**Business-facing:**

- Active users by tier
- Recording minutes consumed (cost tracking)
- HITL queue depth and turnaround time
- Verifier performance metrics
- Conversion rates (free→AI, AI→Pro)
- Churn rates by cohort
- LTV actuals vs projections

**Data science-facing:**

- Aggregated attempt audio with verification labels (the corpus)
- Error pattern analysis
- Model performance metrics (AI vs HITL agreement rate)

---

## Part 5: The Data Flywheel

This is the strategic core of the business. The architecture must be designed to capture, store, and leverage data for compounding advantage.

### 5.1 What We Collect

Every Pro user generates:

- 5 minutes of attempted Xhosa audio daily
- Human verification labels (correct/almost/wrong)
- Human correction audio (voice notes)
- Metadata: user proficiency level, prompt phrase, timestamp

At 1,000 Pro users: 2,500 minutes (41+ hours) of labelled audio per day.  
At 10,000 Pro users: 410+ hours per day.

### 5.2 Why This Data Is Valuable

This dataset does not exist anywhere else:

- South African English speakers attempting Xhosa
- Labelled by native speakers for comprehensibility
- Tied to specific target phrases
- Includes correction examples

This enables:

- Fine-tuning speech-to-text models for this specific accent pair
- Training classifiers to predict "likely correct" vs "needs human review"
- Identifying systematic error patterns (e.g., "English speakers consistently fail the 'q' click in prefix position")
- Building phoneme-level feedback models

### 5.3 Model Improvement Loop

1. Collect labelled data from HITL verification
2. Periodically retrain/fine-tune AI models
3. Measure AI vs HITL agreement rate
4. When AI confidence exceeds threshold, route to AI-only path
5. HITL reserved for low-confidence cases
6. Costs decrease; margin increases
7. Savings fund more data collection or price reduction

**Architecture must support:**

- Data export pipelines for model training
- A/B testing of model versions
- Confidence scoring on AI outputs
- Routing logic based on confidence thresholds
- Monitoring of AI/HITL agreement over time

### 5.4 Data Licensing Potential

The corpus is a licensable asset. Potential buyers:

- ASR companies wanting to improve Xhosa models
- Academic researchers studying L2 acquisition
- Government language programmes
- Corporate training developers

**Architecture must support:**

- Anonymisation of audio (strip user identity, retain linguistic content)
- Consent management (users must opt-in to corpus inclusion)
- Data export in standard formats
- Access control for licensed partners

### 5.5 Privacy and Compliance

Audio recordings are sensitive personal data under POPIA (Protection of Personal Information Act — South Africa's data protection law).

**Requirements:**

- Clear consent at signup for audio collection and use
- Separate consent for corpus inclusion (can use app without contributing to corpus)
- Right to deletion: user can request all their audio be deleted
- Data localisation: understand where data is stored and whether it leaves SA
- Retention policies: define how long raw audio is kept vs aggregated/anonymised data

---

## Part 6: Technical Constraints and Preferences

### 6.1 Platform

Mobile-first. iOS and Android. A progressive web app may serve as a tertiary channel but is not the primary interface.

### 6.2 Offline Capability

Users must be able to:

- Receive notifications offline (queued)
- View prompts offline
- Record audio offline
- Sync recordings when connectivity returns

South African users frequently have intermittent connectivity. Offline-first design is mandatory, not nice-to-have.

### 6.3 Backend Stack Preference

The development team works with:

- SvelteKit (frontend framework)
- ConvexDB (backend database and functions)
- TypeScript throughout

Architectural recommendations must be compatible with this stack or provide compelling justification for alternatives.

### 6.4 Audio Processing Services

Assume use of external APIs for:

- Speech-to-text: Whisper API or self-hosted Whisper
- Text-to-speech: ElevenLabs, Google Cloud TTS, or equivalent
- LLM: Claude API (Anthropic) or equivalent

Design for provider abstraction — the system should be able to swap providers without architectural changes.

### 6.5 Cost Sensitivity

This is a bootstrapped product. Architecture must optimise for:

- Low fixed costs (prefer serverless/consumption-based)
- Predictable variable costs (understand per-user cost drivers)
- No premature scaling (do not build for 1M users on day one)

---

## Part 7: Success Criteria

The architecture is successful if it enables:

1. **Learning outcomes:** Users demonstrably improve at spoken Xhosa production over time, as measured by increasing AI scores and HITL ratings.

2. **Unit economics:** Actual costs remain within 10% of modelled costs at each tier.

3. **Verifier experience:** Verifiers can process clips efficiently, are paid accurately, and maintain quality standards.

4. **Data capture:** Every relevant interaction is logged and available for analysis and model training.

5. **Scalability path:** The system can grow from 100 to 10,000 users without architectural rewrites.

6. **Reliability:** Notifications are delivered on time, recordings are never lost, feedback is always returned.

---

## Part 8: Open Questions for the Architect

The following questions require technical investigation and recommendation:

1. **FSRS implementation:** Build from scratch, use existing open-source library, or adapt? What state storage is required?

2. **Audio pipeline:** On-device compression vs server-side? Format selection? Chunked upload for reliability?

3. **Verifier interface:** Separate app or web interface? Real-time queue or batch assignment?

4. **Notification infrastructure:** FCM/APNs directly or via service (OneSignal, etc.)? How to handle notification-to-recording flow?

5. **Whisper deployment:** API vs self-hosted? Cost/latency/accuracy tradeoffs? Fine-tuning feasibility?

6. **Offline sync:** Conflict resolution strategy? Queue management? What happens if user records same phrase twice offline?

7. **Corpus management:** Separate data store from production? ETL pipeline design? Anonymisation approach?

8. **Billing integration:** Which payment provider for SA market? Subscription management approach?

---

## Conclusion

You now have complete context on what we are building, why it works, what it must cost, and what it must do. Your task is to design a system architecture that satisfies these requirements while remaining buildable by a small team with the specified technology preferences.

Do not optimise for elegance over pragmatism. Do not introduce complexity that does not serve a stated requirement. Do not ignore the financial constraints.

Build something that teaches South Africans to speak Xhosa and makes money doing it.
