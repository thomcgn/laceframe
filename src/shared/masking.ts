import { z } from "zod";
export const MAX_MASK_PIXELS = 16_000_000;
export const maskSelectionSchema = z
  .object({
    id: z.uuid(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    revision: z.number().int().positive(),
    mode: z.literal("hard"),
  })
  .strict();
export const compositeSchema = z
  .object({
    rawId: z.uuid(),
    rawSha256: z.string().regex(/^[a-f0-9]{64}$/),
    maskId: z.uuid(),
    maskSha256: z.string().regex(/^[a-f0-9]{64}$/),
    maskRevision: z.number().int().positive(),
    version: z.literal(1),
    rule: z.literal("rgba8-straight-round"),
    registration: z.literal("user-confirmed-origin"),
  })
  .strict();
export type Point = { x: number; y: number };
/** Native pixel centres, circular brush, interpolated strokes; no viewport coordinates. */
export function paintStroke(
  bytes: Uint8Array,
  width: number,
  height: number,
  from: Point,
  to: Point,
  radius: number,
  value: number,
): Uint8Array {
  if (
    bytes.length !== width * height ||
    width * height > MAX_MASK_PIXELS ||
    ![from.x, from.y, to.x, to.y, radius, value].every(Number.isFinite) ||
    radius <= 0
  )
    throw new Error("Ungültiger Maskenstrich.");
  const result = new Uint8Array(bytes);
  const dx = to.x - from.x,
    dy = to.y - from.y,
    length = dx * dx + dy * dy;
  const minX = Math.max(0, Math.floor(Math.min(from.x, to.x) - radius));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(from.x, to.x) + radius));
  const minY = Math.max(0, Math.floor(Math.min(from.y, to.y) - radius));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(from.y, to.y) + radius));
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const t = length
        ? Math.max(
            0,
            Math.min(
              1,
              ((x + 0.5 - from.x) * dx + (y + 0.5 - from.y) * dy) / length,
            ),
          )
        : 0;
      if (
        (x + 0.5 - from.x - t * dx) ** 2 + (y + 0.5 - from.y - t * dy) ** 2 <=
        radius ** 2
      )
        result[y * width + x] = Math.round(Math.max(0, Math.min(255, value)));
    }
  return result;
}
export type MaskHistory = {
  past: Uint8Array[];
  present: Uint8Array;
  future: Uint8Array[];
};
// Bound undo memory to 64 MiB (at least one previous state), not unbounded full-canvas snapshots.
export function commitMask(h: MaskHistory, next: Uint8Array): MaskHistory {
  if (
    h.present.every((v, i) => v === next[i]) &&
    h.present.length === next.length
  )
    return h;
  const limit = Math.max(
    1,
    Math.min(32, Math.floor((64 * 1024 * 1024) / next.length)),
  );
  return {
    past: [...h.past, h.present].slice(-limit),
    present: new Uint8Array(next),
    future: [],
  };
}
export function undoMask(h: MaskHistory): MaskHistory {
  return h.past.length
    ? {
        past: h.past.slice(0, -1),
        present: h.past.at(-1)!,
        future: [h.present, ...h.future],
      }
    : h;
}
export function redoMask(h: MaskHistory): MaskHistory {
  return h.future.length
    ? {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      }
    : h;
}
