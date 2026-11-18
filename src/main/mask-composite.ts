import { tr } from "../shared/locales/index";
import { inflateSync } from "node:zlib";
import { PNG } from "pngjs";
import { MAX_MASK_PIXELS } from "../shared/masking";
export type Pixels = { width: number; height: number; data: Uint8Array };
/** Exact decoded RGBA8 samples, including RGB beneath alpha=0. No canvas/color conversion. */
export function decodePixels(bytes: Uint8Array): Pixels {
  const b = Buffer.from(bytes);
  if (
    b.length > 32 * 1024 * 1024 ||
    b.length < 33 ||
    !b.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ||
    b[24] > 8
  )
    throw new Error(tr("errors.m890aaa9d53"));
  const width = b.readUInt32BE(16),
    height = b.readUInt32BE(20);
  if (!width || !height || width * height > MAX_MASK_PIXELS)
    throw new Error(tr("errors.m20bb2b4c7a"));
  // Reject animated PNGs rather than silently processing an arbitrary frame.
  const compressed: Buffer[] = [];
  for (let offset = 8; offset + 12 <= b.length; ) {
    const n = b.readUInt32BE(offset);
    if (offset + n + 12 > b.length) throw new Error(tr("errors.m7e822a840a"));
    const type = b.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT")
      compressed.push(b.subarray(offset + 8, offset + 8 + n));
    if (type === "acTL") throw new Error(tr("errors.mcfb0647430"));
    offset += n + 12;
  }
  // Bound decompression also for Adam7 inputs (pngjs otherwise inflates these without a limit).
  inflateSync(Buffer.concat(compressed), {
    maxOutputLength: width * height * 8 + height * 8 + 1024,
  });
  const p = PNG.sync.read(b);
  if (
    p.width !== width ||
    p.height !== height ||
    p.data.length !== width * height * 4
  )
    throw new Error(tr("errors.maa9e46626d"));
  return p;
}
export function encodePixels(p: Pixels): Buffer {
  if (
    p.data.length !== p.width * p.height * 4 ||
    p.width * p.height > MAX_MASK_PIXELS
  )
    throw new Error(tr("errors.maa9e46626d"));
  return PNG.sync.write({
    width: p.width,
    height: p.height,
    data: Buffer.from(p.data),
  } as PNG);
}
export function encodeMask(
  width: number,
  height: number,
  weights: Uint8Array,
): Buffer {
  if (weights.length !== width * height || weights.length > MAX_MASK_PIXELS)
    throw new Error(tr("errors.mbd0b7c8277"));
  const data = Buffer.alloc(weights.length * 4);
  weights.forEach((w, i) => {
    data.fill(w, i * 4, i * 4 + 3);
    data[i * 4 + 3] = 255;
  });
  return encodePixels({ width, height, data });
}
export function maskWeights(p: Pixels): Uint8Array {
  const weights = new Uint8Array(p.width * p.height);
  for (let i = 0; i < weights.length; i++) {
    const k = i * 4;
    if (
      p.data[k] !== p.data[k + 1] ||
      p.data[k] !== p.data[k + 2] ||
      p.data[k + 3] !== 255
    )
      throw new Error(tr("errors.m46bd3fef1f"));
    weights[i] = p.data[k];
  }
  return weights;
}
export function compositePixels(
  master: Pixels,
  raw: Pixels,
  mask: Pixels,
  version: 1 | 2 = 2,
): Pixels {
  if (
    [raw, mask].some(
      (p) =>
        p.width !== master.width ||
        p.height !== master.height ||
        p.data.length !== master.data.length,
    )
  )
    throw new Error(tr("errors.m47e7d98d50"));
  const weights = maskWeights(mask),
    data = new Uint8Array(master.data);
  // V2 blends premultiplied encoded RGB, then unpremultiplies. V1 remains reproducible. Endpoints copy exact RGBA including hidden RGB.
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i];
    if (w === 0) continue;
    if (version === 2 && w !== 255) {
      const k = i * 4,
        a = master.data[k + 3] * (255 - w),
        b = raw.data[k + 3] * w,
        alpha = a + b;
      for (let c = 0; c < 3; c++)
        data[k + c] = alpha
          ? Math.round((master.data[k + c] * a + raw.data[k + c] * b) / alpha)
          : master.data[k + c];
      data[k + 3] = Math.round(alpha / 255);
      continue;
    }
    for (let c = 0; c < 4; c++) {
      const k = i * 4 + c;
      data[k] =
        w === 255
          ? raw.data[k]
          : Math.round((master.data[k] * (255 - w) + raw.data[k] * w) / 255);
    }
  }
  return { width: master.width, height: master.height, data };
}
