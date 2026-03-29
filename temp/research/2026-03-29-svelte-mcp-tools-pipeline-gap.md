---
date: 2026-03-29T12:00:00+02:00
researcher: Claude
git_commit: ee84a31
branch: hein/feature/issue-79
repository: babylon
topic: 'Are Svelte MCP tools utilised in the Ralph pipeline? Do TDD and expert agents have access?'
tags: [research, codebase, svelte-mcp, ralph-pipeline, tdd, experts, tooling-gap]
status: complete
last_updated: 2026-03-29
last_updated_by: Claude
---

# Research: Svelte MCP Tool Availability in Ralph Pipeline

## Research Question

The Svelte MCP server provides tools (`mcp__svelte__get_documentation`, `mcp__svelte__list_sections`, `mcp__svelte__svelte_autofixer`, `mcp__svelte__playground_link`) that could improve frontend code quality. Are these tools actually available to agents spawned by the Ralph pipeline? Does the TDD skill "know" about them for frontend work? Would the frontend expert reliably advise their use?

## Summary

**The Svelte MCP tools are NOT available to SDK-spawned agents.** The Ralph pipeline uses `@anthropic-ai/claude-agent-sdk` via `sdk.query()`, which does not connect MCP servers. MCP servers are connected to the _interactive_ Claude Code session, not to programmatic SDK invocations. The TDD agent in build 79 actually **tried** to call `mcp__svelte__svelte_autofixer` and received `"Error: No such tool available"`. The frontend expert's `question.md` lists Svelte MCP tools in its `allowed-tools` header, but this is only meaningful when the expert is invoked interactively — not when invoked via the SDK pipeline.

## Detailed Findings

### 1. The SDK Does Not Provide MCP Tools

The agent SDK creates sessions via `sdk.query()` with these options:

```ts
// adws/src/agent-sdk.ts:196-209
sdk.query({
  prompt,
  options: {
    model: opts.model ?? DEFAULT_MODEL,
    cwd: opts.cwd,
    permissionMode: "bypassPermissions",
    allowDangerouslySkipPermissions: true,
    settingSources: ["user", "project", "local"],
  },
});
```

There is no `mcpServers` configuration passed. The `settingSources` loads user/project/local settings (which include permission rules for WebFetch domains, etc.), but MCP server connections are established by the Claude Code CLI runtime — not inherited by SDK-spawned agents.

### 2. Build 79 Proves the Gap — TDD Agent Tried and Failed

In the build log for issue #81 (the frontend UI issue), the TDD agent (running `claude-haiku-4-5-20251001`) attempted to validate its Svelte code:

```
// temp/builds/79_ralph_22a1a369/steps/81_05_tdd/raw_output.jsonl:122-124

Line 122: "Perfect! All 77 tests pass! Now let me validate the Svelte component:"
Line 123: [tool_use] name: "mcp__svelte__svelte_autofixer" input: {code: "<script lang=\"ts\">...", filename: "+page.svelte", desired_svelte_version: "5"}
Line 124: [tool_result] "Error: No such tool available: mcp__svelte__svelte_autofixer"
```

The agent knew the tool existed (likely from system prompt context or MCP server instructions), tried to use it, failed, and fell back to manually reading the file to verify correctness.

### 3. Frontend Expert Lists MCP Tools But Can't Use Them in Pipeline

The frontend expert's `question.md` declares:

```yaml
# .claude/commands/experts/frontend/question.md:2
allowed-tools: Bash, Read, Grep, Glob, TodoWrite, mcp__svelte__list_sections, mcp__svelte__get_documentation, mcp__svelte__svelte_autofixer, mcp__svelte__playground_link
```

This `allowed-tools` header is meaningful only in interactive CLI sessions where the MCP server is connected. When invoked via the SDK pipeline (as the consult step does), these tools simply don't exist in the agent's environment.

### 4. The Consult Step Provides Text Advice, Not Tool Access

The Ralph pipeline's consult step (`ralph-executor.ts:40-58`) invokes `/experts:consult`, which routes to matched experts. The expert consultation produces _text guidance_ (e.g., "use Svelte 5 runes", "don't use useMutation") that is appended to the TDD step's prompt as `## Expert Guidance`.

This is a pure text-injection pattern:

```ts
// ralph-executor.ts:66-69
const tddBody = context.expertAdvice
  ? `${context.issue.body}\n\n## Expert Guidance\n${context.expertAdvice}`
  : context.issue.body;
```

The expert advice in build 79 was actually quite good — it correctly warned about `useMutation` not existing, specified i18n patterns, etc. But it cannot _grant_ tool access. The advice is prose, not tooling.

### 5. TDD Skill Has No Svelte-Specific Tooling References

The TDD skill (`SKILL.md`) is domain-agnostic. It describes:
- Red-green-refactor philosophy
- Vertical slicing approach
- Step summary format

It has no `allowed-tools` header at all, meaning it relies on whatever tools the runtime provides. In interactive mode, that includes MCP tools; in SDK mode, it does not.

### 6. Would the Frontend Expert Reliably Advise Using Svelte Tools?

Looking at the actual consult output for #81, the frontend expert gave solid pattern advice but **never mentioned the Svelte MCP tools**. The expert's `expertise.yaml` focuses on project patterns (routes, components, i18n, data layer) — it doesn't reference MCP tooling at all. The `question.md` lists the tools in `allowed-tools` but the prompt body doesn't instruct the expert to _recommend_ their use to downstream agents.

Even if the expert did recommend them, the TDD agent couldn't use them.

## Code References

- `adws/src/agent-sdk.ts:196-209` — SDK query options (no MCP config)
- `adws/src/ralph-executor.ts:64-69` — Expert advice injection into TDD prompt
- `adws/src/ralph-pipeline.ts:14-60` — Pipeline definition (consult → tdd → refactor → review)
- `.claude/commands/experts/frontend/question.md:2` — allowed-tools includes Svelte MCP tools
- `.claude/skills/tdd/SKILL.md` — No allowed-tools, no Svelte references
- `.claude/commands/experts/frontend/expertise.yaml` — No MCP tool references
- `.claude/commands/experts/consult.md` — Orchestrator routes to experts, no tool forwarding
- `temp/builds/79_ralph_22a1a369/steps/81_05_tdd/raw_output.jsonl:122-124` — Smoking gun: autofixer call fails

## Architecture Documentation

### How Tools Reach Agents

```
Interactive CLI Session:
  User → Claude Code CLI → [MCP servers connected] → Agent has all tools

SDK Pipeline (Ralph):
  adw_ralph.ts → sdk.query(prompt) → Agent gets: Read, Write, Edit, Bash, Glob, Grep, etc.
                                      Agent does NOT get: mcp__svelte__*, mcp__firecrawl__*
```

### The Advice-Only Pattern

```
consult step → Expert reads expertise.yaml → Produces text advice
                                                    ↓
tdd step     → Receives advice as prompt suffix → Writes code without validation tools
                                                    ↓
review step  → Reads diff, scores against spec → Text-only review (no Svelte validation)
```

## Open Questions

1. Does the `@anthropic-ai/claude-agent-sdk` support passing MCP server configs to `sdk.query()`? If so, the Svelte MCP server could be forwarded to pipeline agents.
2. If MCP forwarding isn't supported, could a pre/post hook run `mcp__svelte__svelte_autofixer` as a postcondition check between the TDD and review steps?
3. Should the pipeline have a dedicated "lint/validate" step for frontend issues that runs the Svelte autofixer outside the agent?
