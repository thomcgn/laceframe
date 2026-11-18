import { seedHistoricalMaster } from "./historical-master";
import { DEFAULT_COMPOSITION } from "../src/shared/character-creation";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_LIGHT,
  relightPixels,
  relightInputSchema,
  MAX_RELIGHT_PIXELS,
  type LightRegion,
} from "../src/shared/relighting";
import {
  encodePixels,
  decodePixels,
  maskWeights,
} from "../src/main/mask-composite";
import { ProjectService, hashBytes } from "../src/main/project-service";
import { projectSchema } from "../src/shared/domain";
const pixels = (width = 16, height = 16) => ({
  width,
  height,
  data: Uint8Array.from({ length: width * height * 4 }, (_, i) =>
    i % 4 === 3 ? 255 : 100,
  ),
});
const light = {
  ...DEFAULT_LIGHT,
  intensity: 0.8,
  shadows: 0.4,
  temperature: 0.3,
  highlights: 0.2,
  contrast: 1.1,
};
const region = (count = 256): LightRegion => ({
  id: randomUUID(),
  name: "Manuell Haut",
  role: "skin",
  revision: 1,
  light,
  weights: new Uint8Array(count).fill(255),
});
describe("canonical relighting pixels", () => {
  it("neutral settings are exact and source is immutable, including hidden transparent RGB", () => {
    const p = pixels();
    p.data[3] = 0;
    p.data[7] = 1;
    p.data[11] = 128;
    const copy = new Uint8Array(p.data);
    expect(relightPixels(p, DEFAULT_LIGHT).data).toEqual(copy);
    const r = relightPixels(p, light);
    expect(p.data).toEqual(copy);
    for (let i = 0; i < 256; i++)
      expect(r.data[i * 4 + 3]).toBe(copy[i * 4 + 3]);
    expect(r.data.slice(0, 4)).toEqual(copy.slice(0, 4));
    expect(r.data).not.toEqual(copy);
  });
  it("changes direction, temperature, ambient, shadows, contrast and highlights with finite bounded channels", () => {
    const p = pixels();
    for (const v of [
      { direction: 0 },
      { direction: 180 },
      { temperature: -1 },
      { temperature: 1 },
      { ambient: 0.5 },
      { shadows: 1 },
      { contrast: 2 },
      { highlights: 1 },
    ]) {
      const a = relightPixels(p, { ...light, ...v });
      expect(a.data).not.toEqual(relightPixels(p, light).data);
      expect([...a.data].every(Number.isInteger)).toBe(true);
    }
    const a = relightPixels(p, { ...DEFAULT_LIGHT, temperature: 1 });
    expect(a.data[0]).toBeGreaterThan(a.data[2]);
  });
  it("uses point samples and quantized lighting bands without new coordinates, smoothing or alpha edits", () => {
    const p = pixels(128, 1);
    const r = relightPixels(p, {
      ...DEFAULT_LIGHT,
      intensity: 1,
      pixelArt: true,
      direction: 0,
      levels: 4,
    });
    expect(
      new Set(Array.from({ length: 128 }, (_, i) => r.data[i * 4])).size,
    ).toBeLessThanOrEqual(4);
    expect(r.width).toBe(128);
    for (let i = 0; i < 128; i++) expect(r.data[i * 4 + 3]).toBe(255);
  });
  it("regions affect only manually weighted pixels, soft weights round deterministically and overlap order is explicit", () => {
    const p = pixels();
    const r = region();
    r.weights.fill(0);
    r.weights[3] = 128;
    r.weights[4] = 255;
    const a = relightPixels(p, DEFAULT_LIGHT, [r]);
    expect(a.data.slice(0, 12)).toEqual(p.data.slice(0, 12));
    const full = relightPixels(p, light);
    for (let c = 0; c < 3; c++)
      expect(a.data[12 + c]).toBe(
        Math.round((100 * 127 + full.data[12 + c] * 128) / 255),
      );
    expect(relightPixels(p, DEFAULT_LIGHT, [r]).data).toEqual(a.data);
    const dark = { ...region(), light: { ...DEFAULT_LIGHT, ambient: 0.3 } };
    expect(relightPixels(p, DEFAULT_LIGHT, [r, dark]).data).not.toEqual(
      relightPixels(p, DEFAULT_LIGHT, [dark, r]).data,
    );
  });
  it("rejects unsupported geometry/NaN/out-of-range values and malformed/oversize masks", () => {
    expect(() =>
      relightPixels(pixels(), { ...light, intensity: NaN }),
    ).toThrow();
    expect(() => relightPixels(pixels(), light, [region(1)])).toThrow();
    expect(() =>
      relightPixels(
        { width: MAX_RELIGHT_PIXELS + 1, height: 1, data: new Uint8Array() },
        light,
      ),
    ).toThrow();
    expect(
      relightInputSchema.safeParse({
        sourceId: randomUUID(),
        light: { ...light, normals: [] },
        regions: [],
        previewPixelSha256: "a".repeat(64),
      }).success,
    ).toBe(false);
  });
  it("bounds large-image work and memory to 4MP, producing one output buffer without touching input", () => {
    const p = pixels(2048, 2048);
    const before = p.data[0];
    const start = performance.now();
    const r = relightPixels(p, light);
    expect(r.data.byteLength).toBe(16_777_216);
    expect(p.data[0]).toBe(before);
    expect(r.data).not.toBe(p.data);
    expect(performance.now() - start).toBeLessThan(10000);
    console.log(
      "Relighting 4MP canonical CPU ms",
      Math.round(performance.now() - start),
    );
  });
});
let root: string, dir: string, s: ProjectService;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-relight-"));
  dir = path.join(root, "project");
  await fs.mkdir(dir);
  s = new ProjectService();
  await s.create(dir, "Relight synthetic");
  await s.command({ type: "addCharacter", name: "Synthetic" });
  const p = pixels();
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 16; j++)
      if (!i || !j || i === 15 || j === 15) p.data[(i * 16 + j) * 4 + 3] = 0;
  p.data[(8 * 16 + 8) * 4 + 3] = 128;
  const staged = await s.stage(encodePixels(p), "master.png");
  await seedHistoricalMaster(
    s,
    staged,
    s.snapshot().project.selectedCharacterId,
  );
  await approveCutout(s.snapshot().project.masters.at(-1)!.id);
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
async function approveCutout(id: string) {
  const source = await s.cutoutSource(id);
  await s.command({
    type: "createCutout",
    sourceId: id,
    name: "Reviewed fixture cutout",
    weights: new Uint8Array(source.width * source.height).fill(255),
  });
  await review();
  return s.snapshot().project.qualityAssets.at(-1)!;
}
async function derive(
  id = s.snapshot().project.masters.at(-1)!.id,
  regions: LightRegion[] = [],
) {
  const p = await s.relightSource(id);
  return s.command({
    type: "createRelighting",
    sourceId: id,
    sourceSha256: p.sha256,
    light,
    regions: regions.map((r) => ({ ...r, weights: new Uint8Array(r.weights) })),
    previewPixelSha256: hashBytes(relightPixels(p, light, regions).data),
  });
}
const review = async () =>
  s.command({
    type: "reviewQuality",
    id: s.snapshot().project.qualityAssets.at(-1)!.id,
    status: "approved",
    notes: "Identity, silhouette and alpha reviewed manually",
    confirmStyleAndSilhouette: true,
    rasterConfirmed: true,
  });
