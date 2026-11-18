import { z } from "zod";
import {
  regionSelectionInputSchema,
  regionSelectionRecordSchema,
} from "./color-region";
export const COLOR_VERSION = "regional-lab-offset-v1" as const;
export const MAX_COLOR_PIXELS = 4_194_304;
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const hexSchema = z.string().regex(/^#[0-9a-f]{6}$/);
const maskRef = z.object({ file: z.string(), sha256: sha }).strict();
export const colorRoleSchema = z.enum(["hair", "skin", "clothes", "custom"]);
export const colorRegionSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(120),
    role: colorRoleSchema,
  })
  .strict();
const weights = z
  .instanceof(Uint8Array)
  .refine((v) => v.length <= MAX_COLOR_PIXELS);
export const paletteInputSchema = z
  .object({
    masterId: z.uuid(),
    masterSha256: sha,
    regions: z
      .array(
        colorRegionSchema.extend({
          weights,
          selection: regionSelectionInputSchema.optional(),
        }),
      )
      .min(1)
      .max(5),
  })
  .strict();
export const paletteSchema = z
  .object({
    id: z.uuid(),
    masterId: z.uuid(),
    masterSha256: sha,
    characterId: z.uuid(),
    revision: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    algorithm: z.literal(COLOR_VERSION),
    regions: z
      .array(
        colorRegionSchema.extend({
          mask: maskRef,
          selection: regionSelectionRecordSchema.optional(),
          colors: z
            .array(
              z
                .object({ hex: hexSchema, count: z.number().int().positive() })
                .strict(),
            )
            .min(1)
            .max(16),
        }),
      )
      .min(1)
      .max(5),
  })
  .strict();
export const colorRuleSchema = z
  .object({
    paletteRegionId: z.uuid(),
    sourceColor: hexSchema,
    targetColor: hexSchema,
    strength: z.number().min(0).max(1),
    tolerance: z.number().min(1).max(50),
    correctLightness: z.boolean(),
    transferGroups: z
      .array(
        z.object({ sourceColor: hexSchema, targetColor: hexSchema }).strict(),
      )
      .min(1)
      .max(16)
      .optional(),
  })
  .strict();
export const colorDraftSchema = z
  .object({
    paletteId: z.uuid(),
    alignmentConfirmed: z.literal(true),
    regions: z.array(colorRuleSchema.extend({ weights })).min(1).max(5),
    protectedWeights: weights,
  })
  .strict();
export const correctionInputSchema = colorDraftSchema.extend({
  sourceId: z.uuid(),
  sourceSha256: sha,
  previewPixelSha256: sha,
});
export const correctionRecordSchema = z
  .object({
    paletteId: z.uuid(),
    alignmentConfirmed: z.literal(true),
    algorithm: z.literal(COLOR_VERSION),
    revision: z.number().int().positive(),
    pixelSha256: sha,
    protectedMask: maskRef,
    regions: z
      .array(colorRuleSchema.extend({ mask: maskRef }))
      .min(1)
      .max(5),
  })
  .strict();
