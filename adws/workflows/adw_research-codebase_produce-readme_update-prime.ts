/**
 * ADW Research-Codebase → Produce-README → Update-Prime Workflow
 *
 * Researches multiple topics, saves docs to docs/, then produces
 * multiple READMEs: one global consolidated, one for the backend (convex/),
 * and one per frontend app (auto-discovered from apps/).
 *
 * Designed to be rerun often to keep docs up to date.
 *
 * Data flow:
 *   1. Topics from ADW_PROMPT (or defaults) + auto-discovered apps/ dirs → parallel research → docs/*.md
 *   2. Parallel README generation:
 *      - README.md ← all research docs (consolidated)
 *      - convex/README.md ← docs/backend.md
 *      - apps/{name}/README.md ← docs/{name}.md
 *   3. Update prime command — /update_prime regenerates context paragraphs from new READMEs
 *
 * Per-phase model env vars (all optional):
 *   ADW_RESEARCH_MODEL  — research agents (default: claude-haiku-4-5-20251001)
 *   ADW_README_MODEL    — produce-readme agents (default: claude-sonnet-4-20250514)
 *   ADW_PRIME_MODEL     — update-prime agent (default: claude-sonnet-4-20250514)
 *
 * Usage:
 *   bun run adws/workflows/adw_research-codebase_produce-readme_update-prime.ts --adw-id <id>
 *   # Override default topics:
 *   ADW_PROMPT="auth,schema" bun run adws/workflows/adw_research-codebase_produce-readme_update-prime.ts --adw-id <id>
 */

import { parseArgs } from 'util';
import { readdirSync, statSync, renameSync, mkdirSync } from 'fs';
import { join } from 'path';
import {
	runResearchCodebaseStep,
	runProduceReadmeStep,
	runUpdatePrimeStep,
	formatUsage,
	sumUsage,
	type StepUsage
} from '../src/agent-sdk';
import { createLogger, taggedLogger, writeWorkflowStatus } from '../src/logger';
import { discoverApps, slugify, findMostRecentMd, extractMdPath } from '../src/research-utils';
import {
	createStepBanner,
	createDefaultStepUsage,
	createCommentStep,
	createFinalStatusComment,
	getAdwEnv,
	fmtDuration
} from '../src/utils';

const DEFAULT_TOPICS = 'codebase-structure,runtime,deployment,backend,billing,auth,testing';
const STEP_README = 'produce-readme';
const DOCS_DIR = 'docs';
const APPS_DIR = 'apps';
const BACKEND_TOPIC = 'backend';
const BACKEND_DIR = 'convex';

