---
date: 2026-03-28T16:00:00+02:00
researcher: Claude
git_commit: 55fe7a3
branch: hein/feature/issue-68
repository: babylon
topic: 'Assessment of adw_ralph build observability layer'
tags: [research, observability, adw_ralph, build-output]
status: complete
last_updated: 2026-03-28
last_updated_by: Claude
---

# Research: adw_ralph Observability Layer — Strengths & Weaknesses

## Research Question

Assess the strengths and weaknesses of the `temp/builds/68_ralph_18c66a07/` observability output and `temp/learnings/pipeline-2026-03-28.md` as entry points for humans and agents to understand an AFK build.

## Summary

The observability layer is **structurally sound and well-conceived**. The three-tier architecture (execution.log for narrative, status.json for structured telemetry, steps/ for drill-down) gives both humans and agents clear entry points at different zoom levels. The learning file captures real, actionable platform knowledge. However, there's a critical gap between what the reviews *detect* and what the pipeline *does about it* — every review failed, yet the build status is "pass" and issues were closed. The learning file also suffers from deduplication and traceability issues.

---

## Detailed Findings

### Strengths

#### 1. Three-tier observability architecture
The build output provides three complementary views at increasing depth:
- **`execution.log`** — chronological human-readable narrative with timestamps, perfect for "what happened and when"
- **`status.json`** — structured machine-readable telemetry with per-step cost/tokens/duration/summary
- **`steps/`** — full drill-down with raw prompts, output JSONL, and per-step status

This is a genuinely good design. A human can scan the log, an agent can parse status.json, and either can drill into steps/ for forensics.

#### 2. Per-step telemetry is comprehensive
Each step in `status.json` tracks:
- Duration (ms), token breakdown (input/output/cache_read/cache_creation)
- Cost in USD, number of turns
- Git SHA post-step (`post_sha`)
- Structured summary with status/action/decision/blockers/files_changed

The cost rollup in `totals` ($9.89 across 513 turns) is immediately useful for budgeting and efficiency analysis.

#### 3. Review step catches real issues
The review step successfully identified:
- Scope creep in #69 (mutation interface changed beyond spec)
- Frontend rendering failures in #70 (backend worked, UI didn't render)
- Missing frontend in #71 (backend complete, no vote UI)
- `useMutation` SSR crash in #72, #73, #74

This proves the review step is working as a quality gate — it's generating accurate, specific failure signals with actionable learnings.

#### 4. Dependency tracking and issue ordering
The execution log shows clear dependency resolution: `Blocked issues: #70 ← [#69]; #71 ← [#69]; #72 ← [#70]; #73 ← [#71, #72]; #74 ← [#69]`. Issues unblock correctly as predecessors close. The pipeline selects from available (unblocked) issues each iteration.

#### 5. Learning file captures platform-specific knowledge
Learnings like "convex-svelte does not export useMutation" (learn-9) and "TypeScript expects Id<'testPollTable'>, not string" (learn-8) are the exact kind of platform-specific gotchas that expert agents need to avoid repeating mistakes.

#### 6. Step naming convention is legible
`69_02_tdd`, `73_21_refactor` — the `{issue}_{sequence}_{step}` pattern makes it immediately clear which issue, what order, and what type of work. Easy to sort chronologically and filter by concern.

---

### Weaknesses

#### 1. CRITICAL: Reviews fail but build "passes" — no feedback loop
Every single review step returned `status: "fail"`:
- #69: scope creep, mutation interface broken
- #70: frontend doesn't render
- #71: no vote casting UI
- #72: useMutation SSR 500
- #73: TypeScript errors prevent startup
- #74: useMutation import crashes page

Yet `status.json` top-level says `"status": "pass"` and the pipeline closed all issues. **The review step is a sensor without an actuator.** It detects problems but the pipeline doesn't branch on review failure — no retry, no patch step, no issue re-open. This is the single biggest gap: the observability layer *observes the failure* but the workflow doesn't *act on it*.

For a human reading this after the fact, the `"status": "pass"` is actively misleading. For an agent, the signals exist in the step data but the top-level status contradicts them.

#### 2. Cascading failure not detected or surfaced
The `useMutation` import error was introduced in #70's TDD step and then cascaded through #72, #73, and #74 reviews as a blocking issue. The learning file captures this same root cause in learns 6, 7, 8, and 9 — four separate entries for one bug. Neither the execution log nor status.json surface this pattern: "one early mistake is now blocking everything downstream."

