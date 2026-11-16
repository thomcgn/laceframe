// Protocol test double only. Never used by the application or as an AI fallback.
import { setTimeout } from "node:timers";
import readline from "node:readline";
import process from "node:process";
import fs from "node:fs";
import path from "node:path";
// Schema-only capability probe fixture; it never starts a generation.
if (process.argv.includes("generate-json-schema")) {
  const out = process.argv[process.argv.indexOf("--out") + 1];
  fs.mkdirSync(path.join(out, "v2"), { recursive: true });
  const control = path.join(process.env.LACEFRAME_TEST_ROOT, "scenario");
  if (
    fs.existsSync(control) &&
    fs.readFileSync(control, "utf8").trim() === "no-multi"
  ) {
    fs.writeFileSync(path.join(out, "v2", "TurnStartParams.json"), "{}");
    process.exit(0);
  }
  fs.writeFileSync(
    path.join(out, "v2", "TurnStartParams.json"),
    JSON.stringify({
      properties: {
        input: { type: "array", items: { $ref: "#/definitions/UserInput" } },
      },
      definitions: {
        UserInput: {
          oneOf: [
            {
              properties: {
                type: { enum: ["localImage"] },
                path: { type: "string" },
              },
              required: ["path", "type"],
            },
          ],
        },
      },
    }),
  );
  process.exit(0);
}
let scenario = process.env.LACEFRAME_TEST_SCENARIO;
const root = process.env.LACEFRAME_TEST_ROOT;
const thread = "00000000-0000-4000-8000-000000000123";
const trace = path.join(root, "trace.jsonl");
const reply = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const event = (method, params) =>
  reply({ method, params: { threadId: thread, ...params } });
process.on("exit", () => {
  fs.appendFileSync(path.join(root, "exits"), "closed\n");
});
process.on("SIGTERM", () => process.exit(0));
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const control = path.join(root, "scenario");
  if (fs.existsSync(control))
    scenario = fs.readFileSync(control, "utf8").trim();
  const msg = JSON.parse(line);
  fs.appendFileSync(trace, JSON.stringify(msg) + "\n");
  if (!msg.id) return;
  let result = {};
  if (msg.method === "initialize") result = { userAgent: "codex_test/0.162.0" };
  if (msg.method === "account/read")
    result = {
      account:
        scenario === "no-auth"
          ? null
          : { type: scenario === "api-key" ? "apiKey" : "chatgpt" },
    };
  if (msg.method === "experimentalFeature/list")
    result = {
      data: [{ name: "image_generation", enabled: scenario !== "no-feature" }],
    };
  if (msg.method === "model/list")
    result = { data: [{ model: "test-model", isDefault: true }] };
  if (msg.method === "thread/start") result = { thread: { id: thread } };
  if (msg.method === "turn/start") {
    if (scenario === "crash") {
      process.exit(1);
      return;
    }
    if (scenario === "rpc-error") {
      reply({
        id: msg.id,
        error: {
          code: -32000,
          message: "private internal diagnostics must not escape",
        },
      });
      return;
    }
    if (scenario === "invalid-protocol") {
      process.stdout.write("not json\n");
      return;
    }
    result = { turn: { id: "turn-test" } };
    reply({ id: msg.id, result });
    if (scenario === "hang") return;
    if (scenario === "error-retry") {
      event("error", { willRetry: true });
      return;
    }
    event("turn/started", { turn: { id: "turn-test" } });
    if (scenario !== "missing-image") {
      event("item/started", { item: { type: "imageGeneration" } });
      if (scenario === "duplicate-image")
        event("item/started", { item: { type: "imageGeneration" } });
      const complete = () => {
        event("item/completed", {
          item: {
            type: "imageGeneration",
            status: scenario === "image-failed" ? "failed" : "completed",
            failure:
              scenario === "image-failed"
                ? { type: "usageLimitExceeded" }
                : null,
            savedPath:
              scenario === "unsafe-path"
                ? path.join(root, "private.png")
                : path.join(root, "generated_images", thread, "result.png"),
          },
        });
        event("turn/completed", {
          turn: { status: scenario === "turn-failed" ? "failed" : "completed" },
        });
      };
      if (scenario === "delayed") setTimeout(complete, 1800);
      else complete();
      return;
    }
    event("turn/completed", {
      turn: { status: scenario === "turn-failed" ? "failed" : "completed" },
    });
    return;
  }
  if (msg.method === "turn/interrupt")
    event("turn/completed", { turn: { status: "interrupted" } });
  reply({ id: msg.id, result });
});
