import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  measureStyle,
  compareStyle,
  suggestRules,
  adoptedRules,
  MAX_ANALYSIS_PIXELS,
  type AnalysisResult,
  type AnalysisEdits,
} from "../src/shared/style-analysis";
import { ProjectService, hashBytes } from "../src/main/project-service";
import { decodePixels } from "../src/main/mask-composite";
import {
  projectSchema,
  effectiveStyle,
  referencesForStyle,
} from "../src/shared/domain";
import { composePrompt } from "../src/shared/generation";
import { png } from "./fixtures";
const image = (w = 8, h = 8, color = [255, 0, 0, 255]) => ({
  width: w,
  height: h,
  data: Uint8Array.from(Array.from({ length: w * h }, () => color).flat()),
});
const ref = (
  m = measureStyle(image()),
  type: AnalysisResult["type"] = "portrait",
): AnalysisResult => ({
  id: randomUUID(),
  type,
  sha256: "a".repeat(64),
  metrics: m,
});
const edits = (refs: AnalysisResult[]): AnalysisEdits => ({
  rules: suggestRules(refs).map((s) => ({
    key: s.key,
    text: s.text,
    enabled: true,
  })),
  palette: ["#cc8844"],
  ownRules: "Manually confirmed material direction",
});
describe("deterministic encoded RGB measurements", () => {
  it("counts exact RGB, 5-bit groups, histograms and visible alpha without mutating source", () => {
    const a = image(3, 1);
    a.data.set([255, 0, 0, 128], 4);
    a.data.set([0, 255, 0, 0], 8);
    const before = a.data.slice(),
      m = measureStyle(a);
    expect(m.visible).toBe(2);
    expect(m.partialFraction).toBe(0.5);
    expect(m.uniqueColors).toBe(1);
    expect(m.palette).toEqual([{ hex: "#fc0404", count: 2, fraction: 1 }]);
    expect(m.luminance.reduce((a, b) => a + b)).toBe(2);
    expect(m.identicalHorizontal).toBe(1);
    expect(a.data).toEqual(before);
    expect(measureStyle(a)).toEqual(m);
  });
  it("excludes dominant background via native ROI, preserving dimensions", () => {
    const a = image(8, 8, [0, 0, 255, 255]);
    a.data.set([255, 0, 0, 255], (3 * 8 + 3) * 4);
    const m = measureStyle(a, { x: 3, y: 3, width: 1, height: 1 });
    expect(m.width).toBe(8);
    expect(m.uniqueColors).toBe(1);
    expect(m.palette[0].hex).toBe("#fc0404");
    expect(measureStyle(a).palette[0].hex).toBe("#0404fc");
    expect(() => measureStyle(a, { x: 7, y: 0, width: 2, height: 2 })).toThrow(
      /außerhalb/,
    );
  });
  it("handles invisible and single pixels without NaN or invented rules", () => {
    const m = measureStyle(image(1, 1, [1, 2, 3, 0]));
    expect(m.visible).toBe(0);
    expect(m.palette).toEqual([]);
    expect(m.meanEdgeContrast).toBe(0);
    expect(m.warnings.join(" ")).toMatch(/Keine sichtbaren/);
    expect(suggestRules([ref(m)])).toEqual([]);
  });
  it("measures block runs separately from unknown virtual resolution", () => {
    const a = image(32, 32);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++)
        a.data.set(
          (Math.floor(x / 4) + Math.floor(y / 4)) % 2
            ? [0, 0, 255, 255]
            : [255, 0, 0, 255],
          (y * 32 + x) * 4,
        );
    const m = measureStyle(a);
    expect(m.gridCandidate).toBeGreaterThan(0);
    expect(m.gridEvidence).toBe(1);
    expect(m.runGroups[4]).toBeGreaterThan(0);
    expect(m.identicalHorizontal).toBeGreaterThan(0.7);
    expect(m.warnings.join(" ")).toMatch(/keine sichere Originalauflösung/);
  });
  it("measures dither-like cells and fine/coarse aliasing without asserting a technique", () => {
    const a = image(16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        if ((x + y) % 2) a.data.set([0, 0, 0, 255], (y * 16 + x) * 4);
    const m = measureStyle(a);
    expect(m.ditherLike).toBe(1);
    expect(m.diagonalPairs).toBe(1);
    expect(m.detailByStep).toEqual([1, 0, 0]);
    expect(m.hardTransitions).toBe(1);
  });
  it("distinguishes gentle transitions, quadrants and luminance contrast", () => {
    const a = image(16, 16);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        a.data.set([x * 4, x * 4, x * 4, 255], (y * 16 + x) * 4);
    const m = measureStyle(a);
    expect(m.similarTransitions).toBe(0.5);
    expect(m.hardTransitions).toBe(0);
    expect(m.quadrants[1].meanLuminance).toBeGreaterThan(
      m.quadrants[0].meanLuminance,
    );
    expect(m.contrast).toBeCloseTo(60 / 255);
    expect(m.warnings.join(" ")).toMatch(/WebP-Kompression/);
  });
  it("measures periodic 8px block discontinuities without asserting compression", () => {
    const a = image(32, 32);
    for (let y = 0; y < 32; y++)
      for (let x = 0; x < 32; x++)
        a.data.set(
          (Math.floor(x / 8) + Math.floor(y / 8)) % 2
            ? [0, 0, 0, 255]
            : [255, 255, 255, 255],
          (y * 32 + x) * 4,
        );
    const m = measureStyle(a);
    expect(m.blockBoundaryDifference8).toBe(1);
    expect(m.coolFraction).toBe(0);
    expect(m.warmFraction).toBe(0);
    expect(measureStyle(image(4, 4, [0, 0, 255, 255])).coolFraction).toBe(1);
  });
  it("bounds malformed and oversized sources before allocation", () => {
    expect(() =>
      measureStyle({
        width: MAX_ANALYSIS_PIXELS + 1,
        height: 1,
        data: new Uint8Array(),
      }),
    ).toThrow(/4 Megapixel/);
    expect(() =>
      measureStyle({ width: 8, height: 8, data: new Uint8Array(1) }),
    ).toThrow();
    expect(() =>
      measureStyle(image(), { x: -1, y: 0, width: 2, height: 2 }),
    ).toThrow();
  });
  it("keeps environment, UI and portrait rules scoped and explains every suggestion", () => {
    const refs = [
      ref(),
      ref(measureStyle(image()), "environment"),
      ref(measureStyle(image()), "ui"),
    ];
    const rules = suggestRules(refs);
    expect(rules.every((s) => s.evidence.length > 20)).toBe(true);
    expect(rules.filter((r) => r.group === "framingRules")).toHaveLength(1);
    expect(rules.find((r) => r.key === "environment:colorRules")!.text).toMatch(
      /^Spielszene \/ Environment only:/,
    );
    const e = edits(refs);
    e.rules[0].text = "Manually edited contour direction";
    e.rules[1].enabled = false;
    const adopted = adoptedRules(rules, e);
    expect(adopted.renderRules).toContain("Manually edited contour direction");
    expect(adopted.colorRules).not.toContain(
      "Portrait / Character Master only",
    );
    expect(adopted.renderRules).toContain(e.ownRules);
    expect(adopted.colorRules).toContain("#cc8844");
    expect(() => adoptedRules(rules, { ...e, rules: [] })).toThrow();
  });
  it("compares actual metrics and flags incompatible dimensions/aspect/alpha", () => {
    const a = measureStyle(image()),
      b = measureStyle(image(16, 8, [0, 0, 255, 255]));
    b.visibleFraction = 0.5;
    const c = compareStyle(a, b);
    expect(c.deltas.find((d) => d.key === "meanLuminance")!.delta).toBeCloseTo(
      0.0722 - 0.2126,
    );
    expect(c.warnings).toHaveLength(4);
    expect(c.paletteDistance.find((c) => c.reference === 1)!.candidate).toBe(0);
    expect(c.detailDelta).toEqual([0, 0, 0]);
  });
  it("measures the actual bounded 4MP case with a fixed-size color buffer", () => {
    const a = {
      width: 2048,
      height: 2048,
      data: new Uint8Array(MAX_ANALYSIS_PIXELS * 4).fill(255),
    };
    const start = performance.now();
    const m = measureStyle(a);
    console.log(
      JSON.stringify({
        analysis4mpMs: Math.round(performance.now() - start),
        rgbaBytes: a.data.byteLength,
        colorScratchBytes: MAX_ANALYSIS_PIXELS * 4,
        paletteScratchBytes: 32768 * 4,
      }),
    );
    expect(m.visible).toBe(MAX_ANALYSIS_PIXELS);
    expect(m.uniqueColors).toBe(1);
    expect(m.gridCandidate).toBe(0);
  });
});
let root: string, service: ProjectService, profileId: string, masterId: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-analysis-"));
  service = new ProjectService();
  await service.create(root, "Synthetic analysis");
  await service.command({ type: "addCharacter", name: "A" });
  const staged = await service.stage(png(23, 31), "master.png");
  await service.command({
    type: "confirmMaster",
    characterId: service.snapshot().project.selectedCharacterId!,
    token: staged.token,
  });
  masterId = service.snapshot().project.masters[0].id;
  await service.command({
    type: "addArtDirection",
    name: "Measured style",
    renderRules: "Original manual rule",
  });
  profileId = service.snapshot().project.defaultArtDirectionId!;
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
async function adopt() {
  const source = await service.analysisSource(masterId),
    m = measureStyle(source);
  return service.command({
    type: "adoptStyleAnalysis",
    profileId,
    expectedRevision: service.snapshot().project.artDirections[0].revision,
    references: [{ id: masterId, type: "portrait" }],
    edits: edits([
      { id: masterId, type: "portrait", sha256: source.sha256, metrics: m },
    ]),
  });
}
describe("verified style provenance, adoption and project compatibility", () => {
  it("reads without writes and explicitly appends reproducible immutable analyses and revisions", async () => {
    const original = await fs.readFile(path.join(root, "laceframe.json"));
    const source = await service.analysisSource(masterId);
    expect(measureStyle(source)).toEqual(
      measureStyle(
        decodePixels(
          await fs.readFile(
            path.join(root, service.snapshot().project.masters[0].file),
          ),
        ),
      ),
    );
    expect(await fs.readFile(path.join(root, "laceframe.json"))).toEqual(
      original,
    );
    const old = service.snapshot().project;
    await adopt();
    const first = service.snapshot().project;
    expect(first.artDirections[0].revision).toBe(2);
    expect(first.styleAnalyses).toHaveLength(1);
    expect(first.styleAssets).toHaveLength(1);
    expect(first.artDirections[0].styleReferenceIds).toEqual([
      first.styleAssets[0].id,
    ]);
    expect(first.styleAssets[0].sha256).toBe(source.sha256);
    expect(
      await fs.readFile(path.join(root, first.styleAssets[0].file)),
    ).toEqual(await fs.readFile(path.join(root, first.masters[0].file)));
    expect(first.styleAnalyses[0].parameters.comparisonSteps).toEqual([
      1, 2, 4,
    ]);
    expect(first.styleAnalyses[0].references[0].sha256).toBe(source.sha256);
    expect(first.masters).toEqual(old.masters);
    expect(first.characters).toEqual(old.characters);
    expect(
      await fs.readFile(
        path.join(root, "laceframe.v2.pre-style-analysis.backup.json"),
      ),
    ).toEqual(original);
    await adopt();
    const second = service.snapshot().project;
    expect(second.styleAnalyses[0]).toEqual(first.styleAnalyses[0]);
    expect(second.artDirectionRevisions[0].renderRules).toBe(
      "Original manual rule",
    );
    const reopen = new ProjectService();
    await reopen.open(root);
    expect(reopen.snapshot().project).toEqual(second);
  });
  it("rejects stale profile revisions, unknown and damaged references without writes", async () => {
    const before = await fs.readFile(path.join(root, "laceframe.json"));
    await expect(service.analysisSource(randomUUID())).rejects.toThrow();
    await expect(service.analysisSource("../../etc/passwd")).rejects.toThrow();
    await expect(
      service.command({
        type: "adoptStyleAnalysis",
        profileId,
        expectedRevision: 99,
        references: [{ id: masterId, type: "portrait" }],
        edits: { rules: [], palette: [], ownRules: "x" },
      }),
    ).rejects.toThrow(/geändert/);
    const a = service.snapshot().project.masters[0];
    await fs.chmod(path.join(root, a.file), 0o600);
    await fs.writeFile(path.join(root, a.file), png(23, 31, 11));
    await expect(service.analysisSource(masterId)).rejects.toThrow();
    expect(await fs.readFile(path.join(root, "laceframe.json"))).toEqual(
      before,
    );
  });
  it("rejects symlinked sources, corrupt provenance and duplicate inputs", async () => {
    const a = service.snapshot().project.masters[0],
      file = path.join(root, a.file),
      backup = path.join(root, "copy.png");
    await fs.copyFile(file, backup);
    await fs.unlink(file);
    await fs.symlink(backup, file);
    await expect(service.analysisSource(masterId)).rejects.toThrow(/link/i);
    await fs.unlink(file);
    await fs.copyFile(backup, file);
    await adopt();
    const p = service.snapshot().project;
    p.styleAnalyses[0].references[0].sha256 = "f".repeat(64);
    expect(projectSchema.safeParse(p).success).toBe(false);
    await expect(
      service.command({
        type: "adoptStyleAnalysis",
        profileId,
        expectedRevision: 2,
        references: [
          { id: masterId, type: "portrait" },
          { id: masterId, type: "environment" },
        ],
        edits: { rules: [], palette: [], ownRules: "x" },
      }),
    ).rejects.toThrow();
  });
  it("keeps old projects read-only on open and preserves separate characters and saved prompts", async () => {
    const p = service.snapshot().project,
      variant = p.variants[0],
      master = p.masters[0],
      style = effectiveStyle(p, master.characterId),
      refs = referencesForStyle(p, style);
    const basePrompt = composePrompt({
      characterName: "A",
      master,
      variant,
      familyLabel: p.families[0].label,
      artDirection: style,
      styleReferences: refs,
      action: "silent",
      supplementaryInstructions: "",
    });
    await service.command({
      type: "prepareAttempt",
      draft: {
        characterId: master.characterId,
        masterId,
        masterSha256: master.sha256,
        variantId: variant.id,
        action: "silent",
        artDirectionId: style!.id,
        artDirectionRevision: style!.revision,
        styleReferences: refs,
        providerId: "manual-import",
        basePrompt,
        prompt: basePrompt,
        supplementaryInstructions: "",
      },
    });
    await service.command({ type: "addCharacter", name: "B" });
    const before = service.snapshot().project;
    const file = path.join(root, "laceframe.json"),
      legacy = JSON.parse(await fs.readFile(file, "utf8"));
    delete legacy.styleAnalyses;
    await fs.writeFile(file, JSON.stringify(legacy));
    const bytes = await fs.readFile(file);
    service = new ProjectService();
    await service.open(root);
    expect(await fs.readFile(file)).toEqual(bytes);
    expect(service.snapshot().project.styleAnalyses).toEqual([]);
    await adopt();
    const after = service.snapshot().project;
    expect(after.attempts).toEqual(before.attempts);
    expect(after.characters).toEqual(before.characters);
    expect(after.expressionPerformances).toEqual(before.expressionPerformances);
    expect(after.outfits).toEqual(before.outfits);
    expect(hashBytes(await fs.readFile(path.join(root, master.file)))).toBe(
      master.sha256,
    );
    expect(effectiveStyle(after, master.characterId)!.renderRules).not.toBe(
      "Original manual rule",
    );
  });
});
