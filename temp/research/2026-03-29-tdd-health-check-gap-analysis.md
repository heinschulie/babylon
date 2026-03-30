---
date: 2026-03-29T21:30:00+02:00
researcher: Claude
git_commit: 0266aec
branch: hein/feature/issue-83
repository: babylon
topic: 'Why the TDD skill consistently fails to run the health_check command'
tags: [research, tdd, health-check, ralph, agent-behavior, haiku]
status: complete
last_updated: 2026-03-29
last_updated_by: Claude
---

# Research: Why the TDD Skill Skips the Health Check Command

## Research Question

Why does the TDD command consistently NOT implement the health_check as part of its testing gate, despite explicit instructions in the SKILL.md? Where is the emphasis being lost?

## Summary

The health check instruction reaches the TDD agent's context — its thinking blocks reference "Run health check to ensure types and build pass." However, the agent (Haiku) **reinterprets the intent** rather than executing the specified command. It runs `bun run check` and `bun run build` as separate Bash calls instead of `bun run adws/scripts/health-check.ts`. Three reinforcing factors explain this:

1. **Model capability**: The TDD step runs on Haiku (trivial complexity mapping), which follows intent over literal instruction
2. **Instruction dilution**: The health check command is one line buried in a 124-line SKILL.md competing with a large issue body + expert guidance — Haiku deprioritizes specific commands in favor of understood concepts
3. **No programmatic enforcement**: The pipeline postcondition `code-must-compile` only runs `bun run check` (types) — it never validates `bun run build`, creating a signal that the build validation is optional

## Detailed Findings

### 1. The Instruction Path: SKILL.md → Agent Context

**SKILL.md specifies (line 94):**
```
2. **Run `bun run adws/scripts/health-check.ts`** — this runs `bun run check` (types) + `bun run build` (Vite/SSR). Exit 0 = pass, exit 1 = fail. ALL must pass.
```

**And again in the checklist (line 108):**
```
[ ] bun run adws/scripts/health-check.ts exits 0 (types + build)
```

The SKILL.md is loaded via Claude Code's skill discovery mechanism. The SDK is configured with `settingSources: ["user", "project", "local"]` (`adws/src/agent-sdk.ts:206`), which causes Claude Code to discover `.claude/skills/tdd/SKILL.md` and inject it into the system prompt.

**Evidence it reaches the agent:** The init message (`raw_output.jsonl:7`) lists `"tdd"` in the `skills` array. The agent's first thinking block (`raw_output.jsonl:8`) explicitly states: *"Run health check to ensure types and build pass"* — proving the concept was absorbed.

### 2. What the Agent Actually Did

From the raw JSONL output of step `89_03_tdd`:

| JSONL Line | Action | Command |
|------------|--------|---------|
| 28 | Run focused tests | `bun run test -- apps/web/src/routes/test/page.test.ts 2>&1 \| head -100` |
| 31 | Retry tests | `bun run test -- apps/web/src/routes/test/page.test.ts 2>&1` |
| 34 | Run broad tests | `bun run test -- "**test.ts" 2>&1 \| head -150` |
| 40 | Run all tests | `bun run test 2>&1 \| head -200` |
| **44** | **Type check** | **`bun run check 2>&1 \| tail -50`** |
| **47** | **Build** | **`bun run build 2>&1 \| tail -80`** |

The agent ran the two underlying commands manually — never the wrapper script, never the `/health_check` skill.

### 3. Root Cause 1: Model Selection — Haiku for "Trivial" Issues

**Pipeline definition** (`adws/src/ralph-pipeline.ts:32`):
```typescript
modelMap: { trivial: "research", standard: "default", complex: "opus" },
```

**Model resolution** (`adws/src/utils.ts:361-368`):
```typescript
research: "claude-haiku-4-5-20251001"
default:  "claude-sonnet-4-20250514"
opus:     "claude-opus-4-20250514"
```

Issue #89 was classified as trivial complexity → `research` alias → **Haiku**. The init message confirms: `"model":"claude-haiku-4-5-20251001"`.

Haiku absorbs intent ("types + build need to pass") but doesn't reliably follow literal command specifications embedded in longer instruction documents. It took the shortcut of running the component commands directly.

### 4. Root Cause 2: Instruction Dilution in the Prompt

The TDD agent's total context includes:

1. **System prompt** — Claude Code base instructions
2. **SKILL.md** — 124 lines of TDD methodology, workflow, and validation gates
3. **Issue body** — review defect specification (~40 lines)
4. **Expert guidance** — frontend constraints from consult step (~60 lines)
5. **CLAUDE.md** — project conventions (~100 lines)

