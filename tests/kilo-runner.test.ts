import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));
import { spawn } from "node:child_process";
import { runKiloStreaming } from "../src/autodev/kilo-runner";

const mockedSpawn = vi.mocked(spawn);

describe("live Kilo process", () => {
  const dirs: string[] = [];
  afterEach(() => {
    vi.clearAllMocks();
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("pins Nemotron explicitly and streams the agent output into a readable log", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kilo-live-"));
    dirs.push(dir);
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), pid: 42,
      kill: vi.fn(),
    });
    mockedSpawn.mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const chunks: string[] = [];
    const promise = runKiloStreaming({
      agent: "laceframe-builder", model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      prompt: "test", logPath: path.join(dir, "run.log"), timeoutMs: 10000,
      onOutput: (stream, chunk) => { chunks.push(stream + ":" + chunk); },
      onHeartbeat: () => {}, registerCancel: () => {},
    });
    child.stdout.write("editing file\n");
    child.stderr.write("warning\n");
    child.emit("close", 0, null);
    const result = await promise;
    expect(result).toContain("editing file");
    expect(chunks).toEqual(["stdout:editing file\n", "stderr:warning\n"]);
    expect(fs.readFileSync(path.join(dir, "run.log"), "utf8")).toContain("editing file");
    expect(mockedSpawn).toHaveBeenCalledWith("kilo",
      ["run", "--auto", "--model", "nvidia/nemotron-3-ultra-550b-a55b:free", "--agent", "laceframe-builder", "test"],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }));
  });

  it("rejects an unsuccessful exit instead of claiming the issue is done", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kilo-live-"));
    dirs.push(dir);
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), pid: 42,
      kill: vi.fn(),
    });
    mockedSpawn.mockReturnValue(child as unknown as ReturnType<typeof spawn>);
    const promise = runKiloStreaming({
      agent: "laceframe-reviewer", model: "nvidia/nemotron-3-ultra-550b-a55b:free",
      prompt: "test", logPath: path.join(dir, "error.log"), timeoutMs: 10000,
      onOutput: () => {}, onHeartbeat: () => {}, registerCancel: () => {},
    });
    child.stderr.write("model error\n");
    child.emit("close", 1, null);
    await expect(promise).rejects.toThrow("code=1");
  });
});
