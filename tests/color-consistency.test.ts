import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  correctColors,
  extractPalette,
  measureColors,
  lab,
  MAX_COLOR_PIXELS,
  type ColorDraft,
  type ColorPixels,
} from "../src/shared/color-consistency";
import { ProjectService, hashBytes } from "../src/main/project-service";
import { encodePixels, decodePixels } from "../src/main/mask-composite";
import { seedHistoricalMaster } from "./historical-master";
import { commandSchema, projectSchema } from "../src/shared/domain";
const pixels = (colors: number[][]): ColorPixels => ({
  width: colors.length,
  height: 1,
  data: new Uint8Array(colors.flatMap((c) => [...c, 255])),
});
const full = (p: ColorPixels) => new Uint8Array(p.width * p.height).fill(255);
const rule = (
  p: ColorPixels,
  sourceColor = "#986f55",
  targetColor = "#76523e",
): ColorDraft => ({
  paletteId: randomUUID(),
  alignmentConfirmed: true,
  protectedWeights: new Uint8Array(p.width * p.height),
  regions: [
    {
      paletteRegionId: randomUUID(),
      weights: full(p),
      sourceColor,
      targetColor,
      tolerance: 50,
      strength: 1,
      correctLightness: false,
    },
  ],
});
describe("regional Lab color consistency", () => {
  it("uses D65 Lab and measured chromatic distances, not a similarity percentage", () => {
    expect(lab("#ffffff")[0]).toBeCloseTo(100, 3);
    expect(lab("#000000")).toEqual([0, 0, 0]);
    const p = pixels([[150, 40, 30]]),
      r = measureColors(p, full(p), [{ hex: "#287545" }]);
    expect(r.warning).toBe(true);
    expect(r.chromaticDeltaE76).toBeGreaterThan(12);
  });
  it.each([
    ["hair", [125, 125, 125], "#202020"],
    ["skin", [210, 150, 100], "#b58580"],
    ["clothes", [40, 80, 180], "#a03040"],
  ] as const)("detects %s drift", (_role, rgb, reference) => {
    const p = pixels([[...rgb]]),
      m = measureColors(p, full(p), [{ hex: reference }]);
    expect(m.warning).toBe(true);
  });
  it("allows additional dark neutral shading and retains gradients/details instead of palette snapping", () => {
    const shades = pixels([
      [10, 10, 10],
      [40, 40, 40],
      [80, 80, 80],
    ]);
    expect(
      measureColors(shades, full(shades), [{ hex: "#808080" }]).warning,
    ).toBe(false);
    const p = pixels([
        [100, 80, 70],
        [130, 110, 100],
        [170, 150, 140],
      ]),
      d = rule(p, "#826e64", "#806060"),
      out = correctColors(p, d);
    expect(new Set([0, 4, 8].map((k) => out.data[k])).size).toBe(3);
    const before = [0, 4, 8].map(
      (k) =>
        lab(
          "#" +
            [...p.data.slice(k, k + 3)]
              .map((v) => v.toString(16).padStart(2, "0"))
              .join(""),
        )[0],
    );
    const after = [0, 4, 8].map(
      (k) =>
        lab(
          "#" +
            [...out.data.slice(k, k + 3)]
              .map((v) => v.toString(16).padStart(2, "0"))
              .join(""),
        )[0],
    );
    after.forEach((l, i) => expect(Math.abs(l - before[i])).toBeLessThan(0.5));
  });
  it("corrects light hair only by explicit L* offset and preserves dark-light spacing", () => {
    const p = pixels([
        [100, 100, 100],
        [140, 140, 140],
      ]),
      d = rule(p, "#8c8c8c", "#505050");
    expect(correctColors(p, d).data).toEqual(p.data);
    d.regions[0].correctLightness = true;
    const out = correctColors(p, d);
    expect(out.data[0]).toBeLessThan(p.data[0]);
    expect(out.data[4]).toBeLessThan(p.data[4]);
    expect(out.data[4]).toBeGreaterThan(out.data[0]);
  });
  it("preserves protected/hidden/partial-alpha pixels and unselected color groups exactly", () => {
    const p = pixels([
      [160, 110, 80],
      [160, 110, 80],
      [160, 110, 80],
      [20, 40, 200],
    ]);
    p.data[7] = 0;
    p.data[11] = 128;
    const before = new Uint8Array(p.data),
      d = rule(p, "#a06e50", "#80503c");
    d.protectedWeights[0] = 1;
    d.regions[0].tolerance = 8;
    const out = correctColors(p, d);
    expect(out.data.slice(0, 8)).toEqual(before.slice(0, 8));
    expect(out.data.slice(12)).toEqual(before.slice(12));
    expect(out.data[11]).toBe(128);
    expect(out.data.slice(8, 11)).not.toEqual(before.slice(8, 11));
    expect(p.data).toEqual(before);
  });
  it("preserves strength-zero/soft-mask behavior and bounds a real 1 MP correction", () => {
    const p = portrait(1024, 1024, 150),
      d = rule(p, "#969696", "#646464");
    d.regions[0].correctLightness = true;
    d.regions[0].weights[1025] = 128;
    const started = performance.now(),
      out = correctColors(p, d);
    console.log(
      "Color correction 1 MP ms",
      Math.round(performance.now() - started),
    );
    expect(out.data.byteLength).toBe(4194304);
    expect(out.data[1025 * 4]).toBeGreaterThan(out.data[1026 * 4]);
    expect(p.data[1025 * 4]).toBe(150);
    d.regions[0].strength = 0;
    expect(correctColors(p, d).data).toEqual(p.data);
  });
  it("bounds work, excludes empty regions and rejects overlaps, malformed masks and implicit registration", () => {
    const p = pixels([[100, 100, 100]]),
      d = rule(p);
    expect(() => extractPalette(p, new Uint8Array(1))).toThrow("sichtbaren");
    expect(() =>
      correctColors(p, {
        ...d,
        alignmentConfirmed: false,
      } as unknown as ColorDraft),
    ).toThrow();
    expect(() =>
      correctColors(p, { ...d, protectedWeights: new Uint8Array(2) }),
    ).toThrow("Abmessungen");
    expect(() =>
      correctColors(p, { ...d, regions: [d.regions[0], d.regions[0]] }),
    ).toThrow("überlappen");
    expect(() =>
      extractPalette({ ...p, width: MAX_COLOR_PIXELS + 1 }, full(p)),
    ).toThrow("4 MP");
  });
});
let root: string,
  dir: string,
  s: ProjectService,
  masterId: string,
  sourceId: string,
  paletteId: string,
  regionId: string;
