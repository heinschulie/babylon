---
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
description: Scoped refactor step for the red-green-refactor loop — redesigns a naive TDD green-pass into an optimal solution for a single issue while keeping all tests green
argument-hint: [adw_id] [issue_number] [issue_body] [pre_tdd_sha]
model: opus
---

# Purpose

Redesign the naive TDD green-pass implementation into an optimal solution for the current issue, while keeping all tests green. This is the "refactor" phase of red-green-refactor — a **design task**, not a code quality sweep. Every change must trace back to a better implementation of the specified issue. Follow the `Instructions` and `Workflow` to redesign the naive solution, then produce the `Report`.

## Variables

adw_id: $1
issue_number: $2
issue_body: $3
pre_tdd_sha: $4
deep_modules_ref: `.claude/skills/tdd/deep-modules.md`
interface_design_ref: `.claude/skills/tdd/interface-design.md`
refactoring_ref: `.claude/skills/tdd/refactoring.md`

## Instructions

- IMPORTANT: This is a scoped refactor for issue #$2 only. You are NOT scanning for general code quality improvements across the codebase.
- The green-pass was intentionally minimal — your job is to implement the *right* design for this issue.
- You may touch any files necessary, but every change must directly serve a better implementation of issue #$2.
- IMPORTANT: Do NOT fix unrelated code quality issues you encounter along the way. If you see duplication, poor naming, or structural problems in code unrelated to issue #$2, leave them alone.
- Do NOT add new features or functionality beyond the issue scope.
- Do NOT write new tests.
- Do NOT change observable behavior.
- All existing tests must continue to pass after each change. If a change breaks a test, revert it.
- Apply changes one at a time. After EACH change, run the test suite.
- Ultra think about the optimal design before making changes. Consider:
  - Deepen modules (move complexity behind simple interfaces)
  - Extract meaningful abstractions (not premature ones)
  - Apply SOLID principles where natural
  - Simplify complex conditionals
  - Improve naming
- IMPORTANT: For every file you modify, you must be able to justify how it serves issue #$2. If you cannot justify a change, do not make it.

## Workflow

1. Read the `issue_body` carefully. This is the design goal — internalize what problem is being solved.
2. Run `git diff --name-only $4 HEAD` to see exactly which files the TDD green-pass touched. These are your starting point.
3. Read the files identified in step 2 and their corresponding tests to understand the naive implementation.
4. Read the reference docs for design guidance: `deep_modules_ref`, `interface_design_ref`, `refactoring_ref`.
5. Run the test suite to establish a green baseline. If tests fail, STOP and report the failure — do not refactor broken code.
6. Think hard about the optimal solution for issue #$2. The green-pass gave you working code — now redesign it properly. Start from the files the TDD step touched and follow the design wherever it leads, but every change must trace back to this issue.
7. Apply changes one at a time. After EACH change, run the test suite. If a change breaks a test, revert it immediately.
8. Once all changes are complete, produce the `Report`.

## Report

Output a structured report with these two sections:

### Changes

For each file modified, list:
- **File**: `path/to/file`
- **Justification**: One sentence explaining how this change serves a better implementation of issue #$2

### Summary

- Total files modified
- Run `git diff --stat $4 HEAD` to show the final diff
- Brief description of the design improvement achieved

## Step Summary

IMPORTANT: You MUST end your output with this exact block. Fill in each field with a single line.

## Step Summary
- status: pass | fail
- action: <one line describing what you did>
- decision: <one line -- key choice and why>
- blockers: <one line, or "none">
- files_changed: <comma-separated list, or "none">
