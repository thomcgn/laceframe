import { seedHistoricalMaster } from "./historical-master";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  ProjectService,
  hashBytes,
  inspectImage,
} from "../src/main/project-service";
import {
  analyzePixels,
  cutoutPixels,
  resizePixels,
} from "../src/main/asset-quality";
import {
  compositePixels,
  decodePixels,
  encodeMask,
  encodePixels,
} from "../src/main/mask-composite";
import { writeExport } from "../src/main/asset-export";
import { compositeSchema, paintStroke } from "../src/shared/masking";
import { projectSchema } from "../src/shared/domain";
import {
  TRANSPARENT_CHARACTER_INSTRUCTION,
  RESOLUTION_PROFILES,
} from "../src/shared/asset-quality";
import { composePrompt } from "../src/shared/generation";
import {
  composeCharacterPrompt,
  DEFAULT_COMPOSITION,
} from "../src/shared/character-creation";
import { png } from "./fixtures";
const image = () => decodePixels(png(7, 7, 0));
const weights = () =>
  Uint8Array.from({ length: 49 }, (_, i) =>
    i % 7 > 0 && i % 7 < 6 && i >= 7 && i < 42 ? 255 : 0,
  );
const profile = {
  name: "Synthetic square",
  width: 10,
  height: 10,
  sampling: "nearest" as const,
  fit: "contain" as const,
};
describe("decoded alpha and deterministic transforms", () => {
  it("distinguishes an opaque black PNG from genuine transparency and soft alpha", () => {
    const p = image();
    expect(analyzePixels(p).status).toBe("opaque");
    const r = cutoutPixels(p, weights());
    r.data[8 * 4 + 3] = 128;
    const report = analyzePixels(decodePixels(encodePixels(r)));
    expect(report.status).toBe("transparent");
    expect(report.transparent).toBe(24);
    expect(report.partial).toBe(1);
    expect(report.edgeTransparent).toBe(report.edgePixels);
    expect(report.alphaCapable).toBe(true);
  });
  it("flags an exact baked gray checkerboard without claiming semantic segmentation", () => {
    const p = decodePixels(png(16, 16));
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const n = (y * 16 + x) * 4,
          v = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 180 : 220;
        p.data[n] = p.data[n + 1] = p.data[n + 2] = v;
      }
    expect(analyzePixels(p).warnings.join(" ")).toContain(
      "eingebranntes Schachbrett",
    );
    expect(analyzePixels(p).status).toBe("opaque");
  });
  it("flags opaque border with a transparent hole and fully empty output", () => {
    const p = image();
    p.data[24 * 4 + 3] = 0;
    expect(analyzePixels(p).status).toBe("suspicious");
    const r = cutoutPixels(p, new Uint8Array(49));
    expect(analyzePixels(r).status).toBe("empty");
  });
  it("retains all black clothing/hair RGB and original bytes without color inference", () => {
    const p = image(),
      before = new Uint8Array(p.data),
      w = weights();
    w[8] = 128;
    const a = cutoutPixels(p, w),
      b = cutoutPixels(p, w);
    expect(a).toEqual(b);
    expect(a.data[24 * 4 + 3]).toBe(255);
    expect([...a.data.slice(24 * 4, 24 * 4 + 4)]).toEqual([0, 0, 0, 255]);
    expect(a.data[8 * 4 + 3]).toBe(128);
    expect([...p.data]).toEqual([...before]);
  });
  it("preserves RGB beneath removed alpha and supports corrective strokes", () => {
    const p = image();
    p.data[0] = 201;
    const removed = cutoutPixels(p, new Uint8Array(49));
    expect(removed.data[0]).toBe(201);
    const corrected = paintStroke(
      weights(),
      7,
      7,
      { x: 3.5, y: 3.5 },
      { x: 3.5, y: 3.5 },
      0.6,
      128,
    );
    expect(cutoutPixels(p, corrected).data[24 * 4 + 3]).toBe(128);
  });
  it("rejects falsely declared/corrupt image data and invalid masks", () => {
    expect(() => decodePixels(Buffer.from("RIFFnotapng"))).toThrow();
    expect(() => decodePixels(png().subarray(0, 40))).toThrow();
    expect(() => cutoutPixels(image(), new Uint8Array(1))).toThrow();
    expect(inspectImage(png()).format).toBe("png");
  });
  it("uses alpha-correct V2 without dark halos and still reproduces V1", () => {
    const m = { width: 1, height: 1, data: new Uint8Array([0, 0, 0, 0]) },
      r = { ...m, data: new Uint8Array([200, 100, 50, 255]) },
      mask = decodePixels(encodeMask(1, 1, new Uint8Array([128])));
    expect([...compositePixels(m, r, mask).data]).toEqual([200, 100, 50, 128]);
    expect([...compositePixels(m, r, mask, 1).data]).toEqual([
      100, 50, 25, 128,
    ]);
    expect([
      ...compositePixels(
        m,
        r,
        decodePixels(encodeMask(1, 1, new Uint8Array([0]))),
      ).data,
    ]).toEqual([0, 0, 0, 0]);
    expect(
      compositeSchema.safeParse({
        rawId: randomUUID(),
        rawSha256: "a".repeat(64),
        maskId: randomUUID(),
        maskSha256: "b".repeat(64),
        maskRevision: 1,
        version: 1,
        rule: "rgba8-premultiplied-round",
        registration: "user-confirmed-origin",
      }).success,
    ).toBe(false);
  });
  it("copies hidden RGB and exact editable endpoints; alpha-zero gray blends are deterministic", () => {
    const m = { width: 1, height: 1, data: new Uint8Array([17, 23, 99, 0]) },
      r = { ...m, data: new Uint8Array([255, 255, 255, 0]) };
    expect([
      ...compositePixels(
        m,
        r,
        decodePixels(encodeMask(1, 1, new Uint8Array([128]))),
      ).data,
    ]).toEqual([17, 23, 99, 0]);
    expect([
      ...compositePixels(
        m,
        r,
        decodePixels(encodeMask(1, 1, new Uint8Array([255]))),
      ).data,
    ]).toEqual([...r.data]);
  });
  it("pads transparently with no aspect distortion and nearest sampling keeps clusters", () => {
    const p = {
      width: 2,
      height: 1,
      data: new Uint8Array([200, 0, 0, 255, 0, 0, 255, 128]),
    };
    const r = resizePixels(p, { ...profile, width: 4, height: 4 });
    expect(r.data.slice(0, 16)).toEqual(new Uint8Array(16));
    expect([...r.data.slice(16, 32)]).toEqual([
      200, 0, 0, 255, 200, 0, 0, 255, 0, 0, 255, 128, 0, 0, 255, 128,
    ]);
    expect(
      resizePixels(p, { ...profile, width: 1, height: 1, fit: "cover" }).width,
    ).toBe(1);
  });
  it("bilinear ignores hidden black/white RGB and never turns a soft red edge gray", () => {
    const p = {
      width: 2,
      height: 1,
      data: new Uint8Array([255, 0, 0, 255, 255, 255, 255, 0]),
    };
    const r = resizePixels(p, {
      ...profile,
      width: 4,
      height: 2,
      sampling: "bilinear",
    });
    expect([...r.data.slice(4, 8)]).toEqual([255, 0, 0, 191]);
    expect([...r.data.slice(8, 12)]).toEqual([255, 0, 0, 64]);
  });
});
let root: string, dir: string, service: ProjectService;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-quality-"));
  dir = path.join(root, "project");
  await fs.mkdir(dir);
  service = new ProjectService();
  await service.create(dir, "Synthetic quality");
  await service.command({
    type: "addCharacter",
    name: "Synthetic Black Outfit",
  });
  const s = await service.stage(png(7, 7, 0), "master.png");
  await seedHistoricalMaster(
    service,
    s,
    service.snapshot().project.selectedCharacterId,
  );
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
const latest = () => service.snapshot().project.qualityAssets.at(-1)!;
const approve = () =>
  service.command({
    type: "reviewQuality",
    id: latest().id,
    status: "approved",
    notes: "Silhouette, palette and outfit manually checked",
    confirmStyleAndSilhouette: true,
  });
