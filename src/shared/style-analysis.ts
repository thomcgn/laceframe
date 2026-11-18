import { tr } from "./locales/index";
import { z } from "zod";
export const ANALYSIS_VERSION = "rgba8-style-v1" as const;
export const MAX_ANALYSIS_PIXELS = 4_194_304;
export const referenceTypes = [
  "dialogue",
  "portrait",
  "full-body",
  "sprite",
  "environment",
  "ui",
  "general",
] as const;
export const referenceLabels = {
  get general() {
    return tr("styleCreator.roleGeneral");
  },
  dialogue: tr("common.m0c2b1d58da"),
  get portrait() {
    return tr("styles.m1f24176600");
  },
  get "full-body"() {
    return tr("styles.m0e1daa81e2");
  },
  sprite: "Sprite",
  environment: tr("common.md0329eb47d"),
  ui: tr("common.m82b625e185"),
};
const integer = z.number().int().nonnegative();
const fraction = z.number().min(0).max(1);
export const roiSchema = z
  .object({
    x: integer,
    y: integer,
    width: integer.positive(),
    height: integer.positive(),
  })
  .strict();
export const analysisInputSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(referenceTypes),
    roi: roiSchema.optional(),
  })
  .strict();
export const analysisInputsSchema = z
  .array(analysisInputSchema)
  .min(1)
  .max(6)
  .refine(
    (a) => new Set(a.map((r) => r.id)).size === a.length,
    "Doppelte Referenzen",
  );
export const parameters = {
  rgbBits: 5,
  distributionBits: 2,
  blockStep: 8,
  luminanceBins: 16,
  hardEdge: 0.2,
  similarEdge: 0.04,
  comparisonSteps: [1, 2, 4],
  alpha: "exclude-zero-unweighted-visible",
  colorSpace: "encoded-srgb-rgba8",
} as const;
const parametersSchema = z
  .object({
    rgbBits: z.literal(5),
    distributionBits: z.literal(2),
    blockStep: z.literal(8),
    luminanceBins: z.literal(16),
    hardEdge: z.literal(0.2),
    similarEdge: z.literal(0.04),
    comparisonSteps: z.tuple([z.literal(1), z.literal(2), z.literal(4)]),
    alpha: z.literal("exclude-zero-unweighted-visible"),
    colorSpace: z.literal("encoded-srgb-rgba8"),
  })
  .strict();
const regionSchema = z
  .object({ visible: integer, edgeDensity: fraction, meanLuminance: fraction })
  .strict();
