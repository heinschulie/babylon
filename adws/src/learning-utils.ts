/**
 * Learning utilities for capturing runtime learnings from agent workflows.
 *
 * Writes structured YAML entries to temp/learnings/{run_id}.md for later
 * processing by adw_learn → expert self-improve passes.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync } from "fs";
import { join, basename } from "path";

export interface LearningEntry {
  id: string;
  workflow: "adw_ralph" | "adw_sdlc" | "manual";
  run_id: string;
  date: string;
  tags: string[];
  context: string;
  expected: string;
  actual: string;
  resolution?: string;
  expertise_rule_violated?: string;
  confidence: "high" | "medium" | "low";
  platform_context: Record<string, string>;
  occurrences?: number;
  source_step?: string;
  issue_number?: number;
}

export interface ExpertDomainTags {
  expertDir: string;
  expertName: string;
  domainTags: string[];
  filePatterns: string[];
}

export interface ExpertMatch {
  expertName: string;
  domainTags: string[];
  filePatterns: string[];
  matchedFiles: string[];
}

const LEARNINGS_DIR = "temp/learnings";
const ARCHIVE_DIR = "temp/learnings/archive";

/**
 * Read platform versions from package.json files.
 */
export function readPlatformContext(cwd: string): Record<string, string> {
  const ctx: Record<string, string> = {};

  try {
    const rootPkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf-8"));
    const allDeps = { ...rootPkg.dependencies, ...rootPkg.devDependencies };

    if (allDeps["convex"]) ctx.convex = allDeps["convex"].replace(/[\^~]/, "");
    if (allDeps["svelte"]) ctx.svelte = allDeps["svelte"].replace(/[\^~]/, "");
    if (allDeps["@sveltejs/kit"]) ctx.sveltekit = allDeps["@sveltejs/kit"].replace(/[\^~]/, "");
  } catch {
    // Fallback: try workspace packages
  }

  // Check workspace package.json files for more specific versions
  const appDirs = ["apps/web", "apps/verifier"];
  for (const dir of appDirs) {
    try {
      const pkg = JSON.parse(readFileSync(join(cwd, dir, "package.json"), "utf-8"));
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (!ctx.svelte && allDeps["svelte"]) ctx.svelte = allDeps["svelte"].replace(/[\^~]/, "");
      if (!ctx.sveltekit && allDeps["@sveltejs/kit"]) ctx.sveltekit = allDeps["@sveltejs/kit"].replace(/[\^~]/, "");
    } catch {
      // skip
    }
  }

  return ctx;
}

/**
 * Get the next sequential learning ID for a given file.
 */
function getNextId(existingEntries: LearningEntry[]): string {
  const maxId = existingEntries.reduce((max, e) => {
    const num = parseInt(e.id.replace("learn-", ""), 10);
    return isNaN(num) ? max : Math.max(max, num);
  }, 0);
  return `learn-${maxId + 1}`;
}

/**
 * Check if two learnings are semantically duplicate.
 * Same tags (order-independent) + substring overlap on actual field.
 */
function isDuplicate(existing: LearningEntry, incoming: { tags: string[]; actual: string }): boolean {
  const existingTags = [...existing.tags].sort().join(",");
  const incomingTags = [...incoming.tags].sort().join(",");
  if (existingTags !== incomingTags) return false;

  const snippet = incoming.actual.slice(0, 50);
  return existing.actual.includes(snippet) || incoming.actual.includes(existing.actual.slice(0, 50));
}

/**
 * Rewrite the entire learnings file from entries.
 */
function rewriteLearningsFile(filePath: string, runId: string, entries: LearningEntry[]): void {
  const yamlBlocks = entries.map(e => formatLearningYaml(e)).join("");
  writeFileSync(filePath, `# Runtime Learnings: ${runId}\n\n\`\`\`yaml\n${yamlBlocks}\`\`\`\n`);
}

/**
 * Record a learning entry to temp/learnings/{run_id}.md
 * Deduplicates at write time: same tags + overlapping actual → increment occurrences.
 */
