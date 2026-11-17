import type { Pixels } from "./mask-composite";
import type { QualityReport, ResolutionProfile } from "../shared/asset-quality";
import { resolutionProfileSchema } from "../shared/asset-quality";
function validate(p: Pixels) {
  if (
    !p.width ||
    !p.height ||
    p.width * p.height > 16_000_000 ||
    p.data.length !== p.width * p.height * 4
  )
    throw new Error(
      "Pixelverarbeitung: höchstens 16 Megapixel, vollständige RGBA8-Daten erforderlich.",
    );
}
/** Statistics are evidence for review, never a semantic cutout/style classifier. */
export function analyzePixels(p: Pixels, format = "png"): QualityReport {
  validate(p);
  const r: QualityReport = {
    width: p.width,
    height: p.height,
    format,
    alphaCapable: ["png", "webp"].includes(format),
    transparent: 0,
    partial: 0,
    opaque: 0,
    edgeTransparent: 0,
    edgePixels: 0,
    exteriorTransparent: 0,
    status: "opaque",
    warnings: [],
    palette: [],
    neighborChanges: 0,
    neighborPairs: 0,
  };
  const colors = new Map<number, number>();
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      const k = (y * p.width + x) * 4,
        a = p.data[k + 3];
      if (a === 0) r.transparent++;
      else if (a === 255) r.opaque++;
      else r.partial++;
      if (x === 0 || y === 0 || x === p.width - 1 || y === p.height - 1) {
        r.edgePixels++;
        if (a === 0) r.edgeTransparent++;
      }
      if (a) {
        const key =
          (p.data[k] >> 3) * 1024 +
          (p.data[k + 1] >> 3) * 32 +
          (p.data[k + 2] >> 3);
        colors.set(key, (colors.get(key) ?? 0) + 1);
      }
      for (const n of [x ? k - 4 : -1, y ? k - p.width * 4 : -1])
        if (n >= 0 && a && p.data[n + 3]) {
          r.neighborPairs++;
          if ([0, 1, 2].some((c) => p.data[k + c] !== p.data[n + c]))
            r.neighborChanges++;
        }
    }
  r.palette = [...colors]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, pixels]) => ({
      color:
        "#" +
        [Math.floor(k / 1024) * 8, (Math.floor(k / 32) % 32) * 8, (k % 32) * 8]
          .map((c) => c.toString(16).padStart(2, "0"))
          .join(""),
      pixels,
    }));
  // Flood only alpha-zero pixels connected to any image edge (4-neighbour).
  // This is geometric evidence, never automatic silhouette recognition.
  if (r.transparent) {
    const seen = new Uint8Array(p.width * p.height),
      queue = new Uint32Array(p.width * p.height);
    let head = 0,
      tail = 0;
    const add = (i: number) => {
      if (!seen[i] && p.data[i * 4 + 3] === 0) {
        seen[i] = 1;
        queue[tail++] = i;
      }
    };
    for (let x = 0; x < p.width; x++) {
      add(x);
      add((p.height - 1) * p.width + x);
    }
    for (let y = 0; y < p.height; y++) {
      add(y * p.width);
      add(y * p.width + p.width - 1);
    }
    while (head < tail) {
      const i = queue[head++],
        x = i % p.width;
      if (x) add(i - 1);
      if (x + 1 < p.width) add(i + 1);
      if (i >= p.width) add(i - p.width);
      if (i + p.width < seen.length) add(i + p.width);
    }
    r.exteriorTransparent = tail;
  }
  r.status =
    r.transparent + r.partial === 0
      ? "opaque"
      : r.transparent === p.width * p.height
        ? "empty"
        : r.transparent === 0 || r.edgeTransparent < r.edgePixels / 2
          ? "suspicious"
          : "transparent";
  // Conservative pattern detector: only exact opaque two-gray checker tiles across every border sample.
  // Textures or arbitrary/baked backgrounds are never claimed to be recognized generally.
  const colorAt = (x: number, y: number) => {
    const k = (y * p.width + x) * 4;
    return [p.data[k], p.data[k + 1], p.data[k + 2], p.data[k + 3]];
  };
  for (const tile of [2, 4, 8, 16, 32]) {
    if (p.width < tile * 4 || p.height < tile * 4) continue;
    const a = colorAt(0, 0),
      b = colorAt(tile, 0);
    if (
      a[3] !== 255 ||
      b[3] !== 255 ||
      a[0] !== a[1] ||
      a[1] !== a[2] ||
      b[0] !== b[1] ||
      b[1] !== b[2] ||
      Math.abs(a[0] - b[0]) < 16
    )
      continue;
    const matches = (x: number, y: number) => {
      const expected =
        (Math.floor(x / tile) + Math.floor(y / tile)) % 2 ? b : a;
      return colorAt(x, y).every((v, i) => v === expected[i]);
    };
    let match = true;
    for (let x = 0; x < p.width && match; x++)
      match = matches(x, 0) && matches(x, p.height - 1);
    for (let y = 0; y < p.height && match; y++)
      match = matches(0, y) && matches(p.width - 1, y);
    if (match) {
      r.warnings.push(
        "Verdacht auf eingebranntes Schachbrett: exakt wiederholte deckende Graukacheln am gesamten Rand. Visuell prüfen.",
      );
      if (r.status === "transparent") r.status = "suspicious";
      break;
    }
  }
  if (r.status === "opaque")
    r.warnings.push(
      "Vollständig deckend: Hintergrund freistellen; kein produktionsfertiger Transparenzexport.",
    );
  if (r.status === "empty")
    r.warnings.push("Vollständig transparent: keine sichtbare Figur.");
  if (r.status === "suspicious")
    r.warnings.push(
      "Hintergrund verdächtig: zu wenige vollständig transparente Randpixel. Silhouette manuell prüfen.",
    );
  r.warnings.push(
    "Alpha beweist keine perfekte Freistellung. Eingebrannte Flächen/Schachbrett und Stil müssen visuell geprüft werden; keine automatische Segmentierung.",
  );
  return r;
}
/** Foreground retention weights; never infer a background from RGB (including black). */
export function cutoutPixels(source: Pixels, weights: Uint8Array): Pixels {
  validate(source);
  if (weights.length !== source.width * source.height)
    throw new Error("Freistellungsmaske hat falsche Abmessungen.");
  const data = new Uint8Array(source.data);
  weights.forEach((w, i) => {
    data[i * 4 + 3] = Math.round((source.data[i * 4 + 3] * w) / 255);
  });
  return { ...source, data };
}
/** Pixel-centre sampling. Bilinear interpolation uses premultiplied alpha in encoded RGB space. */
export function resizePixels(source: Pixels, input: ResolutionProfile): Pixels {
  validate(source);
  const p = resolutionProfileSchema.parse(input),
    data = new Uint8Array(p.width * p.height * 4);
  const scale = (p.fit === "contain" ? Math.min : Math.max)(
      p.width / source.width,
      p.height / source.height,
    ),
    dw = source.width * scale,
    dh = source.height * scale,
    ox = (p.width - dw) / 2,
    oy = (p.height - dh) / 2;
  for (let y = 0; y < p.height; y++)
    for (let x = 0; x < p.width; x++) {
      if (
        x + 0.5 < ox ||
        x + 0.5 >= ox + dw ||
        y + 0.5 < oy ||
        y + 0.5 >= oy + dh
      )
        continue;
      const sx = (x + 0.5 - ox) / scale - 0.5,
        sy = (y + 0.5 - oy) / scale - 0.5,
        k = (y * p.width + x) * 4;
      const at = (px: number, py: number) =>
        (Math.max(0, Math.min(source.height - 1, py)) * source.width +
          Math.max(0, Math.min(source.width - 1, px))) *
        4;
      if (p.sampling === "nearest") {
        const n = at(Math.round(sx), Math.round(sy));
        data.set(source.data.subarray(n, n + 4), k);
        continue;
      }
      const ix = Math.floor(sx),
        iy = Math.floor(sy),
        fx = sx - ix,
        fy = sy - iy;
      const samples = [
        [at(ix, iy), (1 - fx) * (1 - fy)],
        [at(ix + 1, iy), fx * (1 - fy)],
        [at(ix, iy + 1), (1 - fx) * fy],
        [at(ix + 1, iy + 1), fx * fy],
      ];
      let alpha = 0;
      const rgb = [0, 0, 0];
      for (const [n, w] of samples) {
        const a = source.data[n + 3] * w;
        alpha += a;
        for (let c = 0; c < 3; c++) rgb[c] += source.data[n + c] * a;
      }
      data[k + 3] = Math.round(alpha);
      for (let c = 0; c < 3; c++)
        data[k + c] = alpha ? Math.round(rgb[c] / alpha) : 0;
    }
  return { width: p.width, height: p.height, data };
}