A human reading the build output has to mentally reconstruct this cascade. An agent would need to cross-reference blocker fields across reviews to deduce it.

#### 3. Learning file has no deduplication
Learns 6, 7, 8, and 9 all describe the same root cause (convex-svelte doesn't export useMutation). They're worded differently because different reviews discovered it independently, but they're the same finding. An expert agent consuming this file would process 4 entries for 1 insight, and might weight the issue 4x more than warranted — or waste tokens parsing redundant context.

#### 4. Learnings lack traceability to source step
Each learning has `workflow` and `run_id` but no `step_id` or `issue_number`. You can't tell which learning came from which step without reading the full execution log and matching context strings manually. Adding a `source_step: "73_22_review"` field would make the learning file self-contained for forensics.

#### 5. Some step summaries are empty
Steps `69_02_tdd`, `70_06_tdd`, `71_10_tdd`, and `72_15_tdd` have empty `action` and `decision` fields in their summaries:
```json
"summary": { "status": "pass", "action": "", "decision": "", "blockers": "none" }
```
These are the TDD steps — arguably the most important steps to understand. A human or agent looking at status.json for a quick overview gets no signal from these entries.

#### 6. state.json is underutilized
`state.json` contains only the ADW ID, issue number, branch info, and an empty `all_adws` array. It doesn't capture:
- Which issues were processed and their final review status
- The overall quality verdict (how many reviews passed vs failed)
- Whether the build left known defects
- A pointer to the learning file

This file could serve as the single "glanceable" entry point but currently requires you to open status.json for anything useful.

#### 7. No aggregate quality score
`status.json` has per-step summaries and cost totals, but no quality summary like:
- Issues completed: 6/6
- Reviews passed: 0/6
- Known defects: useMutation import (cascading), scope creep in #69
- Build health: degraded

A human opening this build for the first time has to read all 26 step entries to understand "did this build actually produce working code?"

#### 8. Consult step output is sometimes filler
The #70 consult returned: "I've launched both experts... Let me wait for their responses... The responses should appear shortly." This is process narration, not actionable guidance. The consult step's value should be pre-implementation constraints — when it returns filler, it's wasted cost ($0.066) and the TDD step proceeds without the intended guard rails.

#### 9. execution.log truncation hides detail
The execution log truncates consult and review outputs with `[truncated]`. While understandable for log size, it means the log alone is insufficient for understanding what guidance was given or what specific failures were found. You must drill into `steps/*/` for the full picture. This is fine for an agent (it can read the files) but reduces the log's utility as a standalone human-readable record.

---

## Architecture Documentation

### Build output structure
```
temp/builds/{issue}_{adw_id}/
├── state.json          — minimal run metadata (id, branch, issue)
├── status.json         — full telemetry: per-step cost/tokens/summary + totals
├── execution.log       — human-readable chronological narrative
└── steps/
    └── {issue}_{seq}_{step}/
        ├── prompt.txt       — input prompt to the step
        ├── {step}.log       — step's output log
        ├── raw_output.jsonl — raw LLM output
        └── status.json      — per-step status/usage/summary
```

### Learning file structure
```yaml
- id: learn-N
  workflow: adw_ralph
  run_id: "pipeline-YYYY-MM-DD"
  date: YYYY-MM-DD
  tags: [domain tags]
  context: "what was being attempted"
  expected: "what should have happened"
  actual: "what actually happened"
  confidence: high|medium|low
  platform_context: {versions}
```

### Pipeline flow per issue
```
select → consult → tdd → [refactor if warranted] → review → close issue
```
The refactor step has a `skipWhen` condition (skipped for #69 and #70, ran for #71-#74).

---

## Code References

- `temp/builds/68_ralph_18c66a07/state.json` — Run metadata (5 lines)
- `temp/builds/68_ralph_18c66a07/status.json` — Full telemetry, 547 lines, 26 steps
- `temp/builds/68_ralph_18c66a07/execution.log` — 649 lines, ~44KB
- `temp/builds/68_ralph_18c66a07/steps/` — 26 step directories
- `temp/learnings/pipeline-2026-03-28.md` — 9 learnings in YAML

---

## Open Questions

- Is the review-fail-but-pipeline-continues behavior intentional (observe-only) or a gap to close?
- Should learning dedup happen at write time (in the pipeline) or at read time (in the expert agents)?
- Is state.json meant to be enriched later, or is it intentionally minimal as a resumption checkpoint?