async function cutout(sourceId = service.snapshot().project.masters[0].id) {
  await service.command({
    type: "createCutout",
    name: "Silhouette",
    sourceId,
    weights: weights(),
  });
  return latest();
}
describe("immutable quality lifecycle, versions and exports", () => {
  it("creates an immutable cutout/mask, allows correction from original and reopens without mutation", async () => {
    const master = service.snapshot().project.masters[0],
      original = await fs.readFile(path.join(dir, master.file));
    const q = await cutout();
    expect(q.status).toBe("candidate");
    expect(q.mask?.type).toBe("foreground-alpha");
    expect(q.mask?.name).toBe("Silhouette");
    expect(await service.cutoutMask(q.id)).toEqual(weights());
    const changed = await service.command({
      type: "createCutout",
      sourceId: master.id,
      weights: weights(),
    });
    expect(changed.project.qualityAssets[1].id).not.toBe(q.id);
    expect(changed.project.qualityAssets[1].sha256).toBe(q.sha256);
    expect(await fs.readFile(path.join(dir, master.file))).toEqual(original);
    const manifest = await fs.readFile(path.join(dir, "laceframe.json"));
    const r = await new ProjectService().open(dir);
    expect(r.project).toEqual(service.snapshot().project);
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(
      manifest,
    );
  });
  it("makes Master V2 while expressions and masks remain bound to V1", async () => {
    const p = service.snapshot().project,
      master = p.masters[0],
      s = await service.stage(png(7, 7, 20), "expression.png");
    await service.command({
      type: "importCandidate",
      characterId: master.characterId,
      variantId: p.variants[0].id,
      action: "silent",
      token: s.token,
    });
    await service.command({
      type: "saveMask",
      masterId: master.id,
      name: "Face",
      weights: new Uint8Array(49),
    });
    const old = service.snapshot().project;
    await cutout();
    await approve();
    const next = service.snapshot().project;
    expect(next.masters).toHaveLength(2);
    expect(next.masters[0]).toEqual(master);
    expect(next.masters[1].previousMasterId).toBe(master.id);
    expect(next.masters[1].version).toBe(2);
    expect(next.characters[0].masterId).toBe(next.masters[1].id);
    expect(next.assets).toEqual(old.assets);
    expect(next.masks).toEqual(old.masks);
    expect(next.qualityAssets[0].approvedMasterId).toBe(next.masters[1].id);
    expect((await new ProjectService().open(dir)).project).toEqual(next);
  });
  it("reviews a creator cutout as first master retaining identity, outfit, resolution and raw provenance", async () => {
    await service.command({ type: "addCharacter", name: "Separate Creator" });
    const characterId = service.snapshot().project.selectedCharacterId!,
      s = await service.stageIdentity(png(7, 7, 123), "identity.png");
    await service.command({
      type: "importIdentityReference",
      characterId,
      token: s.token,
    });
    const identity = service.snapshot().project.identityAssets[0];
    const composition = {
      ...DEFAULT_COMPOSITION,
      targetWidth: 512,
      targetHeight: 512,
      targetResolution: RESOLUTION_PROFILES[1],
    };
    const settings = {
      characterId,
      identityReferences: [{ id: identity.id, sha256: identity.sha256 }],
      identityNotes: "Independent identity",
      styleReferences: [],
      outfit: "Independent black coat and glasses",
      composition,
    };
    await service.command({
      type: "prepareCharacterMaster",
      draft: {
        ...settings,
        operation: "create-character-master",
        prompt: composeCharacterPrompt(service.snapshot().project, settings),
      },
    });
    const attempt = service.snapshot().project.masterAttempts[0],
      now = new Date().toISOString();
    await service.recordGeneration(attempt.id, {
      startedAt: now,
      durationMs: 0,
      status: "running",
    });
    await service.importMasterGeneration(attempt.id, png(7, 7, 0), () => ({
      startedAt: now,
      endedAt: now,
      durationMs: 1,
      status: "completed",
    }));
    const candidate = service.snapshot().project.masterCandidates[0];
    await cutout(candidate.id);
    await approve();
    const p = service.snapshot().project,
      m = p.masters.find((m) => m.characterId === characterId)!;
    expect(m.version).toBe(1);
    expect(m.qualitySourceId).toBe(latest().id);
    expect(p.masterCandidates[0]).toEqual(candidate);
    expect(p.masterAttempts[0].composition.targetResolution).toEqual(
      RESOLUTION_PROFILES[1],
    );
    expect(p.outfits.find((o) => o.characterId === characterId)?.notes).toBe(
      settings.outfit,
    );
    expect(p.identityAssets[0]).toEqual(identity);
    expect((await new ProjectService().open(dir)).project).toEqual(p);
  });
  it("does not replace an active master from an outdated improvement", async () => {
    await cutout();
    const stale = latest();
    await cutout();
    await approve();
    await expect(
      service.command({
        type: "reviewQuality",
        id: stale.id,
        status: "approved",
        notes: "checked",
        confirmStyleAndSilhouette: true,
      }),
    ).rejects.toThrow("aktuellen Master");
  });
  it.each(["opaque", "empty"])(
    "blocks %s production approval and preserves candidate",
    async (kind) => {
      await service.command({
        type: "createCutout",
        sourceId: service.snapshot().project.masters[0].id,
        weights: new Uint8Array(49).fill(kind === "opaque" ? 255 : 0),
      });
      await expect(approve()).rejects.toThrow("nicht produktionsfertig");
      expect(latest().status).toBe("candidate");
    },
  );
  it("requires human notes and explicit style/silhouette review; rejection cannot be reapproved", async () => {
    const q = await cutout();
    await expect(
      service.command({
        type: "reviewQuality",
        id: q.id,
        status: "approved",
        notes: "",
        confirmStyleAndSilhouette: true,
      }),
    ).rejects.toThrow();
    await service.command({
      type: "reviewQuality",
      id: q.id,
      status: "rejected",
      notes: "Contour needs correction",
      confirmStyleAndSilhouette: true,
    });
    await expect(approve()).rejects.toThrow("Ungeprüfte");
  });
  it("creates independent approved resolution exports with exact profile and no master replacement", async () => {
    await cutout();
    await approve();
    const master = service.snapshot().project.masters.at(-1)!;
    await service.command({
      type: "deriveResolution",
      sourceId: master.id,
      profile,
    });
    await approve();
    expect(service.snapshot().project.masters).toHaveLength(2);
    expect(latest().profile).toEqual(profile);
    expect(
      (
        await service.exportPayload({
          id: latest().id,
          raw: false,
          provenance: true,
        })
      ).name,
    ).toContain("10x10");
  });
  it("exports human filenames and explicit raw status; never writes internal assets", async () => {
    const old = service.snapshot().project.masters[0];
    await expect(
      service.exportPayload({ id: old.id, raw: false, provenance: true }),
    ).rejects.toThrow("Rohbild");
    const raw = await service.exportPayload({
      id: old.id,
      raw: true,
      provenance: false,
    });
    expect(raw.name).toBe("Synthetic_Black_Outfit_Master_V1_7x7_RAW.png");
    await cutout();
    await approve();
    const m = service.snapshot().project.masters[1],
      payload = await service.exportPayload({
        id: m.id,
        raw: false,
        provenance: true,
      });
    expect(payload.name).toBe("Synthetic_Black_Outfit_Master_V2_7x7.png");
    expect(JSON.parse(payload.provenance!).source.sha256).toBe(m.sha256);
    await expect(writeExport(dir, dir, payload)).rejects.toThrow("außerhalb");
    await writeExport(root, dir, payload);
    expect(hashBytes(await fs.readFile(path.join(root, payload.name)))).toBe(
      m.sha256,
    );
    await expect(writeExport(root, dir, payload)).rejects.toThrow();
    expect(await fs.readFile(path.join(dir, m.file))).toEqual(payload.bytes);
  });
  it("retains exported expressions and their exact master/variant/provenance", async () => {
    const p = service.snapshot().project,
      m = p.masters[0],
      s = await service.stage(png(7, 7, 90), "expression.png");
    await service.command({
      type: "importCandidate",
      characterId: m.characterId,
      variantId: p.variants[0].id,
      action: "silent",
      token: s.token,
    });
    const raw = service.snapshot().project.assets[0];
    await cutout(raw.id);
    await approve();
    const a = service.snapshot().project.assets[1];
    expect(a.masterId).toBe(m.id);
    expect(a.variantId).toBe(raw.variantId);
    expect(a.qualitySourceId).toBe(latest().id);
    expect(a.status).toBe("approved");
    expect(
      (await service.exportPayload({ id: a.id, raw: false, provenance: true }))
        .name,
    ).toContain("7x7.png");
    expect((await new ProjectService().open(dir)).project.assets[0]).toEqual(
      raw,
    );
  });
  it("prevents cutout from bypassing protected hard-lock RGBA and allows a verified composite derivative", async () => {
    const p = service.snapshot().project,
      m = p.masters[0],
      maskWeights = new Uint8Array(49);
    maskWeights[24] = 255;
    await service.command({
      type: "saveMask",
      masterId: m.id,
      name: "Centre only",
      weights: maskWeights,
    });
    const mask = service.snapshot().project.masks[0];
    const draft = {
      characterId: m.characterId,
      masterId: m.id,
      masterSha256: m.sha256,
      variantId: p.variants[0].id,
      action: "silent",
      supplementaryInstructions: "",
      basePrompt: "Saved",
      prompt: "Saved",
      providerId: "manual-import",
      mask: { id: mask.id, sha256: mask.sha256, revision: 1, mode: "hard" },
    };
    await service.command({ type: "prepareAttempt", draft });
    const attempt = service.snapshot().project.attempts[0],
      staged = await service.stage(
        encodePixels(cutoutPixels(decodePixels(png(7, 7, 50)), weights())),
        "raw.png",
      );
    await service.command({
      type: "importResult",
      attemptId: attempt.id,
      token: staged.token,
    });
    let r = service.snapshot().project.assets[0];
    await expect(
      service.command({
        type: "createCutout",
        sourceId: r.id,
        weights: weights(),
      }),
    ).rejects.toThrow("zuerst compositen");
    await service.command({
      type: "deriveResolution",
      sourceId: r.id,
      profile: { ...profile, width: 14, height: 14 },
    });
    expect((await service.qualityReport(latest().id)).status).toBe(
      "transparent",
    );
    await expect(approve()).rejects.toThrow("Hard Lock: zuerst ein Composite");
    await expect(
      service.exportPayload({ id: latest().id, raw: false, provenance: false }),
    ).rejects.toThrow("Rohbild");
    await service.command({
      type: "createComposite",
      rawId: r.id,
      registrationConfirmed: true,
    });
    r = service.snapshot().project.assets[1];
    await expect(
      service.command({
        type: "createCutout",
        sourceId: r.id,
        weights: weights(),
      }),
    ).rejects.toThrow("schützt diese Pixel");
    await service.command({
      type: "createCutout",
      sourceId: r.id,
      weights: new Uint8Array(49).fill(255),
    });
    expect(latest().sourceId).toBe(r.id);
  });
  it("rejects forged/cross-character provenance, cyclic derivations and unsafe paths", async () => {
    await cutout();
    const p = service.snapshot().project;
    for (const change of [
      { sourceSha256: "a".repeat(64) },
      { sourceId: latest().id },
      { characterId: randomUUID() },
      { file: "../evil.png" },
      { mask: { ...latest().mask!, file: "../mask.png" } },
    ])
      expect(
        projectSchema.safeParse({
          ...p,
          qualityAssets: [{ ...latest(), ...change }],
        }).success,
      ).toBe(false);
  });
  it("rejects corrupted/missing and symlinked persisted masks", async () => {
    const q = await cutout(),
      file = path.join(dir, q.mask!.file);
    await fs.chmod(file, 0o600);
    await fs.writeFile(file, Buffer.from("bad"));
    await expect(new ProjectService().open(dir)).rejects.toThrow();
    await fs.unlink(file);
    await fs.symlink(
      path.join(dir, service.snapshot().project.masters[0].file),
      file,
    );
    await expect(service.cutoutMask(q.id)).rejects.toThrow("Symlink");
  });
  it("backs up pre-quality projects byte-exact only on first explicit write", async () => {
    const p = service.snapshot().project;
    const { assetQualityVersion: _, qualityAssets: __, ...legacy } = p;
    void _;
    void __;
    const bytes = JSON.stringify(legacy);
    await fs.writeFile(path.join(dir, "laceframe.json"), bytes);
    await service.open(dir);
    expect(await fs.readFile(path.join(dir, "laceframe.json"), "utf8")).toBe(
      bytes,
    );
    await service.command({
      type: "renameCharacter",
      id: p.characters[0].id,
      name: "Renamed",
    });
    expect(
      await fs.readFile(
        path.join(dir, "laceframe.v2.pre-asset-quality.backup.json"),
        "utf8",
      ),
    ).toBe(bytes);
  });
  it("cannot request transformations with renderer paths or oversized dimensions", async () => {
    await expect(
      service.command({
        type: "createCutout",
        sourceId: "/tmp/file",
        weights: weights(),
      }),
    ).rejects.toThrow();
    await expect(
      service.command({
        type: "deriveResolution",
        sourceId: service.snapshot().project.masters[0].id,
        profile: { ...profile, width: 5000 },
      }),
    ).rejects.toThrow();
  });
  it("rolls back reserved exports on JSON collisions and refuses symlink overwrite", async () => {
    await cutout();
    await approve();
    const m = service.snapshot().project.masters[1],
      payload = await service.exportPayload({
        id: m.id,
        raw: false,
        provenance: true,
      });
    await fs.writeFile(
      path.join(root, payload.name.replace(".png", ".json")),
      "preserved",
    );
    await expect(writeExport(root, dir, payload)).rejects.toThrow();
    await expect(fs.stat(path.join(root, payload.name))).rejects.toThrow();
    expect(
      await fs.readFile(
        path.join(root, payload.name.replace(".png", ".json")),
        "utf8",
      ),
    ).toBe("preserved");
  });
  it("uses the same mandatory transparency and style separation in both prompt composers", async () => {
    const p = service.snapshot().project,
      m = p.masters[0];
    const prompt = composePrompt({
      characterName: "Synthetic",
      master: m,
      variant: p.variants[0],
      familyLabel: p.families[0].label,
      action: "silent",
      supplementaryInstructions: "",
    });
    expect(prompt).toContain(TRANSPARENT_CHARACTER_INSTRUCTION);
    expect(prompt).toContain("VISUAL STYLE LOCK");
    const creator = composeCharacterPrompt(p, {
      characterId: m.characterId,
      identityReferences: [{ id: randomUUID(), sha256: m.sha256 }],
      identityNotes: "Own glasses and beard",
      styleReferences: [],
      outfit: "Independent black coat",
      composition: DEFAULT_COMPOSITION,
    });
    expect(creator).toContain(TRANSPARENT_CHARACTER_INSTRUCTION);
    expect(creator).toContain("OUTFIT DESCRIPTION");
    expect(RESOLUTION_PROFILES[0].width).toBe(1024);
  });
});
