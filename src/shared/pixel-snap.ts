import { rasterGrid, rasterClean } from "./pixel-snap-runtime";
import { z } from "zod";
import {
  colorRuleSchema,
  correctColorRegions,
  type ColorPixels,
} from "./color-consistency";
export const MAX_SNAP_PIXELS = 4_194_304;
export const SNAP_VERSION = "spritefusion-native-rgba-v1" as const;
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const weights = z
  .instanceof(Uint8Array)
  .refine((v) => v.length <= MAX_SNAP_PIXELS);
export const snapSettingsSchema = z
  .object({
    grid: z.number().int().min(2).max(32),
    strength: z.enum(["gentle", "strong"]),
  })
  .strict();
export type SnapSettings = z.infer<typeof snapSettingsSchema>;
const mask = z.object({ file: z.string(), sha256: sha }).strict();
export const localColorSchema = colorRuleSchema.omit({
  paletteRegionId: true,
  transferGroups: true,
});
export type LocalColor = z.infer<typeof localColorSchema>;
export const pixelEditInputSchema = z
  .object({
    sourceId: z.uuid(),
    sourceSha256: sha,
    previewPixelSha256: sha,
    protectedWeights: weights,
    edit: z.discriminatedUnion("kind", [
      z
        .object({ kind: z.literal("snap"), settings: snapSettingsSchema })
        .strict(),
      z
        .object({ kind: z.literal("color"), rule: localColorSchema, weights })
        .strict(),
    ]),
  })
  .strict();
export const pixelEditRecordSchema = z
  .object({
    algorithm: z.literal(SNAP_VERSION),
    revision: z.number().int().positive(),
    pixelSha256: sha,
    protectedMask: mask,
    edit: z.discriminatedUnion("kind", [
      z
        .object({ kind: z.literal("snap"), settings: snapSettingsSchema })
        .strict(),
      z
        .object({ kind: z.literal("color"), rule: localColorSchema, mask })
        .strict(),
    ]),
  })
  .strict();
export type PixelEdit = z.infer<typeof pixelEditInputSchema>["edit"];
export type SnapAnalysis = {
  grid?: number;
  edges: number;
  offGrid: number;
  partialAlpha: number;
  isolated: number;
  ambiguous: number;
};
export function validateSnap(p: ColorPixels, protection?: Uint8Array) {
  if (
    !Number.isInteger(p.width) ||
    !Number.isInteger(p.height) ||
    p.width < 1 ||
    p.height < 1 ||
    p.width * p.height > MAX_SNAP_PIXELS ||
    p.data.length !== p.width * p.height * 4 ||
    (protection && protection.length !== p.width * p.height)
  )
    throw new Error(
      "Pixelbearbeitung benötigt RGBA8 bis 4 MP und passende Schutzmasken. Keine Skalierung.",
    );
}
const same = (d: Uint8Array, a: number, b: number) =>
  d[a * 4] === d[b * 4] &&
  d[a * 4 + 1] === d[b * 4 + 1] &&
  d[a * 4 + 2] === d[b * 4 + 2] &&
  d[a * 4 + 3] === d[b * 4 + 3];
const distance = (d: Uint8Array, a: number, b: number) =>
  Math.max(...[0, 1, 2].map((c) => Math.abs(d[a * 4 + c] - d[b * 4 + c])));
/** Read-only metrics plus upstream Rust peak-spacing analysis. No invented fallback grid. */
export function analyzeSnap(p: ColorPixels): SnapAnalysis {
  validateSnap(p);
  const xs = new Uint32Array(p.width),
    ys = new Uint32Array(p.height);
  let edges = 0,
    partialAlpha = 0,
    isolated = 0;
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const i = y * p.width + x,
        a = p.data[i * 4 + 3];
      if (a > 0 && a < 255) partialAlpha++;
      if (a !== 255) continue;
      if (
        x &&
        p.data[(i - 1) * 4 + 3] === 255 &&
        distance(p.data, i, i - 1) >= 24
      ) {
        xs[x]++;
        edges++;
      }
      if (
        y &&
        p.data[(i - p.width) * 4 + 3] === 255 &&
        distance(p.data, i, i - p.width) >= 24
      ) {
        ys[y]++;
        edges++;
      }
      if (
        x &&
        y &&
        x < p.width - 1 &&
        y < p.height - 1 &&
        [i - 1, i + 1, i - p.width, i + p.width].every(
          (n) => !same(p.data, i, n),
        )
      )
        isolated++;
    }
  return {
    grid: rasterGrid(p),
    edges,
    offGrid: isolated,
    partialAlpha,
    isolated,
    ambiguous: isolated,
  };
}
/** Rust upstream cell analysis and majority selection adapted in place, never resampled. */
export function snapPixels(
  p: ColorPixels,
  input: SnapSettings,
  protectedWeights: Uint8Array,
): ColorPixels & { changed: number; ambiguous: number } {
  validateSnap(p, protectedWeights);
  const s = snapSettingsSchema.parse(input);
  return rasterClean(p, protectedWeights, s.grid, s.strength === "strong");
}
export function applyPixelEdit(
  p: ColorPixels,
  edit: PixelEdit,
  protectedWeights: Uint8Array,
): ColorPixels {
  validateSnap(p, protectedWeights);
  if (edit.kind === "snap")
    return snapPixels(p, edit.settings, protectedWeights);
  return correctColorRegions(p, {
    protectedWeights: new Uint8Array(protectedWeights),
    regions: [{ ...edit.rule, weights: edit.weights }],
  });
}