export function recordLearning(
  cwd: string,
  entry: Omit<LearningEntry, "id" | "date" | "platform_context"> & {
    platform_context?: Record<string, string>;
    source_step?: string;
    issue_number?: number;
  }
): string {
  const learningsDir = join(cwd, LEARNINGS_DIR);
  mkdirSync(learningsDir, { recursive: true });

  const filePath = join(learningsDir, `${entry.run_id}.md`);
  const existingEntries = existsSync(filePath) ? parseLearningsFile(filePath) : [];
  const platformCtx = entry.platform_context ?? readPlatformContext(cwd);

  // Check for duplicate
  const dupIndex = existingEntries.findIndex(e => isDuplicate(e, entry));
  if (dupIndex >= 0) {
    const dup = existingEntries[dupIndex];
    // Update existing: bump occurrences, take higher confidence, update date
    const confidenceRank = { low: 0, medium: 1, high: 2 } as const;
    const newConf = confidenceRank[entry.confidence] > confidenceRank[dup.confidence] ? entry.confidence : dup.confidence;
    existingEntries[dupIndex] = {
      ...dup,
      confidence: newConf,
      date: new Date().toISOString().split("T")[0],
      occurrences: (dup.occurrences ?? 1) + 1,
      ...(entry.source_step && { source_step: entry.source_step }),
      ...(entry.issue_number && { issue_number: entry.issue_number }),
    };
    rewriteLearningsFile(filePath, entry.run_id, existingEntries);
    return dup.id;
  }

  // New entry
  const id = getNextId(existingEntries);
  const fullEntry: LearningEntry = {
    ...entry,
    id,
    date: new Date().toISOString().split("T")[0],
    platform_context: platformCtx,
    occurrences: 1,
  };

  if (existingEntries.length === 0) {
    writeFileSync(filePath, `# Runtime Learnings: ${entry.run_id}\n\n\`\`\`yaml\n${formatLearningYaml(fullEntry)}\`\`\`\n`);
  } else {
    const content = readFileSync(filePath, "utf-8");
    const updated = content.replace(/```\s*$/, `${formatLearningYaml(fullEntry)}\`\`\`\n`);
    writeFileSync(filePath, updated);
  }

  return id;
}

/**
 * Format a single learning entry as YAML.
 */
function formatLearningYaml(entry: LearningEntry): string {
  const lines: string[] = [];
  lines.push(`- id: ${entry.id}`);
  lines.push(`  workflow: ${entry.workflow}`);
  lines.push(`  run_id: "${entry.run_id}"`);
  lines.push(`  date: ${entry.date}`);
  lines.push(`  tags: [${entry.tags.join(", ")}]`);
  lines.push(`  context: "${escapeYaml(entry.context)}"`);
  lines.push(`  expected: "${escapeYaml(entry.expected)}"`);
  lines.push(`  actual: "${escapeYaml(entry.actual)}"`);
  if (entry.resolution) {
    lines.push(`  resolution: "${escapeYaml(entry.resolution)}"`);
  }
  if (entry.expertise_rule_violated) {
    lines.push(`  expertise_rule_violated: "${escapeYaml(entry.expertise_rule_violated)}"`);
  }
  lines.push(`  confidence: ${entry.confidence}`);
  if (entry.occurrences && entry.occurrences > 1) {
    lines.push(`  occurrences: ${entry.occurrences}`);
  }
  if (entry.source_step) {
    lines.push(`  source_step: "${entry.source_step}"`);
  }
  if (entry.issue_number) {
    lines.push(`  issue_number: ${entry.issue_number}`);
  }
  lines.push(`  platform_context:`);
  for (const [key, val] of Object.entries(entry.platform_context)) {
    lines.push(`    ${key}: "${val}"`);
  }
  lines.push("");
  return lines.join("\n");
}

function escapeYaml(s: string): string {
  return s.replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/**
 * Parse a learnings file and extract YAML entries.
 */
export function parseLearningsFile(filePath: string): LearningEntry[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    const yamlMatch = content.match(/```yaml\n([\s\S]*?)```/);
    if (!yamlMatch) return [];

    // Simple YAML list parser for our known schema
    const yaml = yamlMatch[1];
    const entries: LearningEntry[] = [];
    let current: Partial<LearningEntry> | null = null;
    let inPlatformContext = false;
    let platformCtx: Record<string, string> = {};

    for (const line of yaml.split("\n")) {
      if (line.startsWith("- id:")) {
        if (current?.id) {
          current.platform_context = platformCtx;
          entries.push(current as LearningEntry);
        }
        current = { id: line.replace("- id:", "").trim() };
        inPlatformContext = false;
        platformCtx = {};
        continue;
      }
      if (!current) continue;

      if (line.trim().startsWith("platform_context:")) {
        inPlatformContext = true;
        continue;
      }

      if (inPlatformContext && line.match(/^\s{4}\w/)) {
        const [key, ...valParts] = line.trim().split(":");
        const val = valParts.join(":").trim().replace(/^"(.*)"$/, "$1");
        platformCtx[key] = val;
        continue;
      }

      if (inPlatformContext && !line.match(/^\s{4}/)) {
        inPlatformContext = false;
      }

      const match = line.match(/^\s{2}(\w+):\s*(.+)/);
      if (match) {
        const [, key, rawVal] = match;
        let val = rawVal.trim().replace(/^"(.*)"$/, "$1");

        if (key === "tags") {
          (current as any).tags = val.replace(/[\[\]]/g, "").split(",").map((t: string) => t.trim());
        } else {
          (current as any)[key] = val;
        }
      }
    }

    if (current?.id) {
      current.platform_context = platformCtx;
      entries.push(current as LearningEntry);
    }

    return entries;
  } catch {
    return [];
  }
}

