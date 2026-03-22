# CONTEXT

This is production code that will be maintained for years. Every shortcut becomes technical debt. Every pattern you establish will be copied. Fight entropy. Leave the codebase better than you found it.

# YOUR TASK

Work through open GitHub issues in this repo. Each iteration, complete ONE issue.

## 1. CHOOSE YOUR NEXT ISSUE

Fetch open issues:

```
gh issue list --state open --json number,title,labels,body --limit 20
```

When selecting, prioritize in this order:

1. `bug` — broken behavior always trumps new work
2. Architectural decisions and core abstractions
3. Integration points between modules
4. Unknown unknowns and spike work
5. `enhancement` — standard features and implementation
6. `documentation`, polish, cleanup, quick wins

Do NOT just pick the first issue. Read all open issues and pick the highest-priority one.

Once chosen, read the full issue body:

```
gh issue view <number>
```

## 2. KEEP CHANGES SMALL

- One logical change per commit
- Prefer multiple small commits over one large commit
- Run feedback loops after EACH change, not at the end
- Quality over speed. Small steps compound into big progress.

### Too-large issues

If an issue is too large to complete in a single iteration:

1. Break it into concrete sub-issues using `gh issue create`, each small enough to finish in one iteration
2. Reference the parent issue in each sub-issue body (e.g. "Part of #<parent>")
3. Add the label `sub-issue` to each
4. Add a comment to the parent issue listing the sub-issues you created
5. Then **pick one of the sub-issues and complete it this iteration**

Do NOT declare BLOCKED just because an issue is large. Decompose it and keep moving.

## 3. TESTING — USE /tdd

**All test work MUST use the `/tdd` skill.** Invoke it before writing any tests:

```
/tdd
```

This skill enforces red-green-refactor, integration-style tests, and tracer-bullet workflow. Follow its instructions exactly. Do not write tests without it.

Key rules from the skill:

- Tests verify behavior through public interfaces, not implementation details
- Mock only at system boundaries (external APIs, databases, time/randomness)
- One test → one implementation → repeat (vertical slicing)
- Never write all tests first then all code (no horizontal slices)

## 4. RUN ALL FEEDBACK LOOPS BEFORE COMMITTING

Before ANY commit, run ALL of these:

1. TypeScript: `pnpm check` (must pass with zero errors)
2. Tests: `pnpm test` (must pass)
3. Browser: If the work affects UI, verify results in browser at http://localhost:5178

Do NOT commit if ANY feedback loop fails. Fix issues first, then re-run all loops.

## 5. UPDATE THE ISSUE

After completing the work and all feedback loops pass:

- Add a comment to the issue summarizing what was done, key decisions, and files changed
- Close the issue:
  ```
  gh issue close <number> --comment "Resolved in <commit-sha>"
  ```

## 6. COMMIT YOUR WORK

Make a git commit with a clear message. Reference the issue number:

```
feat(scope): description (#<number>)
```

## 7. SCOPE BOUNDARIES

What's in scope (be explicit):

- Files in: src/, tests/, lib/
- All user-facing AND internal commands
- Edge cases specific to the issue

What's NOT in scope:

- Do not modify protected files/directories unrelated to the issue
- Do not scope-creep into adjacent features
- Do not mark issues closed by excluding work from coverage

## 8. STOP CONDITION

If ALL open issues are closed, output:
<promise>COMPLETE</promise>

If you are blocked and cannot proceed, output:
<promise>BLOCKED</promise>
And add a comment to the issue explaining what is blocking you.

# REMEMBER

- You choose the issue, but the issue defines "done"
- Never outrun your headlights — get feedback before moving on
- All tests go through `/tdd` — no exceptions
- The codebase will outlive you. Code accordingly.
