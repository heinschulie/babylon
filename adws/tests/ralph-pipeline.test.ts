import { describe, it, expect } from "vitest";
import { RALPH_PIPELINE } from "../src/ralph-pipeline";
import { validatePipeline } from "../src/pipeline";

describe("RALPH_PIPELINE", () => {
  it("passes validation", () => {
    const result = validatePipeline(RALPH_PIPELINE);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("has exactly 5 steps in correct order", () => {
    expect(RALPH_PIPELINE.map(s => s.name)).toEqual([
      "consult", "tdd", "refactor", "review", "verify",
    ]);
  });

  it("consult produces expertAdvice", () => {
    const consult = RALPH_PIPELINE.find(s => s.name === "consult")!;
    expect(consult.produces).toContain("expertAdvice");
  });

  it("tdd consumes expertAdvice and issue", () => {
    const tdd = RALPH_PIPELINE.find(s => s.name === "tdd")!;
    expect(tdd.consumes).toContain("expertAdvice");
    expect(tdd.consumes).toContain("issue");
  });

  it("review produces both reviewResult and learningEntry", () => {
    const review = RALPH_PIPELINE.find(s => s.name === "review")!;
    expect(review.produces).toContain("reviewResult");
    expect(review.produces).toContain("learningEntry");
  });

  it("only tdd and refactor have commitAfter: true", () => {
    const commitSteps = RALPH_PIPELINE.filter(s => s.commitAfter).map(s => s.name);
    expect(commitSteps).toEqual(["tdd", "refactor"]);
  });

  it("tdd has head-must-advance + code-must-compile + page-must-render postconditions", () => {
    const tdd = RALPH_PIPELINE.find(s => s.name === "tdd")!;
    expect(tdd.postcondition).toEqual(["head-must-advance", "code-must-compile", "page-must-render"]);
  });

  it("only review has result-must-parse postcondition", () => {
    const review = RALPH_PIPELINE.find(s => s.name === "review")!;
    expect(review.postcondition).toBe("result-must-parse");
  });

  it("refactor does not skip any complexity level", () => {
    const refactor = RALPH_PIPELINE.find(s => s.name === "refactor")!;
    expect(refactor.skipWhen).toBeUndefined();
  });

  it("model maps resolve per complexity", () => {
    const tdd = RALPH_PIPELINE.find(s => s.name === "tdd")!;
    expect(tdd.modelMap.trivial).toBe("default");
    expect(tdd.modelMap.standard).toBe("default");
    expect(tdd.modelMap.complex).toBe("opus");

    const consult = RALPH_PIPELINE.find(s => s.name === "consult")!;
    expect(consult.modelMap.trivial).toBe("opus");
    expect(consult.modelMap.standard).toBe("opus");
    expect(consult.modelMap.complex).toBe("opus");
  });

  it("consult onFail is continue (non-fatal)", () => {
    const consult = RALPH_PIPELINE.find(s => s.name === "consult")!;
    expect(consult.onFail).toBe("continue");
  });

  it("tdd and review onFail is skip-issue", () => {
    expect(RALPH_PIPELINE.find(s => s.name === "tdd")!.onFail).toBe("skip-issue");
    expect(RALPH_PIPELINE.find(s => s.name === "review")!.onFail).toBe("skip-issue");
  });

  it("verify step exists with correct properties", () => {
    const verify = RALPH_PIPELINE.find(s => s.name === "verify")!;
    expect(verify).toBeDefined();
    expect(verify.command).toBeNull();
    expect(verify.onFail).toBe("continue");
    expect(verify.commitAfter).toBe(false);
    expect(verify.postcondition).toBeNull();
    expect(verify.timeout).toBe(300_000);
  });

  it("verify consumes reviewResult, localUrl, and issue", () => {
    const verify = RALPH_PIPELINE.find(s => s.name === "verify")!;
    expect(verify.consumes).toContain("reviewResult");
    expect(verify.consumes).toContain("localUrl");
    expect(verify.consumes).toContain("issue");
  });

  it("verify produces verifyResult", () => {
    const verify = RALPH_PIPELINE.find(s => s.name === "verify")!;
    expect(verify.produces).toContain("verifyResult");
  });

  it("has reasonable timeout ceiling values", () => {
    const timeouts = RALPH_PIPELINE.reduce((acc, step) => {
      acc[step.name] = step.timeout;
      return acc;
    }, {} as Record<string, number>);

    // Verify the new ceiling values (converted to minutes for readability)
    expect(timeouts.consult).toBe(300_000); // 5 minutes
    expect(timeouts.tdd).toBe(1_200_000);   // 20 minutes
    expect(timeouts.refactor).toBe(600_000); // 10 minutes
    expect(timeouts.review).toBe(900_000);   // 15 minutes
    expect(timeouts.verify).toBe(300_000);   // 5 minutes

    // Ensure all timeouts are reasonable (not too short or too long)
    for (const [step, timeout] of Object.entries(timeouts)) {
      expect(timeout).toBeGreaterThan(60_000); // At least 1 minute
      expect(timeout).toBeLessThan(25 * 60_000); // Less than 25 minutes
    }
  });
});
