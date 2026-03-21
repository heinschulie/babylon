import { describe, it, expect } from "vitest";
import { SLASH_COMMAND_MODEL_MAP } from "../src/agent";

describe("SLASH_COMMAND_MODEL_MAP", () => {
  it("every command has both base and heavy mappings", () => {
    for (const [command, config] of Object.entries(SLASH_COMMAND_MODEL_MAP)) {
      expect(config.base, `${command} missing 'base'`).toBeDefined();
      expect(config.heavy, `${command} missing 'heavy'`).toBeDefined();
    }
  });

  it("returns correct models for base set", () => {
    expect(SLASH_COMMAND_MODEL_MAP["/implement"].base).toBe("sonnet");
    expect(SLASH_COMMAND_MODEL_MAP["/classify_issue"].base).toBe("sonnet");
    expect(SLASH_COMMAND_MODEL_MAP["/review"].base).toBe("sonnet");
  });

  it("returns correct models for heavy set", () => {
    expect(SLASH_COMMAND_MODEL_MAP["/implement"].heavy).toBe("opus");
    expect(SLASH_COMMAND_MODEL_MAP["/classify_issue"].heavy).toBe("sonnet");
    expect(SLASH_COMMAND_MODEL_MAP["/review"].heavy).toBe("sonnet");
  });

  it("has expected commands that differ between base and heavy", () => {
    const differences: string[] = [];
    for (const [command, config] of Object.entries(SLASH_COMMAND_MODEL_MAP)) {
      if (config.base !== config.heavy) differences.push(command);
    }
    // /implement, /resolve_failed_test, /resolve_failed_e2e_test, /document,
    // /chore, /bug, /feature, /patch should differ
    expect(differences.length).toBeGreaterThan(0);
    expect(differences).toContain("/implement");
    expect(differences).toContain("/feature");
  });
});