async function runWorkflow(adwId: string, issueNumber?: string): Promise<boolean> {
	const startTime = Date.now();
	const logger = createLogger(adwId, 'research-codebase_produce-readme_update-prime');

	logger.info(`Starting ADW Research→README Workflow — ADW ID: ${adwId}`);

	const { prompt: topicsRaw, workingDir, models } = getAdwEnv();

	// Create comment functions
	const commentStep = createCommentStep(issueNumber);
	const commentFinalStatus = createFinalStatusComment(issueNumber);

	const staticTopics = (topicsRaw || DEFAULT_TOPICS)
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);

	// Auto-discover frontend apps
	const appNames = discoverApps(workingDir);
	const allTopics = [...staticTopics, ...appNames];

	const docsDir = join(workingDir, DOCS_DIR);
	mkdirSync(docsDir, { recursive: true });

	// Track which doc path maps to which topic slug
	const docsBySlug = new Map<string, string>();

	logger.info(`Static topics: ${staticTopics.join(', ')}`);
	logger.info(`Discovered apps: ${appNames.length > 0 ? appNames.join(', ') : '(none)'}`);
	logger.info(`All topics: ${allTopics.join(', ')}`);
	logger.info(`Working Dir: ${workingDir}`);
	logger.info(
		`Models — research: ${models.research}, readme: ${models.default}, prime: ${models.default}`
	);

	// Collect usage from every step for the final summary
	const allStepUsages: { step: string; ok: boolean; usage: StepUsage }[] = [];

	try {
		// =========================================================================
		// Research ALL topics in parallel (static + per-app)
		// =========================================================================
		logger.info(`\n${createStepBanner(`PARALLEL RESEARCH — ${allTopics.length} topics`)}`);

		const researchPromises = allTopics.map(async (topic) => {
			const slug = slugify(topic);
			const destPath = join(docsDir, `${slug}.md`);
			const tlog = taggedLogger(logger, topic, { logDir: logger.logDir, step: 'research' });

			tlog.info('Starting research...');

			const researchResult = await runResearchCodebaseStep(topic, {
				model: models.research,
				cwd: workingDir,
				logger: tlog
			});

			if (researchResult.usage) {
				allStepUsages.push({
					step: `research:${topic}`,
					ok: researchResult.success,
					usage: researchResult.usage
				});
				tlog.info(`Usage: ${formatUsage(researchResult.usage)}`);
			}

			if (!researchResult.success) {
				tlog.error(`Research failed: ${researchResult.error}`);
				tlog.finalize(false, researchResult.usage);
				return null;
			}

			// Extract research doc path from result
			let researchDocPath: string | null = null;

			if (researchResult.result) {
				researchDocPath = extractMdPath(researchResult.result.trim(), workingDir);
			}

			// Fallback: scan temp/research/ for file matching this topic's slug
			if (!researchDocPath) {
				tlog.warn('Fallback: scanning temp/research/...');
				const researchDir = join(workingDir, 'temp', 'research');
				try {
					const mdFiles = readdirSync(researchDir)
						.filter((f) => f.endsWith('.md') && f.includes(slug))
						.map((f) => ({
							path: join(researchDir, f),
							mtime: statSync(join(researchDir, f)).mtimeMs
						}))
						.sort((a, b) => b.mtime - a.mtime);
					if (mdFiles.length > 0) researchDocPath = mdFiles[0].path;
				} catch {
					// dir may not exist
				}
				// If slug match failed, try most recent
				if (!researchDocPath) {
					researchDocPath = findMostRecentMd(join(workingDir, 'temp', 'research'));
				}
			}

			if (!researchDocPath) {
				tlog.error('Could not find research doc');
				tlog.finalize(false, researchResult.usage);
				return null;
			}

			// Move research doc to docs/<slug>.md
			try {
				renameSync(researchDocPath, destPath);
				tlog.info(`Moved: ${researchDocPath} → ${destPath}`);
			} catch {
				const content = await Bun.file(researchDocPath).text();
				await Bun.write(destPath, content);
				tlog.info(`Copied to: ${destPath}`);
			}

			tlog.info('Research complete');
			tlog.finalize(true, researchResult.usage);
			return { slug, destPath };
		});

		const results = await Promise.all(researchPromises);

		for (const result of results) {
			if (result) {
				docsBySlug.set(result.slug, result.destPath);
			}
		}

		const allDocPaths = [...docsBySlug.values()];
		logger.info(
			`\nResearch phase complete: ${allDocPaths.length}/${allTopics.length} topics succeeded`
		);

		if (allDocPaths.length === 0) {
			logger.error('No research documents were produced — cannot generate READMEs');
			return false;
		}

		// =========================================================================
		// Produce READMEs in parallel: global + backend + per-app
		// =========================================================================
		type ReadmeTarget = { name: string; sourcePaths: string; outputPath: string; mode?: string };
		const readmeTargets: ReadmeTarget[] = [];

		// 1. Global consolidated README — all docs
		readmeTargets.push({
			name: 'global',
			sourcePaths: allDocPaths.join(','),
			outputPath: join(workingDir, 'README.md'),
			mode: 'consolidated'
		});

		// 2. Backend README — backend doc only
		const backendDoc = docsBySlug.get(BACKEND_TOPIC);
		if (backendDoc) {
			readmeTargets.push({
				name: BACKEND_DIR,
				sourcePaths: backendDoc,
				outputPath: join(workingDir, BACKEND_DIR, 'README.md')
			});
		} else {
			logger.warn(`No "${BACKEND_TOPIC}" research doc found — skipping ${BACKEND_DIR}/README.md`);
		}

		// 3. Per-app READMEs — each app's dedicated doc only
		for (const appName of appNames) {
			const appSlug = slugify(appName);
			const appDoc = docsBySlug.get(appSlug);
			if (appDoc) {
				readmeTargets.push({
					name: `${APPS_DIR}/${appName}`,
					sourcePaths: appDoc,
					outputPath: join(workingDir, APPS_DIR, appName, 'README.md')
				});
			} else {
				logger.warn(
					`No research doc for app "${appName}" — skipping ${APPS_DIR}/${appName}/README.md`
				);
			}
		}

		logger.info(
			`\n${createStepBanner(`PARALLEL README GENERATION — ${readmeTargets.length} READMEs`)}`
		);
		for (const t of readmeTargets) {
			logger.info(`  [${t.name}] ${t.outputPath}${t.mode ? ` (${t.mode})` : ''}`);
		}

		const readmePromises = readmeTargets.map(async (target) => {
			const tlog = taggedLogger(logger, target.name, { logDir: logger.logDir, step: 'readme' });
			tlog.info('Generating README...');

			const result = await runProduceReadmeStep(target.sourcePaths, target.outputPath, {
				model: models.default,
				cwd: workingDir,
				logger: tlog,
				mode: target.mode
			});

			if (result.usage) {
				allStepUsages.push({
					step: `readme:${target.name}`,
					ok: result.success,
					usage: result.usage
				});
				tlog.info(`Usage: ${formatUsage(result.usage)}`);
			}

			if (!result.success) {
				tlog.error(`README generation failed: ${result.error}`);
				tlog.finalize(false, result.usage);
				return false;
			}

			tlog.info(`README complete: ${target.outputPath}`);
			tlog.finalize(true, result.usage);
			return true;
		});

		const readmeResults = await Promise.all(readmePromises);
		const readmeSuccesses = readmeResults.filter(Boolean).length;

		// =========================================================================
		// Update prime command with fresh context from new READMEs
		// =========================================================================
		logger.info(`\n${createStepBanner('UPDATE PRIME COMMAND')}`);

		const primeLog = taggedLogger(logger, 'update-prime', {
			logDir: logger.logDir,
			step: 'update-prime'
		});
		const primeResult = await runUpdatePrimeStep({
			model: models.default,
			cwd: workingDir,
			logger: primeLog
		});

		if (primeResult.usage) {
			allStepUsages.push({
				step: 'update-prime',
				ok: primeResult.success,
				usage: primeResult.usage
			});
			primeLog.info(`Usage: ${formatUsage(primeResult.usage)}`);
		}

		if (!primeResult.success) {
			primeLog.warn(`Failed: ${primeResult.error ?? 'unknown'}`);
			primeLog.finalize(false, primeResult.usage);
		} else {
			primeLog.info('Prime command updated successfully');
			primeLog.finalize(true, primeResult.usage);
		}

		const totalUsage = sumUsage(allStepUsages.map((s) => s.usage));
		const ok = readmeSuccesses > 0;

		logger.info(`\n${'═'.repeat(60)}`);
		logger.info(`  WORKFLOW COMPLETE — ${fmtDuration(Date.now() - startTime)}`);
		logger.info(`  Research docs (${allDocPaths.length}):`);
		allDocPaths.forEach((p) => logger.info(`    - ${p}`));
		logger.info(`  READMEs (${readmeSuccesses}/${readmeTargets.length}):`);
		readmeTargets.forEach((t) => logger.info(`    - ${t.outputPath}`));
		logger.info(`  Prime: ${primeResult.success ? 'updated' : 'failed'}`);
		logger.info(`\n  USAGE PER STEP:`);
		for (const { step, usage } of allStepUsages) {
			logger.info(`    [${step}] ${formatUsage(usage)}`);
		}
		logger.info(`\n  TOTAL: ${formatUsage(totalUsage)}`);
		logger.info(`${'═'.repeat(60)}`);

		writeWorkflowStatus(logger.logDir, {
			workflow: 'research-codebase_produce-readme_update-prime',
			adwId,
			ok,
			startTime,
			totals: totalUsage
		});

		await commentFinalStatus({
			workflow: 'research-codebase_produce-readme_update-prime',
			adwId,
			ok,
			startTime,
			steps: allStepUsages,
			totals: totalUsage
		});

		return ok;
	} catch (e) {
		logger.error(`Workflow exception: ${e}`);
		const totals =
			allStepUsages.length > 0
				? sumUsage(allStepUsages.map((s) => s.usage))
				: createDefaultStepUsage();
		writeWorkflowStatus(logger.logDir, {
			workflow: 'research-codebase_produce-readme_update-prime',
			adwId,
			ok: false,
			startTime,
			totals
		});

		await commentStep(`Workflow exception ❌: ${String(e).slice(0, 200)}`);
		await commentFinalStatus({
			workflow: 'research-codebase_produce-readme_update-prime',
			adwId,
			ok: false,
			startTime,
			steps: allStepUsages,
			totals
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
		console.error(
			"Usage: ADW_PROMPT='auth,schema,i18n' bun run adws/workflows/adw_research-codebase_produce-readme_update-prime.ts --adw-id <id> [--issue <number>]"
		);
		process.exit(1);
	}

	const success = await runWorkflow(adwId, values['issue']);
	process.exit(success ? 0 : 1);
}
