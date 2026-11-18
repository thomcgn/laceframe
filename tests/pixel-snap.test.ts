import { randomUUID } from "node:crypto";
import { correctColors } from "../src/shared/color-consistency";
import { quantizeToPalette } from "../src/shared/pixel-snap-runtime";
import { SNAP_WASM_BASE64 } from "../src/shared/pixel-snap-wasm";
import { GenerationClock } from "../src/main/services/generation-clock";
import {
  characterCreationDraftSchema,
  DEFAULT_COMPOSITION,
  composeCharacterPrompt,
} from "../src/shared/character-creation";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ProjectService, hashBytes } from "../src/main/project-service";
import { encodePixels, decodePixels } from "../src/main/mask-composite";
import { seedHistoricalMaster } from "./historical-master";
import {
  analyzeSnap,
  snapPixels,
  applyPixelEdit,
  MAX_SNAP_PIXELS,
  type PixelEdit,
} from "../src/shared/pixel-snap";
import { commandSchema, projectSchema } from "../src/shared/domain";
import { lab, rgbHex } from "../src/shared/color-consistency";
const settings = {
  grid: 4,

  strength: "gentle" as const,
};
function fixture(w = 32, h = 24) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 4; y < h - 4; y++)
    for (let x = 4; x < w - 4; x++)
      data.set(
        (Math.floor(x / 4) + Math.floor(y / 4)) % 2
          ? [130, 90, 70, 255]
          : [40, 70, 90, 255],
        (y * w + x) * 4,
      );
  data.set([55, 85, 105, 255], (5 * w + 5) * 4); // small off-grid antialias fragment
  data.set([0, 0, 0, 255], (6 * w + 6) * 4); // contrasting eye/detail must survive
  data.set([199, 100, 22, 73], (4 * w + 4) * 4);
  data.set([9, 8, 7, 0], 0);
  return { width: w, height: h, data };
}
const snap: PixelEdit = { kind: "snap", settings };
describe("native grid cleanup", () => {
  it("processes a full 4 MP native RGBA canvas within the WASM memory cap", () => {
    const data = new Uint8Array(2048 * 2048 * 4);
    for (let i = 0; i < data.length; i += 4) data.set([80, 60, 50, 255], i);
    data.set([100, 80, 70, 255], (5 * 2048 + 5) * 4);
    const p = { width: 2048, height: 2048, data };
    const start = performance.now();
    const out = snapPixels(
      p,
      { grid: 8, strength: "gentle" },
      new Uint8Array(2048 * 2048),
    );
    expect(out.width).toBe(2048);
    expect(out.height).toBe(2048);
    expect(out.changed).toBe(1);
    expect(data[(5 * 2048 + 5) * 4]).toBe(100);
    console.log(
      `PX-01 4 MP Rust WASM cleanup: ${Math.round(performance.now() - start)} ms; no resize`,
    );
  });

  it("runs upstream Rust raster and optional palette mapping independently with no host imports", () => {
    const p = fixture(),
      original = new Uint8Array(p.data);
    const cleaned = snapPixels(p, settings, new Uint8Array(p.width * p.height));
    const quantized = quantizeToPalette(p, new Uint8Array([10, 20, 30]));
    expect(cleaned.data).not.toEqual(quantized.data);
    expect(
      quantized.data.slice((5 * p.width + 5) * 4, (5 * p.width + 5) * 4 + 3),
    ).toEqual(new Uint8Array([10, 20, 30]));
    expect(p.data).toEqual(original);
    const bytes = Uint8Array.from(atob(SNAP_WASM_BASE64), (c) =>
      c.charCodeAt(0),
    );
    expect(WebAssembly.Module.imports(new WebAssembly.Module(bytes))).toEqual(
      [],
    );
  });

  it("cleans suitable off-grid close RGBs without resizing, blur, palette mapping or alpha edits", () => {
    const p = fixture(),
      copy = new Uint8Array(p.data),
      out = snapPixels(p, settings, new Uint8Array(32 * 24));
    expect(out.width).toBe(p.width);
    expect(out.height).toBe(p.height);
    expect(out.changed).toBeGreaterThan(0);
    expect(out.data.slice((5 * 32 + 5) * 4, (5 * 32 + 5) * 4 + 4)).toEqual(
      new Uint8Array([40, 70, 90, 255]),
    );
    expect(out.data.slice((6 * 32 + 6) * 4, (6 * 32 + 6) * 4 + 4)).toEqual(
      new Uint8Array([0, 0, 0, 255]),
    );
    for (let i = 0; i < 32 * 24; i++) {
      expect(out.data[i * 4 + 3]).toBe(copy[i * 4 + 3]);
      if (copy[i * 4 + 3] !== 255)
        expect(out.data.slice(i * 4, i * 4 + 4)).toEqual(
          copy.slice(i * 4, i * 4 + 4),
        );
    }
    const palette = new Set(
      Array.from({ length: 32 * 24 }, (_, i) =>
        rgbHex(copy.subarray(i * 4, i * 4 + 3)),
      ),
    );
    for (let i = 0; i < 32 * 24; i++)
      expect(palette.has(rgbHex(out.data.subarray(i * 4, i * 4 + 3)))).toBe(
        true,
      );
    expect(p.data).toEqual(copy);
    expect(snapPixels(p, settings, new Uint8Array(32 * 24)).data).toEqual(
      out.data,
    );
  });
  it("retains protected pixels and leaves ambiguous strong details unchanged", () => {
    const p = fixture(),
      protection = new Uint8Array(32 * 24);
    protection[5 * 32 + 5] = 1;
    const out = snapPixels(p, settings, protection);
    expect(out.data).toEqual(p.data);
    expect(out.ambiguous).toBeGreaterThan(0);
  });
  it("analysis is read-only, detects phase evidence and admits uncertain grids", () => {
    const p = fixture(64, 64),
      copy = new Uint8Array(p.data),
      a = analyzeSnap(p);
    expect(a.grid).toBe(4);
    expect(a.partialAlpha).toBe(1);
    expect(p.data).toEqual(copy);
    expect(
      analyzeSnap({ width: 16, height: 16, data: new Uint8Array(1024) }).grid,
    ).toBeUndefined();
  });
  it("manual grid, partial cells and stronger cleanup are deterministic without cropping", () => {
    const p = fixture(31, 23),
      s = { ...settings, strength: "strong" as const };
    const out = snapPixels(p, s, new Uint8Array(31 * 23));
    expect(out.data.length).toBe(p.data.length);
    expect(out).toEqual(snapPixels(p, s, new Uint8Array(31 * 23)));
  });
  it("rejects invalid buffers, grids and oversized images rather than resampling", () => {
    expect(() =>
      snapPixels(fixture(), { ...settings, grid: 0 }, new Uint8Array(768)),
    ).toThrow();
    expect(() => snapPixels(fixture(), settings, new Uint8Array(1))).toThrow();
    expect(() =>
      analyzeSnap({
        width: MAX_SNAP_PIXELS + 1,
        height: 1,
        data: new Uint8Array(),
      }),
    ).toThrow("Keine Skalierung");
  });
  it("reuses selective Lab offsets, preserving shades, alpha, protection and outside pixels", () => {
    const p = {
      width: 5,
      height: 1,
      data: new Uint8Array(
        [
          [90, 70, 60, 255],
          [120, 100, 90, 255],
          [155, 135, 125, 128],
          [50, 90, 100, 255],
          [123, 0, 0, 0],
        ].flat(),
      ),
    };
    const edit: PixelEdit = {
      kind: "color",
      rule: {
        sourceColor: "#78645a",
        targetColor: "#806060",
        strength: 0.7,
        tolerance: 50,
        correctLightness: false,
      },
      weights: new Uint8Array([255, 255, 255, 0, 255]),
    };
    const protection = new Uint8Array([0, 1, 0, 0, 0]),
      out = applyPixelEdit(p, edit, protection);
    for (const i of [1, 3, 4])
      expect(out.data.slice(i * 4, i * 4 + 4)).toEqual(
        p.data.slice(i * 4, i * 4 + 4),
      );
    for (const i of [0, 2]) {
      expect(out.data[i * 4 + 3]).toBe(p.data[i * 4 + 3]);
      expect(
        Math.abs(
          lab(rgbHex(out.data.subarray(i * 4, i * 4 + 3)))[0] -
            lab(rgbHex(p.data.subarray(i * 4, i * 4 + 3)))[0],
        ),
      ).toBeLessThan(0.6);
    }
  });
});
let root: string,
  dir: string,
  s: ProjectService,
  masterId: string,
  sourceId: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-px01-"));
  dir = path.join(root, "project");
  await fs.mkdir(dir);
  s = new ProjectService();
  await s.create(dir, "Synthetic pixel pipeline");
  await s.command({ type: "addCharacter", name: "Pixel fixture" });
  const staged = await s.stage(encodePixels(fixture()), "master.png");
  await seedHistoricalMaster(
    s,
    staged,
    s.snapshot().project.selectedCharacterId,
  );
  masterId = s.snapshot().project.masters[0].id;
  const image = await s.stage(encodePixels(fixture()), "expression.png");
  await s.command({
    type: "importCandidate",
    characterId: s.snapshot().project.selectedCharacterId,
    variantId: s.snapshot().project.variants[0].id,
    action: "silent",
    token: image.token,
  });
  sourceId = s.snapshot().project.assets[0].id;
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
async function imageBytes(id: string) {
  const p = s.snapshot().project;
  const a = [
    ...p.masters,
    ...p.assets,
    ...p.masterCandidates,
    ...p.qualityAssets,
  ].find((a) => a.id === id)!;
  return fs.readFile(path.join(dir, a.file));
}
async function save(
  id: string,
  edit: PixelEdit = snap,
  protection?: Uint8Array,
) {
  const p = await s.pixelEditSource(id),
    protectedWeights = protection ?? p.protectedWeights,
    out = applyPixelEdit(p, edit, protectedWeights);
  return s.command({
    type: "createPixelEdit",
    sourceId: id,
    sourceSha256: p.sha256,
    previewPixelSha256: hashBytes(out.data),
    edit,
    protectedWeights,
  });
}
describe("safe project pixel pipeline", () => {
  const raster: PixelEdit = {
    kind: "raster",
    settings: {
      width: 8,
      height: 6,
      sampling: "dominant",
      offsetX: 0,
      offsetY: 0,
      alpha: "binary",
      colors: 8,
    },
  };
  it("reuses a pre-raster snapshot after another edit and restart when adopting an Expression", async () => {
    const backup = path.join(dir, "laceframe.v2.pre-raster-target.backup.json");
    const before = await fs.readFile(path.join(dir, "laceframe.json")),
      master = await imageBytes(masterId),
      original = await imageBytes(sourceId);
    await fs.writeFile(backup, before, { flag: "wx" });
    await s.command({ type: "addCharacter", name: "Unrelated edit" });
    await s.open(dir);
    await save(sourceId, raster);
    const q = s.snapshot().project.qualityAssets.at(-1)!;
    expect(q.sourceId).toBe(sourceId);
    expect(q.characterId).toBe(s.snapshot().project.assets[0].characterId);
    expect(q.status).toBe("candidate");
    expect([q.width, q.height]).toEqual([8, 6]);
    expect(await fs.readFile(backup)).toEqual(before);
    await s.open(dir);
    expect(await imageBytes(sourceId)).toEqual(original);
    expect(await imageBytes(masterId)).toEqual(master);
  });
  it("keeps one original backup when snapping a Master then an Expression and regenerating", async () => {
    await save(masterId, raster);
    const backup = path.join(dir, "laceframe.v2.pre-raster-target.backup.json"),
      before = await fs.readFile(backup);
    await s.open(dir);
    await save(sourceId, raster);
    await save(sourceId, raster);
    expect(s.snapshot().project.qualityAssets.map((q) => q.sourceId)).toEqual([
      masterId,
      sourceId,
      sourceId,
    ]);
    expect(await fs.readFile(backup)).toEqual(before);
  });
  it("does not let a failed review's pending migration block Expression Pixel Snap", async () => {
    await save(masterId, raster);
    const q = s.snapshot().project.qualityAssets.at(-1)!;
    const backup = path.join(dir, "laceframe.v2.pre-raster-review.backup.json");
    await fs.writeFile(backup, "conflicting review snapshot");
    await expect(
      s.command({
        type: "reviewQuality",
        id: q.id,
        status: "approved",
        notes: "Review blocked",
        confirmStyleAndSilhouette: true,
        rasterConfirmed: true,
      }),
    ).rejects.toThrow("pre-raster-review");
    expect(s.snapshot().project.qualityAssets.at(-1)!.status).toBe("candidate");
    await save(sourceId, raster);
    expect(s.snapshot().project.qualityAssets).toHaveLength(2);
    expect(await fs.readFile(backup, "utf8")).toBe(
      "conflicting review snapshot",
    );
    await s.open(dir);
  });
  it.each(["corrupt", "foreign", "symlink"])(
    "rejects a %s raster backup without poisoning later commands",
    async (kind) => {
      const backup = path.join(
          dir,
          "laceframe.v2.pre-raster-target.backup.json",
        ),
        file = path.join(dir, "laceframe.json");
      const before = await fs.readFile(file);
      const raw = JSON.parse(before.toString());
      if (kind === "foreign") raw.id = randomUUID();
      if (kind === "symlink") {
        const target = path.join(root, "outside.json");
        await fs.writeFile(target, before);
        await fs.symlink(target, backup);
      } else
        await fs.writeFile(
          backup,
          kind === "corrupt" ? "other" : JSON.stringify(raw),
        );
      const archive = await fs.readFile(backup);
      await expect(save(sourceId, raster)).rejects.toThrow();
      expect(await fs.readFile(file)).toEqual(before);
      await s.command({ type: "addCharacter", name: "Safe unrelated change" });
      await expect(save(sourceId, raster)).rejects.toThrow();
      expect(await fs.readFile(backup)).toEqual(archive);
      expect(s.snapshot().project.qualityAssets).toHaveLength(0);
    },
  );

  it("saves exact target raster preview, rejects stale hash, backs up, reopens and approves without source changes", async () => {
    const source = await s.pixelEditSource(sourceId),
      original = await imageBytes(sourceId);
    const before = await fs.readFile(path.join(dir, "laceframe.json"));
    const edit: PixelEdit = {
      kind: "raster",
      settings: {
        width: 8,
        height: 6,
        sampling: "dominant",
        offsetX: 0,
        offsetY: 0,
        alpha: "binary",
        colors: 8,
      },
    };
    const out = applyPixelEdit(source, edit, source.protectedWeights);
    await expect(
      s.command({
        type: "createPixelEdit",
        sourceId,
        sourceSha256: source.sha256,
        edit,
        protectedWeights: source.protectedWeights,
        previewPixelSha256: "0".repeat(64),
      }),
    ).rejects.toThrow();
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(before);
    await save(sourceId, edit);
    expect(
      await fs.readFile(
        path.join(dir, "laceframe.v2.pre-raster-target.backup.json"),
      ),
    ).toEqual(before);
    const q = s.snapshot().project.qualityAssets.at(-1)!;
    expect(q.pixelEdit!.algorithm).toBe("laceframe-raster-spritefusion-v1");
    expect([q.width, q.height]).toEqual([8, 6]);
    expect(new Uint8Array(decodePixels(await imageBytes(q.id)).data)).toEqual(
      out.data,
    );
    expect(q.status).toBe("candidate");
    const saved = await fs.readFile(path.join(dir, "laceframe.json"));
    await s.open(dir);
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(saved);
    expect((await s.pixelEditSource(q.id)).protectedWeights.length).toBe(48);
    await s.command({
      type: "reviewQuality",
      id: q.id,
      status: "approved",
      notes: "Exact raster reviewed",
      confirmStyleAndSilhouette: true,
      rasterConfirmed: true,
    });
    expect(s.snapshot().project.assets.at(-1)!.qualitySourceId).toBe(q.id);
    await s.open(dir);
    expect(await imageBytes(sourceId)).toEqual(original);
  });

  it("stores exact original-engine PNG at its new dimensions, preserves legacy recipes, reopens and approves explicitly", async () => {
    const source = await s.pixelEditSource(sourceId),
      original = await imageBytes(sourceId);
    const edit: PixelEdit = {
      kind: "spritefusion",
      settings: { colors: 8, pixelSize: 4 },
    };
    const out = applyPixelEdit(source, edit, source.protectedWeights);
    expect(out.width).not.toBe(source.width);
    const previousManifest = await fs.readFile(
      path.join(dir, "laceframe.json"),
    );
    await save(sourceId, edit);
    expect(
      await fs.readFile(
        path.join(dir, "laceframe.v2.pre-spritefusion.backup.json"),
      ),
    ).toEqual(previousManifest);
    const q = s.snapshot().project.qualityAssets.at(-1)!;
    expect(q.pixelEdit!.algorithm).toBe("spritefusion-original-wasm-v1");
    expect(q.width).toBe(out.width);
    expect(q.height).toBe(out.height);
    expect(await imageBytes(q.id)).toEqual(Buffer.from(out.png!));
    expect(await imageBytes(sourceId)).toEqual(original);
    const unchanged = await fs.readFile(path.join(dir, "laceframe.json"));
    await s.open(dir);
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(
      unchanged,
    );
    // Source-sized zero masks must not be confused with the smaller output canvas.
    expect((await s.pixelEditSource(q.id)).protectedWeights.length).toBe(
      q.width * q.height,
    );
    await s.command({
      type: "reviewQuality",
      id: q.id,
      status: "approved",
      notes: "Original engine geometry reviewed",
      confirmStyleAndSilhouette: true,
      rasterConfirmed: true,
    });
    expect(s.snapshot().project.assets.at(-1)!.qualitySourceId).toBe(q.id);
    await s.open(dir);
    expect(await imageBytes(sourceId)).toEqual(original);
  });
  it("rejects original-engine jobs with explicit/inherited protection atomically and binds recipe versions", async () => {
    const p = await s.pixelEditSource(sourceId),
      mask = new Uint8Array(p.width * p.height);
    mask[5 * p.width + 5] = 255;
    await save(sourceId, snap, mask); // historical in-place algorithm remains reproducible
    const q = s.snapshot().project.qualityAssets.at(-1)!;
    const unchanged = await fs.readFile(path.join(dir, "laceframe.json"));
    await expect(
      save(q.id, { kind: "spritefusion", settings: { colors: 8 } }),
    ).rejects.toThrow("Schutzmasken");
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(
      unchanged,
    );
    const bad = structuredClone(s.snapshot().project);
    bad.qualityAssets.at(-1)!.pixelEdit!.algorithm =
      "spritefusion-original-wasm-v1";
    expect(projectSchema.safeParse(bad).success).toBe(false);
  });

  it("also inherits existing Palette Lock color protection without reinterpreting foreground masks", async () => {
    const m = s.snapshot().project.masters[0],
      mp = await s.analysisSource(m.id),
      regionId = randomUUID();
    const weights = new Uint8Array(mp.width * mp.height).fill(255);
    await s.command({
      type: "saveMasterPalette",
      masterId: m.id,
      masterSha256: m.sha256,
      regions: [
        {
          id: regionId,
          name: "Explicit fixture region",
          role: "custom",
          weights,
        },
      ],
    });
    const palette = s.snapshot().project.masterPalettes[0],
      src = await s.analysisSource(sourceId),
      protectedWeights = new Uint8Array(weights.length);
    protectedWeights[5 * mp.width + 5] = 255;
    const d = {
      paletteId: palette.id,
      alignmentConfirmed: true as const,
      regions: [
        {
          paletteRegionId: regionId,
          sourceColor: "#825a46",
          targetColor: palette.regions[0].colors[0].hex,
          strength: 0,
          tolerance: 25,
          correctLightness: false,
          weights,
        },
      ],
      protectedWeights,
    };
    await s.command({
      type: "createColorCorrection",
      sourceId,
      sourceSha256: src.sha256,
      previewPixelSha256: hashBytes(correctColors(src, d).data),
      ...d,
    });
    const q = s.snapshot().project.qualityAssets.at(-1)!;
    expect((await s.pixelEditSource(q.id)).protectedWeights).toEqual(
      protectedWeights,
    );
    await expect(
      save(q.id, snap, new Uint8Array(weights.length)),
    ).rejects.toThrow("Originalpixelschutz");
  });

  it("processes a pending Character Creator result and keeps final Master activation explicit", async () => {
    const p = s.snapshot().project,
      c = p.characters[0],
      m = p.masters[0];
    const identity = await s.stageIdentity(
      encodePixels(fixture()),
      "synthetic-identity.png",
    );
    await s.command({
      type: "importIdentityReference",
      characterId: c.id,
      token: identity.token,
    });
    const i = s.snapshot().project.identityAssets[0];
    const settings = {
      characterId: c.id,
      mode: "rebuild" as const,
      baseMasterId: m.id,
      baseMasterSha256: m.sha256,
      identityReferences: [{ id: i.id, sha256: i.sha256 }],
      styleReferences: [],
      identityNotes: "Synthetic fixture",
      outfit: "Blue",
      composition: DEFAULT_COMPOSITION,
    };
    const draft = characterCreationDraftSchema.parse({
      ...settings,
      operation: "create-character-master",
      prompt: composeCharacterPrompt(s.snapshot().project, settings),
    });
    await s.command({ type: "prepareCharacterMaster", draft });
    const attempt = s.snapshot().project.masterAttempts[0],
      clock = new GenerationClock();
    await s.recordGeneration(attempt.id, clock.snapshot());
    await s.importMasterGeneration(attempt.id, encodePixels(fixture()), () =>
      clock.stamp("completed"),
    );
    const candidate = s.snapshot().project.masterCandidates[0];
    await save(candidate.id);
    const q = s.snapshot().project.qualityAssets.at(-1)!;
    expect(s.snapshot().project.characters[0].masterId).toBe(masterId);
    expect(candidate.status).toBe("candidate");
    await s.command({
      type: "reviewQuality",
      id: q.id,
      status: "approved",
      notes: "Synthetic new master checked",
      confirmStyleAndSilhouette: true,
      rasterConfirmed: true,
    });
    expect(s.snapshot().project.masters.at(-1)?.qualitySourceId).toBe(q.id);
    await s.open(dir);
  });
  it("enforces hard Expression protection before and after compositing", async () => {
    const p = s.snapshot().project,
      m = p.masters[0],
      weights = new Uint8Array(m.width * m.height);
    weights[5 * m.width + 5] = 255;
    await s.command({
      type: "saveMask",
      masterId: m.id,
      name: "Allowed edit",
      weights,
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
        basePrompt: "Synthetic",
        prompt: "Synthetic",
        providerId: "manual-import",
        mask: {
          id: mask.id,
          sha256: mask.sha256,
          revision: mask.revision,
          mode: "hard",
        },
      },
    });
    const a = s.snapshot().project.attempts.at(-1)!,
      raw = await s.stage(encodePixels(fixture()), "raw.png");
    await s.command({
      type: "importResult",
      attemptId: a.id,
      token: raw.token,
    });
    const rawId = s.snapshot().project.assets.at(-1)!.id;
    await expect(s.pixelEditSource(rawId)).rejects.toThrow("Hard Lock");
    await s.command({
      type: "createComposite",
      rawId,
      registrationConfirmed: true,
    });
    const id = s.snapshot().project.assets.at(-1)!.id;
    const src = await s.pixelEditSource(id);
    expect(src.protectedWeights[0]).toBe(255);
    expect(src.protectedWeights[5 * m.width + 5]).toBe(0);
    await expect(
      save(id, snap, new Uint8Array(weights.length)),
    ).rejects.toThrow("Originalpixelschutz");
    await save(id);
  });

  it("opens older projects without writes and analysis/abandon creates no assets", async () => {
    const before = await fs.readFile(path.join(dir, "laceframe.json"));
    await s.open(dir);
    await s.pixelEditSource(masterId);
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(before);
    expect(s.snapshot().project.qualityAssets).toEqual([]);
  });
  it("persists separate snap/color revisions, reopens and promotes Expression only explicitly", async () => {
    const old = structuredClone(s.snapshot().project.assets[0]),
      original = await imageBytes(sourceId);
    await save(sourceId);
    const a = s.snapshot().project.qualityAssets[0];
    expect(a.status).toBe("candidate");
    expect(s.snapshot().project.assets).toEqual([old]);
    const p = await s.pixelEditSource(a.id),
      edit: PixelEdit = {
        kind: "color",
        rule: {
          sourceColor: "#825a46",
          targetColor: "#805050",
          strength: 0.8,
          tolerance: 30,
          correctLightness: false,
        },
        weights: new Uint8Array(p.width * p.height).fill(255),
      };
    await save(a.id, edit);
    const b = s.snapshot().project.qualityAssets[1];
    expect(b.sourceId).toBe(a.id);
    expect(new Uint8Array(decodePixels(await imageBytes(b.id)).data)).toEqual(
      applyPixelEdit(p, edit, p.protectedWeights).data,
    );
    await s.open(dir);
    expect(s.snapshot().project.qualityAssets[1]).toEqual(b);
    await s.command({
      type: "reviewQuality",
      id: b.id,
      status: "approved",
      notes: "Synthetic checked",
      confirmStyleAndSilhouette: true,
      rasterConfirmed: true,
    });
    expect(s.snapshot().project.assets[1]).toMatchObject({
      masterId: old.masterId,
      qualitySourceId: b.id,
      status: "approved",
    });
    expect(await imageBytes(sourceId)).toEqual(original);
    expect(await imageBytes(s.snapshot().project.assets[1].id)).toEqual(
      await imageBytes(b.id),
    );
  });
  it("supports separate Master versions without overwriting historic bytes", async () => {
    const before = structuredClone(s.snapshot().project.masters[0]);
    await save(masterId);
    const q = s.snapshot().project.qualityAssets[0];
    expect(s.snapshot().project.masters).toEqual([before]);
    await s.command({
      type: "reviewQuality",
      id: q.id,
      status: "approved",
      notes: "Pixel master reviewed",
      confirmStyleAndSilhouette: true,
      rasterConfirmed: true,
    });
    expect(s.snapshot().project.masters[0]).toEqual(before);
    expect(s.snapshot().project.masters[1].version).toBe(2);
    expect(s.snapshot().project.assets[0].masterId).toBe(masterId);
    await s.open(dir);
  });
  it("rejects stale preview, changed source hashes, invalid protection and malformed IPC atomically", async () => {
    const before = await fs.readFile(path.join(dir, "laceframe.json")),
      p = await s.pixelEditSource(sourceId);
    for (const cmd of [
      {
        sourceSha256: "0".repeat(64),
        previewPixelSha256: "0".repeat(64),
        protectedWeights: p.protectedWeights,
      },
      {
        sourceSha256: p.sha256,
        previewPixelSha256: "0".repeat(64),
        protectedWeights: p.protectedWeights,
      },
      {
        sourceSha256: p.sha256,
        previewPixelSha256: hashBytes(p.data),
        protectedWeights: new Uint8Array(1),
      },
    ])
      await expect(
        s.command({ type: "createPixelEdit", sourceId, edit: snap, ...cmd }),
      ).rejects.toThrow();
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(before);
    expect((s as unknown as { staged?: unknown }).staged).toBeUndefined();
    expect(
      commandSchema.safeParse({
        type: "createPixelEdit",
        sourceId: "../../private",
        edit: snap,
      }).success,
    ).toBe(false);
  });
  it("retains inherited protection and rejects tampered recipe/mask paths on reopen", async () => {
    const p = await s.pixelEditSource(sourceId),
      protection = new Uint8Array(p.width * p.height);
    protection[5 * p.width + 5] = 255;
    await save(sourceId, snap, protection);
    const q = s.snapshot().project.qualityAssets[0],
      next = await s.pixelEditSource(q.id);
    expect(next.protectedWeights).toEqual(protection);
    await expect(
      save(q.id, snap, new Uint8Array(protection.length)),
    ).rejects.toThrow("Originalpixelschutz");
    const bad = structuredClone(s.snapshot().project);
    bad.qualityAssets[0].pixelEdit!.protectedMask.file = "../mask.png";
    expect(projectSchema.safeParse(bad).success).toBe(false);
    const file = path.join(dir, q.file);
    await fs.chmod(file, 0o644);
    await fs.writeFile(file, encodePixels(fixture(31, 23)));
    await expect(s.open(dir)).rejects.toThrow();
  });
});
