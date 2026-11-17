import { seedHistoricalMaster } from "./historical-master";
import {
  rasterizePolygon,
  POLYGON_VERSION,
  type PolygonOperation,
} from "../src/shared/cutout-polygon";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  selectBackground,
  pixelLab,
  defaultCutoutSettings,
  prepareCutout,
  imagePoint,
  commitCutout,
  undoCutout,
  redoCutout,
  MAX_SMART_PIXELS,
  type CutoutDraft,
  type CutoutImage,
} from "../src/shared/smart-cutout";
import { ProjectService, hashBytes } from "../src/main/project-service";
import { cutoutPixels } from "../src/main/asset-quality";
import { encodePixels, decodePixels } from "../src/main/mask-composite";
import { projectSchema } from "../src/shared/domain";
const image = (w = 24, h = 24): CutoutImage => ({
  width: w,
  height: h,
  data: Uint8Array.from({ length: w * h * 4 }, (_, i) =>
    i % 4 === 3 ? 255 : 0,
  ),
});
const set = (p: CutoutImage, x: number, y: number, rgba: number[]) =>
  p.data.set(rgba, (y * p.width + x) * 4);
const draft = (p: CutoutImage): CutoutDraft => ({
  settings: defaultCutoutSettings(),
  manual: new Uint8Array(p.width * p.height).fill(255),
  protected: new Uint8Array(p.width * p.height),
  forced: new Uint8Array(p.width * p.height),
});
const seed = (p: CutoutImage, x = 0, y = 0) => ({
  x,
  y,
  rgba: Array.from(
    p.data.slice((y * p.width + x) * 4, (y * p.width + x) * 4 + 4),
  ) as [number, number, number, number],
});
const portrait = () => {
  const p = image();
  for (let y = 3; y < 21; y++)
    for (let x = 5; x < 19; x++) set(p, x, y, [150, 110, 85, 255]);
  for (let y = 14; y < 24; y++)
    for (let x = 7; x < 17; x++) set(p, x, y, [0, 0, 0, 255]);
  for (const [x, y] of [
    [8, 8],
    [9, 8],
    [14, 8],
    [15, 8],
    [5, 10],
  ])
    set(p, x, y, [0, 0, 0, 255]);
  return p;
};
describe("original-pixel Lab selection and protected cutout", () => {
  it("uses known D65 Lab and removes an explicitly sampled flat black background", () => {
    expect(pixelLab(0, 0, 0)).toEqual([0, 0, 0]);
    expect(pixelLab(255, 255, 255)[0]).toBeCloseTo(100, 3);
    const p = portrait(),
      d = draft(p);
    d.settings.seeds = [seed(p)];
    const before = p.data.slice(),
      a = selectBackground(p, d);
    expect(a.weights[0]).toBe(0);
    expect(a.weights[6 * 24 + 10]).toBe(255);
    expect(p.data).toEqual(before);
    expect(selectBackground(p, d)).toEqual(a);
    expect(selectBackground(p, d, prepareCutout(p))).toEqual(a);
  });
  it("retains touching black leather/hair when protected and enclosed glasses/tunnel without global removal", () => {
    const p = portrait(),
      d = draft(p);
    d.settings.seeds = [seed(p)];
    expect(selectBackground(p, d).weights[23 * 24 + 12]).toBe(0);
    for (let y = 14; y < 24; y++)
      for (let x = 7; x < 17; x++) d.protected[y * 24 + x] = 255;
    d.protected[10 * 24 + 5] = 255;
    const r = selectBackground(p, d);
    expect(r.weights[23 * 24 + 12]).toBe(255);
    expect(r.weights[8 * 24 + 8]).toBe(255);
    expect(r.weights[10 * 24 + 5]).toBe(255);
    expect(r.weights[0]).toBe(0);
  });
  it("requires another seed for disconnected regions and global matching is an explicit alternative", () => {
    const p = image(9, 5),
      d = draft(p);
    for (let y = 0; y < 5; y++) set(p, 4, y, [220, 0, 0, 255]);
    d.settings.seeds = [seed(p)];
    expect(selectBackground(p, d).weights[8]).toBe(255);
    d.settings.seeds.push(seed(p, 8, 0));
    expect(selectBackground(p, d).weights[8]).toBe(0);
    d.settings.seeds = [seed(p)];
    d.settings.connected = false;
    expect(selectBackground(p, d).weights[8]).toBe(0);
    expect(defaultCutoutSettings().connected).toBe(true);
  });
  it("changes tolerance against immutable seed colors rather than marching a drifting gradient", () => {
    const p = image(8, 1),
      d = draft(p);
    for (let x = 0; x < 8; x++) set(p, x, 0, [x * 5, x * 5, x * 5, 255]);
    d.settings.seeds = [seed(p)];
    d.settings.tolerance = 2;
    const low = selectBackground(p, d).removed;
    d.settings.tolerance = 12;
    expect(selectBackground(p, d).removed).toBeGreaterThan(low);
    expect(low).toBeLessThan(8);
  });
  it("combines multiple colors and preserves original alpha and every RGB sample including hidden data", () => {
    const p = portrait(),
      d = draft(p);
    set(p, 2, 2, [123, 78, 4, 0]);
    set(p, 12, 10, [50, 60, 70, 128]);
    d.settings.seeds = [seed(p), seed(p, 12, 10)];
    d.protected[12 * 24 + 12] = 255;
    d.protected[2 * 24 + 2] = 255;
    const original = p.data.slice(),
      r = cutoutPixels(p, selectBackground(p, d).weights);
    for (let i = 0; i < p.width * p.height; i++) {
      expect([...r.data.slice(i * 4, i * 4 + 3)]).toEqual([
        ...p.data.slice(i * 4, i * 4 + 3),
      ]);
      expect(r.data[i * 4 + 3]).toBeLessThanOrEqual(p.data[i * 4 + 3]);
    }
    expect([...r.data.slice((2 * 24 + 2) * 4, (2 * 24 + 2) * 4 + 4)]).toEqual([
      123, 78, 4, 0,
    ]);
    expect(p.data).toEqual(original);
  });
  it("resolves protected > forced > automatic/manual after edge expansion and softness", () => {
    const p = portrait(),
      d = draft(p);
    d.settings.seeds = [seed(p)];
    d.settings.expand = 2;
    d.settings.softness = 3;
    d.manual.fill(0);
    d.protected[10 * 24 + 10] = 255;
    d.forced[10 * 24 + 10] = 255;
    d.forced[11 * 24 + 10] = 255;
    const r = selectBackground(p, d);
    expect(r.conflicts).toBe(1);
    expect(r.weights[10 * 24 + 10]).toBe(255);
    expect(r.weights[11 * 24 + 10]).toBe(0);
  });
  it("supports feathered alpha without RGB blur, separately expands and shrinks only automatic selection", () => {
    const p = portrait(),
      d = draft(p);
    d.settings.seeds = [seed(p)];
    const normal = selectBackground(p, d);
    d.settings.expand = 1;
    const expanded = selectBackground(p, d);
    d.settings.expand = -1;
    expect(expanded.removed).toBeGreaterThanOrEqual(
      selectBackground(p, d).removed,
    );
    d.settings.expand = 0;
    d.settings.softness = 2;
    const soft = selectBackground(p, d);
    expect(soft.weights.some((v) => v > 0 && v < 255)).toBe(true);
    expect(normal.weights.every((v) => v === 0 || v === 255)).toBe(true);
    const out = cutoutPixels(p, soft.weights);
    expect(out.data[3]).toBe(0);
  });
  it("has no automatic black removal without seeds and keeps legacy manual weights editable", () => {
    const p = portrait(),
      d = draft(p);
    d.manual[10] = 64;
    const r = selectBackground(p, d);
    expect(r.weights[0]).toBe(255);
    expect(r.weights[10]).toBe(64);
    d.manual[10] = 255;
    expect(selectBackground(p, d).weights[10]).toBe(255);
  });
  it("rejects transparent, mismatched/outside seeds, invalid masks, oversize and corrupt data", () => {
    const p = image(),
      d = draft(p);
    d.settings.seeds = [{ ...seed(p), x: 99 }];
    expect(() => selectBackground(p, d)).toThrow(/Seed/);
    d.settings.seeds = [{ ...seed(p), rgba: [9, 0, 0, 255] }];
    expect(() => selectBackground(p, d)).toThrow(/Seed/);
    set(p, 0, 0, [0, 0, 0, 0]);
    d.settings.seeds = [seed(p)];
    expect(() => selectBackground(p, d)).toThrow(/Seed/);
    d.settings.seeds = [];
    d.protected[0] = 12;
    expect(() => selectBackground(p, d)).toThrow(/binäre/);
    expect(() =>
      selectBackground(
        { width: MAX_SMART_PIXELS + 1, height: 1, data: new Uint8Array() },
        d,
      ),
    ).toThrow(/4 Megapixel/);
  });
  it("undoes and redoes seed, parameter and all three mask edits together with bounded history", () => {
    const p = image(),
      d = draft(p);
    let h = {
      past: [] as CutoutDraft[],
      present: d,
      future: [] as CutoutDraft[],
    };
    const next = {
      ...d,
      settings: { ...d.settings, seeds: [seed(p)], tolerance: 30 },
      protected: d.protected.slice(),
    };
    next.protected[3] = 255;
    h = commitCutout(h, next);
    expect(undoCutout(h).present).toEqual(d);
    expect(redoCutout(undoCutout(h))).toEqual(h);
    for (let i = 0; i < 50; i++)
      h = commitCutout(h, {
        ...h.present,
        settings: { ...h.present.settings, tolerance: i },
      });
    expect(h.past.length).toBeLessThanOrEqual(32);
  });
  it("maps native pixel sampling after zoom and pan and does not clamp an outside click into a seed", () => {
    expect(
      imagePoint(
        { clientX: 150, clientY: 100 },
        { left: 100, top: 50, width: 250, height: 250 },
        1254,
        1254,
      ),
    ).toEqual({ x: 250, y: 250 });
    expect(
      imagePoint(
        { clientX: 0, clientY: 0 },
        { left: 50, top: 50, width: 100, height: 100 },
        10,
        10,
      ),
    ).toEqual({ x: -5, y: -5 });
  });
});
let root: string, service: ProjectService, masterId: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-smart-"));
  service = new ProjectService();
  await service.create(root, "Synthetic protected cutout");
  await service.command({ type: "addCharacter", name: "Synthetic" });
  const p = service.snapshot().project;
  const staged = await service.stage(encodePixels(portrait()), "portrait.png");
  await seedHistoricalMaster(service, staged, p.selectedCharacterId!);
  masterId = service.snapshot().project.masters[0].id;
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
async function save(d: CutoutDraft) {
  const p = await service.cutoutSource(masterId);
  return service.command({
    type: "createCutout",
    sourceId: masterId,
    name: "Protected cutout",
    weights: selectBackground(p, d).weights,
    smart: d,
  });
}
describe("immutable cutout provenance, persistence and human review", () => {
  it("recomputes preview, stores separate typed masks/hashes and restores editable recipe without source writes", async () => {
    const original = service.snapshot().project.masters[0],
      bytes = await fs.readFile(path.join(root, original.file)),
      p = await service.cutoutSource(masterId),
      d = draft(p);
    d.settings.seeds = [seed(p)];
    d.protected[12 * 24 + 12] = 255;
    d.forced[11 * 24 + 10] = 255;
    const first = (await save(d)).project.qualityAssets[0];
    expect(first.smartCutout?.masks.protected.type).toBe(
      "protected-foreground",
    );
    expect(first.mask?.type).toBe("foreground-alpha");
    expect(first.status).toBe("candidate");
    expect(await fs.readFile(path.join(root, original.file))).toEqual(bytes);
    const reopened = new ProjectService();
    await reopened.open(root);
    service = reopened;
    const loaded = await service.smartCutoutRecipe(first.id);
    expect(loaded.settings).toEqual(d.settings);
    expect(loaded.protected).toEqual(d.protected);
    expect(loaded.forced).toEqual(d.forced);
    expect(loaded.manual).toEqual(d.manual);
    const result = decodePixels(await fs.readFile(path.join(root, first.file)));
    expect(hashBytes(result.data)).toBe(first.smartCutout!.pixelSha256);
    loaded.protected[11 * 24 + 10] = 255;
    const second = (await save(loaded)).project.qualityAssets[1];
    expect(second.smartCutout!.revision).toBe(2);
    expect(second.smartCutout!.masks.protected.revision).toBe(2);
    expect(second.smartCutout!.masks.forced.revision).toBe(1);
    expect(service.snapshot().project.qualityAssets[0]).toEqual(first);
    expect(
      decodePixels(await fs.readFile(path.join(root, second.file))).data[
        (11 * 24 + 10) * 4 + 3
      ],
    ).toBe(255);
  });
  it("rejects forged results, wrong source lineage, corrupt and unsafe masks before acceptance", async () => {
    const p = await service.cutoutSource(masterId),
      d = draft(p);
    d.settings.seeds = [seed(p)];
    const before = await fs.readFile(path.join(root, "laceframe.json"));
    await expect(
      service.command({
        type: "createCutout",
        sourceId: masterId,
        name: "forged",
        weights: new Uint8Array(576).fill(255),
        smart: d,
      }),
    ).rejects.toThrow(/veraltet/);
    expect(await fs.readFile(path.join(root, "laceframe.json"))).toEqual(
      before,
    );
    const first = (await save(d)).project.qualityAssets[0],
      bad = service.snapshot().project;
    bad.qualityAssets[0].smartCutout!.masks.protected.file = "../unsafe.png";
    expect(projectSchema.safeParse(bad).success).toBe(false);
    const m = first.smartCutout!.masks.protected,
      file = path.join(root, m.file);
    await fs.chmod(file, 0o600);
    await fs.writeFile(file, "broken");
    await expect(service.smartCutoutRecipe(first.id)).rejects.toThrow(
      /verändert/,
    );
    await expect(new ProjectService().open(root)).rejects.toThrow(/verändert/);
  });
  it("requires manual approval for Master V2 and exports real transparent PNG with unchanged source", async () => {
    const p = await service.cutoutSource(masterId),
      d = draft(p);
    d.settings.seeds = [seed(p)];
    const q = (await save(d)).project.qualityAssets[0];
    const saved = await service.command({
      type: "reviewQuality",
      id: q.id,
      status: "approved",
      notes: "Synthetic edges and identity reviewed",
      confirmStyleAndSilhouette: true,
    });
    expect(saved.project.masters).toHaveLength(2);
    expect(saved.project.masters[1].version).toBe(2);
    expect(saved.project.masters[0].id).toBe(masterId);
    const out = await service.exportPayload({
      id: saved.project.masters[1].id,
      raw: false,
      provenance: true,
    });
    expect(decodePixels(out.bytes).data[3]).toBe(0);
    expect(decodePixels(out.bytes).width).toBe(24);
    expect(saved.project.masters[0].sha256).toBe(
      hashBytes(encodePixels(portrait())),
    );
  });
  it("retains legacy manual revisions, exact first-write backup and all old project data", async () => {
    const weights = new Uint8Array(576).fill(255);
    weights[0] = 0;
    await service.command({
      type: "createCutout",
      sourceId: masterId,
      weights,
      name: "Legacy manual",
    });
    const file = path.join(root, "laceframe.json"),
      raw = JSON.parse(await fs.readFile(file, "utf8"));
    delete raw.smartCutoutVersion;
    await fs.writeFile(file, JSON.stringify(raw));
    const original = await fs.readFile(file);
    service = new ProjectService();
    await service.open(root);
    expect(await fs.readFile(file)).toEqual(original);
    expect(await service.cutoutMask(raw.qualityAssets[0].id)).toEqual(weights);
    await service
      .command({ type: "setArtDirection", id: randomUUID() })
      .catch(() => {});
    const p = await service.cutoutSource(masterId),
      d = draft(p);
    d.manual = weights;
    await save(d);
    expect(
      await fs.readFile(
        path.join(root, "laceframe.v2.pre-smart-cutout.backup.json"),
      ),
    ).toEqual(original);
    expect(service.snapshot().project.qualityAssets[0]).toEqual(
      raw.qualityAssets[0],
    );
    await expect(
      service.smartCutoutRecipe(raw.qualityAssets[0].id),
    ).rejects.toThrow(/Keine/);
  });
});

