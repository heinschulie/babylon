---
allowed-tools: Bash(gh *), Read, Grep, Glob, Agent
description: Break a PRD into independently-grabbable GitHub issues using tracer-bullet vertical slices
argument-hint: [PRD issue number or URL]
model: opus
---

# Purpose

Break a PRD into independently-grabbable GitHub issues using vertical slices (tracer bullets). Each issue is a thin end-to-end slice through all integration layers — not a horizontal layer slice. Each sub-issue is linked as a native GitHub sub-issue to the parent PRD issue. Follow the `Instructions` and `Workflow` to interview the user, draft slices, and create issues.

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
- Each sub-issue must be linked to the parent PRD issue as a native GitHub sub-issue via the GraphQL addSubIssue mutation

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
6. For each approved slice, create a GitHub sub-issue linked to the parent PRD issue:

   a. Create the issue with `gh issue create` using the template below. Add labels: `sub-issue` plus a type label (`bug`, `enhancement`, or `chore`) per issue.
   b. Link it as a sub-issue to the parent via GraphQL:
      - Fetch the parent's node ID: `gh api graphql -f query='query { repository(owner: "OWNER", name: "REPO") { issue(number: PARENT_NUM) { id } } }'`
      - Fetch the child's node ID: same query with the child issue number
      - Link: `gh api graphql -f query='mutation { addSubIssue(input: { issueId: "PARENT_ID", subIssueId: "CHILD_ID" }) { issue { id } subIssue { id } } }'`

### Issue Template

```
## Parent PRD

#<prd-issue-number>

## Interface Specification

Public API, function signatures, types, and data structures this slice introduces or modifies. Be specific enough that a TDD agent can write tests from this section alone.

## Behaviors to Test (prioritized)

1. Most critical behavior — describe expected input/output
2. Next most critical behavior
3. ...

Order matters — a TDD agent will work through these top-to-bottom.

## Mocking Boundaries

What's real vs stubbed in tests for this slice:
- **Real**: [e.g., Convex functions, utility modules]
- **Stubbed**: [e.g., external API calls, auth session]

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Dependencies

- **Blocked by**: #<issue-number> (if any), or "None — can start immediately"
- **Blocks**: #<issue-number> (if any)

## User stories addressed

Reference by number from the parent PRD:

- User story 3
- User story 7
```

## Report

List all created issues with their numbers, titles, types (HITL/AFK), and dependency relationships. Include a link to each issue and a summary of the overall breakdown structure.
