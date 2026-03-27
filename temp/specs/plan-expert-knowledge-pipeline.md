# Plan: Expert Knowledge Pipeline

## Metadata

adw_id: `n/a`
prompt: `Capture the thinking from our conversation about building a three-stage knowledge pipeline (refresh_ai_links → load_ai_docs → self-improve) with runtime learnings feedback loop, source provenance tracking, and conflict resolution via platform versioning.`
conversation_id: `grill-me-expert-knowledge-pipeline-2026-03-26`
task_type: feature
complexity: complex

## Task Description

Build a knowledge pipeline that keeps our agent expert system grounded in trusted, current, and battle-tested knowledge. The pipeline has three stages plus a runtime feedback loop:

1. **`refresh_ai_links`** — Discover and curate documentation URLs per technology domain. Persist URLs with `source_type` and `framework_version` metadata in `ai_docs/README.md`.
2. **`load_ai_docs`** (enhanced) — Scrape URLs, save markdown files with `scraped_at` frontmatter. Flag freshness ambiguity where multiple sources cover the same topic at different version levels.
3. **`experts/*/self-improve`** (enhanced) — Consume ai_docs + learnings to build/update expertise.yaml with a new `platform_constraints` section. Version-tagged rules enable conflict resolution.
4. **`adw_learn`** — New ADW workflow that processes runtime learnings (written by Ralph, SDLC, etc.) through expert triage and selective self-improve passes.

The system implements a clear epistemological hierarchy: **lived experience > docs, unless the platform version has changed**.

## Objective

When complete, the expert system will:
- Automatically discover and curate best-practice sources per technology
- Ingest documentation with provenance metadata (source_type, framework_version, scraped_at)
- Synthesize docs + runtime learnings into expertise.yaml files with version-aware conflict resolution
- Close the feedback loop: agent runs → learnings → expertise updates → better agent runs

## Problem Statement

Agent experts currently have no mechanism to:
- Distinguish between theoretical documentation and hard-earned runtime experience
- Resolve conflicts between sources of different ages, types, or authority levels
- Incorporate negative knowledge ("don't do X") learned from actual failures
- Track which platform version a piece of expertise was validated against

This leads to expertise files that are either stale or blindly trust the last source that was read, with no way to weigh competing information.

## Solution Approach

A four-component pipeline with clear interfaces:

```
refresh_ai_links → ai_docs/README.md (curated URLs + metadata)
                        ↓
load_ai_docs     → ai_docs/*.md (scraped content + frontmatter)
                        ↓
self-improve     → experts/*/expertise.yaml (synthesized knowledge)
                        ↑
adw_learn        ← temp/learnings/*.md (runtime experience from agent runs)
```

Each component is a separate command or ADW, composable via orchestrating workflows.

## Relevant Files

### Existing Files (to modify)

- `ai_docs/README.md` — URL index; needs `source_type` and `framework_version` columns per entry
- `.claude/commands/load_ai_docs.md` — Scraper command; needs freshness-ambiguity flagging logic
- `.claude/commands/experts/database/self-improve.md` — Expert self-improve; needs learnings ingestion, platform_constraints validation, version-aware conflict resolution
- `.claude/commands/experts/database/expertise.yaml` — Database expertise; gets new `platform_constraints` section with `verify` and `platform_context` fields

### New Files

- `.claude/commands/refresh_ai_links.md` — New command: discover and curate documentation URLs per technology
- `adws/workflows/adw_learn.ts` — New ADW: triage learnings across experts, run targeted self-improve, clear processed entries
- `temp/learnings/README.md` — Learnings directory README documenting the entry schema

## Implementation Phases

### Phase 1: Foundation — Learnings Schema & Directory

Establish the learnings interface contract that all workflows will write to and `adw_learn` will read from. This must be stable before anything else is built.

### Phase 2: Core — Enhanced Self-Improve & Platform Constraints

Extend the existing self-improve pattern to consume learnings and maintain version-tagged platform constraints. This is the highest-value change.

### Phase 3: Discovery — refresh_ai_links Command

Build the URL discovery and curation command. This can be developed independently since load_ai_docs already works with the current README format.

### Phase 4: Integration — adw_learn Workflow & Composition

Wire everything together: the ADW that orchestrates triage + selective self-improve, and the hooks for Ralph/SDLC to write learnings.

### Phase 5: Enhancement — load_ai_docs Freshness Flagging

Enhance the existing scraper to flag freshness ambiguity in scraped docs.

## Step by Step Tasks

### 1. Define the Learnings Entry Schema

- Create `temp/learnings/README.md` documenting the canonical entry format:

```yaml
- id: learn-{sequential}
  workflow: adw_ralph | adw_sdlc | manual
  run_id: "{workflow}-{date}-{short-hash}"
  date: YYYY-MM-DD
  tags: [convex, queries, indexes, ...]
  context: "Brief description of what was being attempted"
  expected: "What the agent expected based on current expertise"
  actual: "What actually happened"
  resolution: "How it was resolved (optional — unresolved learnings are valid)"
  expertise_rule_violated: "Reference to specific rule if applicable (optional)"
  confidence: high | medium | low
  platform_context:
    convex: "x.y.z"
    sveltekit: "x.y.z"
```

- Validate the schema covers the scenarios discussed: resolved failures, unresolved failures, negative knowledge, version-specific findings

### 2. Add platform_constraints Section to expertise.yaml

- Add a new `platform_constraints` section to the database expertise.yaml
- Distill rules from our ai_docs (primary) cross-referenced with convex-agent-plugins and convexskills repos
- Each rule includes:
  - `rule`: concise statement
  - `verify`: pointer to source file(s) that validate this rule
  - `platform_context`: version(s) the rule was validated against
  - `source`: where the rule came from (ai_docs page, repo rule, runtime learning)
- Initial rules to include (validated in this conversation):
  - `.withIndex()` over `.filter()` — filter does post-scan filtering
  - Batch `runQuery`/`runMutation` into single internal function from actions
  - Don't call actions directly from clients — mutation → schedule → internal action
  - Auth is NOT propagated to scheduled functions
  - `runAction` only for crossing JS runtimes
  - Staged indexes for large table migrations
  - `"use node"` files cannot export queries/mutations
  - Mutations are transactional — all reads consistent, all writes atomic
  - Actions are NOT transactional — separate runQuery calls are NOT consistent
  - Scheduling from mutations is atomic; from actions it is not
  - Flat relational schemas, limit arrays to 5-10 elements
  - Index limits: max 16 fields, 32 indexes per table
  - Action limits: 10 min timeout, 512MB Node / 64MB Convex runtime
  - `_creationTime` auto-appended to all indexes — don't add explicitly

### 3. Enhance self-improve to Consume Learnings

- Update `.claude/commands/experts/database/self-improve.md` to add a new step between "Check Git Diff" and "Read Current Expertise":
  - Read `temp/learnings/*.md` (or `temp/learnings/learnings.md`)
  - Filter entries where tags intersect with expert's `domain_tags`
  - For matched entries: validate against codebase, update expertise.yaml if warranted
  - Record which entries were processed (by id)
- Add version-aware conflict resolution logic to the validation step:
  - If learning `platform_context.version == current.version` AND conflicts with ai_doc at same version → learning wins, flag for review
  - If learning `platform_context.version < current.version` AND ai_doc at current version conflicts → ai_doc wins, deprecate learning
- Add `domain_tags` to expertise.yaml header for triage matching

### 4. Enhance ai_docs/README.md with Source Metadata

- Restructure `ai_docs/README.md` entries to include:
  - `source_type`: `official_docs | official_repo | community_repo | blog | npm`
  - `framework_version`: version the docs describe (e.g., `convex@1.17`, `sveltekit@2.x`)
- Use a table or structured list format per section that load_ai_docs can parse
- Example format per section:

```markdown
### database

| URL | source_type | framework_version |
|-----|-------------|-------------------|
| https://docs.convex.dev/database/schemas | official_docs | convex@latest |
| https://docs.convex.dev/database/indexes | official_docs | convex@latest |
```

### 5. Create refresh_ai_links Command

- Create `.claude/commands/refresh_ai_links.md`
- Workflow:
  1. Read current `ai_docs/README.md` to understand existing coverage
  2. For each technology section, search for:
     - Official documentation pages (highest priority)
     - Official GitHub repos with agent plugins/rules (high priority)
     - Active community repos with practical guidance (medium priority)
     - Recent blog posts from framework maintainers (lower priority)
  3. For discovered URLs, classify `source_type` and `framework_version`
  4. Update `ai_docs/README.md` preserving existing entries, adding new ones, flagging potentially stale ones
- Important: this command ADDS and FLAGS — it does not remove URLs without human confirmation

### 6. Enhance load_ai_docs with Freshness Flagging

- Update `.claude/commands/load_ai_docs.md` to:
  - Read `source_type` and `framework_version` from the README table format
  - Write these as additional frontmatter fields in scraped markdown files
  - When multiple ai_docs cover the same topic area: add a `## Freshness Notes` section at the top noting which sources may conflict and their respective `source_type` rankings
  - Check current `package.json` dependency versions against `framework_version` — if mismatch, add warning to frontmatter

### 7. Build adw_learn Workflow

