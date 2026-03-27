# Plan: Expert Orchestrator + TDD Integration + Dynamic Learning Capture

## Metadata

adw_id: `expert-orchestrator`
prompt: `Expert Knowledge Pipeline v2: Orchestrator + TDD Integration + Dynamic Learning Capture`
conversation_id: `grill-me-expert-knowledge-pipeline-2026-03-26`
task_type: feature
complexity: complex

## Task Description

Build the expert orchestrator command, integrate expert consultation into the Ralph TDD workflow, and implement dynamic learning capture that uses consultation metadata instead of hardcoded tags. This builds on the existing expert knowledge pipeline (learnings schema, platform_constraints, ai_docs metadata tables, adw_learn workflow, learning-utils).

## Objective

When complete:
- A single `/experts:consult` command routes questions to the right experts automatically via file-pattern matching
- Ralph's TDD loop consults experts between the red and green phases, passing synthesized guidance as context
- When TDD fails after expert consultation, learnings are recorded with the correct expert tags (not hardcoded)
- The orchestrator resolves contradictions between experts via one-round debate (capped at 3 experts)

## Problem Statement

The expert system is currently isolated — TDD and refactor steps never consult experts. Learning capture hardcodes `tags: ["convex", "database"]` regardless of which expert (if any) was involved. There's no mechanism for the TDD agent to benefit from accumulated expert knowledge, and no feedback loop when expert knowledge proves wrong.

## Solution Approach

Three-layer integration:

```
Ralph (workflow orchestrator)
  │
  ├─ TDD Red phase (write test)
  │
  ├─ Expert Consultation (NEW)
  │   └─ /experts:consult (NEW orchestrator)
  │       ├─ Discover experts via file_patterns
  │       ├─ Parallel /question calls
  │       ├─ Synthesis + optional debate
  │       └─ Return structured guidance
  │
  ├─ TDD Green phase (implement, with expert context)
  │
  ├─ Refactor, Review, Patch (existing)
  │
  └─ Learning capture (ENHANCED)
      └─ Uses expert_consulted from consultation result
```

## Relevant Files

### Existing Files (to modify)

- `.claude/commands/experts/database/expertise.yaml` — Add `file_patterns` field for automatic routing
- `.claude/commands/experts/database/question.md` — Add `CONTEXT` variable for structured input
- `adws/workflows/adw_ralph.ts` — Add consult step between red and green; enhance learning capture with dynamic tags
- `adws/src/agent-sdk.ts` — Add `runConsultStep()` runner function
- `adws/src/step-commands.ts` — Add `consult` step command entry
- `adws/src/logger.ts` — Extend `StepSummary` with `expert_consulted` and `expert_advice_summary` fields
- `adws/src/learning-utils.ts` — Add `discoverExpertFilePatterns()` and `matchFilesToExperts()` functions

### New Files

- `.claude/commands/experts/consult.md` — Orchestrator command: discover experts, route questions, synthesize answers, debate contradictions

## Implementation Phases

### Phase 1: Expert Infrastructure

Add `file_patterns` to expertise.yaml. Add `CONTEXT` to question.md. These are prerequisites for the orchestrator.

### Phase 2: Orchestrator Command

Create `/experts:consult` — the single entry point for all expert consultation. Discovers experts, matches by file patterns, invokes in parallel, synthesizes, debates contradictions (max 3 experts).

### Phase 3: Ralph Integration

Add the consult wrapper step between TDD red and green. Pass expert guidance as context to the green pass. Enhance learning capture to use `expert_consulted` metadata.

### Phase 4: Step Summary Schema

Extend StepSummary and extractStepSummary to support `expert_consulted` and `expert_advice_summary` fields. Ralph reads these to drive dynamic learning tags.

## Step by Step Tasks

### 1. Add `file_patterns` to database expertise.yaml

- Add a `file_patterns` field at the top level of `expertise.yaml`, alongside `domain_tags`
- For the database expert, the patterns should cover:
  - `convex/**` — all Convex backend files
  - `packages/convex/**` — Convex type exports
