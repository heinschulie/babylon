/**
 * GitHub Webhook Trigger — Bun.serve HTTP server.
 *
 * Receives GitHub issue events and triggers ADW workflows.
 * Responds immediately (GitHub requires <10s response) by spawning background processes.
 *
 * Usage: bun run adws/triggers/webhook.ts
 */

import { makeAdwId, EnvironmentManager } from "../src/utils";
import { makeIssueComment, ADW_BOT_IDENTIFIER } from "../src/github";
import { extractAdwInfo, AVAILABLE_ADW_WORKFLOWS } from "../src/workflow-ops";
import { resolve, dirname } from "path";

const PORT = parseInt(process.env.PORT ?? "8001", 10);

/** Dependent workflows that require existing worktrees. */
const DEPENDENT_WORKFLOWS = [
  "adw_build_iso",
  "adw_test_iso",
  "adw_review_iso",
  "adw_document_iso",
  "adw_ship_iso",
];

async function handleWebhook(req: Request): Promise<Response> {
  try {
    const eventType = req.headers.get("X-GitHub-Event") ?? "";
    const payload = await req.json();

    // Respond to GitHub ping events
    if (eventType === "ping") {
      console.log("Received GitHub ping event");
      return Response.json({ status: "pong" });
    }

    const action = payload.action ?? "";
    const issue = payload.issue ?? {};
    const issueNumber = issue.number;

    console.log(
      `Received webhook: event=${eventType}, action=${action}, issue_number=${issueNumber}`
    );

    let workflow: string | null = null;
    let providedAdwId: string | undefined;
    let modelSet: string | undefined;
    let triggerReason = "";
    let contentToCheck = "";

    // Issue opened
    if (eventType === "issues" && action === "opened" && issueNumber) {
      const issueBody = issue.body ?? "";
      contentToCheck = issueBody;

      if (issueBody.includes(ADW_BOT_IDENTIFIER)) {
        // Ignore bot issues
      } else if (issueBody.toLowerCase().includes("adw_")) {
        const tempId = makeAdwId();
        const result = await extractAdwInfo(issueBody, tempId);
        if (result.workflow_command) {
          workflow = result.workflow_command;
          providedAdwId = result.adw_id ?? undefined;
          modelSet = result.model_set;
          triggerReason = `New issue with ${workflow} workflow`;
        }
      }
    }

    // Issue comment
    if (eventType === "issue_comment" && action === "created" && issueNumber) {
      const comment = payload.comment ?? {};
      const commentBody = comment.body ?? "";
      contentToCheck = commentBody;

      if (commentBody.includes(ADW_BOT_IDENTIFIER)) {
        // Ignore bot comments
      } else if (commentBody.includes("--ralph")) {
        workflow = "adw_ralph";
        triggerReason = "Comment with --ralph keyword";
      } else if (commentBody.includes("--document")) {
        workflow = "adw_document_ralph";
        triggerReason = "Comment with --document keyword";
      } else if (commentBody.toLowerCase().includes("adw_")) {
        const tempId = makeAdwId();
        const result = await extractAdwInfo(commentBody, tempId);
        if (result.workflow_command) {
          workflow = result.workflow_command;
          providedAdwId = result.adw_id ?? undefined;
          modelSet = result.model_set;
          triggerReason = `Comment with ${workflow} workflow`;
        }
      }
    }

    // Validate dependent workflows
    if (workflow && DEPENDENT_WORKFLOWS.includes(workflow) && !providedAdwId) {
      console.log(
        `${workflow} is a dependent workflow that requires an existing ADW ID`
      );
      try {
        await makeIssueComment(
          String(issueNumber),
          `Error: \`${workflow}\` requires an existing ADW ID.\n\nProvide the ADW ID in your comment: \`${workflow} adw-12345678\``
        );
      } catch {
        // ignore
      }
      return Response.json({
        status: "error",
        issue: issueNumber,
        message: `${workflow} requires an existing ADW ID. Provide it in your comment: \`${workflow} adw-12345678\``,
      });
    }

    if (workflow) {
      const adwId = providedAdwId ?? makeAdwId();

      console.log(
        `Detected ${workflow} for issue #${issueNumber} (adw: ${adwId}) from: ${contentToCheck.slice(0, 100)}...`
      );

      // Post notification comment
      try {
        await makeIssueComment(
          String(issueNumber),
          `ADW Webhook: Detected \`${workflow}\` workflow request\n\n` +
            `Starting workflow with ID: \`${adwId}\`\n` +
            `Workflow: \`${workflow}\`\n` +
            `Model Set: \`${modelSet}\`\n` +
            `Reason: ${triggerReason}\n\n` +
            `Logs: \`agents/${adwId}/${workflow}/\``
        );
      } catch (e) {
        console.warn(`Failed to post issue comment: ${e}`);
      }

      // Launch TS workflow in background
      const adwsDir = dirname(dirname(new URL(import.meta.url).pathname));
      const repoRoot = dirname(adwsDir);

      // Map workflow commands to TS workflow files
      const WORKFLOW_SCRIPT_MAP: Record<string, string> = {
        adw_ralph: "workflows/adw_ralph.ts",
        adw_document_ralph: "workflows/adw_document_ralph.ts",
        adw_plan_iso: "workflows/adw_plan.ts",
        adw_patch_iso: "workflows/adw_patch.ts",
        adw_build_iso: "workflows/adw_build.ts",
        adw_test_iso: "workflows/adw_test.ts",
        adw_review_iso: "workflows/adw_review.ts",
        adw_document_iso: "workflows/adw_document.ts",
        adw_plan_build_iso: "workflows/adw_plan_build.ts",
        adw_plan_build_review_iso: "workflows/adw_plan_build_review.ts",
        adw_plan_build_test_iso: "workflows/adw_plan_build_test.ts",
        adw_plan_build_test_review_iso: "workflows/adw_plan_build_test_review.ts",
        adw_plan_build_document_iso: "workflows/adw_plan_build_document.ts",
        adw_sdlc_iso: "workflows/adw_sdlc.ts",
      };

      const scriptRelPath = WORKFLOW_SCRIPT_MAP[workflow];
      if (!scriptRelPath) {
        console.error(`No TS workflow script for: ${workflow}`);
        try {
          await makeIssueComment(
            String(issueNumber),
            `Error: No implementation found for \`${workflow}\`. Available: ${Object.keys(WORKFLOW_SCRIPT_MAP).join(", ")}`
          );
        } catch { /* ignore */ }
        return Response.json({
          status: "error",
          issue: issueNumber,
          message: `No TS workflow implementation for ${workflow}`,
        });
      }

      const triggerScript = resolve(adwsDir, scriptRelPath);

      // Build command with named flags matching workflow parseArgs expectations
      const cmd = ["bun", "run", triggerScript, "--adw-id", adwId];
      // Workflows that accept --issue in their parseArgs
      const ISSUE_AWARE_WORKFLOWS = [
        "adw_ralph",
        "adw_document_ralph",
        "adw_plan_iso",
        "adw_test_iso",
        "adw_review_iso",
        "adw_plan_build_review_iso",
        "adw_plan_build_test_review_iso",
        "adw_sdlc_iso",
      ];
      if (issueNumber && ISSUE_AWARE_WORKFLOWS.includes(workflow)) {
        cmd.push("--issue", String(issueNumber));
      }

      // Pass issue title + body as the prompt for the workflow
      const issueTitle = issue.title ?? "";
      const issueBody = issue.body ?? "";
      const prompt = `${issueTitle}\n\n${issueBody}`.trim();

      console.log(`Launching ${workflow} for issue #${issueNumber}`);
      console.log(`Command: ${cmd.join(" ")}`);

      Bun.spawn(cmd, {
        cwd: repoRoot,
        env: {
          ...EnvironmentManager.getSafeSubprocessEnv(),
          ADW_PROMPT: prompt,
          ADW_WORKING_DIR: repoRoot,
        },
        stdout: "ignore",
        stderr: "ignore",
      });

      return Response.json({
        status: "accepted",
        issue: issueNumber,
        adw_id: adwId,
        workflow,
        message: `ADW ${workflow} triggered for issue #${issueNumber}`,
        reason: triggerReason,
        logs: `temp/builds/${issueNumber ? `${issueNumber}_` : ""}${workflow}_${adwId}/`,
      });
    }

    return Response.json({
      status: "ignored",
      reason: `Not a triggering event (event=${eventType}, action=${action})`,
    });
  } catch (e) {
    console.error(`Error processing webhook: ${e}`);
    return Response.json({
      status: "error",
      message: "Internal error processing webhook",
    });
  }
}

async function handleHealth(): Promise<Response> {
  return Response.json({
    status: "healthy",
    service: "adw-webhook-trigger",
    timestamp: new Date().toISOString(),
  });
}

if (import.meta.main) {
  console.log(`Starting ADW Webhook Trigger on port ${PORT}`);
  console.log(`Webhook endpoint: POST /gh-webhook`);
  console.log(`Health check: GET /health`);

  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method === "POST" && url.pathname === "/gh-webhook") {
        return handleWebhook(req);
      }

      if (req.method === "GET" && url.pathname === "/health") {
        return handleHealth();
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}
