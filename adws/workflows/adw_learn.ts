/**
 * ADW Learn Workflow — process runtime learnings through expert triage and selective self-improve.
 *
 * Reads learnings from temp/learnings/*.md, matches entries to experts by domain_tags,
 * invokes targeted self-improve passes, and archives processed entries.
 *
 * Designed to be composed into orchestrating workflows (e.g., post-Ralph).
 *
 * Usage:
 *   bun run adws/workflows/adw_learn.ts --adw-id <id> [--dry-run]
 */

import { parseArgs } from "util";
import {
  runSelfImproveStep,
  sumUsage,
  formatUsage,
  type StepUsage,
} from "../src/agent-sdk";
import { createLogger, taggedLogger, writeWorkflowStatus } from "../src/logger";
import {
  createDefaultStepUsage,
  createCommentStep,
  createFinalStatusComment,
  getAdwEnv,
  fmtDuration,
} from "../src/utils";
import { openStep } from "../src/step-recorder";
import {
  readAllLearnings,
  discoverExperts,
  matchLearningsToExpert,
  archiveLearnings,
  type LearningEntry,
} from "../src/learning-utils";

async function runWorkflow(adwId: string, dryRun: boolean, issueNumber?: string): Promise<boolean> {
  const startTime = Date.now();
  const logger = createLogger(adwId, "learn");
  logger.info(`Starting ADW Learn Workflow — ADW ID: ${adwId}${dryRun ? " (DRY RUN)" : ""}`);

  const { workingDir, models } = getAdwEnv();
  const commentStep = createCommentStep(issueNumber);
  const commentFinalStatus = createFinalStatusComment(issueNumber);

  const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];

  try {
    // ─── Read all learnings ──────────────────────────────────────────
    const learningsResults = readAllLearnings(workingDir);
    const allEntries = learningsResults.flatMap(r => r.entries);

    if (allEntries.length === 0) {
      logger.info("No learnings entries found — nothing to process");
      await commentStep("No learnings to process — exiting early");

      writeWorkflowStatus(logger.logDir, {
        workflow: "learn",
        adwId,
        ok: true,
        startTime,
        totals: createDefaultStepUsage(),
      });
      return true;
    }

    logger.info(`Found ${allEntries.length} learning entries across ${learningsResults.length} files`);
    for (const entry of allEntries) {
      logger.info(`  [${entry.id}] tags=[${entry.tags.join(",")}] confidence=${entry.confidence} workflow=${entry.workflow}`);
    }

    // ─── Discover experts ────────────────────────────────────────────
    const experts = discoverExperts(workingDir);
    logger.info(`Discovered ${experts.length} experts: ${experts.map(e => e.expertName).join(", ")}`);

    if (experts.length === 0) {
      logger.warn("No experts found with domain_tags — cannot triage learnings");
      return false;
    }

    // ─── Triage: match learnings to experts ──────────────────────────
    const processedFiles = new Set<string>();
    const processedEntryIds = new Set<string>();
    const noTakerEntries: LearningEntry[] = [];
    const expertResults: { expert: string; matched: number; ok: boolean }[] = [];

    for (const expert of experts) {
      const matched = matchLearningsToExpert(allEntries, expert.domainTags);

      if (matched.length === 0) {
        logger.info(`[${expert.expertName}] No matching learnings — skipping`);
        expertResults.push({ expert: expert.expertName, matched: 0, ok: true });
        continue;
      }

      logger.info(`[${expert.expertName}] ${matched.length} matching entries: ${matched.map(e => e.id).join(", ")}`);

      if (dryRun) {
        logger.info(`[${expert.expertName}] DRY RUN — would invoke self-improve with FOCUS_AREA=learnings`);
        expertResults.push({ expert: expert.expertName, matched: matched.length, ok: true });
        matched.forEach(e => processedEntryIds.add(e.id));
        continue;
      }

      // Invoke self-improve with learnings focus
      const stepName = logger.nextStep ? logger.nextStep(`self-improve-${expert.expertName}`) : `self-improve-${expert.expertName}`;
      const step = await openStep(logger.logDir, stepName, `self-improve-${expert.expertName}`, logger, { cwd: workingDir });

      const result = await runSelfImproveStep("false", {
        focusArea: "learnings",
        model: models.default,
        cwd: workingDir,
        logger: step.log,
        logDir: logger.logDir,
        stepName,
      });

      const usage = result.usage ?? createDefaultStepUsage();
      allStepUsages.push({
        step: `self-improve:${expert.expertName}`,
        ok: result.success,
        usage,
      });

      step.log.info(`Usage: ${formatUsage(usage)}`);
      await step.close(result.success, usage, result.summary);

      if (result.success) {
        logger.info(`[${expert.expertName}] Self-improve completed successfully`);
        matched.forEach(e => processedEntryIds.add(e.id));
      } else {
        logger.warn(`[${expert.expertName}] Self-improve failed: ${result.error}`);
      }

      expertResults.push({ expert: expert.expertName, matched: matched.length, ok: result.success });
    }

    // Find entries with no takers
    for (const entry of allEntries) {
      if (!processedEntryIds.has(entry.id)) {
        noTakerEntries.push(entry);
      }
    }

    // ─── Archive processed learnings ─────────────────────────────────
    if (!dryRun && processedEntryIds.size > 0) {
      const filesToArchive = learningsResults
        .filter(r => r.entries.some(e => processedEntryIds.has(e.id)))
        .map(r => r.file);

      archiveLearnings(workingDir, filesToArchive);
      logger.info(`Archived ${filesToArchive.length} learnings files`);
    }

    // ─── Summary ─────────────────────────────────────────────────────
    const totalUsage = allStepUsages.length > 0
      ? sumUsage(allStepUsages.map(s => s.usage))
      : createDefaultStepUsage();
    const duration = fmtDuration(Date.now() - startTime);

    const ok = expertResults.some(r => r.ok && r.matched > 0) || allEntries.length === 0;

    logger.info(`\n${"═".repeat(60)}`);
    logger.info(`  LEARN COMPLETE — ${duration}${dryRun ? " (DRY RUN)" : ""}`);
    logger.info(`  Learnings: ${allEntries.length} total, ${processedEntryIds.size} processed, ${noTakerEntries.length} no takers`);
    logger.info(`  Experts:`);
    for (const r of expertResults) {
      logger.info(`    [${r.expert}] ${r.matched} matched — ${r.ok ? "ok" : "failed"}`);
    }
    if (noTakerEntries.length > 0) {
      logger.info(`  No-taker entries: ${noTakerEntries.map(e => `${e.id} (tags: ${e.tags.join(",")})`).join(", ")}`);
    }
    if (allStepUsages.length > 0) {
      logger.info(`  Total: ${formatUsage(totalUsage)}`);
    }
    logger.info(`${"═".repeat(60)}`);

    writeWorkflowStatus(logger.logDir, {
      workflow: "learn",
      adwId,
      ok,
      startTime,
      totals: totalUsage,
    });

    await commentFinalStatus({
      workflow: "learn",
      adwId,
      ok,
      startTime,
      steps: allStepUsages,
      totals: totalUsage,
    });

    return ok;
  } catch (e) {
    logger.error(`Workflow exception: ${e}`);

    const totalUsage = allStepUsages.length > 0
      ? sumUsage(allStepUsages.map(s => s.usage))
      : createDefaultStepUsage();

    writeWorkflowStatus(logger.logDir, {
      workflow: "learn",
      adwId,
      ok: false,
      startTime,
      totals: totalUsage,
    });

    await commentStep(`Workflow exception: ${String(e).slice(0, 200)}`);
    await commentFinalStatus({
      workflow: "learn",
      adwId,
      ok: false,
      startTime,
      steps: allStepUsages,
      totals: totalUsage,
    });

    return false;
  }
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "adw-id": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      issue: { type: "string" },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values["help"]) {
    console.log("Usage: bun run adws/workflows/adw_learn.ts --adw-id <id> [--dry-run] [--issue <number>]");
    process.exit(0);
  }

  const adwId = values["adw-id"];
  if (!adwId) {
    console.error("Usage: bun run adws/workflows/adw_learn.ts --adw-id <id> [--dry-run]");
    process.exit(1);
  }

  const success = await runWorkflow(adwId, values["dry-run"] ?? false, values["issue"]);
  process.exit(success ? 0 : 1);
}