- Format as a YAML list of glob strings:

```yaml
file_patterns:
  - "convex/**"
  - "packages/convex/**"
```

### 2. Add `CONTEXT` variable to question.md

- Add a new variable `CONTEXT: $2 default to empty string` to the Variables section
- Update the Instructions to say: "If CONTEXT is provided, use it as additional context for answering the question. It may contain issue body, test file content, or changed file paths."
- Update the Workflow to include: "If CONTEXT is non-empty, read and incorporate it before answering"
- The question command already reads expertise.yaml and validates against codebase — CONTEXT just gives it more to work with

### 3. Create `/experts:consult` orchestrator command

- Create `.claude/commands/experts/consult.md`
- Variables:
  - `QUESTION: $1` — the question to answer
  - `CONTEXT: $2 default to empty string` — structured context (issue body, test file, changed files)
  - `CHANGED_FILES: $3 default to empty string` — comma-separated list of changed file paths for expert matching
- allowed-tools: `Read, Glob, Grep, Bash(ls*), Task`
- Workflow:
  1. **Discover experts**: Glob `.claude/commands/experts/*/expertise.yaml`. For each, read `domain_tags` and `file_patterns`.
  2. **Match experts**: If CHANGED_FILES provided, match each file path against each expert's `file_patterns` globs. Also check if QUESTION content matches `domain_tags`. Collect matched experts.
  3. **Consult matched experts in parallel**: For each matched expert, use the Task tool to invoke `/experts:{name}:question` with QUESTION and CONTEXT as arguments. Collect responses.
  4. **Synthesize**: Read all expert responses. Identify areas of agreement and contradiction.
  5. **Debate contradictions** (conditional): If contradictions found AND matched experts <= 3: send one follow-up round to the conflicting experts via Task tool, each informed of the other's position. Read responses and attempt consensus.
  6. **Return structured response**:

```
## Expert Consultation

**Experts consulted:** {comma-separated expert names}
**Changed files matched:** {files → expert mapping}

### Guidance

{synthesized guidance from all experts, contradictions resolved or flagged}

### Contradictions

{any unresolved contradictions with both positions stated, or "none"}

### Expert Advice Summary

{one-paragraph summary of the key constraints and patterns the implementation must follow}
```

### 4. Add `consult` step command to step-commands.ts

- Add a new entry to `STEP_COMMANDS`:

```typescript
consult: {
  command: "/experts:consult",
  buildArgs: (question: string, context?: string, changedFiles?: string) => {
    const args = [question];
    if (context) args.push(context);
    if (changedFiles) args.push(changedFiles);
    return args;
  },
},
```

### 5. Add `runConsultStep()` to agent-sdk.ts

- Add a new exported function following the existing pattern:

```typescript
/** Run an expert consultation step — `/experts:consult <question> [context] [changedFiles]`. */
export function runConsultStep(
  question: string,
  options: RunStepOptions & { context?: string; changedFiles?: string } = {}
): Promise<QueryResult> {
  return runConfigurableStep("consult", [question, options.context, options.changedFiles], options);
}
```

### 6. Extend StepSummary with expert consultation fields

- In `adws/src/logger.ts`, add two optional fields to `StepSummary`:

```typescript
export interface StepSummary {
  // ...existing fields...
  expert_consulted?: string;        // comma-separated expert names
  expert_advice_summary?: string;   // one-line summary of guidance
}
```

- In `adws/src/agent-sdk.ts`, update `extractStepSummary()` to parse these new fields:

```typescript
const expert_consulted = get("expert_consulted");
const expert_advice_summary = get("expert_advice_summary");
return {
  // ...existing fields...
  ...(expert_consulted && { expert_consulted }),
  ...(expert_advice_summary && { expert_advice_summary }),
};
```

### 7. Add `matchFilesToExperts()` to learning-utils.ts

- Add a new function that reads `file_patterns` from expertise.yaml files:

```typescript
export interface ExpertMatch {
  expertName: string;
  domainTags: string[];
  filePatterns: string[];
  matchedFiles: string[];
}
```

- Update `discoverExperts()` to also read `file_patterns` from expertise.yaml
- Add `matchFilesToExperts(cwd: string, changedFiles: string[]): ExpertMatch[]` — for each expert, check if any changed file matches their glob patterns. Return matched experts with which files matched.
- Use `minimatch` or simple glob matching (prefix-based is sufficient: `convex/**` matches any path starting with `convex/`)

### 8. Integrate consult step into Ralph between red and green

- In `adws/workflows/adw_ralph.ts`, after the TDD step succeeds (line ~228 "TDD completed"), add:
  1. Determine which files the TDD step changed: use `diffFileList(preTddSha, "HEAD", workingDir)` (already imported from git-ops)
  2. Invoke `runConsultStep()` with:
     - question: `"Given this issue and test, what constraints, patterns, and invariants must the implementation follow?"`
     - context: issue body + TDD result summary
     - changedFiles: comma-separated list from diff
  3. Store the consultation result (expert names, advice summary) for later use
  4. **Split TDD into two phases**: Currently Ralph calls `runTddStep()` once which runs the full red-green cycle. To insert consultation between red and green, the TDD step needs to be split:
     - Phase 1 (red): Write test only — this needs a modified TDD invocation that stops after the test is written
     - Phase 2 (green): Implement — pass expert consultation result as additional context
  5. **Alternative (simpler, recommended)**: Don't split TDD. Instead, run TDD as-is (full red-green), then on the *next* iteration or refactor step, expert knowledge is available. For the *current* implementation, run consult BEFORE TDD starts (informed by issue body + changed files from prior iterations) and pass expert guidance as TDD context prefix.

**Decision needed during implementation**: The plan specifies consult between red and green, but TDD is currently a single atomic step. The simpler approach is:
  - Run consult before TDD, based on issue body + known file patterns from the issue
  - Prepend expert guidance to the TDD prompt
  - This still achieves the goal: expert knowledge informs the implementation

This avoids splitting the TDD skill into two phases (which would require a new skill variant).

Flow in Ralph becomes:
```
// After issue selection, before TDD:
1. runConsultStep(question, issueBody, expectedFiles)
2. runTddStep(issueBody + "\n\n## Expert Guidance\n" + consultResult)
3. (existing) refactor, review, patch...
```

Where `expectedFiles` is inferred from the issue body (keywords like "convex/billing.ts") or from a quick file-pattern scan against the issue title/labels.

### 9. Enhance learning capture with dynamic expert tags

- In `adws/workflows/adw_ralph.ts`, at each `recordLearning()` call site:
  - If expert consultation was performed for this issue, use the `expert_consulted` names as tags instead of hardcoded `["convex", "database"]`
  - Store the consultation result in a variable scoped to the iteration so both TDD failure and review failure can reference it
  - Include `expert_advice_summary` in the learning's `expected` field when consultation preceded the failure

- Replace the hardcoded tags pattern:

```typescript
// Before (hardcoded):
tags: ["convex", "database"],

// After (dynamic):
tags: consultResult?.expertNames ?? inferTagsFromFiles(changedFiles),
```

- Add `inferTagsFromFiles()` to learning-utils.ts as a fallback for when no consultation was performed — uses `matchFilesToExperts()` to determine tags from changed files

### 10. Validate end-to-end

- Verify expertise.yaml has `file_patterns` and is valid YAML:
  - `python3 -c "import yaml; yaml.safe_load(open('.claude/commands/experts/database/expertise.yaml'))"` or node equivalent
  - `grep -c "file_patterns" .claude/commands/experts/database/expertise.yaml`
- Verify consult.md exists and has correct structure:
  - `head -20 .claude/commands/experts/consult.md`
- Verify step-commands.ts has consult entry:
  - `grep "consult" adws/src/step-commands.ts`
- Verify StepSummary has new fields:
  - `grep "expert_consulted" adws/src/logger.ts`