const portrait = (width = 12, height = 12, shade = 100) => {
  const p = { width, height, data: new Uint8Array(width * height * 4) };
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++)
      p.data.set([shade, shade, shade, 255], (y * width + x) * 4);
  return p;
};
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-colors-"));
  dir = path.join(root, "project");
  await fs.mkdir(dir);
  s = new ProjectService();
  await s.create(dir, "Synthetic palette");
  await s.command({ type: "addCharacter", name: "Color fixture" });
  const staged = await s.stage(encodePixels(portrait()), "master.png");
  await seedHistoricalMaster(
    s,
    staged,
    s.snapshot().project.selectedCharacterId,
  );
  masterId = s.snapshot().project.masters[0].id;
  const image = await s.stage(
    encodePixels(portrait(12, 12, 150)),
    "expression.png",
  );
  await s.command({
    type: "importCandidate",
    characterId: s.snapshot().project.selectedCharacterId,
    variantId: s.snapshot().project.variants[0].id,
    action: "silent",
    token: image.token,
  });
  sourceId = s.snapshot().project.assets[0].id;
  regionId = randomUUID();
  const master = s.snapshot().project.masters[0];
  await s.command({
    type: "saveMasterPalette",
    masterId,
    masterSha256: master.sha256,
    regions: [
      { id: regionId, name: "Haare", role: "hair", weights: full(portrait()) },
    ],
  });
  paletteId = s.snapshot().project.masterPalettes[0].id;
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
async function draft() {
  const p = await s.analysisSource(sourceId);
  const d = rule(p, "#969696", "#646464");
  d.paletteId = paletteId;
  d.regions[0].paletteRegionId = regionId;
  d.regions[0].correctLightness = true;
  return d;
}
async function save(d: ColorDraft) {
  const p = await s.analysisSource(sourceId);
  return s.command({
    type: "createColorCorrection",
    sourceId,
    sourceSha256: p.sha256,
    ...d,
    previewPixelSha256: hashBytes(correctColors(p, d).data),
  });
}
describe("safe versioned palette/candidate persistence", () => {
  it("saves immutable palette and recipe revisions, restores exactly, approves separately and exports exact PNG bytes", async () => {
    const before = s.snapshot().project,
      original = await fs.readFile(path.join(dir, before.assets[0].file)),
      d = await draft();
    d.protectedWeights[13] = 255;
    await save(d);
    const q = s.snapshot().project.qualityAssets[0];
    expect(q.status).toBe("candidate");
    expect(q.colorCorrection?.revision).toBe(1);
    expect(await s.colorRecipe(q.id)).toEqual(d);
    const output = decodePixels(await fs.readFile(path.join(dir, q.file)));
    expect(new Uint8Array(output.data)).toEqual(
      correctColors(await s.analysisSource(sourceId), d).data,
    );
    const next = new ProjectService();
    await next.open(dir);
    expect(await next.colorRecipe(q.id)).toEqual(d);
    expect(s.snapshot().project.assets).toEqual(before.assets);
    await s.command({
      type: "reviewQuality",
      id: q.id,
      status: "approved",
      notes: "Explicit synthetic color and silhouette review",
      confirmStyleAndSilhouette: true,
    });
    const asset = s.snapshot().project.assets.at(-1)!;
    expect(asset.status).toBe("approved");
    expect(asset.masterId).toBe(masterId);
    expect(asset.qualitySourceId).toBe(q.id);
    expect(s.snapshot().project.masters).toEqual(before.masters);
    const payload = await s.exportPayload({
      id: asset.id,
      raw: false,
      provenance: true,
    });
    expect(payload.bytes).toEqual(await fs.readFile(path.join(dir, q.file)));
    expect(await fs.readFile(path.join(dir, before.assets[0].file))).toEqual(
      original,
    );
    await save(d);
    expect(
      s.snapshot().project.qualityAssets[1].colorCorrection?.revision,
    ).toBe(2);
  });
  it("rejects forged hashes, non-master target colors, wrong master/region, unknown paths and stale previews without manifest mutation", async () => {
    const d = await draft(),
      before = await fs.readFile(path.join(dir, "laceframe.json"));
    await expect(
      save({ ...d, regions: [{ ...d.regions[0], targetColor: "#ffffff" }] }),
    ).rejects.toThrow("Referenzfarbe");
    await expect(
      save({
        ...d,
        regions: [{ ...d.regions[0], paletteRegionId: randomUUID() }],
      }),
    ).rejects.toThrow("Farbregion");
    await expect(
      s.command({
        type: "createColorCorrection",
        sourceId,
        sourceSha256: "0".repeat(64),
        ...d,
        previewPixelSha256: "0".repeat(64),
      }),
    ).rejects.toThrow("Farbpalette");
    const source = await s.analysisSource(sourceId);
    await expect(
      s.command({
        type: "createColorCorrection",
        sourceId,
        sourceSha256: source.sha256,
        ...d,
        previewPixelSha256: "0".repeat(64),
      }),
    ).rejects.toThrow("veraltet");
    expect(
      commandSchema.safeParse({
        type: "saveMasterPalette",
        masterId,
        masterSha256: "0".repeat(64),
        regions: [],
        file: "/tmp/file",
      }).success,
    ).toBe(false);
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(before);
  });
  it("handles changed pose/dimensions only with separate candidate masks", async () => {
    const image = await s.stage(
      encodePixels(portrait(8, 10, 150)),
      "different-pose.png",
    );
    await s.command({
      type: "importCandidate",
      characterId: s.snapshot().project.selectedCharacterId,
      variantId: s.snapshot().project.variants[0].id,
      action: "silent",
      token: image.token,
    });
    sourceId = s.snapshot().project.assets.at(-1)!.id;
    const d = await draft();
    await save(d);
    expect(s.snapshot().project.qualityAssets[0].width).toBe(8);
    await expect(
      save({
        ...d,
        regions: [{ ...d.regions[0], weights: new Uint8Array(144) }],
      }),
    ).rejects.toThrow("Abmessungen");
  });
  it("retains historical palette references after new revision and isolates another character", async () => {
    const d = await draft();
    await save(d);
    const first = s.snapshot().project.masterPalettes[0];
    const m = s.snapshot().project.masters[0];
    await s.command({
      type: "saveMasterPalette",
      masterId,
      masterSha256: m.sha256,
      regions: [
        {
          id: regionId,
          name: "Haarrevision",
          role: "hair",
          weights: full(portrait()),
        },
      ],
    });
    expect(s.snapshot().project.masterPalettes[0]).toEqual(first);
    expect(s.snapshot().project.masterPalettes[1].revision).toBe(2);
    expect(
      await s.colorRecipe(s.snapshot().project.qualityAssets[0].id),
    ).toEqual(d);
    await s.command({ type: "addCharacter", name: "Other" });
    const staged = await s.stage(
      encodePixels(portrait(12, 12, 99)),
      "other.png",
    );
    await seedHistoricalMaster(
      s,
      staged,
      s.snapshot().project.selectedCharacterId,
    );
    const image = await s.stage(
      encodePixels(portrait(12, 12, 150)),
      "other-expression.png",
    );
    await s.command({
      type: "importCandidate",
      characterId: s.snapshot().project.selectedCharacterId,
      variantId: s.snapshot().project.variants[0].id,
      action: "silent",
      token: image.token,
    });
    sourceId = s.snapshot().project.assets.at(-1)!.id;
    await expect(save(d)).rejects.toThrow("Farbpalette");
  });
  it("backs up legacy projects on first write, opening is read-only", async () => {
    const file = path.join(dir, "laceframe.json"),
      raw = JSON.parse(await fs.readFile(file, "utf8"));
    delete raw.masterPalettes;
    await fs.unlink(
      path.join(dir, "laceframe.v2.pre-color-consistency.backup.json"),
    );
    const bytes = Buffer.from(JSON.stringify(raw));
    await fs.writeFile(file, bytes);
    const next = new ProjectService();
    await next.open(dir);
    expect(await fs.readFile(file)).toEqual(bytes);
    await next.command({ type: "addCharacter", name: "Write migration" });
    expect(
      await fs.readFile(
        path.join(dir, "laceframe.v2.pre-color-consistency.backup.json"),
      ),
    ).toEqual(bytes);
  });
  it("enforces the existing hard mask independently of the color protection mask", async () => {
    const p = s.snapshot().project,
      m = p.masters[0],
      weights = new Uint8Array(144);
    weights[65] = 255;
    await s.command({
      type: "saveMask",
      masterId: m.id,
      name: "One expression pixel",
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
    const image = await s.stage(encodePixels(portrait(12, 12, 150)), "raw.png");
    await s.command({
      type: "importResult",
      attemptId: s.snapshot().project.attempts[0].id,
      token: image.token,
    });
    sourceId = s.snapshot().project.assets.at(-1)!.id;
    await expect(save(await draft())).rejects.toThrow("Hard Lock");
    await s.command({
      type: "createComposite",
      rawId: sourceId,
      registrationConfirmed: true,
    });
    sourceId = s.snapshot().project.assets.at(-1)!.id;
    const d = await draft();
    await expect(save(d)).rejects.toThrow("Hard Lock");
    d.regions[0].weights = weights;
    await save(d);
    const q = s.snapshot().project.qualityAssets.at(-1)!;
    await s.command({
      type: "reviewQuality",
      id: q.id,
      status: "approved",
      notes: "Synthetic one-pixel color review",
      confirmStyleAndSilhouette: true,
    });
    const out = await s.analysisSource(s.snapshot().project.assets.at(-1)!.id),
      master = await s.analysisSource(m.id);
    for (let i = 0; i < 144; i++)
      if (!weights[i])
        expect(out.data.slice(i * 4, i * 4 + 4)).toEqual(
          master.data.slice(i * 4, i * 4 + 4),
        );
  });
  it("rejects tampered/traversing/symlinked masks and forged palette metadata on reopen", async () => {
    await save(await draft());
    const p = s.snapshot().project,
      mask = p.masterPalettes[0].regions[0].mask;
    expect(
      projectSchema.safeParse({
        ...p,
        masterPalettes: [
          {
            ...p.masterPalettes[0],
            regions: [
              {
                ...p.masterPalettes[0].regions[0],
                mask: { ...mask, file: "../secret.png" },
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    const f = path.join(dir, mask.file),
      bytes = await fs.readFile(f);
    await fs.chmod(f, 0o600);
    await fs.writeFile(f, "corrupt");
    await expect(new ProjectService().open(dir)).rejects.toThrow("Farbmaske");
    await fs.writeFile(f, bytes);
    await fs.unlink(f);
    await fs.writeFile(path.join(root, "outside.png"), bytes);
    await fs.symlink(path.join(root, "outside.png"), f);
    await expect(new ProjectService().open(dir)).rejects.toThrow();
  });
});
