---
allowed-tools: Read, Grep, Glob, Bash, Edit, Write, TodoWrite, mcp__svelte__list_sections, mcp__svelte__get_documentation, mcp__svelte__svelte_autofixer
description: Self-improve Frontend expertise by validating against codebase implementation
argument-hint: [check_git_diff (true/false)] [focus_area (optional)]
---

# Purpose

You maintain the Frontend expert system's expertise accuracy by comparing the existing expertise file against the actual codebase implementation. Follow the `Workflow` section to detect and remedy any differences, missing pieces, or outdated information, ensuring the expertise file remains a powerful **mental model** and accurate memory reference for frontend-related tasks.

## Variables

CHECK_GIT_DIFF: $1 default to false if not specified
FOCUS_AREA: $2 default to empty string
EXPERTISE_FILE: .claude/commands/experts/frontend/expertise.yaml
LEARNINGS_DIR: temp/learnings
MAX_LINES: 1000

## Instructions

- This is a self-improvement workflow to keep Frontend expertise synchronized with the actual codebase
- Think of the expertise file as your **mental model** and memory reference for all frontend-related functionality
- Always validate expertise against real implementation, not assumptions
- Reference only local codebase and `ai_docs/` — no external URLs
- Focus exclusively on Frontend-related functionality (routes, components, layouts, stores, i18n, Convex data integration, UI patterns)
- If FOCUS_AREA is provided, prioritize validation and updates for that specific area
- Maintain the YAML structure of the expertise file
- Enforce strict line limit of 1000 lines maximum
- Prioritize actionable, high-value expertise over verbose documentation
- When trimming, remove least critical information that won't impact expert performance
- Git diff checking is optional and controlled by the CHECK_GIT_DIFF variable
- Be thorough in validation but concise in documentation
- Don't include 'summaries' of work done in your expertise when a git diff is checked. Focus on true, important information that pertains to the key frontend functionality and implementation.
- Write as a principal engineer that writes CLEARLY and CONCISELY for future engineers so they can easily understand how to read and update frontend functionality.
- Keep in mind, after your thorough search, there may be nothing to be done — this is perfectly acceptable. If there's nothing to be done, report that and stop.
- **Beyond route/component listings:** The expertise file serves a frontend expert that must _answer questions and guide code changes_, not just list pages. After validating route and component accuracy, critically evaluate whether the file contains the operational knowledge an agent needs to be useful:
  - **`key_operations`**: Can the expert locate the right component or route for a given task? Each app's routes should catalog their `+page.svelte`, `+layout.svelte`, `+page.ts` files with a one-line description. Key shared components should list their props interface and where they're used.
  - **`best_practices`**: Are there implicit conventions (runes patterns, component composition rules, store usage, i18n string placement, CSS class conventions like `target-phrase`) that an agent modifying frontend code must follow to avoid introducing bugs?
  - **`known_issues`**: Is there tech debt, duplication, or missing functionality that would surprise someone working in this area?
  - A route listing that can't tell you _which component to use_ or _what conventions to follow when adding a new page_ is incomplete — even if every route is correct.
- **Beyond individual routes — think in flows and layers:** A frontend expert doesn't just answer "what route handles X?" — it answers "how do I implement Y?" and "what will break if I change Z?" The expertise file must support these questions. After validating routes and components, critically evaluate whether the file captures:
  - **`key_data_flows`**: End-to-end user flows that span routes, components, and Convex queries (e.g., "navigate to practice → load phrases via Convex query → render practice UI → record attempt → submit via mutation → show results"). These are the hardest thing to reconstruct from code alone. Each flow should name the concrete components and Convex functions in order.
  - **`shared_utilities`**: Stores, auth helpers, and utility functions in `packages/shared` that enforce critical behavior (auth guards, locale management, Convex client setup). An agent writing new code that skips these will introduce bugs.
  - **`i18n_patterns`**: How Paraglide is wired — message file locations per app, how `packages/ui` receives translated strings as props, the cookie-based locale strategy. An agent adding a new string must know _where_ to put it.
  - **`data_layer`**: How frontend talks to Convex — which stores exist, how queries/mutations are called from components, optimistic update patterns. Without this, an agent can build UI that doesn't wire up to data.
  - **`platform_constraints`**: SvelteKit and Svelte 5 gotchas that surprise newcomers — runes vs legacy reactivity, `$effect` cleanup, load function patterns, shadcn-svelte component customization rules, Tailwind 4 changes.
  - **`component_architecture`**: The layering between `packages/ui` (headless, no i18n), `packages/shared` (cross-app), and app-specific components. An agent creating a new component must know which layer it belongs in.
- **The three tiers of expert value — use this as a self-check after every update:** Tier 1 (route/component reference) lists pages and components — any agent can reconstruct this from file paths, so it's necessary but low-value. Tier 2 (operational catalog) maps components to their purpose and documents conventions for writing new code — this is where most expertise files stop but shouldn't. Tier 3 (architectural intuition) captures _why_ the frontend is shaped this way and _what will break if you change it_. Concretely, Tier 3 knowledge includes:
  - **Cross-route data flows** with the concrete component + Convex function chain. An agent implementing a new feature that touches multiple routes needs this.
  - **Platform constraints that contradict intuition**: Svelte 5 runes are not Svelte 4 stores. SvelteKit load functions vs $effect for data fetching. shadcn-svelte customization via data attributes not class overrides. Document the correct approach for each.
  - **Component placement rationale**: Not just "Button is in packages/ui" but "packages/ui has no i18n — if your component needs translated strings, it goes in the app or packages/shared with props for text."
  - **The "what breaks" map**: For tightly integrated components (layouts, auth guards, practice flow), what downstream effects does a change trigger? An agent modifying a layout needs to know which routes depend on it.
  - After each self-improvement pass, ask: "Could an agent use this file to add a new route with components, data fetching, and i18n, without reading any source code beyond what the expertise file points them to?" If not, the file is still at Tier 1 or 2.
  - **Concision**: Be as concise as possible without sacrificing accuracy. Sacrifice grammar for concision.