- Verify Ralph no longer has hardcoded tags:
  - `grep -n '"convex", "database"' adws/workflows/adw_ralph.ts` — should return 0 matches
- Verify adw_learn dry-run still works:
  - `bun run adws/workflows/adw_learn.ts --adw-id test --dry-run`
- Type check:
  - `bun run check` or `npx tsc --noEmit` on adws/src files

## Testing Strategy

- **Unit**: `matchFilesToExperts()` — create test entries with various file patterns, verify correct matching. Test with overlapping patterns, no matches, multiple matches.
- **Integration**: Create a test learning entry with `expert_consulted` tags, run `adw_learn --dry-run`, verify correct expert routing.
- **Smoke**: Run Ralph in dry-run mode (or on a trivial test issue) with the new consult step to verify the full flow compiles and executes without errors.
- **Regression**: `bun run check` — ensure no type regressions. Existing tests must still pass.

## Acceptance Criteria

- [ ] `expertise.yaml` has `file_patterns` field with glob patterns for the database expert
- [ ] `/experts:database:question` accepts a `CONTEXT` argument
- [ ] `/experts:consult` exists and discovers experts, matches by file_patterns, invokes question commands in parallel, synthesizes, debates contradictions (max 3)
- [ ] `step-commands.ts` has `consult` entry; `agent-sdk.ts` exports `runConsultStep()`
- [ ] `StepSummary` interface includes `expert_consulted` and `expert_advice_summary` optional fields
- [ ] `extractStepSummary()` parses the new fields
- [ ] Ralph runs expert consultation before TDD and passes guidance as context
- [ ] Ralph's `recordLearning()` calls use dynamic tags from consultation result, not hardcoded
- [ ] `learning-utils.ts` has `matchFilesToExperts()` for tag inference fallback
- [ ] No hardcoded `["convex", "database"]` tags remain in Ralph
- [ ] `adw_learn --dry-run` still works
- [ ] `bun run check` passes

## Validation Commands

- `grep -c "file_patterns" .claude/commands/experts/database/expertise.yaml` — verify field exists
- `head -5 .claude/commands/experts/consult.md` — verify orchestrator exists
- `grep "consult" adws/src/step-commands.ts` — verify step command registered
- `grep "expert_consulted" adws/src/logger.ts` — verify StepSummary extended
- `grep "expert_consulted" adws/src/agent-sdk.ts` — verify extraction updated
- `grep -c '"convex", "database"' adws/workflows/adw_ralph.ts` — should be 0
- `bun run adws/workflows/adw_learn.ts --adw-id test --dry-run` — smoke test
- `bun -e "import { matchFilesToExperts } from './adws/src/learning-utils'; console.log('OK')"` — import check

## Notes

- **No new dependencies needed** — glob matching can use simple prefix comparison (`path.startsWith()`) since our patterns are directory-based (`convex/**`). If more complex globs are needed later, `minimatch` can be added.
- **TDD is not split**: Rather than splitting TDD into separate red/green phases (which would require a new skill variant), consultation runs before TDD starts and guidance is prepended to the TDD prompt. This preserves TDD as an atomic skill.
- **The orchestrator is a command, not an ADW**: It runs as a slash command via subagent, not a full ADW workflow. This keeps it composable — any workflow can call it, not just Ralph.
- **Debate cap**: Debate is skipped if >3 experts matched. Contradictions are flagged and passed through. The learning loop will resolve persistent disagreements over time.
- **Future experts**: When adding a new expert (e.g., frontend), create `experts/{name}/expertise.yaml` with `domain_tags` + `file_patterns`, `question.md`, and `self-improve.md`. The orchestrator discovers it automatically — no registration needed.

## Unresolved Questions

- TDD prompt format: exact structure for prepending expert guidance? Keep minimal — `## Expert Guidance\n{advice_summary}` appended to issue body should suffice.
- Should consult step use a cheaper model (haiku) since it's mostly routing + synthesis, or same model as TDD?
