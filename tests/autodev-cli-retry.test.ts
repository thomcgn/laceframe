import { describe, expect, it } from "vitest";
import { cliHelp, parseCliArgs } from "../src/autodev/cli-args";

describe("AutoDev retry CLI", () => {
  it("accepts only an explicit positive issue number", () => {
    expect(parseCliArgs(["retry", "36"])).toBe("retry:36");
    expect(() => parseCliArgs(["retry"])).toThrow();
    expect(() => parseCliArgs(["retry", "0"])).toThrow();
    expect(() => parseCliArgs(["retry", "-1"])).toThrow();
    expect(() => parseCliArgs(["retry", "36;rm -rf ."])).toThrow();
    expect(() => parseCliArgs(["retry", "9007199254740992"])).toThrow();
  });

  it("documents safe retry separately from production execution", () => {
    expect(cliHelp()).toContain("retry 36");
    expect(cliHelp()).toContain("run --execute");
  });
});
