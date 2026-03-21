import { describe, it, expect } from "vitest";
import { exec } from "../src/utils";

describe("health check", () => {
  it("git is installed", async () => {
    const { exitCode } = await exec(["git", "--version"]);
    expect(exitCode).toBe(0);
  });

  it("gh CLI is installed", async () => {
    const { exitCode } = await exec(["gh", "--version"]);
    expect(exitCode).toBe(0);
  });

  it("git repo has origin remote", async () => {
    const { stdout, exitCode } = await exec([
      "git",
      "remote",
      "get-url",
      "origin",
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("github.com");
  });

  it.skipIf(!process.env.CONVEX_ANTHROPIC_API_KEY)("CONVEX_ANTHROPIC_API_KEY env var exists", () => {
    expect(process.env.CONVEX_ANTHROPIC_API_KEY).toBeDefined();
  });
});
