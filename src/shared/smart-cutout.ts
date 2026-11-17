import { z } from "zod";
import {
  polygonOperationSchema,
  rasterizePolygon,
  validatePolygonBounds,
} from "./cutout-polygon";
export const MAX_SMART_PIXELS = 4_194_304;
export const SMART_CUTOUT_VERSION = "lab76-seeded-rgba8-v1" as const;
const byte = z.number().int().min(0).max(255);
export const cutoutSettingsSchema = z
  .object({
    seeds: z
      .array(
        z
          .object({
            x: z.number().int().nonnegative(),
            y: z.number().int().nonnegative(),
            rgba: z.tuple([byte, byte, byte, byte]),
          })
          .strict(),
      )
      .max(32),
    tolerance: z.number().min(0).max(100),
    connected: z.boolean(),
    softness: z.number().int().min(0).max(8),
    expand: z.number().int().min(-3).max(3),
    polygons: z.array(polygonOperationSchema).max(32).optional(),
  })
  .strict();
export type CutoutSettings = z.infer<typeof cutoutSettingsSchema>;
const weights = z
  .instanceof(Uint8Array)
  .refine((a) => a.length <= MAX_SMART_PIXELS);
export const cutoutDraftSchema = z
  .object({
    settings: cutoutSettingsSchema,
    manual: weights,
    protected: weights,
    forced: weights,
    previousId: z.uuid().optional(),
  })
  .strict();
