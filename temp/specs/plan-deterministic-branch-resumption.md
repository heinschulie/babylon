# Plan: Deterministic branch naming + orphan resumption

## Context

When Ralph crashes mid-run, it leaves a feature branch with committed work. A new `--ralph` trigger creates a different branch (because `quickPrompt()` generates a non-deterministic suffix), abandoning that work. We want one deterministic branch per parent issue so Ralph naturally resumes where it left off.

## Core insight

The branch name `hein/feature/issue-{N}` is fully deterministic from the parent issue number. Drop the `quickPrompt()` suffix entirely. Since `createBranch()` already handles "already exists" by checking out the existing branch (git-ops.ts:125-129), resumption is automatic — no new discovery utilities needed.

## Changes

### 1. `adws/workflows/adw_ralph.ts` — Simplify branch creation (lines 80-103)

**Remove:**
- The `quickPrompt()` call for `shortDesc` (lines 81-93)
- The `branchStep` / step recorder for branch naming
- The usage tracking for the branch-name step

**Replace with:**
```ts
const branchName = `hein/feature/issue-${parentIssueNumber}`;
const [branchOk, branchErr] = await createBranch(branchName, workingDir);
```

`createBranch()` already does the right thing:
- Branch doesn't exist → `git checkout -b` (fresh start)
- Branch exists locally → `git checkout` (resume orphan)

### 2. `adws/workflows/adw_ralph.ts` — Stable branch guard recovery (lines 68-74)

Currently throws if on a `hein/feature/issue-*` branch. A crashed run may leave the working dir on the target branch. Fix:

```ts
const currentBranch = await getCurrentBranch(workingDir);
const targetBranch = `hein/feature/issue-${parentIssueNumber}`;

if (currentBranch === targetBranch) {
  // Already on our target branch from a prior crashed run — resume
  logger.info(`Already on target branch ${targetBranch} — resuming`);
  baseBranch = "main"; // safe fallback; could also read from state
} else {
  // Normal guard: reject if on any other feature branch
  await assertStableBranch(workingDir);
  baseBranch = currentBranch;
}
```

### 3. `adws/src/git-ops.ts` — Upgrade `createBranch()` with remote fetch

Fold remote-orphan recovery into `createBranch()` so all workflows benefit:

```ts
export async function createBranch(
  branchName: string,
  cwd?: string
): Promise<[boolean, string | null]> {
  // 1. Try create new branch
  const { stderr, exitCode } = await exec(
    ["git", "checkout", "-b", branchName],
    { cwd }
  );

  if (exitCode === 0) return [true, null];

  if (stderr.includes("already exists")) {
    // 2. Branch exists locally — checkout
    const result = await exec(["git", "checkout", branchName], { cwd });
    if (result.exitCode !== 0) return [false, result.stderr];
    return [true, null];
  }

  // 3. Try fetch from remote
  const fetchResult = await exec(
    ["git", "fetch", "origin", branchName],
    { cwd }
  );
  if (fetchResult.exitCode === 0) {
    const trackResult = await exec(
      ["git", "checkout", "-b", branchName, `origin/${branchName}`],
      { cwd }
    );
    if (trackResult.exitCode === 0) return [true, null];
  }

  return [false, stderr];
}
```

## Files to modify

| File | Change |
|------|--------|
| `adws/src/git-ops.ts` | Upgrade `createBranch()` to fetch+track remote before failing — benefits all workflows |
| `adws/workflows/adw_ralph.ts` | Remove quickPrompt branch naming (~15 lines), add stable-branch recovery (~8 lines), use deterministic name |

Net: fewer lines of code, one fewer LLM call per run, fully deterministic.

## Verification

1. **Fresh run** (no branch exists): Creates `hein/feature/issue-{N}`, proceeds normally
2. **Local orphan**: Branch exists with commits from crashed run. `createBranch()` checks it out, loop sees fewer open issues, continues
3. **Remote orphan**: Branch pushed but deleted locally. `createBranch()` fetches + tracks remote, preserving commits
4. **Already on target branch**: Crashed run left working dir on target. Guard recovery skips to loop
5. **Wrong feature branch**: On `hein/feature/issue-50`, run with `--issue 99` → fails stable branch guard (correct)
