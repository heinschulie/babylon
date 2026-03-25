---
allowed-tools: Read, Glob, Grep, Bash, WebFetch, mcp__firecrawl__firecrawl_scrape
description: Create a PRD through user interview, codebase exploration, and module design, then submit as a GitHub issue
model: opus
---

# Purpose

Create a Product Requirements Document (PRD) by interviewing the user, exploring the codebase, designing modules, and submitting the final PRD as a GitHub issue. Follow the Instructions and Workflow below.

## Instructions

- **Stable branch guard**: Before starting, check the current git branch. If on a branch matching `hein/feature/issue-*`, STOP and tell the user they must switch to a stable branch (e.g., `main`) before creating a PRD. Do not proceed.
- Ask the user for a detailed description of the problem and any solution ideas before doing anything else
- Explore the repo to verify user assertions and understand current codebase state
- Interview the user relentlessly about every aspect of the plan until shared understanding is reached; walk down each branch of the design tree, resolving dependencies between decisions one-by-one
- Sketch major modules to build or modify; actively look for deep modules (encapsulate lots of functionality behind simple, testable, rarely-changing interfaces) over shallow modules
- Confirm modules match user expectations and ask which modules need tests
- Skip steps you don't consider necessary
- Do NOT include specific file paths or code snippets in the PRD — they become outdated quickly
- Submit the final PRD as a GitHub issue using `gh issue create`
- IMPORTANT: Include the current conversation ID in the PRD's Metadata section as `conversation_id`. This allows humans or agents to trace back to the conversation that spawned the PRD.

## Workflow

1. Ask the user for a long, detailed description of the problem they want to solve and any potential solution ideas
2. Explore the repo (read files, search code) to verify assertions and understand current state
3. Interview the user about every aspect of the plan — resolve each design decision and its dependencies one-by-one
4. Sketch out major modules to build or modify, favoring deep modules that can be tested in isolation; confirm with the user and ask which modules need tests
5. Write the PRD using the template below and submit it as a GitHub issue via `gh issue create`

### PRD Template

```
## Metadata
conversation_id: `{conversation_id}`

## Problem Statement
The problem from the user's perspective.

## Solution
The solution from the user's perspective.

## User Stories
An extensive numbered list covering all aspects of the feature:
1. As an <actor>, I want a <feature>, so that <benefit>

## Implementation Decisions
- Modules to build/modify
- Interface changes
- Technical clarifications
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

## Testing Decisions
- What makes a good test (test external behavior, not implementation details)
- Which modules will be tested
- Prior art for tests in the codebase

## Out of Scope
Things explicitly not covered by this PRD.

## Further Notes
Any additional context.
```

## Report

After submitting, report back with the GitHub issue URL and a brief summary of the PRD contents.