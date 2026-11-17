import { beforeEach, afterEach, describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  ProjectService,
  inspectIdentityImage,
} from "../src/main/project-service";
import {
  characterCreationDraftSchema,
  composeCharacterPrompt,
  DEFAULT_COMPOSITION,
  validateCreatorSelection,
} from "../src/shared/character-creation";
import {
  projectSchema,
  commandSchema,
  effectiveStyle,
} from "../src/shared/domain";
import { GenerationController } from "../src/main/services/generation-controller";
import { CodexImageGenerationProvider } from "../src/main/services/providers/codexImageGeneration";
import { supportsMultipleLocalImages } from "../src/main/services/codex/reference-capability";
import { composePrompt } from "../src/shared/generation";
import { png, transparentPng, masterReview } from "./fixtures";
let root: string, dir: string, service: ProjectService;
const thread = "00000000-0000-4000-8000-000000000123";
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-creator-"));
  dir = path.join(root, "project");
  await fs.mkdir(dir);
  service = new ProjectService();
  await service.create(dir, "Synthetic creator");
  await service.command({ type: "addCharacter", name: "Independent identity" });
  await fs.mkdir(path.join(root, "generated_images", thread), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(root, "generated_images", thread, "result.png"),
    transparentPng(41, 53, 200),
  );
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
async function identity(shade = 10) {
  const s = await service.stageIdentity(png(17, 29, shade), "private.png");
  const saved = await service.command({
    type: "importIdentityReference",
    characterId: service.snapshot().project.selectedCharacterId,
    token: s.token,
  });
  return saved.project.identityAssets.at(-1)!;
}
function draft() {
  const p = service.snapshot().project,
    style = p.artDirections[0];
  const settings = {
    characterId: p.selectedCharacterId!,
    identityReferences: p.identityAssets
      .filter((a) => a.characterId === p.selectedCharacterId && !a.removedAt)
      .map((a) => ({ id: a.id, sha256: a.sha256 })),
    identityNotes: "Individual curly short hair",
    artDirectionId: style?.id,
    artDirectionRevision: style?.revision,
    styleReferences: (style?.styleReferenceIds ?? []).map((id) => {
      const a = p.styleAssets.find((a) => a.id === id)!;
      return { id: a.id, sha256: a.sha256 };
    }),
    outfit: "Blue jacket and plain white shirt. No plaid or pendant.",
    composition: DEFAULT_COMPOSITION,
  };
  return characterCreationDraftSchema.parse({
    ...settings,
    operation: "create-character-master",
    prompt: composeCharacterPrompt(p, settings),
  });
}
function controller(scenario = "success", multi = true) {
  const provider = new CodexImageGenerationProvider({
    launch: (cwd) =>
      spawn(process.execPath, [path.resolve("tests/support/fake-codex.mjs")], {
        cwd,
        env: {
          ...process.env,
          LACEFRAME_TEST_ROOT: root,
          LACEFRAME_TEST_SCENARIO: scenario,
        },
        stdio: ["pipe", "pipe", "pipe"],
      }),
    probeReferences: async () => multi,
    resultRoot: path.join(root, "generated_images"),
    timeout: 5000,
  });
  return new GenerationController(service, provider);
}
async function wait(c: GenerationController) {
  for (let i = 0; i < 500 && c.running; i++)
    await new Promise((r) => setTimeout(r, 10));
  expect(c.running).toBe(false);
}
async function style() {
  const r = await service.command({
    type: "addArtDirection",
    name: "Shared rendering only",
    renderRules: "Graphic contours and painted pixel clusters",
    lightingRules: "Noir warm/cool contrast",
  });
  const id = r.project.artDirections[0].id;
  for (const shade of [70, 90]) {
    const s = await service.stage(png(10, 10, shade), "style.png");
    await service.command({
      type: "importStyleReference",
      profileId: id,
      token: s.token,
    });
  }
}
describe("private identity sources and creator validation", () => {
  it("stores an immutable bounded source, verifies hashes and reopens a draft without a master", async () => {
    const a = await identity();
    expect(service.snapshot().project.masters).toEqual([]);
    expect(a.file).toBe(`assets/identities/${a.sha256}.png`);
    expect(await fs.readFile(path.join(dir, a.file))).toEqual(png(17, 29, 10));
    expect((await fs.stat(path.join(dir, a.file))).mode & 0o222).toBe(0);
    expect(await service.preview(a.id)).toContain("data:image/png;base64,");
    expect(
      (await new ProjectService().open(dir)).project.identityAssets,
    ).toEqual([a]);
  });
  it("accepts up to three independent identity references and rejects duplicate/fourth images", async () => {
    await identity();
    await expect(identity()).rejects.toThrow(/bereits/);
    await identity(20);
    await identity(30);
    await expect(identity(40)).rejects.toThrow(/drei/);
    expect(draft().identityReferences).toHaveLength(3);
  });
  it("rejects malformed/oversized images and untrusted paths at the identity boundary", async () => {
    expect(() => inspectIdentityImage(Buffer.from("not an image"))).toThrow();
    expect(() =>
      inspectIdentityImage(new Uint8Array(16 * 1024 * 1024 + 1)),
    ).toThrow(/16 MiB/);
    const b = png();
    b.writeUInt32BE(10000, 16);
    b.writeUInt32BE(10000, 20);
    expect(() => inspectIdentityImage(b)).toThrow(/16 Megapixel/);
    expect(
      commandSchema.safeParse({
        type: "importIdentityReference",
        characterId: randomUUID(),
        token: randomUUID(),
        path: "/etc/passwd",
      }).success,
    ).toBe(false);
  });
  it.each(["hash", "symlink", "traversal", "missing"])(
    "rejects %s identity corruption on reopen",
    async (kind) => {
      const a = await identity(),
        file = path.join(dir, a.file);
      if (kind === "traversal") {
        const p = service.snapshot().project;
        p.identityAssets[0].file = "../private.png";
        await fs.writeFile(path.join(dir, "laceframe.json"), JSON.stringify(p));
      } else {
        await fs.unlink(file);
        if (kind === "hash") await fs.writeFile(file, png());
        if (kind === "symlink") {
          const outside = path.join(root, "external.png");
          await fs.writeFile(outside, png());
          await fs.symlink(outside, file);
        }
      }
      await expect(new ProjectService().open(dir)).rejects.toThrow();
    },
  );
  it("prevents cross-character sources, changed hashes and stale style selections", async () => {
    await identity();
    const d = draft();
    await service.command({ type: "addCharacter", name: "Identity B" });
    await expect(
      service.command({
        type: "prepareCharacterMaster",
        draft: {
          ...d,
          characterId: service.snapshot().project.selectedCharacterId,
        },
      }),
    ).rejects.toThrow(/Identitätsreferenzen/);
    expect(() =>
      validateCreatorSelection(service.snapshot().project, {
        ...d,
        identityReferences: [
          { ...d.identityReferences[0], sha256: "a".repeat(64) },
        ],
      }),
    ).toThrow();
    await style();
    await expect(
      service.command({
        type: "prepareCharacterMaster",
        draft: {
          ...d,
          artDirectionId: service.snapshot().project.artDirections[0].id,
        },
      }),
    ).rejects.toThrow(/Revision/);
  });
  it("physically removes an unused project copy without touching the original, and protects shared copies", async () => {
    const a = await identity();
    const original = path.join(root, "external-original.png");
    await fs.writeFile(original, png(17, 29, 10));
    await service.command({ type: "addCharacter", name: "Second draft" });
    const b = await identity();
    expect(b.file).toBe(a.file);
    await service.command({ type: "removeIdentityReference", id: a.id });
    expect(await fs.readFile(path.join(dir, b.file))).toEqual(png(17, 29, 10));
    await service.command({ type: "removeIdentityReference", id: b.id });
    await expect(fs.stat(path.join(dir, b.file))).rejects.toThrow();
    expect(await fs.readFile(original)).toEqual(png(17, 29, 10));
    expect(
      (await new ProjectService().open(dir)).project.identityAssets,
    ).toEqual([]);
  });
  it("archives referenced sources instead of corrupting historical provenance or allowing future submission", async () => {
    const a = await identity(),
      d = draft();
    await service.command({ type: "prepareCharacterMaster", draft: d });
    await service.command({ type: "removeIdentityReference", id: a.id });
    expect(
      service.snapshot().project.identityAssets[0].removedAt,
    ).toBeDefined();
    expect(await service.preview(a.id)).toContain("data:image/png");
    await expect(
      service.command({ type: "prepareCharacterMaster", draft: d }),
    ).rejects.toThrow(/entfernt/);
    expect(
      (await new ProjectService().open(dir)).project.masterAttempts[0]
        .identityReferences,
    ).toEqual(d.identityReferences);
  });
  it("opens pre-creator v2 unchanged and makes an exclusive exact backup on the first write", async () => {
    const p = service.snapshot().project;
    const legacy = { ...p } as Record<string, unknown>;
    delete legacy.characterCreationVersion;
    delete legacy.identityAssets;
    delete legacy.masterAttempts;
    delete legacy.masterCandidates;
    const bytes = Buffer.from(JSON.stringify(legacy));
    await fs.writeFile(path.join(dir, "laceframe.json"), bytes);
    service = new ProjectService();
    await service.open(dir);
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(bytes);
    await identity();
    expect(
      await fs.readFile(
        path.join(dir, "laceframe.v2.pre-character-creation.backup.json"),
      ),
    ).toEqual(bytes);
    expect(service.snapshot().project.characters).toEqual(p.characters);
  });
});
describe("native createCharacterMaster operation, approval and expression handoff", () => {
  it("creates without any master and transports THREE identities then TWO style-only files with separate trusted roles", async () => {
    await identity();
    await identity(20);
    await identity(30);
    await style();
    const d = draft(),
      c = controller();
    expect(d.prompt).toContain("No approved master exists");
    expect(d.prompt).toContain("OUTFIT DESCRIPTION");
    expect(d.prompt).toContain("Blue jacket");
    await c.start(d);
    await wait(c);
    expect(c.status().state).toBe("completed");
    const p = service.snapshot().project;
    expect(p.masters).toEqual([]);
    expect(p.assets).toEqual([]);
    expect(p.masterCandidates[0]).toMatchObject({
      width: 41,
      height: 53,
      status: "candidate",
      attemptId: p.masterAttempts[0].id,
    });
    expect(p.masterAttempts[0]).toMatchObject({
      identityReferences: d.identityReferences,
      styleReferences: d.styleReferences,
      outfit: d.outfit,
      composition: d.composition,
      execution: { status: "completed" },
      promptRevision: { prompt: d.prompt },
    });
    const trace = (await fs.readFile(path.join(root, "trace.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    const start = trace.find((m) => m.method === "thread/start");
    expect(start.params.developerInstructions).toContain(
      "CREATE CHARACTER MASTER",
    );
    expect(start.params.developerInstructions).not.toContain(
      "sole edit target",
    );
    const images = trace
      .find((m) => m.method === "turn/start")
      .params.input.filter((i: { type: string }) => i.type === "localImage");
    expect(images.map((i: { path: string }) => path.basename(i.path))).toEqual([
      "identity-1.png",
      "identity-2.png",
      "identity-3.png",
      "style-1.png",
      "style-2.png",
    ]);
    for (const i of images) await expect(fs.stat(i.path)).rejects.toThrow(); // temporary private copies removed
    expect(
      (await new ProjectService().open(dir)).project.masterCandidates,
    ).toEqual(p.masterCandidates);
    await c.close();
  });
  it("retains independent candidates after rejection, locks the approved master and starts normal expression/mask workflows", async () => {
    await identity();
    await style();
    const c = controller(),
      d = draft();
    await c.start(d);
    await wait(c);
    let p = service.snapshot().project;
    const first = p.masterCandidates[0];
    await service.command({
      type: "reviewMasterCandidate",
      id: first.id,
      status: "rejected",
    });
    await c.start(d);
    await wait(c);
    p = service.snapshot().project;
    const second = p.masterCandidates[1];
    await service.command({
      type: "reviewMasterCandidate",
      id: second.id,
      status: "approved",
      review: masterReview(second.sha256),
    });
    p = service.snapshot().project;
    const m = p.masters[0];
    expect(m.sha256).toBe(second.sha256);
    expect(m.file).not.toBe(second.file);
    expect(m.locked).toBe(true);
    expect(effectiveStyle(p, m.characterId)?.id).toBe(d.artDirectionId);
    expect(p.outfits[0].notes).toBe(d.outfit);
    expect(p.masterCandidates[0].status).toBe("rejected");
    expect(p.masterCandidates[1].approvedMasterId).toBe(m.id);
    await expect(c.start(d)).rejects.toThrow(/Entwurfsfigur/);
    const source = await service.stage(png(), "replacement.png");
    await expect(
      service.command({
        type: "confirmMaster",
        characterId: m.characterId,
        token: source.token,
      }),
    ).rejects.toThrow(/gesperrt/);
    service.discard(source.token);
    const mask = await service.command({
      type: "saveMask",
      masterId: m.id,
      name: "New face",
      weights: new Uint8Array(m.width * m.height).fill(255),
    });
    expect(mask.project.masks[0].masterId).toBe(m.id);
    const prompt = composePrompt({
      characterName: p.characters[0].name,
      master: m,
      variant: p.variants[0],
      familyLabel: p.families[0].label,
      action: "silent",
      supplementaryInstructions: "",
    });
    await service.command({
      type: "prepareAttempt",
      draft: {
        characterId: m.characterId,
        masterId: m.id,
        masterSha256: m.sha256,
        variantId: p.variants[0].id,
        artDirectionId: d.artDirectionId,
        artDirectionRevision: d.artDirectionRevision,
        styleReferences: d.styleReferences,
        action: "silent",
        providerId: "manual-import",
        supplementaryInstructions: "",
        basePrompt: prompt,
        prompt,
      },
    });
    expect(
      (await new ProjectService().open(dir)).project.attempts[0].masterId,
    ).toBe(m.id);
    await c.close();
  });
  it.each(["image-failed", "no-auth", "no-feature"])(
    "handles %s honestly without generating a master or a fake candidate",
    async (scenario) => {
      await identity();
      const c = controller(scenario);
      await c.start(draft());
      await wait(c);
      const p = (await new ProjectService().open(dir)).project;
      expect(p.masterCandidates).toEqual([]);
      expect(p.masters).toEqual([]);
      expect(p.masterAttempts[0].execution?.status).toBe("failed");
      await c.close();
    },
  );
  it("cancels the shared job, rejects parallel creation and allows an explicit retry", async () => {
    await identity();
    const c = controller("hang"),
      d = draft();
    await c.start(d);
    await expect(c.start(d)).rejects.toThrow(/bereits/);
    await c.cancel();
    expect(c.status().state).toBe("cancelled");
    expect(service.snapshot().project.masterCandidates).toEqual([]);
    await fs.writeFile(path.join(root, "scenario"), "success");
    await c.start(d);
    await wait(c);
    expect(c.status().state).toBe("completed");
    expect(
      service.snapshot().project.masterAttempts.map((a) => a.execution?.status),
    ).toEqual(["cancelled", "completed"]);
    await c.close();
  });
  it("blocks multiple references when unconfirmed and rejects forged candidate references", async () => {
    await identity();
    await identity(20);
    const c = controller("success", false);
    await c.start(draft());
    await wait(c);
    expect(service.snapshot().project.masterCandidates).toEqual([]);
    const trace = await fs.readFile(path.join(root, "trace.jsonl"), "utf8");
    expect(trace).not.toContain('"method":"turn/start"');
    const p = service.snapshot().project;
    p.identityAssets[0].file = "assets/identities/../escape.png";
    expect(projectSchema.safeParse(p).success).toBe(false);
    await c.close();
  });
  it("requires capacity for all nine possible creator images in the schema gate", async () => {
    // Self-contained shape, not dependent on a developer-installed CLI.
    const schema = {
      properties: {
        input: {
          type: "array",
          maxItems: 8,
          items: { $ref: "#/definitions/UserInput" },
        },
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
    expect(supportsMultipleLocalImages(schema)).toBe(false);
    schema.properties.input.maxItems = 9;
    expect(supportsMultipleLocalImages(schema)).toBe(true);
  });
});

it("composes canvas occupancy for the selected framing without forcing a bust crop", async () => {
  await identity();
  const settings = draft();
  settings.composition.framing = "Full body, boots and both hands visible";
  const prompt = composeCharacterPrompt(service.snapshot().project, settings);
  expect(prompt).toContain("Full body, boots and both hands visible");
  expect(prompt).toContain("avoid a tiny figure in a corner");
  expect(prompt).toContain("do not force a bust portrait");
  expect(prompt).toContain("not proof of actual provider output dimensions");
});
