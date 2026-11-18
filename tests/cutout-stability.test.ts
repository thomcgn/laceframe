import { seedHistoricalMaster } from "./historical-master";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectService, hashBytes } from "../src/main/project-service";
import { decodePixels, encodePixels } from "../src/main/mask-composite";
import {
  DEFAULT_LIGHT,
  RELIGHT_VERSION,
  relightPixels,
} from "../src/shared/relighting";
import { projectSchema } from "../src/shared/domain";
import { defaultCutoutSettings } from "../src/shared/smart-cutout";
import { cutoutFrame } from "../src/renderer/components/cutout-preview";
describe("cutout presentation invariants", () => {
  const source = {
    width: 2,
    height: 2,
    data: Uint8Array.from([
      20, 80, 140, 255, 64, 128, 192, 128, 5, 10, 15, 0, 250, 100, 30, 255,
    ]),
  };
  it("retention 255 preserves exact original RGBA, including partial/hidden alpha, without mutation", () => {
    const before = new Uint8Array(source.data);
    expect(cutoutFrame(source, new Uint8Array(4).fill(255), "result")).toEqual(
      new Uint8ClampedArray(before),
    );
    expect(source.data).toEqual(before);
  });
  it("original view ignores removals; alpha view is display-only", () => {
    const weights = Uint8Array.from([0, 128, 255, 255]);
    expect(cutoutFrame(source, weights, "original")).toEqual(
      new Uint8ClampedArray(source.data),
    );
    expect(cutoutFrame(source, weights, "result")[7]).toBe(64);
    expect([...cutoutFrame(source, weights, "alpha").slice(4, 8)]).toEqual([
      64, 64, 64, 255,
    ]);
    expect(source.data[7]).toBe(128);
  });
  it("rejects missing, truncated and oversized source/mask data", () => {
    expect(() => cutoutFrame(source, new Uint8Array(), "result")).toThrow();
    expect(() =>
      cutoutFrame(
        { ...source, data: new Uint8Array(2) },
        new Uint8Array(4),
        "result",
      ),
    ).toThrow();
    expect(() =>
      cutoutFrame(
        { ...source, width: 16385, height: 16385 },
        new Uint8Array(4),
        "result",
      ),
    ).toThrow();
  });
});
let dir: string, s: ProjectService;
const fixture = () => {
  const data = new Uint8Array(16 * 16 * 4);
  for (let i = 0; i < 256; i++) data.set([20, 80, 140, 255], i * 4);
  return { width: 16, height: 16, data };
};
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-cutout-guard-"));
  s = new ProjectService();
  await s.create(dir, "Guard");
  await s.command({ type: "addCharacter", name: "Synthetic" });
  const staged = await s.stage(encodePixels(fixture()), "original.png");
  await seedHistoricalMaster(
    s,
    staged,
    s.snapshot().project.selectedCharacterId,
  );
});
afterEach(async () => fs.rm(dir, { recursive: true, force: true }));
const master = () => s.snapshot().project.masters[0];
async function cutout(approved = true, transparent = true, smart = false) {
  const weights = new Uint8Array(256).fill(255);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      if (transparent && (!x || !y || x === 15 || y === 15))
        weights[y * 16 + x] = 0;
  await s.command({
    type: "createCutout",
    sourceId: master().id,
    name: "Explicit cutout",
    weights,
    ...(smart
      ? {
          smart: {
            settings: defaultCutoutSettings(),
            manual: weights,
            protected: new Uint8Array(256),
            forced: new Uint8Array(256),
          },
        }
      : {}),
  });
  const q = s.snapshot().project.qualityAssets.at(-1)!;
  if (approved) await review(q.id);
  return s.snapshot().project.qualityAssets.find((a) => a.id === q.id)!;
}
const review = (id: string, status: "approved" | "rejected" = "approved") =>
  s.command({
    type: "reviewQuality",
    id,
    status,
    notes: "Synthetic silhouette manually reviewed",
    confirmStyleAndSilhouette: true,
    rasterConfirmed: true,
  });
