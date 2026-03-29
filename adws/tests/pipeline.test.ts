import { describe, it, expect } from "vitest";
import {
  validatePipeline,
  type PipelineDefinition,
  type StepDefinition,
  BASE_CONTEXT_KEYS,
} from "../src/pipeline";

function makeStep(overrides: Partial<StepDefinition> = {}): StepDefinition {
  return {
    name: "test-step",
    command: "/test",
    onFail: "halt",
    produces: [],
    consumes: [],
    modelMap: { trivial: "default", standard: "default", complex: "default" },
    commitAfter: false,
    timeout: 60_000,
    postcondition: null,
    ...overrides,
  };
}

describe("validatePipeline", () => {
  it("accepts an empty pipeline", () => {
    const result = validatePipeline([]);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a valid pipeline with correct produces/consumes chain", () => {
    const pipeline: PipelineDefinition = [
      makeStep({ name: "step-a", produces: ["expertAdvice"], consumes: ["issue"] }),
      makeStep({ name: "step-b", produces: ["preTddSha"], consumes: ["issue", "expertAdvice"] }),
    ];
    const result = validatePipeline(pipeline);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects missing produces for a consumes key", () => {
    const pipeline: PipelineDefinition = [
      makeStep({ name: "step-a", consumes: ["nonExistentKey"] }),
    ];
    const result = validatePipeline(pipeline);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("nonExistentKey");
    expect(result.errors[0]).toContain("step-a");
  });

  it("rejects duplicate step names", () => {
    const pipeline: PipelineDefinition = [
      makeStep({ name: "dup", produces: ["x"] }),
      makeStep({ name: "dup", consumes: ["x"] }),
    ];
    const result = validatePipeline(pipeline);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes("Duplicate step name"))).toBe(true);
  });

  it("base context fields are always available for consumes", () => {
    for (const key of BASE_CONTEXT_KEYS) {
      const pipeline: PipelineDefinition = [
        makeStep({ name: `consume-${key}`, consumes: [key] }),
      ];
      const result = validatePipeline(pipeline);
      expect(result.valid).toBe(true);
    }
  });

  it("step can consume from same-step produces (not allowed — must be prior)", () => {
    // A step that both produces and consumes the same key should fail
    // because produces are only available to *later* steps
    const pipeline: PipelineDefinition = [
      makeStep({ name: "self-ref", produces: ["x"], consumes: ["x"] }),
    ];
    const result = validatePipeline(pipeline);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("self-ref");
  });

  it("reports multiple errors at once", () => {
    const pipeline: PipelineDefinition = [
      makeStep({ name: "dup" }),
      makeStep({ name: "dup", consumes: ["missing1", "missing2"] }),
    ];
    const result = validatePipeline(pipeline);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3); // dup name + 2 missing consumes
  });
});
