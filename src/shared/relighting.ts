import { z } from "zod";
export const MAX_RELIGHT_PIXELS = 4_194_304;
export const RELIGHT_VERSION = "2d-rgba8-lut-v1" as const;
export const lightSchema = z
  .object({
    direction: z.number().min(0).max(360),
    intensity: z.number().min(0).max(2),
    temperature: z.number().min(-1).max(1),
    ambient: z.number().min(0).max(2),
    shadows: z.number().min(0).max(1),
    contrast: z.number().min(0.25).max(2),
    highlights: z.number().min(0).max(1),
    pixelArt: z.boolean(),
    levels: z.number().int().min(2).max(16),
  })
  .strict();
export type Light = z.infer<typeof lightSchema>;
export const DEFAULT_LIGHT: Light = {
  direction: 315,
  intensity: 0,
  temperature: 0,
  ambient: 1,
  shadows: 0,
  contrast: 1,
  highlights: 0,
  pixelArt: false,
  levels: 4,
};
export const regionRoleSchema = z.enum([
  "skin",
  "hair",
  "clothes",
  "accessories",
  "custom",
]);
const reuseSchema = z
  .object({
    id: z.uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    revision: z.number().int().positive(),
  })
  .strict();
export const lightRegionSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(120),
    role: regionRoleSchema,
    revision: z.number().int().positive(),
    light: lightSchema,
    reusedExpressionMask: reuseSchema.optional(),
  })
  .strict();
export type LightRegion = z.infer<typeof lightRegionSchema> & {
  weights: Uint8Array;
};
export const relightInputSchema = z
  .object({
    sourceId: z.uuid(),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    light: lightSchema,
    regions: z
      .array(
        lightRegionSchema.extend({
          weights: z
            .instanceof(Uint8Array)
            .refine((v) => v.length <= MAX_RELIGHT_PIXELS),
        }),
      )
      .max(5),
    previewPixelSha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const relightRecordSchema = z
  .object({
    revision: z.number().int().positive(),
    algorithm: z.literal(RELIGHT_VERSION),
    geometry: z.literal("2d-gradient-no-normals"),
    light: lightSchema,
    pixelSha256: z.string().regex(/^[a-f0-9]{64}$/),
    regions: z
      .array(
        lightRegionSchema.extend({
          mask: z
            .object({
              sha256: z.string().regex(/^[a-f0-9]{64}$/),
              file: z.string(),
              type: z.literal("lighting-weight"),
            })
            .strict(),
        }),
      )
      .max(5),
  })
  .strict();
export type RelightRecord = z.infer<typeof relightRecordSchema>;
export type RelightPixels = { width: number; height: number; data: Uint8Array };
export function validateRelightSize(p: RelightPixels) {
  if (
    !Number.isInteger(p.width) ||
    !Number.isInteger(p.height) ||
    p.width < 1 ||
    p.height < 1 ||
    p.width * p.height > MAX_RELIGHT_PIXELS ||
    p.data.length !== p.width * p.height * 4
  )
    throw new Error(
      "Live Relighting benötigt RGBA8 mit maximal 4 Megapixeln. Keine automatische Verkleinerung.",
    );
}
/** Canonical point-wise encoded-sRGB 2D tone transform. No resampling, alpha edits, surface inference or spatial blur.
 * 256 spatial light bands and byte LUTs deliberately make worker preview/export bit-identical.
 * Regions compose in listed order, always adjusting the original tone (not accumulating corrections).
 * Future normal inputs require a separate algorithm version; v1 accepts no geometry. */
export function relightPixels(
  source: RelightPixels,
  input: Light,
  regions: LightRegion[] = [],
): RelightPixels {
  validateRelightSize(source);
  const light = lightSchema.parse(input);
  if (
    regions.length > 5 ||
    regions.some((r) => r.weights.length !== source.width * source.height)
  )
    throw new Error("Ungültige Lichtregionen.");
  const data = new Uint8Array(source.data);
  const transforms = [
    light,
    ...regions.map((r) => lightSchema.parse(r.light)),
  ].map((p) => {
    const angle = (p.direction * Math.PI) / 180;
    const lut = new Uint8Array(256 * 256 * 3);
    for (let band = 0; band < 256; band++) {
      let illumination = band / 255;
      if (p.pixelArt)
        illumination =
          Math.round(illumination * (p.levels - 1)) / (p.levels - 1);
      const gain =
        p.ambient + p.intensity * illumination - p.shadows * (1 - illumination);
      for (let value = 0; value < 256; value++)
        for (let channel = 0; channel < 3; channel++) {
          const temperature =
            channel === 0
              ? p.temperature * 0.18
              : channel === 2
                ? -p.temperature * 0.18
                : 0;
          const v = value / 255;
          const tone =
            (v * gain * (1 + temperature) +
              p.highlights * illumination * v * v -
              0.5) *
              p.contrast +
            0.5;
          lut[(band * 256 + value) * 3 + channel] = Math.max(
            0,
            Math.min(255, Math.round(tone * 255)),
          );
        }
    }
    return { lut, x: Math.cos(angle), y: Math.sin(angle) };
  });
  const xDen = Math.max(1, source.width - 1),
    yDen = Math.max(1, source.height - 1);
  for (let y = 0; y < source.height; y++)
    for (let x = 0; x < source.width; x++) {
      const i = y * source.width + x,
        k = i * 4;
      if (source.data[k + 3] === 0) continue; // Preserve even hidden RGB exactly.
      for (let t = 0; t < transforms.length; t++) {
        const weight = t === 0 ? 255 : regions[t - 1].weights[i];
        if (!weight) continue;
        const tx = transforms[t];
        const band = Math.round(
          Math.max(
            0,
            Math.min(
              1,
              0.5 +
                ((x / xDen - 0.5) * tx.x + (y / yDen - 0.5) * tx.y) /
                  Math.SQRT2,
            ),
          ) * 255,
        );
        for (let c = 0; c < 3; c++) {
          const target = tx.lut[(band * 256 + source.data[k + c]) * 3 + c];
          data[k + c] = Math.round(
            (data[k + c] * (255 - weight) + target * weight) / 255,
          );
        }
      }
    }
  return { ...source, data };
}

export type RelightEligibility = {
  allowed: boolean;
  reason: string;
  sourceSha256?: string;
  cutoutId?: string;
};
