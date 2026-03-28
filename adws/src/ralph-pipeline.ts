/**
 * Ralph-specific pipeline definition.
 *
 * Declarative 4-step array: consult → TDD → refactor → review.
 * Validated at module load — if the pipeline is invalid, this module throws.
 */

import {
  type PipelineDefinition,
  type PipelineContext,
  validatePipeline,
} from "./pipeline";

export const RALPH_PIPELINE: PipelineDefinition = [
  {
    name: "consult",
    command: "/experts:consult",
    onFail: "continue",
    produces: ["expertAdvice"],
    consumes: ["issue"],
    modelMap: { trivial: "research", standard: "research", complex: "research" },
    commitAfter: false,
    timeout: 120_000,
    postcondition: null,
  },
  {
    name: "tdd",
    command: "/tdd",
    onFail: "skip-issue",
    produces: ["preTddSha"],
    consumes: ["issue", "expertAdvice"],
    modelMap: { trivial: "research", standard: "default", complex: "opus" },
    commitAfter: true,
    timeout: 600_000,
    postcondition: "head-must-advance",
  },
  {
    name: "refactor",
    command: "/refactor-step",
    onFail: "continue",
    produces: [],
    consumes: ["issue", "expertAdvice", "preTddSha"],
    modelMap: { trivial: "default", standard: "default", complex: "opus" },
    commitAfter: true,
    timeout: 300_000,
    postcondition: null,
    skipWhen: { complexity: ["trivial"] },
  },
  {
    name: "review",
    command: "/review",
    onFail: "skip-issue",
    produces: ["reviewResult", "learningEntry"],
    consumes: ["issue", "expertAdvice"],
    modelMap: { trivial: "default", standard: "default", complex: "opus" },
    commitAfter: false,
    timeout: 300_000,
    postcondition: "result-must-parse",
  },
];

// Validate at module load — fail fast if definition is broken
const validation = validatePipeline(RALPH_PIPELINE);
if (!validation.valid) {
  throw new Error(`Ralph pipeline validation failed: ${validation.errors.join("; ")}`);
}

export type RalphPipelineContext = PipelineContext;
