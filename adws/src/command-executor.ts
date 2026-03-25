/**
 * Command execution and file management utilities for Claude Code.
 */

import { join } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { exec, getProjectRoot } from "./utils";

/** Claude Code CLI path */
export const CLAUDE_PATH = process.env.CLAUDE_CODE_PATH ?? "claude";

/** Command execution and file management utilities */
export class CommandExecutor {
  /** Check if Claude Code CLI is installed. */
  static async checkInstallation(): Promise<string | null> {
    try {
      const { exitCode } = await exec([CLAUDE_PATH, "--version"]);
      if (exitCode !== 0)
        return `Error: Claude Code CLI not functional at: ${CLAUDE_PATH}`;
    } catch {
      return `Error: Claude Code CLI not found at: ${CLAUDE_PATH}`;
    }
    return null;
  }

  /** Save a prompt to the logging directory. */
  static savePrompt(prompt: string, adwId: string, agentName: string, outputDir?: string): void {
    const match = prompt.match(/^(\/\w+)/);
    if (!match) return;

    const commandName = match[1].slice(1);

    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, `${commandName}.txt`), prompt);
      return;
    }

    const promptDir = join(
      getProjectRoot(),
      "temp",
      "builds",
      `${agentName}_${adwId}`,
      "prompts"
    );
    mkdirSync(promptDir, { recursive: true });
    writeFileSync(join(promptDir, `${commandName}.txt`), prompt);
  }
}