# Fix: Review screenshots should be saved in the build folder

## Problem

The review step captures screenshots during frontend visual validation and saves them to `agents/{adw_id}/review_agent/{issue}_review_img/`. This is disconnected from the build record at `temp/builds/{prd}_{adw_id}/steps/{issue}_{step}_review/`.

Example from v4 run (ADW `e99e0f08`, PRD #121):
- Screenshots saved to: `agents/e99e0f08/review_agent/124_review_img/`
- Build step lives at: `temp/builds/121_ralph_e99e0f08/steps/124_13_review/`

The screenshots should live within the review step's build folder so the entire build is self-contained and inspectable in one place.

## Where to look

1. **Review skill definition:** `.claude/commands/review.md` — lines 26-43 define screenshot capture behavior. This is where the review agent is told where to save screenshots. The path template uses the agent's own working directory (`agents/{adw_id}/review_agent/`).

2. **Review executor:** `adws/src/ralph-executor.ts:87-186` — post-review automation. Lines around 164-176 read screenshot paths from the review JSON output and upload to R2. This code already knows the screenshot paths because the review agent returns them in `screenshots[]`.

3. **Step directory creation:** `adws/src/loop-runner.ts` or `adws/src/ralph-executor.ts` — wherever step output directories (`temp/builds/.../steps/{issue}_{step}_review/`) are created. The review step already writes `prompt.txt`, `raw_output.jsonl`, `review.log`, and `status.json` here.

## Fix

The review agent needs to save screenshots into the build step directory instead of its own working directory. Two approaches:

**Option A (preferred): Pass the step directory to the review command.** The executor already knows the step output path. Pass it as an argument to `/review` so the agent saves screenshots directly to `{step_dir}/screenshots/`. Update the review skill prompt to use this path instead of constructing its own.

**Option B: Copy screenshots post-review.** After the review agent returns, have the executor copy files from the agent's screenshot directory into the step directory. Less clean — two copies of the same files — but doesn't require changing the review skill.

Either way, the R2 upload code in the executor should read from the build step directory, not the agent directory.

## Verification

After the fix, a review step directory should look like:
```
temp/builds/121_ralph_e99e0f08/steps/124_13_review/
├── prompt.txt
├── raw_output.jsonl
├── review.log
├── status.json
└── screenshots/
    ├── 01_test_page_initial_state.png
    ├── 04_focused_reaction_view.png
    └── 05_full_page_emoji_timeline.png
```
