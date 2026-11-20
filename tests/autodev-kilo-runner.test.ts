import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runKiloStreaming, type KiloStreamingOptions } from "../src/autodev/kilo-runner";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, spawn: vi.fn() };
});

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const mocked = {
    ...actual,
    mkdirSync: vi.fn(() => undefined),
    createWriteStream: vi.fn(() => ({
      write: vi.fn(),
      end: vi.fn((_data: string, cb?: () => void) => cb?.()),
    })),
  };
  return { ...mocked, default: mocked };
});

import { spawn } from "node:child_process";
import fs from "node:fs";

const mockSpawn = vi.mocked(spawn);
const mockFs = vi.mocked(fs);

describe("runKiloStreaming", () => {
  let mockChild: {
    stdout: { on: ReturnType<typeof vi.fn> };
    stderr: { on: ReturnType<typeof vi.fn> };
    on: ReturnType<typeof vi.fn>;
    kill: ReturnType<typeof vi.fn>;
    pid: number;
    stdin: null;
    stdio: [null, NodeJS.ReadableStream, NodeJS.ReadableStream];
    killed: boolean;
    connected: boolean;
  };
  let options: KiloStreamingOptions;
  let killProcessSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    killProcessSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    mockChild = {
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      on: vi.fn(),
      kill: vi.fn(),
      pid: 12345,
      stdin: null,
      stdio: [null, { on: vi.fn() } as unknown as NodeJS.ReadableStream, { on: vi.fn() } as unknown as NodeJS.ReadableStream],
      killed: false,
      connected: true,
    };

    mockSpawn.mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.createWriteStream.mockReturnValue({
      write: vi.fn(),
      // The real WriteStream invokes the completion callback after flushing.
      // Omitting it leaves the Kilo promise pending until Vitest times out.
      end: vi.fn((data: string, callback?: () => void) => {
        void data;
        callback?.();
      }),
      close: vi.fn(),
      bytesWritten: 0,
      path: '/tmp/test.log',
      pending: false,
    } as unknown as fs.WriteStream);

    options = {
      agent: "laceframe-builder",
      model: "kilo/nvidia/nemotron-3-ultra-550b-a55b:free",
      prompt: "test prompt",
      logPath: "/tmp/kilo-test.log",
      inactivityTimeoutMs: 30000,
      onOutput: vi.fn(),
      onHeartbeat: vi.fn(),
      onInactivityWarning: vi.fn(),
      registerCancel: vi.fn(),
    };
  });

  afterEach(() => {
    killProcessSpy.mockRestore();
    vi.resetAllMocks();
    vi.useRealTimers();
  });

  it("spawns kilo with correct arguments", () => {
    const promise = runKiloStreaming(options);

    // Simulate immediate success
    const closeHandler = mockChild.on.mock.calls.find((c: unknown[]) => c[0] === "close")?.[1];
    if (closeHandler) closeHandler(0, null);

    return promise.then(() => {
      expect(mockSpawn).toHaveBeenCalledWith("kilo", [
        "run", "--auto", "--model", options.model, "--agent", options.agent, options.prompt
      ], expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] }));
    });
  });

  it("spawns kilo with --session when sessionId provided", () => {
    const optionsWithSession = { ...options, sessionId: "session-123" };
    const promise = runKiloStreaming(optionsWithSession);

    const closeHandler = mockChild.on.mock.calls.find((c: unknown[]) => c[0] === "close")?.[1];
    if (closeHandler) closeHandler(0, null);

    return promise.then(() => {
      expect(mockSpawn).toHaveBeenCalledWith("kilo", [
        "run", "--auto", "--model", options.model, "--agent", options.agent, "--session", "session-123", options.prompt
      ], expect.anything());
    });
  });

  it("registers cancel function", () => {
    const promise = runKiloStreaming(options);

    const closeHandler = mockChild.on.mock.calls.find((c: unknown[]) => c[0] === "close")?.[1];
    if (closeHandler) closeHandler(0, null);

    return promise.then(() => {
      expect(options.registerCancel).toHaveBeenCalled();
      const cancel = (options.registerCancel as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(typeof cancel).toBe("function");
    });
  });

  it("sends SIGTERM to the running Kilo process and rejects cancellation", async () => {
    let cancelFn: (() => void) | undefined;
    const promise = runKiloStreaming({
      ...options,
      registerCancel: (cancel) => { cancelFn = cancel; },
    });

    expect(cancelFn).toBeTypeOf("function");
    cancelFn!();
    if (process.platform === "win32") {
      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
    } else {
      // The runner starts a detached process group on Unix and kills the group.
      expect(killProcessSpy).toHaveBeenCalledWith(-mockChild.pid, "SIGTERM");
    }

    const closeHandler = mockChild.on.mock.calls.find((c: unknown[]) => c[0] === "close")?.[1];
    expect(closeHandler).toBeTypeOf("function");
    closeHandler(null, "SIGTERM");
    await expect(promise).rejects.toThrow("interrupted");
  });

  it("rejects on permission rejection in output", () => {
    const promise = runKiloStreaming(options);

    // Simulate stdout with permission rejection
    const stdoutHandler = mockChild.stdout.on.mock.calls.find((c: unknown[]) => c[0] === "data")?.[1];
    if (stdoutHandler) stdoutHandler(Buffer.from("run ended with an auto-rejected permission"));

    const closeHandler = mockChild.on.mock.calls.find((c: unknown[]) => c[0] === "close")?.[1];
    if (closeHandler) closeHandler(0, null);

    return expect(promise).rejects.toThrow("Kilo refused a tool permission");
  });

  it("extracts sessionId from output", () => {
    const promise = runKiloStreaming(options);

    // Simulate stdout with session ID
    const stdoutHandler = mockChild.stdout.on.mock.calls.find((c: unknown[]) => c[0] === "data")?.[1];
    if (stdoutHandler) stdoutHandler(Buffer.from("session: abc-123-def"));

    const closeHandler = mockChild.on.mock.calls.find((c: unknown[]) => c[0] === "close")?.[1];
    if (closeHandler) closeHandler(0, null);

    return promise.then((result) => {
      expect(result.sessionId).toBe("abc-123-def");
    });
  });

  it("rejects on non-zero exit code", () => {
    const promise = runKiloStreaming(options);

    const closeHandler = mockChild.on.mock.calls.find((c: unknown[]) => c[0] === "close")?.[1];
    if (closeHandler) closeHandler(1, null);

    return expect(promise).rejects.toThrow();
  });

  it("resolves on successful exit", () => {
    const promise = runKiloStreaming(options);

    const closeHandler = mockChild.on.mock.calls.find((c: unknown[]) => c[0] === "close")?.[1];
    if (closeHandler) closeHandler(0, null);

    return promise.then((result) => {
      expect(result.output).toBeDefined();
      expect(result.terminatedByInactivity).toBe(false);
    });
  });
});