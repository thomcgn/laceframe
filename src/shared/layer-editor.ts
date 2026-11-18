import type { LayerDraft } from "./semantic-layers";
import type { ColorPixels } from "./color-consistency";
import { visitStrokePixels, type Point } from "./masking";
import { colorSeedMask, pixelHex } from "./color-region";
import { rasterizePolygon, POLYGON_VERSION } from "./cutout-polygon";
export type PackedLayer = Omit<LayerDraft, "weights"> & {
  size: number;
  binary: boolean;
  data: Uint8Array;
};
const cache = new WeakMap<
  Uint8Array,
  { size: number; binary: boolean; data: Uint8Array }
>();
function pack(rows: LayerDraft[]): PackedLayer[] {
  return rows.map(({ weights, ...meta }) => {
    let saved = cache.get(weights);
    if (!saved) {
      const binary = weights.every((v) => v === 0 || v === 255),
        data = binary
          ? new Uint8Array(Math.ceil(weights.length / 8))
          : new Uint8Array(weights);
      if (binary)
        weights.forEach((v, i) => {
          if (v) data[i >>> 3] |= 1 << (i & 7);
        });
      saved = { size: weights.length, binary, data };
      cache.set(weights, saved);
    }
    return { ...meta, ...saved };
  });
}
function unpack(rows: PackedLayer[]): LayerDraft[] {
  return rows.map(({ size, binary, data, ...meta }) => {
    const weights = binary ? new Uint8Array(size) : new Uint8Array(data);
    if (binary)
      for (let i = 0; i < size; i++)
        weights[i] = data[i >>> 3] & (1 << (i & 7)) ? 255 : 0;
    return { ...meta, weights };
  });
}
export type LayerHistory = {
  present: LayerDraft[];
  past: PackedLayer[][];
  future: PackedLayer[][];
};
export const layerHistory = (present: LayerDraft[]): LayerHistory => ({
  present,
  past: [],
  future: [],
});
export const commitLayers = (
  h: LayerHistory,
  present: LayerDraft[],
): LayerHistory => ({
  present,
  past: [...h.past, pack(h.present)].slice(-20),
  future: [],
});
export function undoLayers(h: LayerHistory): LayerHistory {
  return h.past.length
    ? {
        present: unpack(h.past.at(-1)!),
        past: h.past.slice(0, -1),
        future: [pack(h.present), ...h.future],
      }
    : h;
}
export function redoLayers(h: LayerHistory): LayerHistory {
  return h.future.length
    ? {
        present: unpack(h.future[0]),
        past: [...h.past, pack(h.present)].slice(-20),
        future: h.future.slice(1),
      }
    : h;
}
export function blockedPixels(rows: LayerDraft[], active: string, n: number) {
  const out = new Uint8Array(n);
  for (const row of rows)
    if (row.id !== active && row.locked)
      row.weights.forEach((v, i) => {
        if (v) out[i] = 255;
      });
  return out;
}
export function paintLayer(
  p: ColorPixels,
  weights: Uint8Array,
  blocked: Uint8Array,
  from: Point,
  to: Point,
  radius: number,
  value: number,
) {
  visitStrokePixels(p.width, p.height, from, to, radius, (i) => {
    if (p.data[i * 4 + 3] && (value === 0 || !blocked[i])) weights[i] = value;
  });
}
export function selectLayerRegion(
  p: ColorPixels,
  blocked: Uint8Array,
  options:
    | {
        kind: "seed";
        x: number;
        y: number;
        tolerance: number;
        connected: boolean;
      }
    | { kind: "polygon"; points: Point[] },
) {
  if (options.kind === "polygon") {
    const mask = rasterizePolygon(
      {
        algorithm: POLYGON_VERSION,
        operation: "limit",
        points: options.points,
      },
      p.width,
      p.height,
    );
    mask.forEach((_, i) => {
      if (blocked[i] || !p.data[i * 4 + 3]) mask[i] = 0;
    });
    return mask;
  }
  // Alpha-zero barriers stop connected fill at locked pixels; source bytes remain immutable.
  const data = new Uint8Array(p.data);
  blocked.forEach((v, i) => {
    if (v) data[i * 4 + 3] = 0;
  });
  const x = Math.floor(options.x),
    y = Math.floor(options.y);
  return colorSeedMask(
    { ...p, data },
    {
      x,
      y,
      hex: pixelHex(p, y * p.width + x),
      tolerance: options.tolerance,
      connected: options.connected,
      operation: "add",
    },
  );
}
