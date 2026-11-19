import { describe, expect, it } from "vitest";
import { cliHelp, parseCliArgs } from "../src/autodev/cli-args.js";

describe("AutoDev CLI safety", () => {
  it("shows help without arguments", () => {
    expect(parseCliArgs([])).toBe("help");
  });
  it.each([["--help"], ["-h"]])("handles help flag %s", (...args) => {
    expect(parseCliArgs(args)).toBe("help");
  });
  it("shows help text containing explicit safe commands", () => {
    expect(cliHelp()).toContain("run --dry-run");
    expect(cliHelp()).toContain("run --execute");
  });
  it("supports status without starting a workflow", () => {
    expect(parseCliArgs(["status"])).toBe("status");
  });
  it.each([["run", "--dry-run"], ["run", "-d"]])("supports dry run", (...args) => {
    expect(parseCliArgs(args)).toBe("dry-run");
  });
  it("requires explicit --execute for real workflow", () => {
    expect(parseCliArgs(["run", "--execute"])).toBe("execute");
  });
  it.each([
    ["run"], ["--dry-run"], ["--execute"], ["--help", "run"],
    ["run", "--help"], ["run", "--execute", "--dry-run"], ["xyz"],
  ])("rejects unsafe/incomplete arguments %j", (...args) => {
    expect(() => parseCliArgs(args)).toThrow(/Unsupported or incomplete/);
  });
});