export type MasterPalette = z.infer<typeof paletteSchema>;
export type ColorDraft = z.infer<typeof colorDraftSchema>;
export type ColorRecord = z.infer<typeof correctionRecordSchema>;
export type ColorPixels = { width: number; height: number; data: Uint8Array };
export type ColorMeasurement = {
  visible: number;
  chromaticDeltaE76: number;
  excessLightness: number;
  warning: boolean;
};
export function validateColorPixels(p: ColorPixels) {
  if (
    !Number.isInteger(p.width) ||
    !Number.isInteger(p.height) ||
    p.width < 1 ||
    p.height < 1 ||
    p.width * p.height > MAX_COLOR_PIXELS ||
    p.data.length !== p.width * p.height * 4
  )
    throw new Error(
      "Farbprüfung: vollständige RGBA8-Daten, maximal 4 MP; keine automatische Skalierung.",
    );
}
export function rgbHex(rgb: ArrayLike<number>) {
  return (
    "#" +
    Array.from({ length: 3 }, (_, c) =>
      rgb[c].toString(16).padStart(2, "0"),
    ).join("")
  );
}
export function lab(hex: string): [number, number, number] {
  hexSchema.parse(hex);
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const f = (v: number) =>
    v > 216 / 24389 ? Math.cbrt(v) : ((24389 / 27) * v + 16) / 116;
  const x = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047),
    y = f(0.2126729 * r + 0.7151522 * g + 0.072175 * b),
    zz = f((0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - zz)];
}
function fromLab([l, a, b]: number[]): number[] {
  const y = (l + 16) / 116,
    x = y + a / 500,
    zz = y - b / 200;
  const f = (v: number) =>
    v ** 3 > 216 / 24389 ? v ** 3 : (116 * v - 16) / (24389 / 27);
  const xx = 0.95047 * f(x),
    yy = f(y),
    zzz = 1.08883 * f(zz);
  return [
    3.2404542 * xx - 1.5371385 * yy - 0.4985314 * zzz,
    -0.969266 * xx + 1.8760108 * yy + 0.041556 * zzz,
    0.0556434 * xx - 0.2040259 * yy + 1.0572252 * zzz,
  ].map((v) =>
    Math.round(
      255 *
        Math.max(
          0,
          Math.min(
            1,
            v <= 0.0031308
              ? 12.92 * v
              : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055,
          ),
        ),
    ),
  );
}
function checkMask(p: ColorPixels, w: Uint8Array) {
  if (!(w instanceof Uint8Array) || w.length !== p.width * p.height)
    throw new Error(
      "Farbmaske hat falsche Abmessungen; Regionen der Expression separat zuordnen.",
    );
}
/** Bounded 5-bit histogram; representative is an actual input RGB, not a quantized replacement palette. */
export function extractPalette(p: ColorPixels, weights: Uint8Array) {
  validateColorPixels(p);
  checkMask(p, weights);
  const bins = new Map<number, { hex: string; count: number }>();
  for (let i = 0; i < weights.length; i++)
    if (weights[i] >= 128 && p.data[i * 4 + 3] >= 128) {
      const k = i * 4,
        bin =
          (p.data[k] >> 3) * 1024 +
          (p.data[k + 1] >> 3) * 32 +
          (p.data[k + 2] >> 3);
      const old = bins.get(bin);
      if (old) old.count++;
      else bins.set(bin, { hex: rgbHex(p.data.subarray(k, k + 3)), count: 1 });
    }
  const colors = [...bins.values()]
    .sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex))
    .slice(0, 16);
  if (!colors.length)
    throw new Error(
      "Region enthält keine ausreichend sichtbaren, markierten Pixel.",
    );
  return colors;
}
/** Chroma-only Delta E76 plus excess L*: darker shades are allowed. Not a style or identity score. */
export function measureColors(
  p: ColorPixels,
  weights: Uint8Array,
  colors: { hex: string }[],
): ColorMeasurement {
  validateColorPixels(p);
  checkMask(p, weights);
  if (!colors.length) throw new Error("Referenzpalette fehlt.");
  const refs = colors.map((c) => lab(c.hex)),
    maxL = Math.max(...refs.map((c) => c[0]));
  let visible = 0,
    chroma = 0,
    light = 0;
  const cache = new Map<string, [number, number]>();
  for (let i = 0; i < weights.length; i++)
    if (weights[i] >= 128 && p.data[i * 4 + 3] >= 128) {
      const hex = rgbHex(p.data.subarray(i * 4, i * 4 + 3));
      let v = cache.get(hex);
      if (!v) {
        const c = lab(hex);
        v = [
          Math.min(...refs.map((r) => Math.hypot(c[1] - r[1], c[2] - r[2]))),
          Math.max(0, c[0] - maxL - 8),
        ];
        if (cache.size < 65536) cache.set(hex, v);
      }
      visible++;
      chroma += v[0];
      light += v[1];
    }
  if (!visible)
    throw new Error("Kandidatenregion enthält keine sichtbaren Pixel.");
  return {
    visible,
    chromaticDeltaE76: chroma / visible,
    excessLightness: light / visible,
    warning: chroma / visible > 12 || light / visible > 8,
  };
}
/** Selective Lab offset. Retains per-pixel tone/chroma differences; never snaps pixels onto a palette.
 * Overlap is rejected, protected pixels (any nonzero mask value) and alpha/hidden RGB remain exact.
 * Gamut clipping/byte rounding can reduce details at channel limits and must be reviewed. */
