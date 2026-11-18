import { afterEach, beforeEach, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectService, hashBytes } from "../src/main/project-service";
import { encodePixels } from "../src/main/mask-composite";
import { seedHistoricalMaster } from "./historical-master";
import { projectSchema } from "../src/shared/domain";
import {
  validateLayerMasks,
  semanticRegion,
  type LayerDraft,
} from "../src/shared/semantic-layers";
let dir: string, s: ProjectService, masterId: string, expressionId: string;
const image = (width = 16, height = 12) => {
  const data = new Uint8Array(width * height * 4);
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++)
      data.set([80, 60 + x, 40, 255], (y * width + x) * 4);
  return { width, height, data };
};
function layer(role: LayerDraft["role"] = "hair", index = 20): LayerDraft {
  const weights = new Uint8Array(192);
  weights[index] = 255;
  return {
    id: randomUUID(),
    name: role,
    role,
    visible: true,
    locked: false,
    order: 0,
    weights,
  };
}
async function save(
  layers: LayerDraft[],
  sourceId = masterId,
  baseSetId?: string,
  templateSetId?: string,
) {
  const src = await s.analysisSource(sourceId);
  return s.command({
    type: "saveSemanticLayers",
    sourceId,
    sourceSha256: src.sha256,
    baseSetId,
    templateSetId,
    layers,
  });
}
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-layers-"));
  s = new ProjectService();
  await s.create(dir, "Layer fixture");
  await s.command({ type: "addCharacter", name: "Synthetic" });
  const staged = await s.stage(encodePixels(image()), "master.png");
  await seedHistoricalMaster(
    s,
    staged,
    s.snapshot().project.selectedCharacterId,
  );
  masterId = s.snapshot().project.masters[0].id;
  const expr = await s.stage(encodePixels(image()), "expression.png");
  await s.command({
    type: "importCandidate",
    characterId: s.snapshot().project.selectedCharacterId,
    variantId: s.snapshot().project.variants[0].id,
    action: "silent",
    token: expr.token,
  });
  expressionId = s.snapshot().project.assets[0].id;
});
afterEach(async () => fs.rm(dir, { recursive: true, force: true }));
it("saves immutable masks, roles, revisions and exact master/source binding across reopen", async () => {
  const before = await fs.readFile(path.join(dir, "laceframe.json")),
    master = s.snapshot().project.masters[0],
    original = await fs.readFile(path.join(dir, master.file)),
    hair = layer();
  await save([hair]);
  const one = s.snapshot().project.semanticLayerSets[0];
  expect(
    await fs.readFile(
      path.join(dir, "laceframe.v2.pre-semantic-layers.backup.json"),
    ),
  ).toEqual(before);
  expect((await s.semanticLayers(one.id)).layers[0].weights).toEqual(
    hair.weights,
  );
  await save(
    [{ ...hair, name: "Hair changed", locked: true }],
    masterId,
    one.id,
  );
  const two = s.snapshot().project.semanticLayerSets[1];
  expect(two.revision).toBe(2);
  expect(one.layers[0].name).toBe("hair");
  expect(two.layers[0].mask).toEqual(one.layers[0].mask);
  const unchanged = await fs.readFile(path.join(dir, "laceframe.json"));
  await s.open(dir);
  expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(
    unchanged,
  );
  expect((await s.semanticLayers(one.id)).layers[0].weights).toEqual(
    hair.weights,
  );
  expect(await fs.readFile(path.join(dir, master.file))).toEqual(original);
  expect(
    (await fs.stat(path.join(dir, one.layers[0].mask.file))).mode & 0o222,
  ).toBe(0);
});
it("opens older projects read-only and preserves their first-write snapshot", async () => {
  const file = path.join(dir, "laceframe.json"),
    raw = JSON.parse(await fs.readFile(file, "utf8"));
  delete raw.semanticLayerSets;
  const old = Buffer.from(JSON.stringify(raw));
  await fs.writeFile(file, old);
  await s.open(dir);
  expect(s.snapshot().project.semanticLayerSets).toEqual([]);
  expect(await fs.readFile(file)).toEqual(old);
  await s.command({ type: "addCharacter", name: "Unrelated first write" });
  await s.open(dir);
  await save([layer()]);
  expect(
    await fs.readFile(
      path.join(dir, "laceframe.v2.pre-semantic-layers.backup.json"),
    ),
  ).toEqual(old);
});
it("rejects overlap, transparency and wrong dimensions before rewriting the manifest", async () => {
  const file = path.join(dir, "laceframe.json"),
    before = await fs.readFile(file),
    hair = layer();
  for (const layers of [
    [hair, { ...layer("skin"), order: 1 }],
    [layer("hair", 0)],
    [{ ...hair, weights: new Uint8Array(1) }],
  ]) {
    await expect(save(layers)).rejects.toThrow();
    expect(await fs.readFile(file)).toEqual(before);
  }
  expect(
    validateLayerMasks(image(), [hair, { ...layer("skin"), order: 1 }])
      .conflicts,
  ).toBe(1);
  expect(semanticRegion([hair], "hair")).toEqual(hair.weights);
});
it("rejects stale edits and invalid orders/IDs", async () => {
  const hair = layer();
  await save([hair]);
  const before = await fs.readFile(path.join(dir, "laceframe.json"));
  await expect(save([hair])).rejects.toThrow("Layerrevision");
  const set = s.snapshot().project.semanticLayerSets[0];
  for (const rows of [
    [hair, hair],
    [hair, { ...layer("skin", 21), order: 0 }],
  ])
    await expect(save(rows, masterId, set.id)).rejects.toThrow();
  expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(before);
});
it("maps Expression definitions but starts independent masks even with different dimensions", async () => {
  const small = await s.stage(
    encodePixels(image(8, 6)),
    "small-expression.png",
  );
  await s.command({
    type: "importCandidate",
    characterId: s.snapshot().project.selectedCharacterId,
    variantId: s.snapshot().project.variants[0].id,
    action: "silent",
    token: small.token,
  });
  expressionId = s.snapshot().project.assets.at(-1)!.id;
  const hair = layer();
  await save([hair]);
  const master = s.snapshot().project.semanticLayerSets[0],
    target = layer();
  target.weights = new Uint8Array(48);
  target.masterLayerId = hair.id;
  await expect(save([target], expressionId)).rejects.toThrow();
  await save([target], expressionId, undefined, master.id);
  const expr = s.snapshot().project.semanticLayerSets[1];
  expect(expr.masterId).toBe(masterId);
  expect(expr.templateSetId).toBe(master.id);
  expect(
    (await s.semanticLayers(expr.id)).layers[0].weights.some(Boolean),
  ).toBe(false);
  await s.open(dir);
  expect(s.snapshot().project.semanticLayerSets[0].layers[0].mask.sha256).toBe(
    master.layers[0].mask.sha256,
  );
});
it("rejects foreign master/template roles and source SHA", async () => {
  const hair = layer();
  await save([hair]);
  const template = s.snapshot().project.semanticLayerSets[0];
  await expect(
    save(
      [{ ...layer("skin"), masterLayerId: hair.id }],
      expressionId,
      undefined,
      template.id,
    ),
  ).rejects.toThrow();
  const src = await s.analysisSource(masterId);
  await expect(
    s.command({
      type: "saveSemanticLayers",
      sourceId: masterId,
      sourceSha256: "0".repeat(64),
      layers: [layer()],
    }),
  ).rejects.toThrow();
  expect(src.sha256).not.toBe("0".repeat(64));
});
it.each(["path", "hash", "dimensions", "overlap", "transparent", "symlink"])(
  "refuses %s mask corruption on loading without replacing the active project",
  async (kind) => {
    await save([layer()]);
    const file = path.join(dir, "laceframe.json"),
      p = s.snapshot().project,
      set = p.semanticLayerSets[0];
    if (kind === "path") set.layers[0].mask.file = "../outside.png";
    if (kind === "hash")
      await fs
        .chmod(path.join(dir, set.layers[0].mask.file), 0o600)
        .then(() =>
          fs.writeFile(
            path.join(dir, set.layers[0].mask.file),
            encodePixels(image()),
          ),
        );
    if (kind === "symlink") {
      const file = path.join(dir, set.layers[0].mask.file),
        outside = path.join(dir, "outside-mask.png");
      await fs.copyFile(file, outside);
      await fs.unlink(file);
      await fs.symlink(outside, file);
    }
    if (kind === "dimensions") set.width++;
    if (kind === "overlap")
      set.layers.push({ ...set.layers[0], id: randomUUID(), order: 1 });
    if (kind === "transparent") {
      const mask = image();
      mask.data.fill(255);
      const bytes = encodePixels(mask),
        sha256 = hashBytes(bytes),
        rel = `assets/color-masks/${sha256}.png`;
      await fs.writeFile(path.join(dir, rel), bytes);
      set.layers[0].mask = { file: rel, sha256 };
    }
    await fs.writeFile(file, JSON.stringify(p));
    await expect(s.open(dir)).rejects.toThrow();
    expect(s.snapshot().project.semanticLayerSets[0].layers).toHaveLength(1);
  },
);
it("validates path and source relationships in the shared project schema", async () => {
  await save([layer()]);
  const p = s.snapshot().project;
  p.semanticLayerSets[0].characterId = randomUUID();
  expect(projectSchema.safeParse(p).success).toBe(false);
});
it("imports existing color masks byte-exactly with immutable origin and reusable role data", async () => {
  const src = await s.analysisSource(masterId),
    weights = layer().weights,
    regionId = randomUUID();
  await s.command({
    type: "saveMasterPalette",
    masterId,
    masterSha256: src.sha256,
    regions: [{ id: regionId, name: "Hair source", role: "hair", weights }],
  });
  const palette = s.snapshot().project.masterPalettes[0],
    original = await fs.readFile(path.join(dir, palette.regions[0].mask.file));
  const { layerFromColorRegion } = await import(
      "../src/shared/semantic-layers"
    ),
    decoded = await s.colorPalette(palette.id);
  const imported = layerFromColorRegion(
    src,
    decoded.regions[0],
    palette.id,
    randomUUID(),
    0,
  );
  await save([imported]);
  const record = s.snapshot().project.semanticLayerSets[0];
  expect(record.layers[0].importedFrom).toEqual({
    paletteId: palette.id,
    regionId,
    maskSha256: palette.regions[0].mask.sha256,
  });
  expect((await s.semanticLayers(record.id)).layers[0].weights).toEqual(
    weights,
  );
  expect(
    semanticRegion((await s.semanticLayers(record.id)).layers, "hair"),
  ).toEqual(weights);
  expect(
    await fs.readFile(path.join(dir, palette.regions[0].mask.file)),
  ).toEqual(original);
  await s.open(dir);
  expect(s.snapshot().project.masterPalettes[0]).toEqual(palette);
});
it("requires explicit visible-only import and keeps source weights unchanged", async () => {
  const { layerFromColorRegion } = await import(
      "../src/shared/semantic-layers"
    ),
    src = await s.analysisSource(masterId),
    weights = layer().weights;
  weights[0] = 255;
  const region = {
    id: randomUUID(),
    name: "Partial source",
    role: "clothes",
    weights,
    mask: { sha256: "0".repeat(64) },
  };
  expect(() =>
    layerFromColorRegion(src, region, randomUUID(), randomUUID(), 0),
  ).toThrow("transparente");
  const imported = layerFromColorRegion(
    src,
    region,
    randomUUID(),
    randomUUID(),
    0,
    true,
  );
  expect(imported.role).toBe("clothing");
  expect(imported.weights[0]).toBe(0);
  expect(weights[0]).toBe(255);
  expect(imported.weights[20]).toBe(255);
});
it("rechecks imported region hashes before saving instead of trusting renderer provenance", async () => {
  const src = await s.analysisSource(masterId),
    weights = layer().weights;
  await s.command({
    type: "saveMasterPalette",
    masterId,
    masterSha256: src.sha256,
    regions: [{ id: randomUUID(), name: "Source", role: "hair", weights }],
  });
  const palette = s.snapshot().project.masterPalettes[0],
    region = (await s.colorPalette(palette.id)).regions[0],
    { layerFromColorRegion } = await import("../src/shared/semantic-layers");
  const imported = layerFromColorRegion(
      src,
      region,
      palette.id,
      randomUUID(),
      0,
    ),
    before = await fs.readFile(path.join(dir, "laceframe.json"));
  const mask = path.join(dir, region.mask.file);
  await fs.chmod(mask, 0o600);
  await fs.writeFile(mask, encodePixels(image()));
  await expect(save([imported])).rejects.toThrow();
  expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(before);
});
it("creates empty Expression masks from exact Master definitions and keeps historical template bindings", async () => {
  const { expressionLayerDraft } = await import(
      "../src/shared/semantic-layers"
    ),
    hair = layer();
  await save([hair]);
  const template = s.snapshot().project.semanticLayerSets[0],
    draft = expressionLayerDraft(template, 16, 12, randomUUID);
  expect(draft[0].id).not.toBe(hair.id);
  expect(draft[0].masterLayerId).toBe(hair.id);
  expect(draft[0].name).toBe(hair.name);
  expect(draft[0].weights.some(Boolean)).toBe(false);
  draft[0].weights[21] = 255;
  await save(draft, expressionId, undefined, template.id);
  const expr = s.snapshot().project.semanticLayerSets[1];
  const next = {
    ...hair,
    name: "New definition",
    weights: new Uint8Array(hair.weights),
  };
  next.weights[22] = 255;
  await save([next], masterId, template.id);
  await s.open(dir);
  const restored = await s.semanticLayers(expr.id);
  expect(restored.set.templateSetId).toBe(template.id);
  expect(restored.layers[0].weights[20]).toBe(0);
  expect(restored.layers[0].weights[21]).toBe(255);
  expect((await s.semanticLayers(template.id)).layers[0].weights[20]).toBe(255);
  await save(restored.layers, expressionId, expr.id, template.id);
  expect(s.snapshot().project.semanticLayerSets.at(-1)!.templateSetId).toBe(
    template.id,
  );
});
it("rejects Expression mapping to a different character's layer template", async () => {
  const { expressionLayerDraft } = await import(
    "../src/shared/semantic-layers"
  );
  await s.command({ type: "addCharacter", name: "Other identity" });
  const pixels = image();
  pixels.data[80] = 99;
  const staged = await s.stage(encodePixels(pixels), "other.png");
  await seedHistoricalMaster(
    s,
    staged,
    s.snapshot().project.selectedCharacterId,
  );
  const other = s.snapshot().project.masters.at(-1)!;
  await save([layer()], other.id);
  const template = s.snapshot().project.semanticLayerSets.at(-1)!;
  const before = await fs.readFile(path.join(dir, "laceframe.json"));
  await expect(
    save(
      expressionLayerDraft(template, 16, 12, randomUUID),
      expressionId,
      undefined,
      template.id,
    ),
  ).rejects.toThrow();
  expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(before);
});

it("does not consume a pending image import while saving layers", async () => {
  const pending = await s.stage(
    encodePixels(image()),
    "pending-expression.png",
  );
  await expect(save([layer()])).rejects.toThrow();
  expect(s.snapshot().project.semanticLayerSets).toHaveLength(0);
  await s.command({
    type: "importCandidate",
    characterId: s.snapshot().project.selectedCharacterId,
    variantId: s.snapshot().project.variants[0].id,
    action: "silent",
    token: pending.token,
  });
  expect(s.snapshot().project.assets).toHaveLength(2);
});
it("rejects layer memory budgets before scanning oversized region lists", () => {
  const p = {
      width: 2048,
      height: 2048,
      data: new Uint8Array(2048 * 2048 * 4),
    },
    weights = new Uint8Array(2048 * 2048);
  expect(() =>
    validateLayerMasks(
      p,
      Array.from({ length: 17 }, (_, order) => ({
        ...layer(),
        order,
        weights,
      })),
    ),
  ).toThrow("Speichergrenze");
});
