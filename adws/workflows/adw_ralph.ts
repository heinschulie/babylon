/**
 * ADW Ralph Workflow — automated TDD loop over parent issue's sub-issues.
 *
 * Thin entry point: parses args, delegates to the generic loop runner
 * with the Ralph pipeline definition and a skill-based step executor.
 *
 * Usage: bun run adws/workflows/adw_ralph.ts --adw-id <id> --issue <parent-issue-number> [--max-iterations <n>]
 */

process.on("unhandledRejection", (reason) => {
  console.error(`[ralph] unhandled rejection (non-fatal): ${reason}`);
});

import { parseArgs } from "util";
import { RALPH_PIPELINE } from "../src/ralph-pipeline";
import { runLoop } from "../src/loop-runner";
import { createRalphExecutor } from "../src/ralph-executor";

const DEFAULT_MAX_ITERATIONS = 20;

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "adw-id": { type: "string" },
      "issue": { type: "string" },
      "max-iterations": { type: "string" },
      "help": { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values["help"]) {
    console.log("Usage: bun run adw_ralph.ts --adw-id <id> --issue <parent-issue-number> [--max-iterations <n>]");
    process.exit(0);
  }

  const adwId = values["adw-id"];
  const issueStr = values["issue"];

  if (!adwId || !issueStr) {
    console.error("Usage: bun run adw_ralph.ts --adw-id <id> --issue <parent-issue-number> [--max-iterations <n>]");
    process.exit(1);
  }

  const parentIssueNumber = parseInt(issueStr, 10);
  const maxIterations = values["max-iterations"]
    ? parseInt(values["max-iterations"], 10)
    : DEFAULT_MAX_ITERATIONS;

  const success = await runLoop({
    pipeline: RALPH_PIPELINE,
    adwId,
    parentIssueNumber,
    maxIterations,
    issueNumberStr: issueStr,
    executeStep: createRalphExecutor(adwId),
    branchPrefix: "hein/feature",
    workflowName: "ralph",
  });

  process.exit(success ? 0 : 1);
}
