import { resolve, dirname, join, isAbsolute } from "path";
import { readdirSync, statSync, existsSync } from "fs";
import { withFallback } from "./error-utils";

/** Discover frontend app directories under apps/. */
export function discoverApps(workingDir: string): string[] {
  const appsPath = join(workingDir, "apps");
  return withFallback(() => {
    return readdirSync(appsPath)
      .filter((entry) => {
        const entryPath = join(appsPath, entry);
        return statSync(entryPath).isDirectory() && !entry.startsWith(".");
      });
  }, []);
}

/** Slugify a topic name for use as a filename. */
export function slugify(topic: string): string {
  return topic
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Find the most recently created .md file in a directory. */
export function findMostRecentMd(dir: string): string | null {
  return withFallback(() => {
    const mdFiles = readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => ({
        path: join(dir, f),
        mtime: statSync(join(dir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    return mdFiles.length > 0 ? mdFiles[0].path : null;
  }, null);
}

/** Extract a .md path from agent result text, or return null. */
export function extractMdPath(resultText: string, workingDir: string): string | null {
  const absMatch = resultText.match(/\/[^\s`"']+\.md/);
  if (absMatch) {
    const matched = absMatch[0];
    // Only trust it as absolute if it actually exists on disk
    if (isAbsolute(matched) && existsSync(matched)) return matched;
    // Otherwise treat as relative to workingDir
    const asRelative = join(workingDir, matched);
    if (existsSync(asRelative)) return asRelative;
  }

  const relMatch = resultText.match(/(?:temp\/research\/[^\s`"']+\.md)/);
  if (relMatch) return join(workingDir, relMatch[0]);

  return null;
}