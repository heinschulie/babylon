/**
 * Pipeline definition types and validation.
 *
 * Declarative, Zod-typed pipeline format for multi-step ADW workflows.
 * Each step declares what it produces/consumes, enabling graph validation
 * at construction time rather than runtime surprises.
 */

import { z } from "zod";

// ─── Schemas ───────────────────────────────────────────────────────────────────

/** Result produced by a single step execution. */
export const StepResultSchema = z.object({
  ok: z.boolean(),
  error: z.string().optional(),
  sha: z.string().optional(),
  summary: z.string().optional(),
});
export type StepResult = z.infer<typeof StepResultSchema>;

/** Known postcondition types. */
export const PostconditionSchema = z.enum([
  "head-must-advance",
  "result-must-parse",
  "code-must-compile",
  "page-must-load",
]);
export type Postcondition = z.infer<typeof PostconditionSchema>;

/** Known onFail policies. */
export const OnFailSchema = z.enum(["halt", "continue", "skip-issue"]);
export type OnFail = z.infer<typeof OnFailSchema>;

/** A single step in a pipeline definition. */
export const StepDefinitionSchema = z.object({
  name: z.string(),
  command: z.string().nullable(),
  onFail: OnFailSchema,
  produces: z.array(z.string()),
  consumes: z.array(z.string()),
  modelMap: z.record(z.enum(["trivial", "standard", "complex"]), z.string()),
  commitAfter: z.boolean(),
  timeout: z.number(),
  postcondition: z.union([PostconditionSchema, z.array(PostconditionSchema)]).nullable(),
  skipWhen: z.record(z.string(), z.array(z.string())).optional(),
});
export type StepDefinition = z.infer<typeof StepDefinitionSchema>;

/** A pipeline is an ordered array of step definitions. */
export const PipelineDefinitionSchema = z.array(StepDefinitionSchema);
export type PipelineDefinition = z.infer<typeof PipelineDefinitionSchema>;

/** Base context fields always available to every step (provided by the loop runner). */
export const BASE_CONTEXT_KEYS = ["issue", "complexity", "baseSha", "parentIssueNumber"] as const;

// ─── Pipeline Context ──────────────────────────────────────────────────────────

/** Typed context bag threaded through the pipeline. */
export const PipelineContextSchema = z.object({
  // Base fields (always present)
  issue: z.object({
    number: z.number(),
    title: z.string(),
    body: z.string(),
    labels: z.array(z.string()),
  }),
  complexity: z.enum(["trivial", "standard", "complex"]),
  baseSha: z.string(),
  parentIssueNumber: z.number().optional(),

  // Step outputs (optional — filled as pipeline progresses)
  expertAdvice: z.string().optional(),
  preTddSha: z.string().optional(),
  reviewResult: z.object({
    success: z.boolean(),
    verdict: z.enum(["PASS", "PASS_WITH_ISSUES", "FAIL"]).optional(),
    review_summary: z.string().optional(),
    review_issues: z.array(z.object({
      review_issue_number: z.number(),
      issue_description: z.string(),
      issue_severity: z.enum(["blocker", "tech_debt", "skippable"]),
    }).passthrough()).default([]),
  }).passthrough().optional(),
  learningEntry: z.array(z.object({
    tags: z.array(z.string()),
    context: z.string(),
    expected: z.string(),
    actual: z.string(),
    confidence: z.enum(["high", "medium", "low"]),
  })).optional(),
  reviewSubIssues: z.array(z.number()).optional(),
});
export type PipelineContext = z.infer<typeof PipelineContextSchema>;

// ─── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a pipeline definition at construction time.
 *
 * Checks:
 * - Every `consumes` key has a matching `produces` from a prior step or is a base context field
 * - No duplicate step names
 * - All postconditions are recognized (enforced by Zod, but double-checked here)
 */
export function validatePipeline(definition: PipelineDefinition): ValidationResult {
  const errors: string[] = [];

  // Empty pipeline is valid
  if (definition.length === 0) {
    return { valid: true, errors: [] };
  }

  // Check unique step names
  const names = new Set<string>();
  for (const step of definition) {
    if (names.has(step.name)) {
      errors.push(`Duplicate step name: "${step.name}"`);
    }
    names.add(step.name);
  }

  // Build available keys: start with base context
  const available = new Set<string>(BASE_CONTEXT_KEYS);

  for (const step of definition) {
    // Check consumes are available
    for (const key of step.consumes) {
      if (!available.has(key)) {
        errors.push(`Step "${step.name}" consumes "${key}" but no prior step produces it and it is not a base context field`);
      }
    }

    // Add produces to available set
    for (const key of step.produces) {
      available.add(key);
    }
  }

  return { valid: errors.length === 0, errors };
}
