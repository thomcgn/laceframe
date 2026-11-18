import { z } from "zod";
import type { ColorPixels } from "./color-consistency";
import { spriteFusionQuantize } from "./spritefusion-runtime";
import { tr } from "./locales";
export const RASTER_VERSION = "laceframe-raster-spritefusion-v1" as const;
export const rasterSettingsSchema = z
  .object({
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
    sampling: z.enum(["nearest", "dominant"]),
    offsetX: z.number().min(-0.5).max(0.5),
    offsetY: z.number().min(-0.5).max(0.5),
    colors: z.number().int().min(1).max(256).optional(),
    palette: z
      .array(z.string().regex(/^#[a-fA-F0-9]{6}$/))
      .min(1)
      .max(256)
      .optional(),
    alpha: z.enum(["preserve", "binary"]),
  })
  .strict()
  .refine(
    (s) =>
      s.width * s.height <= 4_194_304 &&
      (!s.colors || s.width * s.height * s.colors <= 67_108_864) &&
      (!s.palette || (!!s.colors && s.palette.length <= s.colors)),
  );
export type RasterSettings = z.infer<typeof rasterSettingsSchema>;
export const rasterEditSchema = z
  .object({ kind: z.literal("raster"), settings: rasterSettingsSchema })
  .strict();
/** Exact uniform cells, no interpolation: select existing RGBA, then optional original Rust quantizer. */
export function rasterPixels(
  source: ColorPixels,
  input: RasterSettings,
): ColorPixels {
  const s = rasterSettingsSchema.parse(input);
  if (
    source.width < 1 ||
    source.height < 1 ||
    source.width * source.height > 4_194_304 ||
    source.data.length !== source.width * source.height * 4 ||
    s.width > source.width ||
    s.height > source.height
  )
    throw new Error(tr("raster.invalid"));
  const data = new Uint8Array(s.width * s.height * 4);
  const sx = source.width / s.width,
    sy = source.height / s.height;
  const clamp = (n: number, limit: number) =>
    Math.max(0, Math.min(limit - 1, n));
  const keyAt = (x: number, y: number) => {
    const i = (y * source.width + x) * 4;
    return (
      (source.data[i] * 16777216 +
        source.data[i + 1] * 65536 +
        source.data[i + 2] * 256 +
        source.data[i + 3]) >>>
      0
    );
  };
  for (let y = 0; y < s.height; y++)
    for (let x = 0; x < s.width; x++) {
      const cx = clamp(Math.floor((x + 0.5 + s.offsetX) * sx), source.width);
      const cy = clamp(Math.floor((y + 0.5 + s.offsetY) * sy), source.height);
      let key = keyAt(cx, cy);
      if (s.sampling === "dominant") {
        const counts = new Map<number, number>();
        const x0 = clamp(Math.floor((x + s.offsetX) * sx), source.width),
          x1 = Math.min(
            source.width,
            Math.max(x0 + 1, Math.floor((x + 1 + s.offsetX) * sx)),
          );
        const y0 = clamp(Math.floor((y + s.offsetY) * sy), source.height),
          y1 = Math.min(
            source.height,
            Math.max(y0 + 1, Math.floor((y + 1 + s.offsetY) * sy)),
          );
        for (let yy = y0; yy < y1; yy++)
          for (let xx = x0; xx < x1; xx++) {
            const k = keyAt(xx, yy);
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
        // Center wins ties, then numeric RGBA order: deterministic and detail-friendly.
        let best = counts.get(key) ?? 0;
        for (const [k, count] of counts)
          if (
            count > best ||
            (count === best && key !== keyAt(cx, cy) && k < key)
          ) {
            key = k;
            best = count;
          }
      }
      const alpha = key & 255;
      data.set(
        [
          key >>> 24,
          (key >>> 16) & 255,
          (key >>> 8) & 255,
          s.alpha === "binary" ? (alpha >= 128 ? 255 : 0) : alpha,
        ],
        (y * s.width + x) * 4,
      );
    }
  const out = { width: s.width, height: s.height, data };
  return s.colors ? spriteFusionQuantize(out, s.colors, s.palette) : out;
}
export function visibleColors(p: ColorPixels) {
  const colors = new Set<number>();
  for (let i = 0; i < p.data.length; i += 4)
    if (p.data[i + 3])
      colors.add(p.data[i] * 65536 + p.data[i + 1] * 256 + p.data[i + 2]);
  return colors.size;
}
