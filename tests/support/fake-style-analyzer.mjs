// Deterministic protocol fixture only. Never used by production or as a model fallback.
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
if (process.argv.includes("generate-json-schema")) {
  const out = process.argv[process.argv.indexOf("--out") + 1];
  fs.mkdirSync(path.join(out, "v2"), { recursive: true });
  fs.writeFileSync(
    path.join(out, "v2", "TurnStartParams.json"),
    JSON.stringify({
      properties: {
        input: { type: "array", items: { $ref: "#/definitions/UserInput" } },
        outputSchema: {},
      },
      definitions: {
        UserInput: {
          oneOf: [
            {
              properties: {
                type: { enum: ["localImage"] },
                path: { type: "string" },
              },
              required: ["type", "path"],
            },
          ],
        },
      },
    }),
  );
  process.exit(0);
}
let scenario = process.env.LACEFRAME_STYLE_SCENARIO;
const root = process.env.LACEFRAME_STYLE_ROOT;
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");
const threadId = "style-fixture-thread";
const event = (method, params) =>
  send({ method, params: { threadId, ...params } });
process.on("exit", () =>
  fs.appendFileSync(path.join(root, "exits"), "closed\n"),
);
process.on("SIGTERM", () => process.exit(0));
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (fs.existsSync(path.join(root, "scenario")))
    scenario = fs.readFileSync(path.join(root, "scenario"), "utf8").trim();
  const message = JSON.parse(line);
  fs.appendFileSync(path.join(root, "trace"), line + "\n");
  if (message.id === undefined) return;
  let result = {};
  if (message.method === "account/read")
    result = {
      account:
        scenario === "no-auth"
          ? null
          : { type: scenario === "api-key" ? "apiKey" : "chatgpt" },
    };
  if (message.method === "model/list")
    result = {
      data: [
        {
          model: "fixture-vision",
          isDefault: true,
          ...(scenario === "no-modalities"
            ? {}
            : {
                inputModalities:
                  scenario === "text-only" ? ["text"] : ["text", "image"],
              }),
        },
      ],
    };
  if (message.method === "thread/start") result = { thread: { id: threadId } };
  if (message.method === "turn/start") {
    send({ id: message.id, result: { turn: { id: "style-turn" } } });
    if (scenario === "hang") return;
    if (scenario === "crash") {
      process.exit(1);
      return;
    }
    if (scenario === "tool") {
      event("item/started", { item: { type: "commandExecution" } });
      return;
    }
    if (scenario === "image-generation") {
      event("item/started", { item: { type: "imageGeneration" } });
      return;
    }
    if (scenario === "retry") {
      event("error", { willRetry: true });
      return;
    }
    const metadata = JSON.parse(message.params.input[0].text);
    const response = {
      version: "lf-semantic-style-v1",
      references: metadata.references.map((r) => ({
        sha256: r.sha256,
        suggestedRole: "general",
      })),
      suggestedName: "Fixture rendering study",
      description: "Deterministic protocol output",
      observations: [],
      interpretations: [],
      limitations: ["Test fixture"],
    };
    if (scenario === "wrong-hash")
      response.references[0].sha256 = "f".repeat(64);
    event("item/completed", {
      item: {
        type: "agentMessage",
        phase: "final_answer",
        text: scenario === "bad-json" ? "not JSON" : JSON.stringify(response),
      },
    });
    event("turn/completed", {
      turn: { status: scenario === "turn-failure" ? "failed" : "completed" },
    });
    return;
  }
  send({ id: message.id, result });
});
