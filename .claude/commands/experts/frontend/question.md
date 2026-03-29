---
allowed-tools: Bash, Read, Grep, Glob, TodoWrite, mcp__svelte__list_sections, mcp__svelte__get_documentation, mcp__svelte__svelte_autofixer, mcp__svelte__playground_link
description: Answer questions about frontend routes, components, and UI patterns without coding
argument-hint: [question]
---

# Frontend Expert - Question Mode

Answer the user's question by analyzing the SvelteKit apps, UI components, shared packages, and frontend patterns in this project. This prompt provides information about the frontend layer without making any code changes.

## Variables

USER_QUESTION: $1
CONTEXT: $2
EXPERTISE_PATH: .claude/commands/experts/frontend/expertise.yaml

## Instructions

- IMPORTANT: This is a question-answering task only — DO NOT write, edit, or create any files
- Focus on routes, components, layouts, Svelte 5 patterns, i18n, stores, and Convex data integration
- If the question requires code changes, explain the approach conceptually without implementing
- Validate information from `EXPERTISE_PATH` against the codebase before answering
- Reference only local codebase and `ai_docs/` — no external URLs
- If CONTEXT is provided, use it as additional context for answering the question

## Workflow

- Read the `EXPERTISE_PATH` file to understand frontend architecture and patterns
- If CONTEXT is non-empty, read and incorporate it before answering
- Review, validate, and confirm information from `EXPERTISE_PATH` against the codebase
- Respond based on the `Report` section below

## Report

- Direct answer to the `USER_QUESTION`
- Supporting evidence from `EXPERTISE_PATH` and the codebase
- References to the exact files and lines of code that support the answer
- High-mid level conceptual explanations of the frontend architecture and patterns
- Include component trees (indented or mermaid), route diagrams, or Svelte/TS snippets where appropriate to streamline communication

### Quality Gates (MANDATORY for any .svelte changes)

If the question involves `.svelte` file changes, you MUST include this section in your response:

```
### Quality Gates

1. **Before coding**: Use `mcp__svelte__get-documentation` to verify Svelte 5 patterns (runes, events, bindings, snippets) rather than relying on memory
2. **After coding**: Run `mcp__svelte__svelte-autofixer` on every modified `.svelte` file to catch syntax errors, deprecated patterns, and accessibility issues
```

Omitting this section when `.svelte` files are in scope is a consultation failure. The implementing agent depends on this guidance to produce correct Svelte 5 code.