/**
 * Read all learnings from temp/learnings/*.md (excluding README.md).
 */
export function readAllLearnings(cwd: string): { file: string; entries: LearningEntry[] }[] {
  const learningsDir = join(cwd, LEARNINGS_DIR);
  if (!existsSync(learningsDir)) return [];

  const files = readdirSync(learningsDir)
    .filter(f => f.endsWith(".md") && f !== "README.md")
    .map(f => join(learningsDir, f));

  return files.map(f => ({
    file: f,
    entries: parseLearningsFile(f),
  })).filter(r => r.entries.length > 0);
}

/**
 * Discover all experts and their domain_tags from expertise.yaml files.
 */
export function discoverExperts(cwd: string): ExpertDomainTags[] {
  const expertsDir = join(cwd, ".claude/commands/experts");
  if (!existsSync(expertsDir)) return [];

  const experts: ExpertDomainTags[] = [];

  for (const name of readdirSync(expertsDir)) {
    const expertDir = join(expertsDir, name);
    const expertiseFile = join(expertDir, "expertise.yaml");
    if (!existsSync(expertiseFile)) continue;

    try {
      const content = readFileSync(expertiseFile, "utf-8");
      const tagsMatch = content.match(/domain_tags:\n((?:\s+-\s+.+\n)+)/);
      if (!tagsMatch) continue;

      const tags = tagsMatch[1]
        .split("\n")
        .filter(l => l.trim().startsWith("-"))
        .map(l => l.trim().replace(/^-\s*/, ""));

      // Read file_patterns if present
      const patternsMatch = content.match(/file_patterns:\n((?:\s+-\s+.+\n)+)/);
      const filePatterns = patternsMatch
        ? patternsMatch[1]
            .split("\n")
            .filter(l => l.trim().startsWith("-"))
            .map(l => l.trim().replace(/^-\s*"?/, "").replace(/"$/, ""))
        : [];

      experts.push({ expertDir: name, expertName: name, domainTags: tags, filePatterns });
    } catch {
      // skip malformed
    }
  }

  return experts;
}

/**
 * Find learnings that match an expert's domain tags.
 */
export function matchLearningsToExpert(
  learnings: LearningEntry[],
  domainTags: string[]
): LearningEntry[] {
  const tagSet = new Set(domainTags);
  return learnings.filter(entry =>
    entry.tags.some(tag => tagSet.has(tag))
  );
}

/**
 * Check if a file path matches a glob pattern using prefix-based matching.
 * Supports directory globs like "convex/**" — matches any path starting with "convex/".
 */
function matchGlob(filePath: string, pattern: string): boolean {
  const prefix = pattern.replace(/\*\*.*$/, "").replace(/\*.*$/, "");
  if (!prefix) return true; // bare "**" matches everything
  return filePath.startsWith(prefix);
}

/**
 * Match changed files to experts based on file_patterns.
 * Returns experts that have at least one matching file.
 */
export function matchFilesToExperts(cwd: string, changedFiles: string[]): ExpertMatch[] {
  const experts = discoverExperts(cwd);
  const matches: ExpertMatch[] = [];

  for (const expert of experts) {
    if (expert.filePatterns.length === 0) continue;

    const matched = changedFiles.filter(file =>
      expert.filePatterns.some(pattern => matchGlob(file, pattern))
    );

    if (matched.length > 0) {
      matches.push({
        expertName: expert.expertName,
        domainTags: expert.domainTags,
        filePatterns: expert.filePatterns,
        matchedFiles: matched,
      });
    }
  }

  return matches;
}

/**
 * Infer tags from changed files by matching against expert file_patterns.
 * Fallback for when no expert consultation was performed.
 */
export function inferTagsFromFiles(cwd: string, changedFiles: string[]): string[] {
  const matches = matchFilesToExperts(cwd, changedFiles);
  if (matches.length === 0) return [];
  // Collect unique domain tags from all matched experts
  const tagSet = new Set<string>();
  for (const m of matches) {
    for (const t of m.domainTags) tagSet.add(t);
  }
  return [...tagSet];
}

/**
 * Archive processed learnings files to temp/learnings/archive/.
 */
export function archiveLearnings(cwd: string, files: string[]): void {
  const archiveDir = join(cwd, ARCHIVE_DIR);
  mkdirSync(archiveDir, { recursive: true });

  for (const file of files) {
    const dest = join(archiveDir, basename(file));
    try {
      renameSync(file, dest);
    } catch {
      // If rename fails (cross-device), copy + delete
      const content = readFileSync(file, "utf-8");
      writeFileSync(dest, content);
      // Leave original — don't delete on copy failure
    }
  }
}
