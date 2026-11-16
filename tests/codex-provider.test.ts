import { beforeEach, afterEach, it, expect, describe, vi } from "vitest";
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { CodexImageGenerationProvider } from "../src/main/services/providers/codexImageGeneration";
import { type SpawnServer } from "../src/main/services/codex/app-server";
import { readGeneratedImage } from "../src/main/services/codex/result-file";
import { ProjectService, hashBytes } from "../src/main/project-service";
import { GenerationClock } from "../src/main/services/generation-clock";
import { GenerationController } from "../src/main/services/generation-controller";
import {
  draftFromAttempt,
  type GenerationDraft,
} from "../src/shared/generation";
import { png } from "./fixtures";
let root: string, service: ProjectService, draft: GenerationDraft;
const thread = "00000000-0000-4000-8000-000000000123";
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-native-test-"));
  const project = path.join(root, "project");
  await fs.mkdir(project);
  service = new ProjectService();
  await service.create(project, "Native");
  await service.command({ type: "addCharacter", name: "Test character" });
  const p = service.snapshot().project;
  const image = await service.stage(png(17, 31), "master.png");
  await service.command({
    type: "confirmMaster",
    characterId: p.selectedCharacterId,
    token: image.token,
  });
  const master = service.snapshot().project.masters[0];
  draft = {
    providerId: "codex-native",
    characterId: master.characterId,
    masterId: master.id,
    masterSha256: master.sha256,
    variantId: p.variants[0].id,
    action: "silent",
    supplementaryInstructions: "",
    basePrompt: "Identity lock with supplied reference.",
    prompt: "Identity lock with supplied reference. Test expression.",
  };
  await fs.mkdir(path.join(root, "generated_images", thread), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, "generated_images", thread, "result.png"),
    png(23, 40),
  );
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
function makeProvider(scenario = "success", timeout = 2000) {
  const launch: SpawnServer = (cwd) =>
    spawn(process.execPath, [path.resolve("tests/support/fake-codex.mjs")], {
      cwd,
      env: {
        ...process.env,
        LACEFRAME_TEST_SCENARIO: scenario,
        LACEFRAME_TEST_ROOT: root,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
  return new CodexImageGenerationProvider({
    launch,
    resultRoot: path.join(root, "generated_images"),
    timeout,
  });
}
async function trace() {
  return (await fs.readFile(path.join(root, "trace.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
}
async function request(provider: CodexImageGenerationProvider) {
  const r = provider.prepare(service.snapshot().project, draft);
  r.referenceAssetPath = await service.masterFile(draft.masterId);
  return r;
}
async function wait(controller: GenerationController) {
  for (let i = 0; i < 1000 && controller.running; i++)
    await new Promise((r) => setTimeout(r, 10));
  expect(controller.running).toBe(false);
}
describe("Codex process, account and capability boundary", () => {
  it.each([
    ["no-auth", "not-authenticated"],
    ["api-key", "not-authenticated"],
    ["no-feature", "unavailable"],
  ])("blocks %s before any image turn", async (scenario, state) => {
    const p = makeProvider(scenario);
    await expect(p.editImage(await request(p))).rejects.toThrow();
    expect(p.status.state).toBe(state);
    expect((await trace()).some((m) => m.method === "turn/start")).toBe(false);
    expect(await fs.readFile(path.join(root, "exits"), "utf8")).toContain(
      "closed",
    );
  });
  it("reports missing Codex without hanging shutdown", async () => {
    const launch: SpawnServer = (cwd) =>
      spawn(path.join(root, "does-not-exist"), [], {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
      });
    const p = new CodexImageGenerationProvider({ launch });
    expect((await p.check()).state).toBe("not-installed");
  });
  it("checks availability without starting a generation and closes the process", async () => {
    const p = makeProvider();
    expect((await p.check()).state).toBe("ready");
    expect(p.getCapabilities()).toMatchObject({
      canGenerate: true,
      supportsReferenceImages: true,
    });
    expect((await trace()).map((m) => m.method)).toEqual([
      "initialize",
      "initialized",
      "account/read",
      "experimentalFeature/list",
    ]);
    expect(await fs.readFile(path.join(root, "exits"), "utf8")).toContain(
      "closed",
    );
  });
  it.each([
    "rpc-error",
    "crash",
    "invalid-protocol",
    "image-failed",
    "turn-failed",
    "missing-image",
    "unsafe-path",
    "duplicate-image",
    "error-retry",
  ])("fails safely for %s and does not retry", async (scenario) => {
    const p = makeProvider(scenario);
    await expect(p.editImage(await request(p))).rejects.toThrow();
    expect(p.status.state).toBe("failed");
    expect(p.status.message).not.toContain("private internal");
    expect(
      (await trace()).filter((m) => m.method === "turn/start"),
    ).toHaveLength(1);
  });
  it("times out and closes a stalled server", async () => {
    const p = makeProvider("hang", 100);
    await expect(p.editImage(await request(p))).rejects.toThrow("Zeitlimit");
    expect(await fs.readFile(path.join(root, "exits"), "utf8")).toContain(
      "closed",
    );
  });
});
describe("native project ingestion", () => {
  it("passes actual localImage bytes and the full saved prompt, preserves master, imports and approves with exact provenance", async () => {
    const p = makeProvider(),
      controller = new GenerationController(service, p);
    await controller.start(draft);
    await wait(controller);
    expect(controller.status().state).toBe("completed");
    const snapshot = service.snapshot(),
      attempt = snapshot.project.attempts[0],
      asset = snapshot.project.assets[0];
    expect(asset).toMatchObject({
      providerId: "codex-native",
      attemptId: attempt.id,
      promptRevisionId: attempt.promptRevision.id,
      masterId: draft.masterId,
      masterSha256: draft.masterSha256,
      width: 23,
      height: 40,
      status: "candidate",
    });
    const calls = await trace(),
      turn = calls.find((m) => m.method === "turn/start");
    expect(turn.params.input[0].text).toContain(draft.prompt);
    expect(turn.params.input[1].type).toBe("localImage");
    expect(turn.params.input[1].path).not.toBe(
      await service.masterFile(draft.masterId),
    );
    expect(
      hashBytes(await fs.readFile(await service.masterFile(draft.masterId))),
    ).toBe(draft.masterSha256);
    await service.command({ type: "review", id: asset.id, status: "approved" });
    const reopened = (await new ProjectService().open(snapshot.directory))
      .project;
    expect(reopened.assets[0].status).toBe("approved");
    expect(reopened.attempts[0].execution).toMatchObject({
      status: "completed",
      endedAt: expect.any(String),
      durationMs: expect.any(Number),
    });
    expect(controller.status().available).toBe(true);
    expect(draftFromAttempt(reopened.attempts[0])).toEqual(draft);
    expect(await fs.readFile(path.join(root, "exits"), "utf8")).toContain(
      "closed",
    );
    await expect(
      service.command({
        type: "importResult",
        attemptId: attempt.id,
        token: randomUUID(),
      }),
    ).rejects.toThrow();
  });
  it("keeps a failed attempt without a fake candidate", async () => {
    const c = new GenerationController(service, makeProvider("image-failed"));
    await c.start(draft);
    await wait(c);
    expect(c.status().state).toBe("failed");
    expect(service.snapshot().project.attempts).toHaveLength(1);
    expect(service.snapshot().project.attempts[0].execution).toMatchObject({
      status: "failed",
      endedAt: expect.any(String),
    });
    expect(c.status().available).toBe(true);
    expect(service.snapshot().project.assets).toHaveLength(0);
  });
  it("rejects concurrent jobs and cancels without importing a late result", async () => {
    const c = new GenerationController(service, makeProvider("hang"));
    await c.start(draft);
    await expect(c.start(draft)).rejects.toThrow("bereits");
    for (let i = 0; i < 100; i++) {
      if (
        (await trace().catch(() => [])).some((m) => m.method === "turn/start")
      )
        break;
      await new Promise((r) => setTimeout(r, 10));
    }
    expect((await c.cancel()).state).toBe("cancelled");
    expect(service.snapshot().project.attempts[0].execution).toMatchObject({
      status: "cancelled",
      endedAt: expect.any(String),
    });
    expect(c.status().available).toBe(true);
    expect(service.snapshot().project.assets).toHaveLength(0);
    expect(await fs.readFile(path.join(root, "exits"), "utf8")).toContain(
      "closed",
    );
  });
  it("reports live monotonic time and actual event stages, then permits explicit repeated generation", async () => {
    let now = 100;
    const c = new GenerationController(
      service,
      makeProvider("delayed", 5000),
      () => new GenerationClock(() => now),
    );
    await c.start(draft);
    for (let i = 0; i < 100 && c.status().phase !== "generating-image"; i++)
      await new Promise((r) => setTimeout(r, 10));
    expect(c.status().phase).toBe("generating-image");
    now = 4100;
    expect(c.status().execution).toMatchObject({
      status: "running",
      durationMs: 4000,
    });
    const disk = await new ProjectService().open(service.snapshot().directory);
    expect(disk.project.attempts[0].execution).toMatchObject({
      status: "running",
    });
    expect(disk.project.assets).toHaveLength(0);
    await wait(c);
    expect(c.status().execution).toMatchObject({
      status: "completed",
      durationMs: 4000,
    });
    now = 99999;
    expect(c.status().execution?.durationMs).toBe(4000);
    await fs.writeFile(path.join(root, "scenario"), "image-failed");
    await c.start(draft);
    await wait(c);
    expect(c.status().state).toBe("failed");
    expect(c.status().available).toBe(true);
    await fs.writeFile(path.join(root, "scenario"), "hang");
    await c.start(draft);
    await c.cancel();
    expect(c.status().state).toBe("cancelled");
    await fs.writeFile(path.join(root, "scenario"), "success");
    await c.start(draft);
    await wait(c);
    expect(c.status().state).toBe("completed");
    expect(
      service.snapshot().project.attempts.map((a) => a.execution?.status),
    ).toEqual(["completed", "failed", "cancelled", "completed"]);
    expect(service.snapshot().project.assets).toHaveLength(2);
  });
  it("does not persist success when the final import fails", async () => {
    const c = new GenerationController(service, makeProvider());
    vi.spyOn(service, "importGeneratedResult").mockImplementationOnce(
      async (_id, _bytes, complete) => {
        complete?.();
        throw new Error("Atomic save failed");
      },
    );
    await c.start(draft);
    await wait(c);
    expect(c.status()).toMatchObject({
      state: "failed",
      available: true,
      execution: { status: "failed" },
    });
    const reopened = await new ProjectService().open(
      service.snapshot().directory,
    );
    expect(reopened.project.attempts[0].execution?.status).toBe("failed");
    expect(reopened.project.assets).toHaveLength(0);
  });
  it("rejects completed metadata without a corresponding imported image", async () => {
    const saved = await service.command({ type: "prepareAttempt", draft });
    await expect(
      service.recordGeneration(saved.project.attempts[0].id, {
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 0,
        status: "completed",
      }),
    ).rejects.toThrow();
  });
  it("does not expose native ingestion as a renderer command", async () => {
    await expect(
      service.command({ type: "importGeneratedResult", path: "/etc/passwd" }),
    ).rejects.toThrow();
  });
});
describe("savedPath validation", () => {
  it("reads a bounded valid image only under the active thread", async () => {
    expect(
      await readGeneratedImage(
        path.join(root, "generated_images", thread, "result.png"),
        thread,
        path.join(root, "generated_images"),
      ),
    ).toEqual(png(23, 40));
  });
  it.each([
    "outside",
    "traversal",
    "relative",
    "wrong-thread",
    "directory",
    "bad-image",
    "symlink",
  ])("rejects %s", async (scenario) => {
    const output = path.join(root, "generated_images", thread, "result.png");
    let input = output;
    if (scenario === "outside") input = path.join(root, "private.png");
    if (scenario === "traversal")
      input =
        path.join(root, "generated_images", thread) +
        "/../" +
        thread +
        "/result.png";
    if (scenario === "relative") input = "result.png";
    if (scenario === "wrong-thread")
      input = path.join(root, "generated_images", randomUUID(), "result.png");
    if (scenario === "directory") {
      await fs.unlink(output);
      await fs.mkdir(output);
    }
    if (scenario === "bad-image") await fs.writeFile(output, "not a png");
    if (scenario === "symlink") {
      await fs.unlink(output);
      await fs.symlink(path.join(root, "private.png"), output);
    }
    await expect(
      readGeneratedImage(input, thread, path.join(root, "generated_images")),
    ).rejects.toThrow();
  });
  it("rejects a symlinked thread directory", async () => {
    await fs.rm(path.join(root, "generated_images", thread), {
      recursive: true,
    });
    await fs.symlink(root, path.join(root, "generated_images", thread));
    await expect(
      readGeneratedImage(
        path.join(root, "generated_images", thread, "result.png"),
        thread,
        path.join(root, "generated_images"),
      ),
    ).rejects.toThrow();
  });
});
