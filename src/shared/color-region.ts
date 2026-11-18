import { z } from "zod";
import {
  prepareCutout,
  validateCutoutImage,
  type CutoutImage,
} from "./smart-cutout";
export const REGION_VERSION = "color-region-lab76-v1" as const;
const weights = z.instanceof(Uint8Array).refine((v) => v.length <= 4_194_304);
const mask = z
  .object({ file: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const colorSeedSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    hex: z.string().regex(/^#[a-f0-9]{6}$/),
    tolerance: z.number().min(0).max(100),
    connected: z.boolean(),
    operation: z.enum(["add", "subtract"]),
  })
  .strict();
const settings = {
  version: z.literal(REGION_VERSION),
  seeds: z.array(colorSeedSchema).max(32),
};
export const regionSelectionInputSchema = z
  .object({ ...settings, base: weights, override: weights, values: weights })
  .strict();
export const regionSelectionRecordSchema = z
  .object({ ...settings, base: mask, override: mask, values: mask })
  .strict();
export type RegionSelection = z.infer<typeof regionSelectionInputSchema>;
export type ColorSeed = z.infer<typeof colorSeedSchema>;
export type RegionSelectionRecord = z.infer<typeof regionSelectionRecordSchema>;
export function emptyRegionSelection(base: Uint8Array): RegionSelection {
  return {
    version: REGION_VERSION,
    seeds: [],
    base: new Uint8Array(base),
    override: new Uint8Array(base.length),
    values: new Uint8Array(base.length),
  };
}
export function pixelHex(p: CutoutImage, i: number) {
  return (
    "#" +
    [...p.data.subarray(i * 4, i * 4 + 3)]
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}
/** Four-neighbour connectivity, original RGB seeds and full Lab76 distance; transparent pixels never bridge regions. */
export function colorSeedMask(
  p: CutoutImage,
  input: ColorSeed,
  prepared?: Float32Array,
) {
  validateCutoutImage(p);
  const s = colorSeedSchema.parse(input),
    n = p.width * p.height,
    i = s.y * p.width + s.x;
  if (
    s.x >= p.width ||
    s.y >= p.height ||
    p.data[i * 4 + 3] < 128 ||
    pixelHex(p, i) !== s.hex
  )
    throw new Error(
      "Farbseed muss von einem sichtbaren Originalpixel stammen.",
    );
  const labs = prepared ?? prepareCutout(p);
  if (labs.length !== n * 3) throw new Error("Ungültiger Lab-Puffer.");
  const eligible = new Uint8Array(n),
    out = new Uint8Array(n),
    k = i * 3,
    t = s.tolerance ** 2;
  for (let j = 0; j < n; j++)
    if (
      p.data[j * 4 + 3] >= 128 &&
      (labs[j * 3] - labs[k]) ** 2 +
        (labs[j * 3 + 1] - labs[k + 1]) ** 2 +
        (labs[j * 3 + 2] - labs[k + 2]) ** 2 <=
        t
    )
      eligible[j] = 255;
  if (!s.connected) return eligible;
  const queue = new Uint32Array(n);
  let head = 0,
    tail = 0;
  const push = (j: number) => {
    if (eligible[j] && !out[j]) {
      out[j] = 255;
      queue[tail++] = j;
    }
  };
  push(i);
  while (head < tail) {
    const j = queue[head++],
      x = j % p.width;
    if (x) push(j - 1);
    if (x + 1 < p.width) push(j + 1);
    if (j >= p.width) push(j - p.width);
    if (j + p.width < n) push(j + p.width);
  }
  return out;
}
export function replayRegionSelection(p: CutoutImage, input: RegionSelection) {
  validateCutoutImage(p);
  const d = regionSelectionInputSchema.parse(input),
    n = p.width * p.height;
  if (
    [d.base, d.override, d.values].some((a) => a.length !== n) ||
    d.override.some((v) => v !== 0 && v !== 255)
  )
    throw new Error("Farbregion: ungültige Korrekturmasken.");
  const out = new Uint8Array(d.base),
    labs = d.seeds.length ? prepareCutout(p) : undefined;
  for (const seed of d.seeds) {
    const selected = colorSeedMask(p, seed, labs);
    for (let i = 0; i < n; i++)
      if (selected[i]) out[i] = seed.operation === "add" ? 255 : 0;
  }
  for (let i = 0; i < n; i++) if (d.override[i]) out[i] = d.values[i];
  return out;
}
/** A later color action takes precedence over earlier brush corrections within its selection. */
export function appendColorSeed(
  p: CutoutImage,
  d: RegionSelection,
  seed: ColorSeed,
): RegionSelection {
  const selected = colorSeedMask(p, seed),
    override = new Uint8Array(d.override);
  for (let i = 0; i < selected.length; i++) if (selected[i]) override[i] = 0;
  return regionSelectionInputSchema.parse({
    ...d,
    seeds: [...d.seeds, seed],
    override,
  });
}
export function refineRegionSelection(
  p: CutoutImage,
  d: RegionSelection,
  weights: Uint8Array,
): RegionSelection {
  const baseline = replayRegionSelection(p, {
    ...d,
    override: new Uint8Array(d.base.length),
  });
  if (weights.length !== baseline.length)
    throw new Error("Falsche Farbmaskengröße.");
  return {
    ...d,
    override: Uint8Array.from(weights, (v, i) => (v === baseline[i] ? 0 : 255)),
    values: new Uint8Array(weights),
  };
}
export type RegionHistory = {
  past: RegionSelection[];
  present: RegionSelection;
  future: RegionSelection[];
};
export function commitRegion(
  h: RegionHistory,
  next: RegionSelection,
): RegionHistory {
  const limit = Math.max(
    1,
    Math.min(
      32,
      Math.floor((32 * 1024 * 1024) / Math.max(1, next.base.length * 3)),
    ),
  );
  return {
    past: [...h.past, h.present].slice(-limit),
    present: next,
    future: [],
  };
}
export function undoRegion(h: RegionHistory): RegionHistory {
  return h.past.length
    ? {
        past: h.past.slice(0, -1),
        present: h.past.at(-1)!,
        future: [h.present, ...h.future],
      }
    : h;
}
export function redoRegion(h: RegionHistory): RegionHistory {
  return h.future.length
    ? {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      }
    : h;
}
