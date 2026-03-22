/**
 * ADW Document Workflow — generates feature documentation from git changes.
 *
 * Loads existing ADW state, checks for changes vs origin/main,
 * runs /document skill, commits and pushes.
 *
 * Requires an existing ADW state (run plan/build/test/review first).
 *
 * Env vars:
 *   ADW_MODEL — model for document generation (default: claude-sonnet-4-20250514)
 *
 * Usage:
 *   bun run adws/workflows/adw_document.ts --adw-id <id> [--issue <number>]
 */

import { parseArgs } from 'util';
import { existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { runDocumentStep, formatUsage, sumUsage, type StepUsage } from '../src/agent-sdk';
import { createLogger, taggedLogger, writeWorkflowStatus } from '../src/logger';
import {
	exec,
	getProjectRoot,
	getAdwEnv,
	createStepBanner,
	createDefaultStepUsage,
	createCommentStep,
	createFinalStatusComment,
	fmtDuration
} from '../src/utils';
import { commitChanges, finalizeGitOperations } from '../src/git-ops';
import { ADWState } from '../src/state';

const WORKFLOW_NAME = 'document';
const STEP_DOCUMENT = 'document';
const TOTAL_STEPS = 1;

/** Check if there are changes between current branch and origin/main. */
async function checkForChanges(
	logger: ReturnType<typeof createLogger>,
	cwd?: string
): Promise<boolean> {
	const { stdout, exitCode } = await exec(['git', 'diff', 'origin/main', '--stat'], { cwd });

	if (exitCode !== 0) {
		logger.warn('Failed to check for changes, assuming changes exist');
		return true;
	}

	const hasChanges = !!stdout.trim();
	if (!hasChanges) {
		logger.info('No changes detected between current branch and origin/main');
	} else {
		logger.info(`Found changes:\n${stdout}`);
	}
	return hasChanges;
}

/** Find spec file path from state or temp/specs/ directory. */
function findSpecFile(state: ADWState, projectRoot: string): string | null {
	// Check state first
	const planFile = state.get('plan_file') as string | undefined;
	if (planFile && existsSync(planFile)) return planFile;

	// Fallback: look in temp/specs/ for file matching adw_id
	const specsDir = join(projectRoot, 'temp', 'specs');
	try {
		const files = readdirSync(specsDir).filter((f) => f.endsWith('.md'));
		const match = files.find((f) => f.includes(state.adwId));
		if (match) return join(specsDir, match);
		// Return most recent
		if (files.length > 0) return join(specsDir, files[files.length - 1]);
	} catch {
		// specs dir may not exist
	}
	return null;
}

/** Find screenshots directory from state or fallback location. */
function findScreenshotsDir(state: ADWState, projectRoot: string): string | null {
	const screenshots = state.get('review_screenshots' as any) as string[] | undefined;
	if (screenshots?.length) {
		const dir = dirname(screenshots[0]);
		if (existsSync(dir)) return dir;
	}

	// Fallback
	const reviewImgDir = join(projectRoot, 'agents', state.adwId, 'reviewer', 'review_img');
	if (existsSync(reviewImgDir)) {
		try {
			if (readdirSync(reviewImgDir).length > 0) return reviewImgDir;
		} catch {
			// ignore
		}
	}
	return null;
}

async function runWorkflow(adwId: string, issueNumber?: string): Promise<boolean> {
	const startTime = Date.now();
	const logger = createLogger(adwId, WORKFLOW_NAME);
	const projectRoot = getProjectRoot();
	const { models } = getAdwEnv();
	const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];

	// Create comment functions
	const commentStep = createCommentStep(issueNumber);
	const commentFinalStatus = createFinalStatusComment(issueNumber);

	logger.info(`Starting ADW Document Workflow — ADW ID: ${adwId}`);

	// Load existing state (required)
	const state = ADWState.load(adwId, logger);
	if (!state) {
		logger.error(`No state found for ADW ID: ${adwId}`);
		logger.error('Run plan/build/test/review workflows first');
		return false;
	}

	// Check branch
	const branchName = state.get('branch_name') as string | undefined;
	if (!branchName) {
		logger.error('No branch name in state — run plan workflow first');
		return false;
	}

	// Checkout branch
	const { exitCode: checkoutCode, stderr: checkoutErr } = await exec(
		['git', 'checkout', branchName],
		{ cwd: projectRoot }
	);
	if (checkoutCode !== 0) {
		logger.error(`Failed to checkout branch ${branchName}: ${checkoutErr}`);
		return false;
	}
	logger.info(`Checked out branch: ${branchName}`);

	// Check for changes
	const hasChanges = await checkForChanges(logger, projectRoot);
	if (!hasChanges) {
		logger.info('No changes to document — skipping');

		const totalUsage = sumUsage([]);
		writeWorkflowStatus(logger.logDir, {
			workflow: WORKFLOW_NAME,
			adwId,
			ok: true,
			startTime,
			totals: totalUsage
		});
		return true;
	}

	// Gather context for /document
	const specPath = findSpecFile(state, projectRoot);
	const screenshotsDir = findScreenshotsDir(state, projectRoot);

	logger.info(`Spec path: ${specPath ?? '(none)'}`);
	logger.info(`Screenshots dir: ${screenshotsDir ?? '(none)'}`);
	logger.info(`Model: ${models.default}`);

	try {
		// Step 1: Document
		logger.info(`\n${createStepBanner(STEP_DOCUMENT, 1, TOTAL_STEPS)}`);

		const docLog = taggedLogger(logger, STEP_DOCUMENT, {
			logDir: logger.logDir,
			step: STEP_DOCUMENT
		});
		const docResult = await runDocumentStep(adwId, {
			model: models.default,
			cwd: projectRoot,
			logger: docLog,
			specPath: specPath ?? undefined,
			screenshotsDir: screenshotsDir ?? undefined
		});

		const docUsage = docResult.usage ?? createDefaultStepUsage();
		const docOk = docResult.success;
		allStepUsages.push({ step: STEP_DOCUMENT, ok: docOk, usage: docUsage });
		docLog.info(`Usage: ${formatUsage(docUsage)}`);

		if (!docResult.success) {
			docLog.error(`Failed: ${docResult.error ?? docResult.result}`);
			docLog.finalize(false, docUsage);

			const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));
			writeWorkflowStatus(logger.logDir, {
				workflow: WORKFLOW_NAME,
				adwId,
				ok: false,
				startTime,
				totals: totalUsage
			});
			return false;
		}
		docLog.finalize(true, docUsage);

		const documentationPath = docResult.result?.trim() ?? null;
		logger.info(`Documentation generated: ${documentationPath ?? '(unknown path)'}`);

		// Commit documentation
		const commitMsg = `docs: generate feature documentation for ${adwId}`;
		const [commitOk, commitErr] = await commitChanges(commitMsg, projectRoot);
		if (!commitOk && commitErr) {
			logger.error(`Failed to commit documentation: ${commitErr}`);
		} else {
			logger.info(`Committed documentation: ${commitMsg}`);
		}

		// Push and handle PR
		await finalizeGitOperations(state, logger, projectRoot);

		// Save state
		if (documentationPath) {
			state.update({ plan_file: documentationPath } as any);
		}
		await state.save(WORKFLOW_NAME);

		// Summary
		const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));

		logger.info(`\n${'═'.repeat(60)}`);
		logger.info(`  WORKFLOW COMPLETE — ${fmtDuration(Date.now() - startTime)}`);
		if (documentationPath) logger.info(`  Documentation: ${documentationPath}`);
		logger.info(`\n  USAGE PER STEP:`);
		for (const { step, usage } of allStepUsages) {
			logger.info(`    [${step}] ${formatUsage(usage)}`);
		}
		logger.info(`\n  TOTAL: ${formatUsage(totalUsage)}`);
		logger.info(`${'═'.repeat(60)}`);

		writeWorkflowStatus(logger.logDir, {
			workflow: WORKFLOW_NAME,
			adwId,
			ok: true,
			startTime,
			totals: totalUsage
		});

		return true;
	} catch (e) {
		logger.error(`Workflow exception: ${e}`);

		const totalUsage =
			allStepUsages.length > 0
				? sumUsage(allStepUsages.map((s) => s.usage))
				: createDefaultStepUsage();
		writeWorkflowStatus(logger.logDir, {
			workflow: WORKFLOW_NAME,
			adwId,
			ok: false,
			startTime,
			totals: totalUsage
		});
		await commentStep(`Workflow exception: ${String(e).slice(0, 200)}`);
		await commentFinalStatus({
			workflow: WORKFLOW_NAME,
			adwId,
			ok: false,
			startTime,
			steps: allStepUsages,
			totals: totalUsage
		});

		return false;
	}
}

if (import.meta.main) {
	const { values } = parseArgs({
		args: Bun.argv.slice(2),
		options: {
			'adw-id': { type: 'string' },
			issue: { type: 'string' }
		},
		strict: true
	});

	const adwId = values['adw-id'];
	if (!adwId) {
		console.error('Usage: bun run adw_document.ts --adw-id <id> [--issue <number>]');
		process.exit(1);
	}

	const success = await runWorkflow(adwId, values['issue']);
	process.exit(success ? 0 : 1);
}