- Create `adws/workflows/adw_learn.ts`
- Follows existing ADW patterns (parseArgs, logger, step-recorder, state persistence)
- Workflow:
  1. Read all entries from `temp/learnings/*.md`
  2. If no entries, exit early with summary
  3. For each expert in `.claude/commands/experts/*/`:
     - Read expert's `domain_tags` from expertise.yaml header
     - Check tag intersection with learnings entries
     - If matches found: invoke self-improve with `FOCUS_AREA=learnings` and pass matched entry IDs
     - If no matches: skip (log skip)
  4. After all experts have processed: archive processed entries (move to `temp/learnings/archive/` or clear)
  5. Post summary: which experts ran, which entries were processed, which had no takers
- CLI: `bun run adws/workflows/adw_learn.ts --adw-id <id> [--dry-run]`
- Add `just learn [adw-id]` to justfile

### 8. Add Learning Hooks to Ralph

- In `adws/workflows/adw_ralph.ts`, add learning capture at failure points:
  - When TDD step fails and is retried/patched
  - When review step identifies issues
  - When a patch attempt fails
- Use a helper function `recordLearning()` in `adws/src/learning-utils.ts`:
  - Reads current `package.json` for `platform_context` versions
  - Generates sequential ID
  - Appends structured YAML entry to `temp/learnings/{run_id}.md`
- Keep it lightweight — recording must not slow down the main workflow

### 9. Validate End-to-End Pipeline

- Run `refresh_ai_links` → verify README updated with metadata
- Run `load_ai_docs` → verify frontmatter includes source_type, framework_version
- Manually create a test learning entry in `temp/learnings/`
- Run `adw_learn` → verify correct expert picks it up, expertise.yaml updated
- Run self-improve on database expert → verify platform_constraints section present and valid YAML
- Verify learnings are cleared/archived after processing

## Testing Strategy

- **Unit**: Learning schema validation — ensure entries conform to the YAML schema
- **Integration**: adw_learn triage — create test entries with various tags, verify correct routing to experts
- **End-to-end**: Full pipeline run from refresh_ai_links through to expertise.yaml update
- **Regression**: After pipeline runs, existing test suite (`bun run check`, convex tests) must still pass — pipeline changes docs, not code
- **Version conflict**: Create deliberate version-mismatched learnings and verify conflict resolution behaves correctly

## Acceptance Criteria

- [ ] `temp/learnings/README.md` exists with canonical entry schema documented
- [ ] `expertise.yaml` has `domain_tags` header and `platform_constraints` section with version-tagged rules
- [ ] Self-improve reads learnings, filters by domain tags, applies version-aware conflict resolution
- [ ] `ai_docs/README.md` entries include `source_type` and `framework_version` metadata
- [ ] `refresh_ai_links` command discovers and curates URLs with classification
- [ ] `load_ai_docs` writes `source_type` and `framework_version` to scraped file frontmatter
- [ ] `adw_learn` workflow triages learnings, invokes targeted self-improve, clears processed entries
- [ ] Ralph records structured learnings on failures
- [ ] `adw_learn` can be composed into orchestrating ADWs (e.g., post-Ralph documentation workflows)
- [ ] Pipeline does not break any existing tests or workflows

## Validation Commands

- `bun run check` — Ensure no type regressions across all apps
- `cat temp/learnings/README.md` — Verify schema documentation exists
- `head -30 .claude/commands/experts/database/expertise.yaml` — Verify domain_tags and platform_constraints header
- `grep -c "platform_constraints" .claude/commands/experts/database/expertise.yaml` — Verify section exists
- `python3 -c "import yaml; yaml.safe_load(open('.claude/commands/experts/database/expertise.yaml'))"` — Validate YAML syntax
- `wc -l .claude/commands/experts/database/expertise.yaml` — Ensure under 1000 lines
- `ls temp/learnings/` — Verify directory structure
- `bun run adws/workflows/adw_learn.ts --adw-id test --dry-run` — Verify workflow compiles and runs

## Notes

- **No new dependencies required** — all infrastructure uses existing Bun + Claude Code agent SDK patterns
- **Incremental rollout** — Phases 1-2 can ship independently and provide immediate value. Phase 3-5 build on top but are not blockers.
- **The `Date.now()` question** — During research, we found the convex-agent-plugins repo says "never use Date.now() in queries" but official Convex docs say it's safe and use it in examples. This is a real example of the conflict resolution problem this pipeline solves. For now: document both positions in platform_constraints with a note, resolve when version-specific evidence emerges.
- **Expert taxonomy growth** — This plan focuses on the database expert, but the architecture (domain_tags, learnings triage, adw_learn) is designed to scale to future experts (frontend, testing, auth, etc.) without changes to the pipeline.
- **Composability** — `adw_learn` is designed as a standalone workflow that can be appended to any orchestrating ADW. The existing `adw_document_ralph` pattern shows how: the parent workflow calls `adw_learn` as a final step after the main work is done.
