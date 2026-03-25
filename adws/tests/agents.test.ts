import { describe, it, expect } from "vitest";
import { promptClaudeCode } from "../src/agent";
import { makeAdwId, getProjectRoot } from "../src/utils";
import { mkdirSync } from "fs";
import { join } from "path";

/**
 * Integration tests — require CONVEX_ANTHROPIC_API_KEY and claude CLI.
 * Skipped in CI if env var is not set.
 */
const hasApiKey = !!process.env.CONVEX_ANTHROPIC_API_KEY;

describe.skipIf(!hasApiKey)("agent integration", () => {
  it("sonnet model responds to simple prompt", async () => {
    const adwId = makeAdwId();
    const outputDir = join(getProjectRoot(), "temp", "builds", `test_sonnet_${adwId}`);
    mkdirSync(outputDir, { recursive: true });

    const response = await promptClaudeCode({
      prompt: "What is 2+2? Just respond with the number.",
      adw_id: adwId,
      agent_name: "test_sonnet",
      model: "sonnet",
      dangerously_skip_permissions: true,
      output_file: join(outputDir, "raw_output.jsonl"),
    });

    expect(response.success).toBe(true);
    expect(response.output).toContain("4");
  }, 60_000);

  it("opus model responds to simple prompt", async () => {
    const adwId = makeAdwId();
    const outputDir = join(getProjectRoot(), "temp", "builds", `test_opus_${adwId}`);
    mkdirSync(outputDir, { recursive: true });

    const response = await promptClaudeCode({
      prompt: "What is 3+3? Just respond with the number.",
      adw_id: adwId,
      agent_name: "test_opus",
      model: "opus",
      dangerously_skip_permissions: true,
      output_file: join(outputDir, "raw_output.jsonl"),
    });

    expect(response.success).toBe(true);
    expect(response.output).toContain("6");
  }, 60_000);
});
