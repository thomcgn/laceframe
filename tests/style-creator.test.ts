import { seedHistoricalMaster } from "./historical-master";
import { afterEach, beforeEach, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectService, hashBytes } from "../src/main/project-service";
import {
  measureStyle,
  type AnalysisResult,
} from "../src/shared/style-analysis";
import { proposeStyle, styleWithReview } from "../src/shared/style-creator";
import {
  parseSemanticJSON,
  type SemanticResponse,
  type StyleDraftImage,
} from "../src/shared/style-semantics";
import {
  emptyStyle,
  parsePackJSON,
  serializePack,
  exportStyle,
} from "../src/shared/packs";
import { png } from "./fixtures";
let root: string, service: ProjectService;
beforeEach(async () => {
  root = await fs.mkdtemp(
    path.join(os.tmpdir(), "laceframe-style-creator-test-"),
  );
  service = new ProjectService();
  await service.create(root, "Synthetic styles");
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
const files = (n = 2) =>
  Array.from({ length: n }, (_, i) => ({
    name: `reference-${i}.png`,
    bytes: png(8, 8, 50 + i * 20),
  }));
const refs = (images: StyleDraftImage[]) =>
  images.map((i) => ({
    token: i.token,
    role: "general" as const,
    sourceNote: "Synthetic fixture",
  }));
async function proposal(images: StyleDraftImage[]) {
  const results: AnalysisResult[] = [];
  for (const image of images) {
    const source = await service.styleDraftSource(image.token);
    results.push({
      id: image.token,
      type: "general",
      sha256: image.sha256,
      metrics: measureStyle(source),
    });
  }
  return {
    results,
    style: styleWithReview(proposeStyle(results), {
      results,
      roles: images.map((i) => ({
        sha256: i.sha256,
        role: "general",
        sourceNote: "Synthetic fixture",
      })),
      palette: ["#123456"],
    }),
  };
}
function response(images: StyleDraftImage[]): SemanticResponse {
  return {
    version: "lf-semantic-style-v1",
    references: images.map((i) => ({
      sha256: i.sha256,
      suggestedRole: "portrait",
    })),
    suggestedName: "Independent fixture",
    description: "Measured and reviewed",
    observations: [
      {
        area: "shading",
        text: "Grouped tonal transitions",
        evidence: "Three visible tone groups",
        referenceHashes: [images[0].sha256],
      },
    ],
    interpretations: [
      {
        kind: "mood",
        label: "Quiet",
        confidence: "uncertain",
        evidence: "Subjective tonal interpretation",
        referenceHashes: [images[0].sha256],
      },
    ],
    limitations: ["Fixture response, not a live model result"],
  };
}
it("stages six verified originals without writing a project or asset, cleans all tokens", async () => {
  const before = await fs.readFile(path.join(root, "laceframe.json"));
  const beforeAssets = await fs.readdir(path.join(root, "assets"), {
    recursive: true,
  });
  const images = await service.stageStyleImages({ files: files(6) });
  expect(images).toHaveLength(6);
  expect(await fs.readFile(path.join(root, "laceframe.json"))).toEqual(before);
  expect(
    await fs.readdir(path.join(root, "assets"), { recursive: true }),
  ).toEqual(beforeAssets);
  for (const image of images) {
    expect(image.sha256).toBe(hashBytes(files(6)[images.indexOf(image)].bytes));
    service.discardStyleImage(image.token);
    await expect(service.styleDraftSource(image.token)).rejects.toThrow();
  }
});
it("rejects duplicate and corrupt groups atomically, preserving existing draft", async () => {
  const [first] = await service.stageStyleImages({ files: files(1) });
  await expect(
    service.stageStyleImages({
      files: [
        ...files(2).slice(1),
        { name: "broken.png", bytes: new Uint8Array([1, 2]) },
      ],
    }),
  ).rejects.toThrow(/broken/);
  await expect(service.stageStyleImages({ files: files(2) })).rejects.toThrow();
  expect((await service.styleDraftSource(first.token)).sha256).toBe(
    first.sha256,
  );
  expect(
    await service.stageStyleImages({ files: files(6).slice(1) }),
  ).toHaveLength(5);
  await expect(
    service.stageStyleImages({
      files: [{ name: "extra.png", bytes: png(8, 8, 240) }],
    }),
  ).rejects.toThrow();
});
it("replaces only after successful full validation and rejects oversize/traversal", async () => {
  const [first] = await service.stageStyleImages({ files: files(1) });
  await expect(
    service.stageStyleImages({
      replaceToken: first.token,
      files: [{ name: "bad.png", bytes: new Uint8Array([0]) }],
    }),
  ).rejects.toThrow();
  expect((await service.styleDraftSource(first.token)).sha256).toBe(
    first.sha256,
  );
  for (const file of [
    { name: "../escape.png", bytes: png() },
    { name: "large.png", bytes: new Uint8Array(8 * 1024 * 1024 + 1) },
  ])
    await expect(service.stageStyleImages({ files: [file] })).rejects.toThrow();
  const next = await service.stageStyleImages({
    replaceToken: first.token,
    files: files(2).slice(1),
  });
  expect(next).toHaveLength(1);
  await expect(service.styleDraftSource(first.token)).rejects.toThrow();
});
it("saves independent reviewed profile, backup, read-only original bytes and restart", async () => {
  await service.command({
    type: "addCharacter",
    name: "Synthetic existing identity",
  });
  const staged = await service.stage(png(13, 17, 180), "synthetic-master.png");
  await seedHistoricalMaster(
    service,
    staged,
    service.snapshot().project.selectedCharacterId,
  );
  const master = service.snapshot().project.masters[0];
  const masterBytes = await fs.readFile(path.join(root, master.file));
  await service.command({
    type: "addArtDirection",
    name: "Existing",
    renderRules: "Keep existing style",
  });
  const before = structuredClone(service.snapshot().project);
  const manifest = await fs.readFile(path.join(root, "laceframe.json"));
  const images = await service.stageStyleImages({ files: files() });
  const { style } = await proposal(images);
  const saved = await service.command({
    type: "createStylePreset",
    references: refs(images),
    style,
    scopeReviewed: true,
  });
  expect(saved.project.artDirections.slice(0, -1)).toEqual(
    before.artDirections,
  );
  expect(saved.project.defaultArtDirectionId).toBe(
    before.defaultArtDirectionId,
  );
  expect(saved.project.characters).toEqual(before.characters);
  expect(saved.project.masters).toEqual(before.masters);
  expect(await fs.readFile(path.join(root, master.file))).toEqual(masterBytes);
  expect(
    await fs.readFile(
      path.join(root, "laceframe.v2.pre-style-creator.backup.json"),
    ),
  ).toEqual(manifest);
  for (const asset of saved.project.styleAssets) {
    expect(await fs.readFile(path.join(root, asset.file))).toEqual(
      files().find((f) => hashBytes(f.bytes) === asset.sha256)!.bytes,
    );
    expect((await fs.stat(path.join(root, asset.file))).mode & 0o222).toBe(0);
  }
  await expect(service.styleDraftSource(images[0].token)).rejects.toThrow();
  const reopened = await new ProjectService().open(root);
  expect(reopened.project).toEqual(saved.project);
});
it("reuses known immutable image and rejects forged measurements before asset writes", async () => {
  let images = await service.stageStyleImages({ files: files(1) });
  let { style } = await proposal(images);
  style.findings[0].metrics.saturation = 0.12345;
  await expect(
    service.command({
      type: "createStylePreset",
      references: refs(images),
      style,
      scopeReviewed: true,
    }),
  ).rejects.toThrow();
  expect(service.snapshot().project.styleAssets).toHaveLength(0);
  ({ style } = await proposal(images));
  await service.command({
    type: "createStylePreset",
    references: refs(images),
    style,
    scopeReviewed: true,
  });
  images = await service.stageStyleImages({ files: files(1) });
  expect(images[0].known).toBe(true);
  ({ style } = await proposal(images));
  style.name = "Another independent style";
  const result = await service.command({
    type: "createStylePreset",
    references: refs(images),
    style,
    scopeReviewed: true,
  });
  expect(result.project.styleAssets).toHaveLength(1);
  expect(result.project.artDirections).toHaveLength(2);
});
it("strictly validates semantic identities, order, schema and unsafe input", async () => {
  const images = await service.stageStyleImages({ files: files() });
  const raw = response(images),
    hashes = images.map((i) => i.sha256);
  expect(parseSemanticJSON(JSON.stringify(raw), hashes)).toEqual(raw);
  for (const invalid of [
    { ...raw, references: [...raw.references].reverse() },
    { ...raw, extra: true },
    { ...raw, description: "file:///private/portrait.png" },
    {
      ...raw,
      observations: [
        { ...raw.observations[0], referenceHashes: ["f".repeat(64)] },
      ],
    },
  ])
    expect(() => parseSemanticJSON(JSON.stringify(invalid), hashes)).toThrow();
  expect(() => parseSemanticJSON('{"__proto__":{}}', hashes)).toThrow();
});
it("manual provenance needs Main receipt and cannot pretend to be a native result", async () => {
  const images = await service.stageStyleImages({ files: files() });
  const imported = service.importStyleSemantic(
    JSON.stringify(response(images)),
    refs(images),
  );
  expect(imported.record.provider).toBe("manual-import");
  const { results } = await proposal(images);
  const style = styleWithReview(proposeStyle(results, imported.record), {
    results,
    roles: images.map((i) => ({
      sha256: i.sha256,
      role: "general",
      sourceNote: "Synthetic fixture",
    })),
    palette: [],
    semantic: imported.record,
  });
  await expect(
    service.command({
      type: "createStylePreset",
      references: refs(images),
      style,
      scopeReviewed: true,
      semanticReceipt: randomUUID(),
    }),
  ).rejects.toThrow();
  const result = await service.command({
    type: "createStylePreset",
    references: refs(images),
    style,
    scopeReviewed: true,
    semanticReceipt: imported.receipt,
  });
  expect(
    result.project.artDirections[0].portableStyle!.creator!.semantic,
  ).toEqual(imported.record);
});
it("roundtrips old and new strict packs without embedding source images or absolute paths", async () => {
  const images = await service.stageStyleImages({ files: files() });
  const { style } = await proposal(images);
  for (const content of [emptyStyle("Old style"), style]) {
    const pack = {
      format: "laceframe.style" as const,
      schemaVersion: 1 as const,
      id: randomUUID(),
      revision: 1,
      provenance: { application: "laceframe" as const, note: "Synthetic" },
      style: content,
    };
    const json = serializePack(pack);
    expect(parsePackJSON(json)).toEqual(pack);
    expect(json).not.toContain(root);
    expect(json).not.toContain("data:image");
  }
  const malformed = structuredClone(style);
  malformed.creator!.references.reverse();
  expect(() =>
    parsePackJSON(
      JSON.stringify({
        format: "laceframe.style",
        schemaVersion: 1,
        id: randomUUID(),
        revision: 1,
        provenance: { application: "laceframe", note: "" },
        style: malformed,
      }),
    ),
  ).toThrow();
});
it("clears transient references and semantic receipts on project close", async () => {
  const images = await service.stageStyleImages({ files: files() });
  service.importStyleSemantic(JSON.stringify(response(images)), refs(images));
  service.close();
  await service.open(root);
  await expect(service.styleDraftSource(images[0].token)).rejects.toThrow();
});

it("imports a creator pack into an independent project without switching its default or inventing image assets", async () => {
  const images = await service.stageStyleImages({ files: files() });
  const { style } = await proposal(images);
  const source = await service.command({
    type: "createStylePreset",
    references: refs(images),
    style,
    scopeReviewed: true,
  });
  const pack = exportStyle(source.project, source.project.artDirections[0]);
  const targetDir = path.join(root, "target");
  await fs.mkdir(targetDir);
  const target = new ProjectService();
  const before = await target.create(targetDir, "Target");
  const preview = target.previewPack(serializePack(pack));
  const imported = await target.command({
    type: "importPack",
    pack: preview.pack,
    projectHash: preview.projectHash,
    choices: preview.rows.map((row) => ({
      key: row.key,
      action: "new" as const,
    })),
  });
  expect(imported.project.defaultArtDirectionId).toBe(
    before.project.defaultArtDirectionId,
  );
  expect(imported.project.styleAssets).toEqual([]);
  expect(imported.project.artDirections[0].portableStyle).toEqual(pack.style);
  expect(
    exportStyle(imported.project, imported.project.artDirections[0]),
  ).toEqual(pack);
  expect((await new ProjectService().open(targetDir)).project).toEqual(
    imported.project,
  );
  expect(
    await fs.readFile(
      path.join(targetDir, "laceframe.v2.pre-style-creator.backup.json"),
      "utf8",
    ),
  ).toContain("Target");
});
