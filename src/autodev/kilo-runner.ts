import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface KiloStreamingOptions {
  agent: string;
  model: string;
  prompt: string;
  logPath: string;
  timeoutMs: number;
  onOutput: (stream: "stdout" | "stderr", chunk: string) => void;
  onHeartbeat: (silenceMs: number) => void;
  registerCancel: (cancel: () => void) => void;
}

/** Starts Kilo without a shell and emits output immediately instead of buffering it. */
export function runKiloStreaming(options: KiloStreamingOptions): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    fs.mkdirSync(path.dirname(options.logPath), { recursive: true });
    const log = fs.createWriteStream(options.logPath, { flags: "a", mode: 0o600 });
    const detached = process.platform !== "win32";
    const child = spawn("kilo", ["run", "--auto", "--model", options.model, "--agent", options.agent, options.prompt],
      { stdio: ["ignore", "pipe", "pipe"], detached });
    let tail = "";
    let lastOutput = Date.now();
    let finished = false;
    let stopping = false;
    let timedOut = false;
    let spawnError: NodeJS.ErrnoException | undefined;
    let forceTimer: NodeJS.Timeout | undefined;

    const signalProcess = (signal: NodeJS.Signals): void => {
      try {
        if (detached && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {
        // Child may have already exited.
      }
    };
    const stop = (): void => {
      if (finished || stopping) return;
      stopping = true;
      signalProcess("SIGTERM");
      forceTimer = setTimeout(() => { if (!finished) signalProcess("SIGKILL"); }, 4000);
      forceTimer.unref();
    };
    options.registerCancel(stop);
    const accept = (stream: "stdout" | "stderr", data: Buffer | string): void => {
      const chunk = data.toString();
      lastOutput = Date.now();
      tail = (tail + chunk).slice(-64_000);
      log.write(`[${new Date().toISOString()}] [${stream}] ${chunk}`);
      options.onOutput(stream, chunk);
    };
    child.stdout?.on("data", (data: Buffer) => accept("stdout", data));
    child.stderr?.on("data", (data: Buffer) => accept("stderr", data));
    child.on("error", (error: NodeJS.ErrnoException) => {
      spawnError = error;
      log.write(`[${new Date().toISOString()}] [error] ${error.message}\n`);
    });
    const heartbeat = setInterval(() => {
      if (!finished) options.onHeartbeat(Date.now() - lastOutput);
    }, 30_000);
    heartbeat.unref();
    const timeout = setTimeout(() => { timedOut = true; stop(); }, options.timeoutMs);
    timeout.unref();

    child.on("close", (code, signal) => {
      finished = true;
      clearInterval(heartbeat);
      clearTimeout(timeout);
      if (forceTimer) clearTimeout(forceTimer);
      const outcome = `Kilo ${options.agent} ${timedOut ? "timed out" : stopping ? "interrupted" : "exited"}: code=${code ?? "null"}, signal=${signal ?? "none"}`;
      log.end(`[${new Date().toISOString()}] [status] ${outcome}\n`, () => {
        if (spawnError) { reject(Object.assign(new Error(outcome, { cause: spawnError }), { code: spawnError.code })); return; }
        if (timedOut || stopping || code !== 0) {
          reject(new Error(`${outcome}. ${tail.slice(-1000)}`));
          return;
        }
        if (/run ended with an auto-rejected permission|user rejected permission/i.test(tail)) {
          reject(new Error("Kilo refused a tool permission"));
          return;
        }
        resolve(tail);
      });
    });
  });
}