const polygon = (
  points: number[][],
  operation: PolygonOperation["operation"] = "limit",
): PolygonOperation => ({
  algorithm: POLYGON_VERSION,
  operation,
  points: points.map(([x, y]) => ({ x, y })),
});
const rectangle = (
  x = 5,
  y = 3,
  w = 14,
  h = 21,
  op: PolygonOperation["operation"] = "limit",
) =>
  polygon(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    op,
  );
describe("native polygon selection", () => {
  it("rasterizes full image borders and half-open rectangle by pixel centers with no AA", () => {
    expect([...rasterizePolygon(rectangle(0, 0, 4, 3), 4, 3)]).toEqual(
      new Array(12).fill(255),
    );
    expect([...rasterizePolygon(rectangle(1, 1, 2, 1), 4, 3)]).toEqual([
      0, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0, 0,
    ]);
    const triangle = polygon([
      [0, 0],
      [3, 0],
      [0, 3],
    ]);
    expect([...rasterizePolygon(triangle, 3, 3)]).toEqual([
      255, 255, 0, 255, 0, 0, 0, 0, 0,
    ]);
    expect(
      rasterizePolygon(
        { ...triangle, points: [...triangle.points].reverse() },
        3,
        3,
      ),
    ).toEqual(rasterizePolygon(triangle, 3, 3));
  });
  it("handles concave silhouettes deterministically", () => {
    const op = polygon([
      [0, 0],
      [4, 0],
      [4, 1],
      [1, 1],
      [1, 4],
      [0, 4],
    ]);
    expect([...rasterizePolygon(op, 4, 4)]).toEqual([
      255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0,
    ]);
  });
  it("rejects crossing, touching, duplicate, flat, out of bounds and unbounded inputs", () => {
    for (const points of [
      [
        [0, 0],
        [4, 4],
        [0, 4],
        [4, 0],
      ],
      [
        [0, 0],
        [4, 0],
        [2, 2],
        [4, 4],
        [0, 4],
        [2, 2],
      ],
      [
        [0, 0],
        [0, 0],
        [4, 4],
      ],
      [
        [0, 0],
        [2, 0],
        [4, 0],
        [4, 4],
        [0, 4],
      ],
      [
        [0, 0],
        [4, 0],
      ],
      [
        [-1, 0],
        [4, 0],
        [4, 4],
      ],
      [
        [0.5, 0],
        [4, 0],
        [4, 4],
      ],
    ])
      expect(() => rasterizePolygon(polygon(points), 4, 4)).toThrow();
    expect(() => rasterizePolygon(rectangle(0, 0, 5, 4), 4, 4)).toThrow(
      /außerhalb/,
    );
    expect(() =>
      rasterizePolygon(
        { ...rectangle(), points: new Array(129).fill({ x: 0, y: 0 }) },
        24,
        24,
      ),
    ).toThrow();
    expect(() =>
      rasterizePolygon(rectangle(), MAX_SMART_PIXELS + 1, 1),
    ).toThrow(/Megapixel/);
  });
  it("limits connected and global automatic fill without leaking softness into a black jacket", () => {
    const p = portrait(),
      d = draft(p);
    d.settings.seeds = [seed(p)];
    d.settings.polygons = [rectangle()];
    for (const connected of [true, false]) {
      d.settings.connected = connected;
      d.settings.softness = 4;
      d.settings.expand = 3;
      const r = selectBackground(p, d);
      expect(r.weights[23 * 24 + 12]).toBe(255);
      expect(r.weights[0]).toBeLessThan(255);
      expect(r.selection[23 * 24 + 12]).toBe(0);
    }
  });
  it("treats the silhouette as a flood barrier and respects manual and forced edits inside limits", () => {
    const p = image(9, 5),
      d = draft(p);
    d.settings.seeds = [seed(p)];
    d.settings.polygons = [rectangle(4, 0, 1, 5)];
    const r = selectBackground(p, d);
    expect(r.weights[8]).toBe(255);
    expect(r.weights[0]).toBe(0);
    d.forced[4] = 255;
    d.manual[9 + 4] = 64;
    const a = selectBackground(p, d);
    expect(a.weights[4]).toBe(0);
    expect(a.weights[13]).toBe(64);
    d.settings.seeds = [seed(p, 4, 0)];
    expect(selectBackground(p, d).selection.every((v) => v === 0)).toBe(true);
  });
  it("preserves protected > forced > automatic independent of polygon order", () => {
    const p = portrait(),
      d = draft(p);
    d.settings.seeds = [seed(p)];
    d.settings.polygons = [
      rectangle(7, 14, 10, 10, "protect"),
      rectangle(0, 0, 24, 24, "force"),
    ];
    const before = p.data.slice(),
      result = selectBackground(p, d);
    expect(result.weights[23 * 24 + 12]).toBe(255);
    expect(result.weights[0]).toBe(0);
    expect(result.conflicts).toBe(100);
    d.settings.polygons.reverse();
    expect(selectBackground(p, d)).toEqual(result);
    expect(p.data).toEqual(before);
  });
  it("keeps polygon operations and brush masks undoable together", () => {
    const p = portrait(),
      d = draft(p);
    const next = { ...d, settings: { ...d.settings, polygons: [rectangle()] } };
    const h = commitCutout({ past: [], present: d, future: [] }, next);
    expect(undoCutout(h).present).toEqual(d);
    expect(redoCutout(undoCutout(h)).present).toEqual(next);
    next.settings.polygons = new Array(33).fill(rectangle());
    expect(() => selectBackground(p, next)).toThrow();
  });
  it("persists native coordinates, restores recipes and verifies exact worker/main output without master writes", async () => {
    const original = service.snapshot().project.masters[0],
      bytes = await fs.readFile(path.join(root, original.file)),
      p = await service.cutoutSource(masterId),
      d = draft(p);
    d.settings.seeds = [seed(p)];
    d.settings.polygons = [
      rectangle(),
      rectangle(8, 15, 2, 2, "protect"),
      rectangle(0, 0, 2, 2, "force"),
    ];
    const preview = selectBackground(p, d, prepareCutout(p));
    const q = (await save(d)).project.qualityAssets[0];
    const output = decodePixels(await fs.readFile(path.join(root, q.file)));
    expect([...output.data]).toEqual([
      ...cutoutPixels(p, preview.weights).data,
    ]);
    const reopened = new ProjectService();
    await reopened.open(root);
    const loaded = await reopened.smartCutoutRecipe(q.id);
    expect(loaded.settings.polygons).toEqual(d.settings.polygons);
    expect(selectBackground(p, loaded).weights).toEqual(preview.weights);
    expect(await fs.readFile(path.join(root, original.file))).toEqual(bytes);
    const invalid = structuredClone(reopened.snapshot().project);
    invalid.qualityAssets[0].smartCutout!.settings.polygons![0].points[0].x = 999;
    expect(projectSchema.safeParse(invalid).success).toBe(false);
  });
  it("retains pre-polygon smart recipes byte-for-byte when opening and saving a new revision", async () => {
    const p = await service.cutoutSource(masterId),
      d = draft(p);
    d.settings.seeds = [seed(p)];
    const q = (await save(d)).project.qualityAssets[0];
    expect(q.smartCutout!.settings.polygons).toBeUndefined();
    const before = await fs.readFile(path.join(root, "laceframe.json"));
    service = new ProjectService();
    await service.open(root);
    expect(await fs.readFile(path.join(root, "laceframe.json"))).toEqual(
      before,
    );
    const next = await service.smartCutoutRecipe(q.id);
    next.settings.polygons = [rectangle()];
    await save(next);
    expect(service.snapshot().project.qualityAssets[0]).toEqual(q);
  });
});