export type CutoutDraft = z.infer<typeof cutoutDraftSchema>;
const maskRecord = (
  role: "manual-retention" | "protected-foreground" | "forced-background",
) =>
  z
    .object({
      type: z.literal(role),
      file: z.string(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
      revision: z.number().int().positive(),
    })
    .strict();
export const smartCutoutRecordSchema = z
  .object({
    algorithm: z.literal(SMART_CUTOUT_VERSION),
    revision: z.number().int().positive(),
    previousId: z.uuid().optional(),
    settings: cutoutSettingsSchema,
    pixelSha256: z.string().regex(/^[a-f0-9]{64}$/),
    masks: z
      .object({
        manual: maskRecord("manual-retention"),
        protected: maskRecord("protected-foreground"),
        forced: maskRecord("forced-background"),
      })
      .strict(),
  })
  .strict();
export type SmartCutoutRecord = z.infer<typeof smartCutoutRecordSchema>;
export type CutoutImage = { width: number; height: number; data: Uint8Array };
export const defaultCutoutSettings = (): CutoutSettings => ({
  seeds: [],
  tolerance: 8,
  connected: true,
  softness: 0,
  expand: 0,
});
export function validateCutoutImage(p: CutoutImage) {
  if (
    !Number.isInteger(p.width) ||
    !Number.isInteger(p.height) ||
    p.width < 1 ||
    p.height < 1 ||
    p.width * p.height > MAX_SMART_PIXELS ||
    p.data.length !== p.width * p.height * 4
  )
    throw new Error(
      "Automatische Freistellung: gültiges RGBA8-Bild mit maximal 4 Megapixeln erforderlich.",
    );
}
// Exact sRGB byte linearization, D65 XYZ, CIE L*a*b*. Delta E 1976, not CIEDE2000.
const linear = Float64Array.from({ length: 256 }, (_, c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
});
const labF = (v: number) =>
  v > 216 / 24389 ? Math.cbrt(v) : ((24389 / 27) * v + 16) / 116;
export function pixelLab(r: number, g: number, b: number) {
  const R = linear[r],
    G = linear[g],
    B = linear[b],
    x = labF((0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047),
    y = labF(0.2126729 * R + 0.7151522 * G + 0.072175 * B),
    v = labF((0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - v)];
}
export function prepareCutout(p: CutoutImage) {
  validateCutoutImage(p);
  const lab = new Float32Array(p.width * p.height * 3);
  for (let i = 0; i < p.width * p.height; i++)
    lab.set(
      pixelLab(p.data[i * 4], p.data[i * 4 + 1], p.data[i * 4 + 2]),
      i * 3,
    );
  return lab;
}
export function validateCutoutDraft(p: CutoutImage, input: CutoutDraft) {
  validateCutoutImage(p);
  const d = cutoutDraftSchema.parse(input),
    n = p.width * p.height;
  if (
    [d.manual, d.protected, d.forced].some((a) => a.length !== n) ||
    d.protected.some((v) => v !== 0 && v !== 255) ||
    d.forced.some((v) => v !== 0 && v !== 255)
  )
    throw new Error(
      "Ungültige Schutz-/Hintergrundmaske; binäre native Masken erforderlich.",
    );
  for (const op of d.settings.polygons ?? [])
    validatePolygonBounds(op.points, p.width, p.height);
  for (const s of d.settings.seeds) {
    if (
      s.x >= p.width ||
      s.y >= p.height ||
      s.rgba.some((v, c) => v !== p.data[(s.y * p.width + s.x) * 4 + c]) ||
      !s.rgba[3]
    )
      throw new Error(
        "Seed außerhalb des Bildes, transparent oder nicht vom Originalpixel aufgenommen.",
      );
  }
  return d;
}
function morphology(
  src: Uint8Array,
  w: number,
  h: number,
  r: number,
  dilate: boolean,
) {
  let current = src;
  for (let pass = 0; pass < 2; pass++) {
    const out = new Uint8Array(src.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = dilate ? 0 : 255;
        for (let k = -r; k <= r; k++) {
          const xx = pass === 0 ? Math.max(0, Math.min(w - 1, x + k)) : x,
            yy = pass === 1 ? Math.max(0, Math.min(h - 1, y + k)) : y,
            a = current[yy * w + xx];
          v = dilate ? Math.max(v, a) : Math.min(v, a);
        }
        out[y * w + x] = v;
      }
    current = out;
  }
  return current;
}
// Truncated-window separable box blur, rounded after each axis. No RGB filtering.
function soften(src: Uint8Array, w: number, h: number, r: number) {
  let current = src;
  for (let axis = 0; axis < 2; axis++) {
    const out = new Uint8Array(src.length),
      major = axis === 0 ? h : w,
      minor = axis === 0 ? w : h;
    for (let a = 0; a < major; a++) {
      const at = (b: number) => (axis === 0 ? a * w + b : b * w + a);
      let sum = 0;
      for (let b = 0; b <= Math.min(r, minor - 1); b++) sum += current[at(b)];
      for (let b = 0; b < minor; b++) {
        const count = Math.min(minor - 1, b + r) - Math.max(0, b - r) + 1;
        out[at(b)] = Math.round(sum / count);
        if (b - r >= 0) sum -= current[at(b - r)];
        if (b + r + 1 < minor) sum += current[at(b + r + 1)];
      }
    }
    current = out;
  }
  return current;
}
export function selectBackground(
  p: CutoutImage,
  input: CutoutDraft,
  prepared?: Float32Array,
) {
  const d = validateCutoutDraft(p, input),
    n = p.width * p.height,
    lab = prepared ?? prepareCutout(p);
  if (lab.length !== n * 3) throw new Error("Ungültiger Lab-Puffer");
  const protectedMask = d.protected.slice(),
    forcedMask = d.forced.slice(),
    limited = new Uint8Array(n),
    polygonProtected = new Uint8Array(n),
    polygonForced = new Uint8Array(n);
  for (const op of d.settings.polygons ?? []) {
    const region = rasterizePolygon(op, p.width, p.height);
    const target =
      op.operation === "protect"
        ? protectedMask
        : op.operation === "force"
          ? forcedMask
          : limited;
    for (let i = 0; i < n; i++)
      if (region[i]) {
        target[i] = 255;
        if (op.operation === "protect") polygonProtected[i] = 255;
        if (op.operation === "force") polygonForced[i] = 255;
      }
  }
  const selected = new Uint8Array(n),
    eligible = new Uint8Array(n),
    seedLabs = d.settings.seeds.map((s) => (s.y * p.width + s.x) * 3),
    threshold = d.settings.tolerance ** 2;
  if (seedLabs.length) {
    for (let i = 0; i < n; i++) {
      if (protectedMask[i] || limited[i]) continue;
      if (!p.data[i * 4 + 3]) {
        eligible[i] = 255;
        continue;
      }
      const k = i * 3;
      for (const j of seedLabs) {
        if (
          (lab[k] - lab[j]) ** 2 +
            (lab[k + 1] - lab[j + 1]) ** 2 +
            (lab[k + 2] - lab[j + 2]) ** 2 <=
          threshold
        ) {
          eligible[i] = 255;
          break;
        }
      }
    }
    if (d.settings.connected) {
      const queue = new Uint32Array(n);
      let head = 0,
        tail = 0;
      const push = (i: number) => {
        if (eligible[i] && !selected[i]) {
          selected[i] = 255;
          queue[tail++] = i;
        }
      };
      for (const s of d.settings.seeds) push(s.y * p.width + s.x);
      while (head < tail) {
        const i = queue[head++],
          x = i % p.width;
        if (x) push(i - 1);
        if (x + 1 < p.width) push(i + 1);
        if (i >= p.width) push(i - p.width);
        if (i + p.width < n) push(i + p.width);
      }
    } else selected.set(eligible);
  }
  let automatic: Uint8Array = selected;
  if (d.settings.expand)
    automatic = morphology(
      automatic,
      p.width,
      p.height,
      Math.abs(d.settings.expand),
      d.settings.expand > 0,
    );
  if (d.settings.softness)
    automatic = soften(automatic, p.width, p.height, d.settings.softness);
  // Refinement must never leak the automatic selection back into a silhouette.
  for (let i = 0; i < n; i++)
    if (limited[i] || protectedMask[i]) automatic[i] = 0;
  const weights = new Uint8Array(n);
  let conflicts = 0,
    removed = 0;
  for (let i = 0; i < n; i++) {
    if (protectedMask[i]) {
      weights[i] = 255;
      conflicts += Number(!!forcedMask[i]);
    } else if (forcedMask[i]) weights[i] = 0;
    else weights[i] = Math.round((d.manual[i] * (255 - automatic[i])) / 255);
    removed += Number(weights[i] < 255);
  }
  return {
    weights,
    selection: automatic,
    protectedMask,
    forcedMask,
    limited,
    polygonProtected,
    polygonForced,
    conflicts,
    removed,
  };
}
export type CutoutHistory = {
  past: CutoutDraft[];
  present: CutoutDraft;
  future: CutoutDraft[];
};
export function commitCutout(
  h: CutoutHistory,
  next: CutoutDraft,
  previous = h.present,
): CutoutHistory {
  const bytes = next.manual.length * 3,
    limit = Math.max(
      1,
      Math.min(32, Math.floor((32 * 1024 * 1024) / Math.max(1, bytes))),
    );
  return {
    past: [...h.past, previous].slice(-limit),
    present: next,
    future: [],
  };
}
export function undoCutout(h: CutoutHistory): CutoutHistory {
  return h.past.length
    ? {
        past: h.past.slice(0, -1),
        present: h.past.at(-1)!,
        future: [h.present, ...h.future],
      }
    : h;
}
export function redoCutout(h: CutoutHistory): CutoutHistory {
  return h.future.length
    ? {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      }
    : h;
}
export function imagePoint(
  client: { clientX: number; clientY: number },
  rect: { left: number; top: number; width: number; height: number },
  width: number,
  height: number,
) {
  return {
    x: Math.floor(((client.clientX - rect.left) * width) / rect.width),
    y: Math.floor(((client.clientY - rect.top) * height) / rect.height),
  };
}