export const metricsSchema = z
  .object({
    width: integer.positive(),
    height: integer.positive(),
    roi: roiSchema,
    visible: integer,
    visibleFraction: fraction,
    partialFraction: fraction,
    uniqueColors: integer,
    palette: z
      .array(
        z
          .object({
            hex: z.string().regex(/^#[0-9a-f]{6}$/),
            count: integer.positive(),
            fraction,
          })
          .strict(),
      )
      .max(12),
    luminance: z.array(integer).length(16),
    colorDistribution: z.array(integer).length(64),
    meanLuminance: fraction,
    saturation: fraction,
    warmFraction: fraction,
    coolFraction: fraction,
    blockBoundaryDifference8: z.number().min(-1).max(1),
    contrast: fraction,
    identicalHorizontal: fraction,
    identicalVertical: fraction,
    edgeDensity: fraction,
    hardTransitions: fraction,
    similarTransitions: fraction,
    meanEdgeContrast: fraction,
    diagonalPairs: fraction,
    ditherLike: fraction,
    runGroups: z.array(integer).length(33),
    gridCandidate: integer.max(32),
    gridEvidence: fraction,
    detailByStep: z.array(fraction).length(3),
    quadrants: z.array(regionSchema).length(4),
    warnings: z.array(z.string().max(500)).max(12),
  })
  .strict()
  .refine(
    (m) =>
      m.width * m.height <= MAX_ANALYSIS_PIXELS &&
      m.roi.x + m.roi.width <= m.width &&
      m.roi.y + m.roi.height <= m.height &&
      m.visible <= m.roi.width * m.roi.height &&
      m.uniqueColors <= m.visible &&
      m.luminance.reduce((a, b) => a + b, 0) === m.visible &&
      m.colorDistribution.reduce((a, b) => a + b, 0) === m.visible &&
      m.palette.reduce((a, c) => a + c.count, 0) <= m.visible,
    "Inconsistent style measurement",
  );
export type StyleMetrics = z.infer<typeof metricsSchema>;
export type AnalysisInput = z.infer<typeof analysisInputSchema>;
export type AnalysisResult = AnalysisInput & {
  sha256: string;
  metrics: StyleMetrics;
};
export const ruleGroups = [
  "renderRules",
  "colorRules",
  "lightingRules",
  "framingRules",
  "constraints",
] as const;
export const suggestionSchema = z
  .object({
    key: z.string().max(100),
    group: z.enum(ruleGroups),
    text: z.string().max(2000),
    evidence: z.string().max(2000),
  })
  .strict();
export type Suggestion = z.infer<typeof suggestionSchema>;
export const analysisEditsSchema = z
  .object({
    rules: z
      .array(
        z
          .object({
            key: z.string().max(100),
            text: z.string().max(2000),
            enabled: z.boolean(),
          })
          .strict(),
      )
      .max(100),
    palette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(24),
    ownRules: z.string().max(4000),
  })
  .strict();
export type AnalysisEdits = z.infer<typeof analysisEditsSchema>;
export const analysisRecordSchema = z
  .object({
    origin: z.literal("style-creator").optional(),
    id: z.uuid(),
    version: z.literal(ANALYSIS_VERSION),
    profileId: z.uuid(),
    profileRevision: integer.positive(),
    createdAt: z.iso.datetime(),
    parameters: parametersSchema,
    references: z
      .array(
        analysisInputSchema
          .extend({
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
            metrics: metricsSchema,
          })
          .strict(),
      )
      .min(1)
      .max(6)
      .refine(
        (a) => new Set(a.map((r) => r.id)).size === a.length,
        "Duplicate analysis reference",
      ),
    suggestions: z.array(suggestionSchema).max(100),
    edits: analysisEditsSchema,
  })
  .strict();
export type AnalysisRecord = z.infer<typeof analysisRecordSchema>;
/** Future local engines must expose their own version/parameters; no model implementation or downloads. */
export interface LocalStyleAnalyzer {
  readonly version: string;
  analyze(
    image: { width: number; height: number; data: Uint8Array },
    roi?: z.infer<typeof roiSchema>,
  ): StyleMetrics;
}
const lum = (r: number, g: number, b: number) =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const ratio = (a: number, b: number) => (b ? a / b : 0);
export function measureStyle(
  image: { width: number; height: number; data: Uint8Array },
  selected?: z.infer<typeof roiSchema>,
): StyleMetrics {
  const { width, height, data } = image;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > MAX_ANALYSIS_PIXELS ||
    data.length !== width * height * 4
  )
    throw new Error(tr("styles.m60a2505d77"));
  const roi = roiSchema.parse(selected ?? { x: 0, y: 0, width, height });
  if (roi.x + roi.width > width || roi.y + roi.height > height)
    throw new Error(tr("styles.m8e2ed08ea0"));
  const colors = new Uint32Array(roi.width * roi.height),
    bins = new Uint32Array(32768),
    luminance = Array<number>(16).fill(0),
    colorDistribution = Array<number>(64).fill(0),
    runGroups = Array<number>(33).fill(0);
  const quadrants = Array.from({ length: 4 }, () => ({
    visible: 0,
    edgeDensity: 0,
    meanLuminance: 0,
    pairs: 0,
    edges: 0,
  }));
  let visible = 0,
    partial = 0,
    sumLum = 0,
    sat = 0,
    warm = 0,
    cool = 0,
    blockSum = 0,
    blockCount = 0,
    interiorSum = 0,
    interiorCount = 0,
    lo = 1,
    hi = 0;
  let hPairs = 0,
    vPairs = 0,
    sameH = 0,
    sameV = 0,
    hard = 0,
    similar = 0,
    changed = 0,
    edgeSum = 0,
    diag = 0,
    diagonalChecks = 0,
    dither = 0,
    cells = 0;
  const endX = roi.x + roi.width,
    endY = roi.y + roi.height;
  const code = (i: number) =>
    (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
  const delta = (i: number, j: number) =>
    Math.max(
      Math.abs(data[i] - data[j]),
      Math.abs(data[i + 1] - data[j + 1]),
      Math.abs(data[i + 2] - data[j + 2]),
    ) / 255;
  const pair = (
    i: number,
    j: number,
    q: (typeof quadrants)[number],
    blockBoundary: boolean,
  ) => {
    const d = delta(i, j);
    q.pairs++;
    if (blockBoundary) {
      blockSum += d;
      blockCount++;
    } else {
      interiorSum += d;
      interiorCount++;
    }
    edgeSum += d;
    if (d > 0) {
      changed++;
      q.edges++;
    }
    if (d >= parameters.hardEdge) hard++;
    if (d > 0 && d <= parameters.similarEdge) similar++;
  };
  for (let y = roi.y; y < endY; y++) {
    let run = 0,
      previous = -1;
    for (let x = roi.x; x < endX; x++) {
      const i = (y * width + x) * 4;
      if (!data[i + 3]) {
        if (run) runGroups[Math.min(run, 32)]++;
        run = 0;
        previous = -1;
        continue;
      }
      const c = code(i),
        r = data[i],
        g = data[i + 1],
        b = data[i + 2],
        l = lum(r, g, b),
        max = Math.max(r, g, b),
        min = Math.min(r, g, b);
      colors[visible++] = c;
      bins[(r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3)]++;
      luminance[Math.min(15, Math.floor(l * 16))]++;
      colorDistribution[(r >> 6) * 16 + (g >> 6) * 4 + (b >> 6)]++;
      partial += Number(data[i + 3] < 255);
      sumLum += l;
      sat += max ? (max - min) / max : 0;
      warm += Number(r > b);
      cool += Number(b > r);
      lo = Math.min(lo, l);
      hi = Math.max(hi, l);
      const q =
        quadrants[
          Number(y - roi.y >= roi.height / 2) * 2 +
            Number(x - roi.x >= roi.width / 2)
        ];
      q.visible++;
      q.meanLuminance += l;
      if (c === previous) run++;
      else {
        if (run) runGroups[Math.min(run, 32)]++;
        run = 1;
        previous = c;
      }
      if (x + 1 < endX && data[i + 7]) {
        hPairs++;
        sameH += Number(c === code(i + 4));
        pair(i, i + 4, q, (x + 1) % 8 === 0);
      }
      if (y + 1 < endY && data[i + width * 4 + 3]) {
        vPairs++;
        sameV += Number(c === code(i + width * 4));
        pair(i, i + width * 4, q, (y + 1) % 8 === 0);
      }
      if (x + 1 < endX && y + 1 < endY) {
        const right = i + 4,
          down = i + width * 4,
          cross = down + 4;
        if (data[right + 3] && data[down + 3] && data[cross + 3]) {
          cells++;
          if (
            c === code(cross) &&
            code(right) === code(down) &&
            c !== code(right)
          )
            dither++;
          diagonalChecks++;
          if (
            delta(i, right) >= 0.2 &&
            delta(i, down) >= 0.2 &&
            delta(i, cross) < 0.04
          )
            diag++;
        }
      }
    }
    if (run) runGroups[Math.min(run, 32)]++;
  }
  // Native vertical runs, independent of horizontal evidence.
  for (let x = roi.x; x < endX; x++) {
    let run = 0,
      prev = -1;
    for (let y = roi.y; y < endY; y++) {
      const i = (y * width + x) * 4,
        c = data[i + 3] ? code(i) : -1;
      if (c >= 0 && c === prev) run++;
      else {
        if (run) runGroups[Math.min(run, 32)]++;
        run = c >= 0 ? 1 : 0;
        prev = c;
      }
    }
    if (run) runGroups[Math.min(run, 32)]++;
  }
  colors.subarray(0, visible).sort();
  let uniqueColors = 0;
  for (let i = 0; i < visible; i++)
    if (i === 0 || colors[i] !== colors[i - 1]) uniqueColors++;
  const palette = Array.from(bins, (count, key) => ({ count, key }))
    .filter((a) => a.count)
    .sort((a, b) => b.count - a.count || a.key - b.key)
    .slice(0, 12)
    .map(({ count, key }) => {
      const r = ((key >> 10) & 31) * 8 + 4,
        g = ((key >> 5) & 31) * 8 + 4,
        b = (key & 31) * 8 + 4;
      return {
        hex: `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`,
        count,
        fraction: ratio(count, visible),
      };
    });
  const detailByStep = [1, 2, 4].map((step) => {
    let n = 0,
      d = 0;
    for (let y = roi.y; y < endY; y += step)
      for (let x = roi.x; x < endX; x += step) {
        const i = (y * width + x) * 4;
        if (!data[i + 3]) continue;
        for (const j of [
          x + step < endX ? i + step * 4 : -1,
          y + step < endY ? i + width * step * 4 : -1,
        ])
          if (j >= 0 && data[j + 3]) {
            n++;
            d += Number(delta(i, j) > 0);
          }
      }
    return ratio(d, n);
  });
  let gridCandidate = 0,
    gridEvidence = 0;
  const boundedRuns = runGroups.slice(1, 32).reduce((a, b) => a + b, 0);
  for (let g = 2; g <= 16; g++) {
    let supported = 0;
    for (let k = g; k < 32; k += g) supported += runGroups[k];
    const evidence = ratio(supported, boundedRuns);
    if (
      evidence > gridEvidence ||
      (evidence === gridEvidence && supported > 0)
    ) {
      gridEvidence = evidence;
      gridCandidate = g;
    }
  }
  if (gridEvidence < 0.8 || boundedRuns < 8 || uniqueColors < 2)
    gridCandidate = 0;
  const warnings = [
    tr("common.md84bd24a6a"),
    tr("common.m04d18ca263"),
    tr("common.m653f49f5f9"),
  ];
  if (!visible) warnings.push("Keine sichtbaren Pixel im Analysebereich.");
  if (gridCandidate)
    warnings.push(
      `Run-Längen passen häufig zu ${gridCandidate}-Pixel-Schritten; nur Rasterkandidat, keine sichere Originalauflösung.`,
    );
  return metricsSchema.parse({
    width,
    height,
    roi,
    visible,
    visibleFraction: ratio(visible, roi.width * roi.height),
    partialFraction: ratio(partial, visible),
    uniqueColors,
    palette,
    luminance,
    colorDistribution,
    meanLuminance: ratio(sumLum, visible),
    saturation: ratio(sat, visible),
    warmFraction: ratio(warm, visible),
    coolFraction: ratio(cool, visible),
    blockBoundaryDifference8:
      blockCount && interiorCount
        ? ratio(blockSum, blockCount) - ratio(interiorSum, interiorCount)
        : 0,
    contrast: visible ? hi - lo : 0,
    identicalHorizontal: ratio(sameH, hPairs),
    identicalVertical: ratio(sameV, vPairs),
    edgeDensity: ratio(changed, hPairs + vPairs),
    hardTransitions: ratio(hard, hPairs + vPairs),
    similarTransitions: ratio(similar, hPairs + vPairs),
    meanEdgeContrast: ratio(edgeSum, hPairs + vPairs),
    diagonalPairs: ratio(diag, diagonalChecks),
    ditherLike: ratio(dither, cells),
    runGroups,
    gridCandidate,
    gridEvidence,
    detailByStep,
    quadrants: quadrants.map((q) => ({
      visible: q.visible,
      edgeDensity: ratio(q.edges, q.pairs),
      meanLuminance: ratio(q.meanLuminance, q.visible),
    })),
    warnings,
  });
}
export const deterministicAnalyzer: LocalStyleAnalyzer = {
  version: ANALYSIS_VERSION,
  analyze: measureStyle,
};
export function suggestRules(refs: AnalysisResult[]): Suggestion[] {
  const rules: Suggestion[] = [];
  for (const type of referenceTypes) {
    const group = refs.filter((r) => r.type === type && r.metrics.visible);
    if (!group.length) continue;
    const avg = (
      key:
        | "saturation"
        | "contrast"
        | "edgeDensity"
        | "meanLuminance"
        | "hardTransitions",
    ) => group.reduce((s, r) => s + r.metrics[key], 0) / group.length;
    const label = referenceLabels[type],
      evidence = group
        .map((r) => `${r.id.slice(0, 8)}:${r.sha256.slice(0, 8)}`)
        .join(", ");
    const add = (category: Suggestion["group"], text: string, why: string) =>
      rules.push({
        key: `${type}:${category}`,
        group: category,
        text: `${label} only: ${text}`,
        evidence: `${evidence}. ${why}`,
      });
    add(
      "renderRules",
      `Use native-neighbour detail as a review target: ${(avg("edgeDensity") * 100).toFixed(1)}% changing adjacent visible RGB pairs. Run-grid candidates: ${group.map((r) => r.metrics.gridCandidate || "unknown").join(", ")} px (indicators only, not original resolution). Detail frequencies at native/2/4 steps: ${group.map((r) => r.metrics.detailByStep.map((v) => v.toFixed(3)).join("/")).join(", ")}. Material treatment must be specified manually.`,
      "Native horizontal/vertical RGB-change frequency, selected ROI; resolution-dependent.",
    );
    add(
      "colorRules",
      `Review against saturation ${avg("saturation").toFixed(3)} and luminance span ${avg("contrast").toFixed(3)}; do not transfer character-specific skin, hair or clothing colors.`,
      "HSV saturation mean and encoded-sRGB luminance max−min; equal weight per image.",
    );
    add(
      "lightingRules",
      `Use mean luminance ${avg("meanLuminance").toFixed(3)} as a tonal reference; ${(avg("hardTransitions") * 100).toFixed(1)}% adjacent RGB jumps ≥ 0.2. Light geometry and artistic shading levels require manual direction.`,
      "Measured encoded-sRGB luminance; maximum-channel RGB neighbour jumps.",
    );
    if (["dialogue", "portrait", "full-body", "sprite"].includes(type))
      add(
        "framingRules",
        `Review selected crop aspect ratios ${group.map((r) => (r.metrics.roi.width / r.metrics.roi.height).toFixed(3)).join(", ")}; no automatic subject/camera alignment.`,
        "ROI width / height for this reference type only.",
      );
    add(
      "constraints",
      "Do not infer identity, outfit, physical lighting, original pixel resolution or automatic approval from these statistics.",
      "Measurement limits; virtual source resolution unknown.",
    );
  }
  return rules;
}
export function adoptedRules(suggestions: Suggestion[], edits: AnalysisEdits) {
  if (
    edits.rules.length !== suggestions.length ||
    new Set(edits.rules.map((r) => r.key)).size !== suggestions.length ||
    edits.rules.some((r) => !suggestions.some((s) => s.key === r.key))
  )
    throw new Error(tr("styles.m906c2aa8cb"));
  const get = (group: Suggestion["group"]) =>
    suggestions
      .filter((s) => s.group === group)
      .map((s) => edits.rules.find((r) => r.key === s.key)!)
      .filter((r) => r.enabled && r.text.trim())
      .map((r) => r.text.trim())
      .join("\n");
  return {
    renderRules: [get("renderRules"), get("constraints"), edits.ownRules.trim()]
      .filter(Boolean)
      .join("\n"),
    colorRules: [
      get("colorRules"),
      edits.palette.length
        ? `Manually selected review palette (not identity colors): ${edits.palette.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    lightingRules: get("lightingRules"),
    framingRules: get("framingRules"),
  };
}
export function compareStyle(a: StyleMetrics, b: StyleMetrics) {
  const keys = [
    "meanLuminance",
    "saturation",
    "contrast",
    "edgeDensity",
    "identicalHorizontal",
    "identicalVertical",
    "hardTransitions",
    "similarTransitions",
    "meanEdgeContrast",
    "ditherLike",
    "blockBoundaryDifference8",
  ] as const;
  const warnings = [tr("common.m03299a4d91")];
  if (a.width !== b.width || a.height !== b.height)
    warnings.push(tr("common.m414ba61692"));
  if (Math.abs(a.roi.width / a.roi.height - b.roi.width / b.roi.height) > 0.01)
    warnings.push(tr("common.m181730b8ab"));
  if (Math.abs(a.visibleFraction - b.visibleFraction) > 0.1)
    warnings.push(tr("common.m5d18542b6a"));
  return {
    deltas: keys.map((key) => ({
      key,
      reference: a[key],
      candidate: b[key],
      delta: b[key] - a[key],
    })),
    paletteDistance: a.colorDistribution
      .map((n, key) => ({
        hex: `#${[((key >> 4) & 3) * 64 + 32, ((key >> 2) & 3) * 64 + 32, (key & 3) * 64 + 32].map((c) => c.toString(16).padStart(2, "0")).join("")}`,
        reference: ratio(n, a.visible),
        candidate: ratio(b.colorDistribution[key], b.visible),
      }))
      .filter((c) => c.reference || c.candidate),
    detailDelta: a.detailByStep.map((v, i) => b.detailByStep[i] - v),
    warnings,
  };
}