## Frontend-Specific Validation Hints

When validating expertise against codebase, use these strategies:
- **Routes**: Glob for `apps/*/src/routes/**/+page.svelte` to verify route tree
- **Components**: Glob for `packages/ui/src/lib/components/**/*.svelte` to verify component inventory
- **Shared exports**: Read `packages/shared/src/index.ts` (or equivalent barrel file) to verify shared utilities
- **Stores**: Grep for `\$state\(` and `\$derived\(` in `packages/shared/` to find reactive stores
- **i18n**: Read `packages/shared/messages/en.json`, `apps/web/messages/en.json`, `apps/verifier/messages/en.json` for message catalog
- **Convex integration**: Grep for `useQuery\|useMutation\|useAction\|convex` in `apps/` to find data layer wiring
- **Layouts**: Read `+layout.svelte` and `+layout.ts` files to understand layout hierarchy and data loading

## Workflow

1. **Check Git Diff (Conditional)**
   - If CHECK_GIT_DIFF is "true", run `git diff` to identify recent changes to Frontend-related files
   - If changes detected, note them for targeted validation in step 3
   - If CHECK_GIT_DIFF is "false", skip this step

1b. **Ingest Runtime Learnings (Conditional)**
   - If FOCUS_AREA is "learnings" OR if `temp/learnings/*.md` files exist (excluding README.md):
     - Read the expert's `domain_tags` from the EXPERTISE_FILE header
     - Read all `temp/learnings/*.md` files (not README.md)
     - Parse YAML entries from each file
     - Filter entries where `tags` intersect with this expert's `domain_tags`
     - For each matched entry:
       - Validate the learning against the actual codebase (read the relevant files)
       - Apply version-aware conflict resolution:
         - If learning `platform_context` version matches current version AND conflicts with an ai_doc at same version → **learning wins** (lived experience > docs), flag for review
         - If learning `platform_context` version is older AND an ai_doc at current version conflicts → **ai_doc wins**, note learning as deprecated
       - If learning is validated, update the relevant section in expertise.yaml (platform_constraints, best_practices, or known_issues as appropriate)
     - Record which entry IDs were processed in the report
   - If no learnings files exist or no tags match, skip this step

2. **Read Current Expertise**
   - Read the entire EXPERTISE_FILE to understand current documented expertise
   - Identify key sections and note areas that seem outdated or incomplete

3. **Validate Against Codebase**
   - Read the EXPERTISE_FILE to identify documented key files
   - Use the Frontend-Specific Validation Hints to verify:
     - Route tree matches documented routes
     - Component inventory matches documented components
     - Shared utilities and stores match documented exports
     - i18n message catalogs match documented patterns
     - Convex data integration matches documented wiring
     - Layout hierarchy matches documented structure
   - If FOCUS_AREA is provided, prioritize validation of that specific area
   - If git diff was checked in step 1, pay special attention to changed areas

4. **Identify Discrepancies**
   - List all differences found:
     - Missing or removed routes
     - New or changed components
     - Updated store patterns
     - Changed Convex query/mutation usage
     - Outdated i18n patterns
     - Incorrect file paths or component references

5. **Update Expertise File**
   - Remedy all identified discrepancies by updating EXPERTISE_FILE
   - Add missing information
   - Update outdated information
   - Remove obsolete information
   - Maintain YAML structure and formatting
   - Ensure all file paths are accurate
   - Keep descriptions concise and actionable

6. **Enforce Line Limit**
   - Run: `wc -l .claude/commands/experts/frontend/expertise.yaml`
   - Check if line count exceeds MAX_LINES (1000)
   - If line count > MAX_LINES:
     - Identify least important sections that won't impact expert performance
     - Trim identified sections
     - Run line count check again
     - REPEAT until line count <= MAX_LINES
   - Document what was trimmed in the report

7. **Validation Check**
   - Read the updated EXPERTISE_FILE
   - Verify all critical Frontend information is present
   - Ensure line count is within limit
   - Validate YAML syntax:
     - Run: `python3 -c "import yaml; yaml.safe_load(open('.claude/commands/experts/frontend/expertise.yaml'))"`
     - Confirm no syntax errors
     - If errors occur, fix and re-validate

## Report

Provide a structured report with the following sections:

### Summary

- Brief overview of self-improvement execution
- Whether git diff was checked
- Focus area (if any)
- Learnings processed (count, IDs)
- Total discrepancies found and remedied
- Final line count vs MAX_LINES

### Discrepancies Found

- List each discrepancy identified:
  - What was incorrect/missing/outdated
  - Where in the codebase the correct information was found
  - How it was remedied

### Updates Made

- Concise list of all updates to EXPERTISE_FILE:
  - Added sections/information
  - Updated sections/information
  - Removed sections/information

### Line Limit Enforcement

- Initial line count
- Final line count
- If trimming was needed:
  - Number of trimming iterations
  - What was trimmed and why
  - Confirmation that trimming didn't impact critical expertise

### Validation Results

- Confirm all critical Frontend expertise is present
- Confirm line count is within limit
- Note any areas that may need future attention

### Codebase References

- List of files validated against
- Key components and routes verified
