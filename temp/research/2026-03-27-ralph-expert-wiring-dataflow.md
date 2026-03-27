---
date: 2026-03-27T00:00:00+02:00
researcher: Claude
git_commit: 488cbc0
branch: hein/feature/issue-61
repository: babylon
topic: 'Data flow diagram of a typical Ralph loop — expert agent wiring verification'
tags: [research, codebase, adw-ralph, experts, consult, learning-utils]
status: complete
last_updated: 2026-03-27
last_updated_by: Claude
---

# Research: Ralph Loop Data Flow — Expert Agent Wiring

## Research Question

Data flow diagram of a typical loop in the adw_ralph workflow, specifically confirming that expert agents are wired in correctly.

## Summary

Expert agents are correctly wired into the Ralph loop. The consult step runs **before TDD**, injects expert guidance into the TDD issue body, and records expert names for downstream use in learning tags. The wiring follows a clean chain: `runConsultStep()` → `runConfigurableStep("consult")` → `/experts:consult` skill → discovers experts via `expertise.yaml` → routes to `/experts:{name}:question` in parallel → synthesizes → returns structured result. Expert names and advice flow into both TDD context and failure learnings.

## Data Flow Diagram — Single Ralph Iteration

```
┌──────────────────────────────────────────────────────────────────────┐
│  ITERATION START                                                      │
│  fetchSubIssues() → filterUnblockedIssues() → select issue            │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  1. EXPERT CONSULT                                                    │
│  adw_ralph.ts:198-225                                                 │
│                                                                       │
│  runConsultStep(question, { context: issue.body })                     │
│       │                                                               │
│       ▼                                                               │
│  agent-sdk.ts:451-457                                                 │
│  runConfigurableStep("consult", [question, context, changedFiles])     │
│       │                                                               │
│       ▼                                                               │
│  step-commands.ts:91-99                                               │
│  Maps to: /experts:consult <question> <context>                       │
│       │                                                               │
│       ▼                                                               │
│  ┌────────────────────────────────────────────────────────────┐       │
│  │  consult.md — Expert Orchestrator                          │       │
│  │                                                            │       │
│  │  Step 1: Glob experts/*/expertise.yaml                     │       │
│  │          → { name, domainTags[], filePatterns[] }           │       │
│  │                                                            │       │
│  │  Step 2: Match experts by:                                 │       │
│  │          - file_patterns prefix match on CHANGED_FILES     │       │
│  │          - domain_tags keyword match on QUESTION           │       │
│  │          - fallback: ALL experts (cap at 3)                │       │
│  │                                                            │       │
│  │  Step 3: Parallel Task per matched expert:                 │       │
│  │          /experts:database:question  ←─ expertise.yaml     │       │
│  │          /experts:frontend:question  ←─ expertise.yaml     │       │
│  │                                                            │       │
│  │  Step 4: Synthesize responses (agreement + contradictions) │       │
│  │  Step 5: Debate contradictions (if any, 1 round)           │       │
│  │  Step 6: Return structured response                        │       │
│  └────────────────────────────────────────────────────────────┘       │
│                                                                       │
│  OUTPUT:                                                              │
│    consultResult.summary.expert_consulted → consultExpertNames[]      │
│    consultResult.summary.expert_advice_summary → consultAdviceSummary │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  2. TDD STEP                                                          │
│  adw_ralph.ts:227-273                                                 │
│                                                                       │
│  tddIssueBody = consultAdviceSummary                                  │
│    ? issue.body + "\n\n## Expert Guidance\n" + consultAdviceSummary    │
│    : issue.body                                                       │
│                                                                       │
│  runTddStep(tddIssueBody, { model: issueModel })                     │
│                                                                       │
│  ON FAILURE → recordLearning() with:                                  │
│    tags: consultExpertNames[] || inferTagsFromFiles()                  │
│    expected: expert guidance summary (if available)                    │
│    actual: TDD error message                                          │
│    → writes to temp/learnings/{run_id}.md                             │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ (success)
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  3. REFACTOR STEP (skipped if complexity=trivial)                     │
│  adw_ralph.ts:277-311                                                 │
│                                                                       │
│  runRefactorStep(adwId, issue.number, issue.body, preTddSha)          │
│  + scope guardrail: file count threshold check                        │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  4. REVIEW STEP                                                       │
│  adw_ralph.ts:313-346                                                 │
│                                                                       │
│  runReviewStep(adwId, "", { issueBody, reviewImageDir })              │
│  parseReviewResult() → extractScreenshots()                           │
│                                                                       │
│  ON FAILURE → Patch retry loop (max 2 attempts):                      │
│    runPatchPlanStep() → runBuildStep()                                 │
│                                                                       │
│  ON FINAL FAILURE → recordLearning() with:                            │
│    tags: consultExpertNames[] || inferTagsFromFiles()                  │
│    expected: expert guidance (if available)                            │
│    actual: patch failure details                                      │
│    → writes to temp/learnings/{run_id}.md                             │
└──────────────────────┬───────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│  5. FINALIZE                                                          │
│  commitChanges() → closeSubIssue() → next iteration                   │
└──────────────────────────────────────────────────────────────────────┘
```