describe("relighting project lifecycle", () => {
  it("rejects an unapproved master candidate before cutout/review, retaining its sources", async () => {
    await s.command({ type: "addCharacter", name: "Draft identity" });
    const c = s.snapshot().project.selectedCharacterId!;
    const st = await s.stageIdentity(encodePixels(pixels()), "identity.png");
    await s.command({
      type: "importIdentityReference",
      characterId: c,
      token: st.token,
    });
    const identity = s.snapshot().project.identityAssets[0];
    await s.command({
      type: "prepareCharacterMaster",
      draft: {
        operation: "create-character-master",
        characterId: c,
        identityReferences: [{ id: identity.id, sha256: identity.sha256 }],
        identityNotes: "",
        styleReferences: [],
        outfit: "Simple jacket",
        composition: DEFAULT_COMPOSITION,
        prompt: "Synthetic fixture only",
      },
    });
    const a = s.snapshot().project.masterAttempts[0],
      now = new Date().toISOString();
    await s.recordGeneration(a.id, {
      status: "running",
      startedAt: now,
      durationMs: 0,
    });
    const output = await fs.readFile(
      path.join(dir, s.snapshot().project.masters.at(-1)!.file),
    );
    await s.importMasterGeneration(a.id, output, () => ({
      status: "completed",
      startedAt: now,
      endedAt: new Date().toISOString(),
      durationMs: 1,
    }));
    const candidate = s.snapshot().project.masterCandidates[0];
    const before = s.snapshot().project;
    await expect(derive(candidate.id)).rejects.toThrow(/Freistellung/);
    expect(s.snapshot().project).toEqual(before);
    expect(
      s.snapshot().project.characters.find((x) => x.id === c)?.masterId,
    ).toBeUndefined();
    expect(s.snapshot().project.identityAssets[0]).toEqual(identity);
  });

  it("keeps hard-lock protected pixels exact and rejects a raw/derived bypass", async () => {
    const p = s.snapshot().project,
      m = p.masters.at(-1)!,
      weights = new Uint8Array(256);
    weights[8 * 16 + 8] = 255;
    await s.command({
      type: "saveMask",
      masterId: m.id,
      weights,
      name: "Centre edit permission",
    });
    const mask = s.snapshot().project.masks[0];
    await s.command({
      type: "prepareAttempt",
      draft: {
        characterId: m.characterId,
        masterId: m.id,
        masterSha256: m.sha256,
        variantId: p.variants[0].id,
        action: "silent",
        supplementaryInstructions: "",
        basePrompt: "Saved",
        prompt: "Saved",
        providerId: "manual-import",
        mask: {
          id: mask.id,
          sha256: mask.sha256,
          revision: mask.revision,
          mode: "hard",
        },
      },
    });
    const staged = await s.stage(encodePixels(pixels()), "raw.png");
    await s.command({
      type: "importResult",
      attemptId: s.snapshot().project.attempts[0].id,
      token: staged.token,
    });
    const raw = s.snapshot().project.assets[0];
    await expect(derive(raw.id)).rejects.toThrow(/Freistellung/);
    await s.command({
      type: "createComposite",
      rawId: raw.id,
      registrationConfirmed: true,
    });
    const composite = s.snapshot().project.assets[1];
    await approveCutout(composite.id);
    const approvedComposite = s.snapshot().project.assets.at(-1)!;
    await expect(derive(approvedComposite.id)).rejects.toThrow(
      "schützt diese Pixel",
    );
    const r = { ...region(), weights };
    const source = await s.relightSource(approvedComposite.id);
    const out = relightPixels(source, DEFAULT_LIGHT, [r]);
    await s.command({
      type: "createRelighting",
      sourceId: approvedComposite.id,
      sourceSha256: source.sha256,
      light: DEFAULT_LIGHT,
      regions: [{ ...r, weights: new Uint8Array(weights) }],
      previewPixelSha256: hashBytes(out.data),
    });
    const q = s
        .snapshot()
        .project.qualityAssets.filter((q) => q.operation === "relighting")[0],
      actual = decodePixels(await fs.readFile(path.join(dir, q.file)));
    for (let i = 0; i < 256; i++)
      if (!weights[i])
        expect([...actual.data.slice(i * 4, i * 4 + 4)]).toEqual([
          ...source.data.slice(i * 4, i * 4 + 4),
        ]);
    await review();
    expect(s.snapshot().project.assets.at(-1)?.masterId).toBe(m.id);
  });

  it("reads/updates previews without writes, rejects stale hashes and preserves existing open projects byte-exactly", async () => {
    const file = path.join(dir, "laceframe.json"),
      before = await fs.readFile(file);
    const id = s.snapshot().project.masters.at(-1)!.id;
    for (let i = 0; i < 3; i++)
      relightPixels(await s.relightSource(id), { ...light, intensity: i });
    expect(await fs.readFile(file)).toEqual(before);
    await expect(
      s.command({
        type: "createRelighting",
        sourceId: id,
        sourceSha256: s.snapshot().project.masters.at(-1)!.sha256,
        light,
        regions: [],
        previewPixelSha256: "0".repeat(64),
      }),
    ).rejects.toThrow("veraltet");
    expect(await fs.readFile(file)).toEqual(before);
    await new ProjectService().open(dir);
    expect(await fs.readFile(file)).toEqual(before);
  });
  it("persists exact PNG preview pixels, source hash, immutable mask revisions and independent candidate/approval/master versions", async () => {
    const m = s.snapshot().project.masters.at(-1)!,
      original = await fs.readFile(path.join(dir, m.file)),
      before = await fs.readFile(path.join(dir, "laceframe.json"));
    const r = region();
    r.weights[0] = 0;
    await derive(m.id, [r]);
    const q = s
      .snapshot()
      .project.qualityAssets.filter((q) => q.operation === "relighting")[0];
    expect(q.status).toBe("candidate");
    expect(s.snapshot().project.masters).toHaveLength(2);
    expect(q.sourceSha256).toBe(m.sha256);
    expect(q.relighting?.algorithm).toBe("2d-rgba8-lut-v1");
    expect(
      hashBytes(decodePixels(await fs.readFile(path.join(dir, q.file))).data),
    ).toBe(q.relighting!.pixelSha256);
    expect(
      await fs.readFile(
        path.join(dir, "laceframe.v2.pre-relighting.backup.json"),
      ),
    ).toEqual(before);
    const recipe = await s.relightRecipe(q.id);
    expect(recipe.weights[0]).toEqual(r.weights);
    const reopened = new ProjectService();
    const manifest = await fs.readFile(path.join(dir, "laceframe.json"));
    await reopened.open(dir);
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(
      manifest,
    );
    expect(await reopened.relightRecipe(q.id)).toEqual(recipe);
    await review();
    expect(s.snapshot().project.masters).toHaveLength(3);
    expect(s.snapshot().project.masters[2].qualitySourceId).toBe(q.id);
    const exported = await s.exportPayload({
      id: s.snapshot().project.masters[2].id,
      raw: false,
      provenance: true,
    });
    expect(exported.bytes).toEqual(await fs.readFile(path.join(dir, q.file)));
    expect(
      JSON.parse(exported.provenance!).derivatives.find(
        (q: { operation: string }) => q.operation === "relighting",
      ).relighting.pixelSha256,
    ).toBe(q.relighting!.pixelSha256);
    expect(await fs.readFile(path.join(dir, m.file))).toEqual(original);
    await derive(q.id);
    expect(s.snapshot().project.qualityAssets).toHaveLength(3);
    expect(
      s
        .snapshot()
        .project.qualityAssets.filter((q) => q.operation === "relighting")[0]
        .relighting?.regions[0].revision,
    ).toBe(1);
  });
  it("promotes an expression derivative only after human review and retains its original master and old bytes", async () => {
    const p = s.snapshot().project,
      m = p.masters.at(-1)!;
    const staged = await s.stage(
      await fs.readFile(path.join(dir, m.file)),
      "expression.png",
    );
    await s.command({
      type: "importCandidate",
      characterId: m.characterId,
      variantId: p.variants[0].id,
      action: "silent",
      token: staged.token,
    });
    const source = s.snapshot().project.assets[0];
    await approveCutout(source.id);
    await derive(s.snapshot().project.assets.at(-1)!.id);
    expect(s.snapshot().project.assets).toHaveLength(2);
    await review();
    const a = s.snapshot().project.assets[2];
    expect(a.masterId).toBe(m.id);
    expect(a.status).toBe("approved");
    expect(a.qualitySourceId).toBe(
      s
        .snapshot()
        .project.qualityAssets.filter((q) => q.operation === "relighting")[0]
        .id,
    );
    expect(s.snapshot().project.assets[0]).toEqual(source);
  });
  it("validates duplicate/foreign/reused masks and rejects paths, corrupt masks, PNG data and forged pixel provenance on reopen", async () => {
    const m = s.snapshot().project.masters.at(-1)!;
    await expect(
      derive(m.id, [region(), { ...region(), id: "not-uuid" }]),
    ).rejects.toThrow();
    const r = region();
    await expect(derive(m.id, [r, r])).rejects.toThrow("Doppelte");
    await expect(
      derive(m.id, [
        {
          ...r,
          reusedExpressionMask: {
            id: randomUUID(),
            sha256: "a".repeat(64),
            revision: 1,
          },
        },
      ]),
    ).rejects.toThrow("Bearbeitungsmaske");
    await derive(m.id, [r]);
    const p = s.snapshot().project,
      q = p.qualityAssets.filter((q) => q.operation === "relighting")[0];
    const forged = structuredClone(p);
    forged.qualityAssets.find(
      (q) => q.operation === "relighting",
    )!.relighting!.regions[0].mask.file = "../../etc/passwd";
    expect(projectSchema.safeParse(forged).success).toBe(false);
    await fs.chmod(path.join(dir, q.relighting!.regions[0].mask.file), 0o644);
    await fs.writeFile(
      path.join(dir, q.relighting!.regions[0].mask.file),
      "broken",
    );
    await expect(new ProjectService().open(dir)).rejects.toThrow();
  });
  it("reuses expression masks explicitly without changing their edit-permission meaning or hashes", async () => {
    const m = s.snapshot().project.masters.at(-1)!,
      weights = new Uint8Array(256).fill(255);
    await s.command({
      type: "saveMask",
      masterId: m.id,
      weights,
      name: "Edit permission",
    });
    const mask = s.snapshot().project.masks[0];
    const r = {
      ...region(),
      weights,
      reusedExpressionMask: {
        id: mask.id,
        sha256: mask.sha256,
        revision: mask.revision,
      },
    };
    await derive(m.id, [r]);
    expect(s.snapshot().project.masks[0]).toEqual(mask);
    const recipe = await s.relightRecipe(
      s
        .snapshot()
        .project.qualityAssets.filter((q) => q.operation === "relighting")[0]
        .id,
    );
    expect(recipe.recipe.regions[0].mask.type).toBe("lighting-weight");
    expect(
      maskWeights(decodePixels(await fs.readFile(path.join(dir, mask.file)))),
    ).toEqual(weights);
    r.weights[0] = 0;
    await expect(derive(m.id, [r])).rejects.toThrow("verändert");
  });
});
