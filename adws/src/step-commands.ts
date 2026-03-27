/**
 * Step command configuration for standardized workflow steps.
 */

/** Command configuration for step runners. */
export interface StepCommand {
  command: string;
  buildArgs: (...args: any[]) => string[];
}

/** Registry of available step commands and their argument builders. */
export const STEP_COMMANDS: Record<string, StepCommand> = {
  plan: {
    command: "/plan",
    buildArgs: (prompt: string, adwId?: string) => [adwId ?? "unknown", prompt],
  },
  build: {
    command: "/build",
    buildArgs: (planPath: string) => [planPath],
  },
  review: {
    command: "/review",
    buildArgs: (adwId: string, specPath: string, issueBody?: string, agentName?: string, reviewImageDir?: string) => {
      const specArg = issueBody && !specPath ? `INLINE_SPEC::${issueBody}` : specPath;
      const args = [adwId, specArg, agentName ?? "review_agent"];
      if (reviewImageDir) args.push(reviewImageDir);
      return args;
    },
  },
  researchCodebase: {
    command: "/research-codebase",
    buildArgs: (question: string) => [question],
  },
  produceReadme: {
    command: "/produce-readme",
    buildArgs: (sourcePaths: string, outputPath: string, mode?: string) => {
      return mode ? [sourcePaths, outputPath, mode] : [sourcePaths, outputPath];
    },
  },
  updatePrime: {
    command: "/update_prime",
    buildArgs: () => [],
  },
  document: {
    command: "/document",
    buildArgs: (adwId: string, specPath?: string, screenshotsDir?: string) => {
      const args = [adwId];
      if (specPath) args.push(specPath);
      if (screenshotsDir) args.push(screenshotsDir);
      return args;
    },
  },
  test: {
    command: "/test",
    buildArgs: () => [],
  },
  patchPlan: {
    command: "/patch",
    buildArgs: (adwId: string, changeRequest: string, specPath?: string, agentName?: string) => {
      const args = [adwId, JSON.stringify(changeRequest)];
      if (specPath) args.push(specPath);
      if (agentName) args.push(agentName);
      return args;
    },
  },
  classify: {
    command: "/classify_issue",
    buildArgs: (issueJson: string) => [issueJson],
  },
  tdd: {
    command: "/tdd",
    buildArgs: (issueBody: string) => [`\n\n${issueBody}`],
  },
  refactorSweep: {
    command: "/refactor",
    buildArgs: (adwId: string) => [adwId],
  },
  refactorStep: {
    command: "/refactor-step",
    buildArgs: (adwId: string, issueNumber: number, issueBody: string, preTddSha: string) =>
      [adwId, String(issueNumber), issueBody, preTddSha],
  },
  selfImprove: {
    command: "/experts:database:self-improve",
    buildArgs: (checkGitDiff: string, focusArea?: string) => {
      const args = [checkGitDiff];
      if (focusArea) args.push(focusArea);
      return args;
    },
  },
  consult: {
    command: "/experts:consult",
    buildArgs: (question: string, context?: string, changedFiles?: string) => {
      const args = [question];
      if (context) args.push(context);
      if (changedFiles) args.push(changedFiles);
      return args;
    },
  },
};