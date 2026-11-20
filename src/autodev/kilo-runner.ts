import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface KiloStreamingOptions {
  agent: string;
  model: string;
  prompt: string;
  logPath: string;
  inactivityTimeoutMs: number;
  sessionId?: string;
  /** Heartbeat interval for inactivity monitoring. Default 30000ms. Override for testing. */
  heartbeatIntervalMs?: number;
  onOutput: (stream: "stdout" | "stderr", chunk: string) => void;
  onHeartbeat: (silenceMs: number, elapsedMs: number) => void;
  onInactivityWarning: (silenceMs: number) => void;
  registerCancel: (cancel: () => void) => void;
}

export interface KiloResult {
  output: string;
  sessionId: string | null;
  terminatedByInactivity: boolean;
}

/** Starts Kilo without a shell and emits output immediately instead of buffering it.
 *  Supports inactivity monitoring and session resumption via --session flag. */
export function runKiloStreaming(options: KiloStreamingOptions): Promise<KiloResult> {
  return new Promise<KiloResult>((resolve, reject) => {
    fs.mkdirSync(path.dirname(options.logPath), { recursive: true });
    const log = fs.createWriteStream(options.logPath, { flags: "a", mode: 0o600 });
    const detached = process.platform !== "win32";

    // Build kilo command with optional session resumption
    const args = ["run", "--auto", "--model", options.model, "--agent", options.agent];
    if (options.sessionId) {
      args.push("--session", options.sessionId);
    }
    args.push(options.prompt);

    const child = spawn("kilo", args, { stdio: ["ignore", "pipe", "pipe"], detached });
    const childStartTime = Date.now();
    let tail = "";
    let lastOutput = Date.now();
    let finished = false;
    let stopping = false;
    let terminatedByInactivity = false;
    let spawnError: NodeJS.ErrnoException | undefined;
    let forceTimer: NodeJS.Timeout | undefined;
    let inactivityWarningSent = false;

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
      inactivityWarningSent = false; // Reset warning on any output
    };

    child.stdout?.on("data", (data: Buffer) => accept("stdout", data));
    child.stderr?.on("data", (data: Buffer) => accept("stderr", data));

    child.on("error", (error: NodeJS.ErrnoException) => {
      spawnError = error;
      log.write(`[${new Date().toISOString()}] [error] ${error.message}\n`);
    });

    // Heartbeat interval for inactivity monitoring
    const heartbeatInterval = options.heartbeatIntervalMs ?? 30_000;
    const heartbeat = setInterval(() => {
      if (!finished) {
        const silenceMs = Date.now() - lastOutput;
        const elapsedMs = Date.now() - childStartTime;
        options.onHeartbeat(silenceMs, elapsedMs);

        // Inactivity warning at 80% of timeout
        if (!inactivityWarningSent && silenceMs >= options.inactivityTimeoutMs * 0.8) {
          inactivityWarningSent = true;
          options.onInactivityWarning(silenceMs);
        }

        // Terminate on inactivity timeout
        if (silenceMs >= options.inactivityTimeoutMs) {
          terminatedByInactivity = true;
          log.write(`[${new Date().toISOString()}] [status] Inactivity timeout reached (${silenceMs}ms silence)\n`);
          stop();
        }
      }
    }, heartbeatInterval);
    heartbeat.unref();

    child.on("close", (code, signal) => {
      finished = true;
      clearInterval(heartbeat);
      if (forceTimer) clearTimeout(forceTimer);

      const outcome = `Kilo ${options.agent} ${terminatedByInactivity ? "terminated by inactivity" : stopping ? "interrupted" : "exited"}: code=${code ?? "null"}, signal=${signal ?? "none"}`;
      log.end(`[${new Date().toISOString()}] [status] ${outcome}\n`, () => {
        if (spawnError) {
          reject(Object.assign(new Error(outcome, { cause: spawnError }), { code: spawnError.code }));
          return;
        }
        if (terminatedByInactivity || stopping || code !== 0) {
          reject(new Error(`${outcome}. ${tail.slice(-1000)}`));
          return;
        }
        if (/run ended with an auto-rejected permission|user rejected permission/i.test(tail)) {
          reject(new Error("Kilo refused a tool permission"));
          return;
        }

        // Extract session ID from output if present (kilo prints it on startup)
        const sessionIdMatch = tail.match(/session[:\s]+([a-zA-Z0-9-]+)/i);
        const sessionId = sessionIdMatch ? sessionIdMatch[1] : null;

        resolve({ output: tail, sessionId, terminatedByInactivity });
      });
    });
  });
}