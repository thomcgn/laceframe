import { beforeEach, afterEach, it, expect } from "vitest";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CodexStyleAnalysisProvider } from "../src/main/services/providers/codexStyleAnalysis";
import { hashBytes } from "../src/main/project-service";
import { supportsSemanticImages } from "../src/main/services/codex/reference-capability";
import { png } from "./fixtures";
let root: string;
const providers: CodexStyleAnalysisProvider[] = [];
beforeEach(async () => {
  root = await fs.mkdtemp(
    path.join(os.tmpdir(), "laceframe-semantic-fixture-"),
  );
});
afterEach(async () => {
  for (const provider of providers.splice(0)) await provider.dispose();
  await fs.rm(root, { recursive: true, force: true });
});
function provider(scenario = "success", probe = true, timeout = 2000) {
  const p = new CodexStyleAnalysisProvider({
    launch: (cwd) =>
      spawn(
        process.execPath,
        [path.resolve("tests/support/fake-style-analyzer.mjs")],
        {
          cwd,
          env: {
            ...process.env,
            LACEFRAME_STYLE_SCENARIO: scenario,
            LACEFRAME_STYLE_ROOT: root,
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      ),
    probe: async () => probe,
    timeout,
  });
  providers.push(p);
  return p;
}
const images = () =>
  [50, 100].map((shade) => {
    const bytes = png(8, 8, shade);
    return {
      bytes: new Uint8Array(bytes),
      sha256: hashBytes(bytes),
      format: "png" as const,
    };
  });
async function trace() {
  try {
    return (await fs.readFile(path.join(root, "trace"), "utf8"))
      .trim()
      .split("\n")
      .map((s) => JSON.parse(s));
  } catch {
    return [];
  }
}
async function done(p: CodexStyleAnalysisProvider) {
  for (let i = 0; i < 500 && p.running; i++)
    await new Promise((r) => setTimeout(r, 10));
  expect(p.running).toBe(false);
  return p.status;
}
it.each(["no-auth", "api-key", "text-only", "no-modalities"])(
  "refuses %s before any inference turn",
  async (scenario) => {
    const p = provider(scenario);
    p.start(images());
    expect((await done(p)).state).toMatch(/not-authenticated|unavailable/);
    expect((await trace()).some((m) => m.method === "turn/start")).toBe(false);
  },
);
it("requires installed schema support and permits metadata check with zero turns", async () => {
  const denied = provider("success", false);
  expect((await denied.check()).state).toBe("unavailable");
  const ready = provider();
  expect(await ready.check()).toMatchObject({
    state: "ready",
    model: "fixture-vision",
  });
  expect((await trace()).some((m) => m.method === "turn/start")).toBe(false);
  expect(
    (await fs.readFile(path.join(root, "exits"), "utf8")).trim().split("\n"),
  ).toHaveLength(2);
});
it("sends ordered read-only references and structured schema, accepts text result and removes temp files", async () => {
  const p = provider(),
    originals = images();
  p.start(originals);
  const result = await done(p);
  expect(result).toMatchObject({
    state: "completed",
    result: { provider: "codex-native", model: "fixture-vision" },
  });
  expect(result.result!.result.references.map((r) => r.sha256)).toEqual(
    originals.map((i) => i.sha256),
  );
  const messages = await trace(),
    turn = messages.find((m) => m.method === "turn/start");
  expect(messages.filter((m) => m.method === "turn/start")).toHaveLength(1);
  expect(turn.params.outputSchema.properties.version).toBeDefined();
  expect(
    turn.params.input.slice(1).map((i: { type: string }) => i.type),
  ).toEqual(["localImage", "localImage"]);
  for (const input of turn.params.input.slice(1))
    await expect(fs.stat(input.path)).rejects.toThrow();
  const thread = messages.find((m) => m.method === "thread/start");
  expect(thread.params).toMatchObject({
    ephemeral: true,
    sandbox: "read-only",
    approvalPolicy: "never",
    modelProvider: "openai",
  });
  expect(originals[0].sha256).toBe(hashBytes(originals[0].bytes));
});
it.each([
  "bad-json",
  "wrong-hash",
  "tool",
  "image-generation",
  "retry",
  "crash",
  "turn-failure",
])("rejects %s without a retry or raw diagnostics", async (scenario) => {
  const p = provider(scenario);
  p.start(images());
  expect(await done(p)).toMatchObject({
    state: "failed",
    message: "styleCreator.semanticFailed",
  });
  expect((await trace()).filter((m) => m.method === "turn/start")).toHaveLength(
    1,
  );
});
it("times out and can start another controlled operation", async () => {
  const p = provider("hang", true, 100);
  p.start(images());
  expect((await done(p)).state).toBe("failed");
  expect((await p.check()).state).toBe("ready");
});
it("cancels, rejects concurrency and closes process before returning", async () => {
  const p = provider("hang");
  p.start(images());
  expect(() => p.start(images())).toThrow();
  for (
    let i = 0;
    i < 100 && !(await trace()).some((m) => m.method === "turn/start");
    i++
  )
    await new Promise((r) => setTimeout(r, 10));
  expect((await p.cancel()).state).toBe("cancelled");
  expect(p.running).toBe(false);
  expect(await fs.readFile(path.join(root, "exits"), "utf8")).toContain(
    "closed",
  );
});
it("schema transport requires localImage array and structured output capability", () => {
  expect(supportsSemanticImages({})).toBe(false);
  const schema = {
    properties: {
      input: {
        type: "array",
        maxItems: 6,
        items: { $ref: "#/definitions/UserInput" },
      },
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
            required: ["path", "type"],
          },
        ],
      },
    },
  };
  expect(supportsSemanticImages(schema)).toBe(true);
  expect(
    supportsSemanticImages({
      ...schema,
      properties: {
        ...schema.properties,
        input: { ...schema.properties.input, maxItems: 1 },
      },
    }),
  ).toBe(false);
});

it("reports missing Codex executable without any inference", async () => {
  const p = new CodexStyleAnalysisProvider({
    launch: (cwd) =>
      spawn(path.join(root, "absent-codex"), [], {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      }),
    probe: async () => true,
  });
  providers.push(p);
  expect((await p.check()).state).toBe("not-installed");
  expect(await trace()).toEqual([]);
});