The health check instruction is **two lines** within the 124-line SKILL.md (lines 94 and 108). It competes with:
- 6 TDD philosophy paragraphs
- Anti-pattern warnings
- Workflow steps
- Mocking guidelines
- Interface design references

For Haiku, the specific command `bun run adws/scripts/health-check.ts` gets deprioritized against the more salient concept of "run type checks and build."

### 5. Root Cause 3: Pipeline Postcondition Doesn't Enforce the Full Health Check

**Pipeline postcondition** (`adws/src/ralph-pipeline.ts:35`):
```typescript
postcondition: ["head-must-advance", "code-must-compile"],
```

**`code-must-compile` implementation** (`adws/src/step-runner.ts:130-142`):
```typescript
if (postcondition === "code-must-compile") {
  const proc = Bun.spawn(["bun", "run", "check"], { cwd, stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  // ...
}
```

This **only runs `bun run check`** (types). It does NOT run `bun run build`. The full health-check script (`adws/src/health-check.ts:20-64`) runs both `bun run check` AND `bun run build`.

This means:
- If the agent skips the build check, the postcondition won't catch it
- The pipeline implicitly validates that "close enough" is acceptable
- The agent's manual `bun run check` + `bun run build` is actually **more thorough** than what the postcondition enforces — but it still bypasses the canonical script

### 6. The "health_check" is a Slash Command, Not a Skill

From the init message (`raw_output.jsonl:7`):
- **`skills` array** (12 items): includes `"tdd"` — these get SKILL.md injected
- **`slash_commands` array** (67 items): includes `"health_check"` — these are discoverable but not pre-loaded

The `/health_check` command exists at `.claude/commands/health_check.md` (a simple wrapper for `bun run adws/scripts/health-check.ts`). But since it's a command (not a skill), its definition isn't pre-loaded into the agent's context — the agent would need to actively invoke it with the Skill tool.

The TDD SKILL.md doesn't say "run `/health_check`" — it says "run `bun run adws/scripts/health-check.ts`." This is a Bash command, not a skill invocation. But Haiku decomposed it into the constituent parts.

## Code References

- `.claude/skills/tdd/SKILL.md:89-98` — GREEN Validation Gate (specifies health check)
- `.claude/skills/tdd/SKILL.md:106-111` — Per-cycle checklist (repeats health check)
- `adws/src/ralph-pipeline.ts:26-36` — TDD step definition (model map + postcondition)
- `adws/src/step-runner.ts:130-142` — `code-must-compile` postcondition (check only, no build)
- `adws/src/utils.ts:361-368` — Model resolution (haiku for research)
- `adws/src/agent-sdk.ts:195-214` — SDK creation with settingSources
- `adws/src/step-commands.ts:70-73` — TDD prompt builder
- `adws/src/ralph-executor.ts:64-71` — TDD step execution with expert advice
- `adws/src/health-check.ts:20-64` — Full health check (check + build)
- `adws/scripts/health-check.ts` — CLI wrapper for health check
- `.claude/commands/health_check.md` — Slash command wrapper

## Architecture Documentation

### Prompt Assembly Chain
```
ralph-executor.ts:66-67  → assembles issue body + expert guidance
step-commands.ts:70-73   → wraps as: /tdd \n\n{body}
agent-sdk.ts:371-379     → builds: "/tdd \n\n{body}"
agent-sdk.ts:218-245     → sends to sdk.query()
Claude Code SDK          → loads .claude/skills/tdd/SKILL.md into system prompt
                         → spawns Haiku session with full context
```

### Validation Layers (Intended vs Actual)
```
Layer 1 (SKILL.md):      bun run adws/scripts/health-check.ts  → check + build
Layer 2 (Postcondition):  code-must-compile                     → check only
Layer 3 (Agent behavior): bun run check + bun run build         → check + build (manual)
```

Layer 1 is aspirational (agent must follow it). Layer 2 is enforced (programmatic). Layer 3 is what actually happened. The gap is between Layer 1's specificity (use this exact script) and Haiku's interpretation (run the underlying commands).

## Open Questions

1. Would promoting the health check to a **programmatic postcondition** (e.g. `health-check-must-pass`) that runs the actual script eliminate the dependency on agent compliance?
2. Would moving the TDD model floor from `research` (Haiku) to `default` (Sonnet) for trivial issues improve instruction adherence enough, or is the cost increase unacceptable?
3. Would restructuring SKILL.md to put the health check command in a more prominent position (e.g., bold callout at the top) improve Haiku's compliance?
4. Should the `code-must-compile` postcondition be upgraded to also run `bun run build` to match what the health check script does?