## Expert Wiring — Connection Points

### A. Consult → TDD (advice injection)

```
adw_ralph.ts:228-230
  tddIssueBody = consultAdviceSummary
    ? `${selectedIssue.body}\n\n## Expert Guidance\n${consultAdviceSummary}`
    : selectedIssue.body;
```

Expert advice is appended as `## Expert Guidance` section to the issue body before passing to TDD. This means the TDD agent sees expert constraints alongside the issue requirements.

### B. Consult → Learning (tag propagation)

```
adw_ralph.ts:256-258 (TDD failure path)
  const dynamicTags = consultExpertNames.length > 0
    ? consultExpertNames
    : inferTagsFromFiles(workingDir, tddChangedFiles);

adw_ralph.ts:422-424 (Review failure path)
  const dynamicTags = consultExpertNames.length > 0
    ? consultExpertNames
    : inferTagsFromFiles(workingDir, reviewChangedFiles);
```

Expert names from the consult step are used as learning tags. If no consult was performed (or it failed), `inferTagsFromFiles()` falls back to matching changed files against `expertise.yaml` file patterns.

### C. Consult result shape (summary extraction)

```
adw_ralph.ts:218-221
  consultExpertNames = consultResult.summary.expert_consulted
    ?.split(",").map(s => s.trim()).filter(Boolean) ?? [];
  consultAdviceSummary = consultResult.summary.expert_advice_summary ?? "";
```

The consult step's `StepSummary` must include `expert_consulted` (comma-separated names) and `expert_advice_summary` (one-line summary). These are defined in `consult.md`'s "Step Summary" section.

### D. Expert discovery pipeline

```
consult.md → Glob .claude/commands/experts/*/expertise.yaml
           → reads domain_tags + file_patterns per expert
           → matches against QUESTION keywords + CHANGED_FILES paths
           → invokes /experts:{name}:question per matched expert (parallel)
```

Currently 2 experts registered:
- `database` — 862-line expertise, covers `convex/**`, `packages/convex/**`
- `frontend` — 50-line skeleton, covers `apps/web/**`, `apps/verifier/**`, `packages/ui/**`, `packages/shared/**`

## Code References

- `adws/workflows/adw_ralph.ts:193-225` — Expert consultation step
- `adws/workflows/adw_ralph.ts:228-230` — Advice injection into TDD body
- `adws/workflows/adw_ralph.ts:254-270` — Learning with expert tags (TDD failure)
- `adws/workflows/adw_ralph.ts:419-436` — Learning with expert tags (review failure)
- `adws/src/agent-sdk.ts:451-457` — `runConsultStep()` definition
- `adws/src/step-commands.ts:91-99` — Consult command config mapping to `/experts:consult`
- `.claude/commands/experts/consult.md` — Expert orchestrator (discover → match → consult → synthesize → debate)
- `.claude/commands/experts/database/expertise.yaml` — Database expert knowledge (862 lines)
- `.claude/commands/experts/database/question.md` — Database question mode
- `.claude/commands/experts/frontend/expertise.yaml` — Frontend expert knowledge (50 lines, skeleton)
- `.claude/commands/experts/frontend/question.md` — Frontend question mode
- `adws/src/learning-utils.ts:91-123` — `recordLearning()` function
- `adws/src/learning-utils.ts:340-349` — `inferTagsFromFiles()` fallback tag inference
- `adws/src/learning-utils.ts:246-283` — `discoverExperts()` reads expertise.yaml files

## Architecture Documentation

**Pattern: Pre-step consultation with graceful degradation**
The expert consult is wrapped in a try/catch (adw_ralph.ts:198-225) making it non-fatal. If consultation fails, the TDD step proceeds with the raw issue body and learnings use `inferTagsFromFiles()` as a fallback for tagging.

**Pattern: Expertise as YAML knowledge bases**
Each expert maintains a `expertise.yaml` with `domain_tags`, `file_patterns`, and domain knowledge. The consult orchestrator discovers experts dynamically via glob, making it extensible — adding a new expert requires only creating a new directory under `.claude/commands/experts/` with the three standard files (expertise.yaml, question.md, self-improve.md).

**Pattern: Expert names as learning taxonomy**
Expert names flow from consult → learning tags, creating a closed loop where failures are categorized by the same domain taxonomy used for routing. This enables future analysis of which domains generate the most failures.

## Open Questions

- `CHANGED_FILES` param in consult is never passed from Ralph — only `question` and `context` are provided (adw_ralph.ts:202-211). File-based expert matching therefore never triggers; matching relies solely on keyword/tag matching against the question string. Is this intentional?
- Frontend expertise.yaml is a skeleton (50 lines vs database's 862). Has `self-improve` been run for frontend yet?
- The `inferTagsFromFiles` fallback in learning-utils.ts duplicates expert discovery logic that also exists in consult.md. These could diverge if expert file patterns change.