export function correctColors(
  source: ColorPixels,
  input: ColorDraft,
): ColorPixels {
  const d = colorDraftSchema.parse(input);
  return correctColorRegions(source, {
    protectedWeights: d.protectedWeights,
    regions: d.regions.map((r) => {
      const { paletteRegionId, ...rest } = r;
      void paletteRegionId;
      return rest;
    }),
  });
}
export const colorTransformSchema = z
  .object({
    protectedWeights: weights,
    regions: z
      .array(
        colorRuleSchema.omit({ paletteRegionId: true }).extend({ weights }),
      )
      .min(1)
      .max(5),
  })
  .strict();
/** Shared manual/reference color transform; palette provenance is validated by its caller. */
export function correctColorRegions(
  source: ColorPixels,
  input: z.infer<typeof colorTransformSchema>,
): ColorPixels {
  validateColorPixels(source);
  const d = colorTransformSchema.parse(input);
  checkMask(source, d.protectedWeights);
  const owned = new Uint8Array(source.width * source.height),
    data = new Uint8Array(source.data);
  for (const r of d.regions) {
    checkMask(source, r.weights);
    const groups = (
        r.transferGroups ?? [
          { sourceColor: r.sourceColor, targetColor: r.targetColor },
        ]
      ).map((g) => ({ from: lab(g.sourceColor), to: lab(g.targetColor) })),
      cache = new Map<string, number[]>(),
      noChange = groups.every((g) => g.from.every((v, i) => v === g.to[i]));
    for (let i = 0; i < owned.length; i++)
      if (r.weights[i]) {
        if (owned[i])
          throw new Error(
            "Farbregionen überlappen; eindeutige Zuordnung erforderlich.",
          );
        owned[i] = 1;
        const k = i * 4;
        if (
          d.protectedWeights[i] ||
          !source.data[k + 3] ||
          !r.strength ||
          noChange
        )
          continue;
        const hex = rgbHex(source.data.subarray(k, k + 3));
        let rgb = cache.get(hex);
        if (!rgb) {
          const c = lab(hex);
          const { from, to } = closestGroup(c, groups);
          // Chroma grouping deliberately includes new darker shades, but retains their L* spacing.
          if (Math.hypot(c[1] - from[1], c[2] - from[2]) > r.tolerance)
            continue;
          const strength = (r.strength * r.weights[i]) / 255;
          rgb = fromLab([
            c[0] + (r.correctLightness ? to[0] - from[0] : 0) * strength,
            c[1] + (to[1] - from[1]) * strength,
            c[2] + (to[2] - from[2]) * strength,
          ]);
          // Soft weights may vary: only cache full-weight conversions.
          if (r.weights[i] === 255 && cache.size < 65536) cache.set(hex, rgb);
        } else if (r.weights[i] !== 255) {
          const c = lab(hex),
            { from, to } = closestGroup(c, groups),
            s = (r.strength * r.weights[i]) / 255;
          rgb = fromLab([
            c[0] + (r.correctLightness ? to[0] - from[0] : 0) * s,
            c[1] + (to[1] - from[1]) * s,
            c[2] + (to[2] - from[2]) * s,
          ]);
        }
        data.set(rgb, k);
      }
  }
  return { ...source, data };
}

function closestGroup(c: number[], groups: { from: number[]; to: number[] }[]) {
  return groups.reduce((best, g) =>
    Math.hypot(c[1] - g.from[1], c[2] - g.from[2]) <
    Math.hypot(c[1] - best.from[1], c[2] - best.from[2])
      ? g
      : best,
  );
}
/** Proposes chromatic group offsets using actual regional swatches. No per-pixel palette snapping.
 * Near-identical chroma shares one anchor so additional darker shades retain their own L*. */
export function paletteTransferGroups(
  candidate: { hex: string; count: number }[],
  master: { hex: string; count: number }[],
) {
  if (!candidate.length || !master.length)
    throw new Error("Master- und Kandidatenregion zuerst zuweisen.");
  const anchors: { sourceColor: string; targetColor: string }[] = [];
  for (const c of candidate) {
    const from = lab(c.hex);
    if (
      anchors.some((g) => {
        const v = lab(g.sourceColor);
        return Math.hypot(from[1] - v[1], from[2] - v[2]) < 3;
      })
    )
      continue;
    const distance = (hex: string) => {
      const to = lab(hex);
      return (
        Math.hypot(from[1] - to[1], from[2] - to[2]) +
        0.25 * Math.abs(from[0] - to[0])
      );
    };
    const target = master.reduce((best, v) =>
      distance(v.hex) < distance(best.hex) ? v : best,
    );
    anchors.push({ sourceColor: c.hex, targetColor: target.hex });
  }
  return anchors;
}
