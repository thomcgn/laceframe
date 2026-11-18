import { tr } from "../../../shared/locales/index";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { z } from "zod";

export class CodexError extends Error {
  constructor(
    public readonly kind:
      | "not-installed"
      | "not-authenticated"
      | "unavailable"
      | "failed"
      | "cancelled",
    message: string,
  ) {
    super(message);
  }
}
const envelope = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});
export type SpawnServer = (cwd: string) => ChildProcessWithoutNullStreams;
const launchServer = (cwd: string, images: boolean) => {
  const env = { ...process.env };
  for (const key of [
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_ORG_ID",
    "OPENAI_PROJECT_ID",
  ])
    delete env[key];
  return spawn(
    "codex",
    [
      "app-server",
      "--listen",
      "stdio://",
      "-c",
      'model_provider="openai"',
      "-c",
      'forced_login_method="chatgpt"',
      "-c",
      "features.shell_tool=false",
      ...(images ? [] : ["-c", "features.image_generation=false"]),
      "-c",
      "features.unified_exec=false",
      "-c",
      "features.apps=false",
      "-c",
      "features.hooks=false",
      "-c",
      "features.multi_agent=false",
      "-c",
      "features.multi_agent_v2=false",
      "-c",
      'web_search="disabled"',
    ],
    { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true },
  );
};
export const spawnServer: SpawnServer = cwd => launchServer(cwd, true);
export const spawnAnalysisServer: SpawnServer = cwd => launchServer(cwd, false);
/** Only the documented stdio protocol; no HTTP, credentials or raw diagnostics leave this client. */
export class AppServerClient extends EventEmitter {
  private child: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private buffer = "";
  private stopped = false;
  private failure?: Error;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  constructor(
    cwd: string,
    launch: SpawnServer = spawnServer,
    private timeout = 30000,
  ) {
    super();
    this.child = launch(cwd);
    this.child.stderr.on("data", () => {}); // Can contain account/config data: never log it.
    this.child.stdin.on("error", () =>
      this.fail(new CodexError("failed", tr("common.m235ebb49c0"))),
    );
    this.child.on("error", (e) =>
      this.fail(
        new CodexError(
          (e as NodeJS.ErrnoException).code === "ENOENT"
            ? "not-installed"
            : "failed",
          (e as NodeJS.ErrnoException).code === "ENOENT"
            ? tr("common.mf4e073a872")
            : tr("common.m1126b61e0e"),
        ),
      ),
    );
    this.child.on("exit", () => {
      if (!this.stopped)
        this.fail(new CodexError("failed", tr("common.m7b961d4ef1")));
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      this.buffer += chunk;
      if (this.buffer.length > 16 * 1024 * 1024) {
        this.fail(new CodexError("failed", tr("common.m84e14bad6a")));
        this.child.kill();
        return;
      }
      let index: number;
      while ((index = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 1);
        if (!line.trim()) continue;
        try {
          const msg = envelope.parse(JSON.parse(line));
          if (typeof msg.id === "number" && this.pending.has(msg.id)) {
            const pending = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            clearTimeout(pending.timer);
            if (msg.error)
              pending.reject(
                new CodexError("failed", tr("common.mb35467634a")),
              );
            else pending.resolve(msg.result);
          } else if (msg.id !== undefined) {
            this.send({
              id: msg.id,
              error: {
                code: -32601,
                message: tr("errors.ma4b8270b63"),
              },
            });
          } else if (msg.method)
            this.emit("notification", msg.method, msg.params);
        } catch {
          this.fail(new CodexError("failed", tr("common.m99af0a377f")));
          this.child.kill();
        }
      }
    });
  }
  private fail(error: Error) {
    if (this.failure || this.stopped) return;
    this.failure = error;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.emit("failure", error);
  }
  private send(value: unknown) {
    if (!this.child.stdin.destroyed)
      this.child.stdin.write(JSON.stringify(value) + "\n");
  }
  notify(method: string) {
    this.send({ method });
  }
  request(method: string, params: unknown): Promise<unknown> {
    if (this.failure) return Promise.reject(this.failure);
    if (this.stopped)
      return Promise.reject(
        new CodexError("cancelled", tr("common.m52589e2b31")),
      );
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexError("failed", tr("common.m1b7c5333cb")));
      }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.send({ id, method, params });
    });
  }
  async close() {
    if (this.stopped) return;
    this.stopped = true;
    this.emit("failure", new CodexError("cancelled", tr("common.m52589e2b31")));
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(new CodexError("cancelled", tr("common.m52589e2b31")));
    }
    this.pending.clear();
    this.child.stdin.end();
    await new Promise<void>((resolve) => {
      if (
        this.child.pid === undefined ||
        this.child.exitCode !== null ||
        this.child.signalCode !== null
      ) {
        resolve();
        return;
      }
      const force = setTimeout(() => this.child.kill("SIGKILL"), 1500);
      this.child.once("exit", () => {
        clearTimeout(force);
        resolve();
      });
      this.child.kill("SIGTERM");
    });
    this.removeAllListeners();
  }
}
