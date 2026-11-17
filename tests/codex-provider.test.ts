import { seedHistoricalMaster } from "./historical-master";
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
import { effectiveStyle, referencesForStyle } from "../src/shared/domain";
import { composePrompt } from "../src/shared/generation";
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
  await seedHistoricalMaster(service, image, p.selectedCharacterId);
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
function makeProvider(scenario = "success", timeout = 2000, multiple = true) {
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
    probeReferences: async () => multiple,
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
describe("native separated identity/style references", () => {
  async function styledDraft() {
    await service.command({
      type: "addArtDirection",
      name: "Rendering only",
      renderRules: "Crisp contours",
    });
    const id = service.snapshot().project.defaultArtDirectionId!;
    for (const shade of [80, 180]) {
      const staged = await service.stage(png(12, 16, shade), "style.png");
      await service.command({
        type: "importStyleReference",
        profileId: id,
        token: staged.token,
      });
    }
    const p = service.snapshot().project,
      style = effectiveStyle(p, draft.characterId)!;
    const refs = referencesForStyle(p, style);
    const prompt = composePrompt({
      characterName: p.characters[0].name,
      master: p.masters[0],
      variant: p.variants[0],
      familyLabel: p.families[0].label,
      artDirection: style,
      styleReferences: refs,
      action: "silent",
      supplementaryInstructions: "",
    });
    return {
      ...draft,
      artDirectionId: style.id,
      artDirectionRevision: style.revision,
      styleReferences: refs,
      basePrompt: prompt,
      prompt,
    };
  }
  it("submits one identity followed by two immutable style copies and persists exact provenance", async () => {
    const d = await styledDraft(),
      c = new GenerationController(service, makeProvider());
    await c.start(d);
    await wait(c);
    expect(c.status().state).toBe("completed");
    const turn = (await trace()).find((m) => m.method === "turn/start");
    expect(
      turn.params.input.filter(
        (i: { type: string }) => i.type === "localImage",
      ),
    ).toHaveLength(3);
    expect(path.basename(turn.params.input[1].path)).toBe("master.png");
    expect(path.basename(turn.params.input[2].path)).toBe("style-1.png");
    expect(path.basename(turn.params.input[3].path)).toBe("style-2.png");
    expect(turn.params.input[0].text).toContain("STYLE ONLY");
    expect(service.snapshot().project.attempts[0].styleReferences).toEqual(
      d.styleReferences,
    );
    for (const a of service.snapshot().project.styleAssets)
      expect(
        hashBytes(await fs.readFile(path.join(root, "project", a.file))),
      ).toBe(a.sha256);
  });
  it("blocks unconfirmed multiple images before sending any image turn, then allows master-only", async () => {
    const d = await styledDraft(),
      c = new GenerationController(
        service,
        makeProvider("success", 2000, false),
      );
    await c.start(d);
    await wait(c);
    expect(c.status()).toMatchObject({
      state: "failed",
      multipleReferences: false,
      available: true,
    });
    expect((await trace()).some((m) => m.method === "turn/start")).toBe(false);
    await service.command({
      type: "setCharacterStyle",
      characterId: d.characterId,
      selection: { mode: "master" },
    });
    await c.start(draft);
    await wait(c);
    expect(c.status().state).toBe("completed");
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

describe("native hard-lock attempt snapshots", () => {
  async function maskedDraft() {
    const m = service.snapshot().project.masters[0];
    await service.command({
      type: "saveMask",
      masterId: m.id,
      name: "Native face mask",
      weights: new Uint8Array(m.width * m.height).fill(128),
    });
    const mask = service.snapshot().project.masks[0];
    return {
      ...draft,
      mask: {
        id: mask.id,
        sha256: mask.sha256,
        revision: mask.revision,
        mode: "hard" as const,
      },
    };
  }
  it("passes explicit local-only mask provenance, preserves raw result, and supports another generation", async () => {
    const d = await maskedDraft();
    await fs.writeFile(
      path.join(root, "generated_images", thread, "result.png"),
      png(17, 31, 210),
    );
    const c = new GenerationController(service, makeProvider());
    await c.start(d);
    await wait(c);
    const p = service.snapshot().project,
      raw = p.assets[0];
    expect(p.attempts[0].mask).toEqual(d.mask);
    expect(raw.composite).toBeUndefined();
    const turn = (await trace()).find((m) => m.method === "turn/start");
    expect(
      turn.params.input.filter(
        (i: { type: string }) => i.type === "localImage",
      ),
    ).toHaveLength(1);
    expect(turn.params.input[0].text).toContain('"inpaintingMaskSent":false');
    expect(turn.params.input[0].text).toContain(d.mask.sha256);
    const result = await service.command({
      type: "createComposite",
      rawId: raw.id,
      registrationConfirmed: true,
    });
    expect(result.project.assets[1].composite?.maskId).toBe(d.mask.id);
    expect(result.project.assets[1].status).toBe("candidate");
    await c.start(d);
    await wait(c);
    expect(c.status().state).toBe("completed");
    expect(service.snapshot().project.assets).toHaveLength(3);
    expect(
      (
        await new ProjectService().open(service.snapshot().directory)
      ).project.attempts.map((a) => a.mask),
    ).toEqual([d.mask, d.mask]);
    await c.close();
  });
  it("does not produce raw/composite assets on failure or cancellation with a saved mask", async () => {
    const d = await maskedDraft(),
      c = new GenerationController(service, makeProvider("image-failed"));
    await c.start(d);
    await wait(c);
    expect(c.status().state).toBe("failed");
    await fs.writeFile(path.join(root, "scenario"), "hang");
    await c.start(d);
    await c.cancel();
    expect(c.status().state).toBe("cancelled");
    const reopened = await new ProjectService().open(
      service.snapshot().directory,
    );
    expect(reopened.project.assets).toEqual([]);
    expect(reopened.project.attempts.map((a) => a.execution?.status)).toEqual([
      "failed",
      "cancelled",
    ]);
    expect(reopened.project.attempts.map((a) => a.mask)).toEqual([
      d.mask,
      d.mask,
    ]);
    await c.close();
  });
});