async function relight(id: string) {
  const p = await s.relightSource(id);
  await s.command({
    type: "createRelighting",
    sourceId: id,
    sourceSha256: p.sha256,
    light: { ...DEFAULT_LIGHT, intensity: 0.5 },
    regions: [],
    previewPixelSha256: hashBytes(
      relightPixels(p, { ...DEFAULT_LIGHT, intensity: 0.5 }).data,
    ),
  });
  return s.snapshot().project.qualityAssets.at(-1)!;
}
describe("trusted cutout-before-relighting guard", () => {
  it.each([false, true])(
    "rejects raw master even when imported transparency=%s; open/read leaves manifest unchanged",
    async (transparent) => {
      if (transparent) {
        const p = fixture();
        p.data[3] = 0;
        const st = await s.stage(encodePixels(p), "transparent.png");
        await s.command({ type: "addCharacter", name: "External transparent" });
        await seedHistoricalMaster(
          s,
          st,
          s.snapshot().project.selectedCharacterId,
        );
      }
      const m = s.snapshot().project.masters.at(-1)!;
      const before = await fs.readFile(path.join(dir, "laceframe.json"));
      expect((await s.relightEligibility(m.id)).allowed).toBe(false);
      await expect(s.relightSource(m.id)).rejects.toThrow(/Freistellung/);
      await expect(
        s.command({
          type: "createRelighting",
          sourceId: m.id,
          sourceSha256: m.sha256,
          light: DEFAULT_LIGHT,
          regions: [],
          previewPixelSha256: hashBytes(fixture().data),
        }),
      ).rejects.toThrow(/Freistellung/);
      await new ProjectService().open(dir);
      expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(
        before,
      );
    },
  );
  it.each(["candidate", "rejected"] as const)(
    "rejects %s cutout including direct command",
    async (status) => {
      const q = await cutout(false);
      const originalPixelHash = hashBytes(
        decodePixels(await fs.readFile(path.join(dir, q.file))).data,
      );
      if (status === "rejected") {
        await review(q.id, "rejected");
        await expect(fs.readFile(path.join(dir, q.file))).rejects.toThrow();
      }
      expect((await s.relightEligibility(q.id)).allowed).toBe(false);
      await expect(
        s.command({
          type: "createRelighting",
          sourceId: q.id,
          sourceSha256: q.sha256,
          light: DEFAULT_LIGHT,
          regions: [],
          previewPixelSha256: originalPixelHash,
        }),
      ).rejects.toThrow(/freigegeben/);
    },
  );
  it.each([false, true])(
    "allows a verified manually approved cutout (smart=%s) and its promoted master",
    async (smart) => {
      const q = await cutout(true, true, smart);
      expect(await s.relightEligibility(q.id)).toMatchObject({
        allowed: true,
        cutoutId: q.id,
      });
      expect((await s.relightEligibility(q.approvedMasterId!)).allowed).toBe(
        true,
      );
      await relight(q.id);
      expect(s.snapshot().project.qualityAssets.at(-1)!.sourceId).toBe(q.id);
      expect(s.snapshot().project.masters[0]).toEqual(master());
    },
  );
  it("requires approval of further light revisions and permits reviewed descendants", async () => {
    const q = await cutout();
    const r = await relight(q.approvedMasterId!);
    await expect(s.relightSource(r.id)).rejects.toThrow(/freigegeben/);
    await review(r.id);
    const reviewed = s
      .snapshot()
      .project.qualityAssets.find((q) => q.id === r.id)!;
    expect(
      (await s.relightEligibility(reviewed.approvedMasterId!)).allowed,
    ).toBe(true);
    await relight(reviewed.approvedMasterId!);
  });
  it("rejects stale source hash on Apply without writes", async () => {
    const q = await cutout();
    const p = await s.relightSource(q.id);
    const before = await fs.readFile(path.join(dir, "laceframe.json"));
    await expect(
      s.command({
        type: "createRelighting",
        sourceId: q.id,
        sourceSha256: "0".repeat(64),
        light: DEFAULT_LIGHT,
        regions: [],
        previewPixelSha256: hashBytes(p.data),
      }),
    ).rejects.toThrow(/seit dem Öffnen/);
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(before);
  });
  it.each(["source", "output", "mask"] as const)(
    "rechecks changed %s bytes after a valid opening",
    async (target) => {
      const q = await cutout();
      const opened = await s.relightSource(q.id);
      const record =
        target === "source" ? master() : target === "output" ? q : q.mask!;
      await fs.chmod(path.join(dir, record.file), 0o644);
      await fs.writeFile(path.join(dir, record.file), "corrupt");
      expect((await s.relightEligibility(q.id)).allowed).toBe(false);
      await expect(
        s.command({
          type: "createRelighting",
          sourceId: q.id,
          sourceSha256: opened.sha256,
          light: DEFAULT_LIGHT,
          regions: [],
          previewPixelSha256: hashBytes(opened.data),
        }),
      ).rejects.toThrow(/verändert|integrität/i);
    },
  );
  it("checks smart masks/settings and semantic source provenance, not only a transparency count", async () => {
    const q = await cutout(true, true, true);
    const record = q.smartCutout!.masks.protected;
    await fs.chmod(path.join(dir, record.file), 0o644);
    await fs.writeFile(path.join(dir, record.file), "corrupt");
    expect((await s.relightEligibility(q.id)).allowed).toBe(false);
  });
  it("rejects forged output even if an attacker updates the superficial output hash", async () => {
    const q = await cutout();
    const p = s.snapshot().project;
    const image = fixture();
    image.data[3] = 0;
    const bytes = encodePixels(image),
      sha = hashBytes(bytes),
      file = `assets/quality/${sha}.png`;
    await fs.writeFile(path.join(dir, file), bytes);
    const found = p.qualityAssets.find((a) => a.id === q.id)!;
    found.sha256 = sha;
    found.file = file;
    const promoted = p.masters.find((a) => a.id === found.approvedMasterId)!;
    promoted.sha256 = sha;
    if (promoted.masterReview) promoted.masterReview.sourceSha256 = sha;
    promoted.file = file.replace("quality/", "originals/");
    await fs.writeFile(path.join(dir, promoted.file), bytes);
    await fs.writeFile(
      path.join(dir, "laceframe.json"),
      JSON.stringify(projectSchema.parse(p)),
    );
    await s.open(dir);
    await expect(s.relightSource(q.id)).rejects.toThrow(/Abgeleitete Pixel/);
  });
  it("rejects malformed/cross-character metadata on reopen", async () => {
    const q = await cutout();
    const p = s.snapshot().project;
    p.qualityAssets.find((a) => a.id === q.id)!.sourceId = randomUUID();
    expect(projectSchema.safeParse(p).success).toBe(false);
    await fs.writeFile(path.join(dir, "laceframe.json"), JSON.stringify(p));
    await expect(new ProjectService().open(dir)).rejects.toThrow();
  });
  it.each(["candidate", "approved"] as const)(
    "retains legacy %s relighting without a cutout: read/export/cutout without a new light revision",
    async (status) => {
      const transparent = fixture();
      for (let i = 0; i < 16; i++) {
        transparent.data[i * 4 + 3] = 0;
        transparent.data[(15 * 16 + i) * 4 + 3] = 0;
        transparent.data[i * 16 * 4 + 3] = 0;
        transparent.data[(i * 16 + 15) * 4 + 3] = 0;
      }
      await s.command({
        type: "addCharacter",
        name: "Legacy transparent source",
      });
      const staged = await s.stage(encodePixels(transparent), "legacy.png");
      await seedHistoricalMaster(
        s,
        staged,
        s.snapshot().project.selectedCharacterId,
      );
      const p = s.snapshot().project,
        m = p.masters.at(-1)!;
      const original = await fs.readFile(path.join(dir, m.file));
      const image = decodePixels(original);
      const output = relightPixels(image, DEFAULT_LIGHT),
        bytes = encodePixels(output),
        sha = hashBytes(bytes);
      const q = {
        id: randomUUID(),
        characterId: m.characterId,
        sourceId: m.id,
        sourceSha256: m.sha256,
        sha256: sha,
        file: `assets/quality/${sha}.png`,
        width: m.width,
        height: m.height,
        format: "png" as const,
        operation: "relighting" as const,
        version: 1 as const,
        status,
        ...(status === "approved"
          ? {
              reviewedAt: new Date().toISOString(),
              notes: "Historical synthetic manual review",
            }
          : {}),
        createdAt: new Date().toISOString(),
        relighting: {
          revision: 1,
          algorithm: RELIGHT_VERSION,
          geometry: "2d-gradient-no-normals" as const,
          light: DEFAULT_LIGHT,
          pixelSha256: hashBytes(output.data),
          regions: [],
        },
      };
      await fs.mkdir(path.join(dir, "assets/quality"), { recursive: true });
      await fs.writeFile(path.join(dir, q.file), bytes);
      p.qualityAssets.push(q);
      const manifest = JSON.stringify(projectSchema.parse(p));
      await fs.writeFile(path.join(dir, "laceframe.json"), manifest);
      await s.open(dir);
      expect(await fs.readFile(path.join(dir, "laceframe.json"), "utf8")).toBe(
        manifest,
      );
      expect((await s.relightEligibility(q.id)).allowed).toBe(false);
      await expect(s.relightSource(q.id)).rejects.toThrow();
      expect((await s.cutoutSource(q.id)).data).toEqual(
        new Uint8Array(image.data),
      );
      expect((await s.relightRecipe(q.id)).recipe).toEqual(q.relighting);
      expect(
        (await s.exportPayload({ id: q.id, raw: true, provenance: true }))
          .bytes,
      ).toEqual(bytes);
      expect(await fs.readFile(path.join(dir, m.file))).toEqual(original);
      expect(s.snapshot().project.qualityAssets[0]).toEqual(q);
    },
  );
});
