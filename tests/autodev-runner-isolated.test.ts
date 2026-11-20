/** Real-spawn smoke tests, isolated from AutoDev's repo, git index and model quota.
 * These do NOT claim to prove controller restart/recovery or 429 handling. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runKiloStreaming, type KiloStreamingOptions } from "../src/autodev/kilo-runner.js";

const FAKE_KILO = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (process.env.AUTODEV_FAKE_ARGS) fs.writeFileSync(process.env.AUTODEV_FAKE_ARGS, JSON.stringify(args));
console.log('session: fixed-session-123');
if (args.includes('MODE_429')) {
  console.error('Error: Free model usage limit reached. Retry-After: 120');
  process.exitCode = 1;
} else if (args.includes('MODE_HANG')) {
  process.on('SIGTERM', () => process.exit(0));
  setInterval(() => {}, 1000);
} else {
  console.log('ok');
}
`;

describe("AutoDev runner: isolated real-process checks", () => {
  let dir: string;
  let oldPath: string | undefined;
  let oldArgs: string | undefined;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "autodev-runner-safe-"));
    fs.writeFileSync(path.join(dir, "kilo"), FAKE_KILO, { mode: 0o755 });
    oldPath = process.env.PATH;
    oldArgs = process.env.AUTODEV_FAKE_ARGS;
    process.env.PATH = `${dir}${path.delimiter}${oldPath ?? ""}`;
    process.env.AUTODEV_FAKE_ARGS = path.join(dir, "args.json");
  });
  afterEach(() => {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
    if (oldArgs === undefined) delete process.env.AUTODEV_FAKE_ARGS;
    else process.env.AUTODEV_FAKE_ARGS = oldArgs;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function opts(prompt: string): KiloStreamingOptions {
    return {
      agent: "laceframe-builder",
      model: "test-model",
      prompt,
      logPath: path.join(dir, "runner.log"),
      inactivityTimeoutMs: 30_000,
      onOutput: () => {},
      onHeartbeat: () => {},
      onInactivityWarning: () => {},
      registerCancel: () => {},
    };
  }

  it("uses --session with the existing ID and captures actual child output", async () => {
    const result = await runKiloStreaming({ ...opts("MODE_OK"), sessionId: "resume-456" });
    expect(result.sessionId).toBe("fixed-session-123");
    const args = JSON.parse(fs.readFileSync(path.join(dir, "args.json"), "utf8")) as string[];
    expect(args.slice(args.indexOf("--session"), args.indexOf("--session") + 2)).toEqual(["--session", "resume-456"]);
    expect(result.output).toContain("ok");
  }, 8_000);

  it("rejects a real failing fake Kilo process without calling any provider", async () => {
    await expect(runKiloStreaming(opts("MODE_429"))).rejects.toThrow(/Free model usage limit reached/);
    expect(fs.readFileSync(path.join(dir, "runner.log"), "utf8")).toContain("Retry-After: 120");
  }, 8_000);

  it("cancel sends an actual SIGTERM and rejects rather than claiming success", async () => {
    let cancel: (() => void) | undefined;
    const promise = runKiloStreaming({
      ...opts("MODE_HANG"),
      registerCancel: (fn) => { cancel = fn; },
    });
    // The cancellation callback is registered synchronously during startup.
    expect(cancel).toBeTypeOf("function");
    cancel?.();
    await expect(promise).rejects.toThrow(/interrupted/);
  }, 8_000);
});
