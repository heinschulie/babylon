---
allowed-tools: Bash(gh *), Read, Grep, Glob, Agent
description: Break a PRD into independently-grabbable GitHub issues using tracer-bullet vertical slices
argument-hint: [PRD issue number or URL]
model: opus
---

# Purpose

Break a PRD into independently-grabbable GitHub issues using vertical slices (tracer bullets). Each issue is a thin end-to-end slice through all integration layers — not a horizontal layer slice. Follow the `Instructions` and `Workflow` to interview the user, draft slices, and create issues.

## Variables

PRD_REF: $ARGUMENTS

## Instructions

- Each slice must cut through ALL layers end-to-end (schema, API, UI, tests) — never horizontal layer slices
- A completed slice must be demoable or verifiable on its own
- Prefer many thin slices over few thick ones
- Slices are either HITL (requires human interaction like arch decision or design review) or AFK (can be implemented and merged without human interaction) — prefer AFK
- Create issues in dependency order (blockers first) so real issue numbers can be referenced
- Do NOT close or modify the parent PRD issue
- Use the issue template defined in the Workflow for all created issues

## Workflow

1. If PRD_REF is provided, fetch it with `gh issue view <number> --comments`. If not provided, ask the user for the PRD issue number or URL, then fetch it.
2. If the codebase has not been explored yet, explore it to understand current state relevant to the PRD
3. Draft vertical slices — for each slice identify:
   - **Title**: short descriptive name
   - **Type**: HITL / AFK
   - **Blocked by**: which other slices must complete first
   - **User stories covered**: which user stories from the PRD this addresses
4. Present the breakdown as a numbered list and ask the user:
   - Does the granularity feel right? (too coarse / too fine)
   - Are the dependency relationships correct?
   - Should any slices be merged or split further?
   - Are the correct slices marked as HITL and AFK?
5. Iterate until the user approves the breakdown
6. For each approved slice, create a GitHub issue with `gh issue create` using this template:

```
## Parent PRD

#<prd-issue-number>

## What to build

A concise description of this vertical slice. Describe end-to-end behavior, not layer-by-layer implementation. Reference specific sections of the parent PRD rather than duplicating content.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- Blocked by #<issue-number> (if any)

Or "None - can start immediately" if no blockers.

## User stories addressed

Reference by number from the parent PRD:

- User story 3
- User story 7
```

## Report

List all created issues with their numbers, titles, types (HITL/AFK), and dependency relationships. Include a link to each issue and a summary of the overall breakdown structure.