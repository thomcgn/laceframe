import { beforeEach, afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PNG } from "pngjs";
import { ProjectService, hashBytes } from "../src/main/project-service";
import {
  compositePixels,
  decodePixels,
  encodeMask,
  encodePixels,
  maskWeights,
} from "../src/main/mask-composite";
import {
  commitMask,
  undoMask,
  redoMask,
  paintStroke,
  type MaskHistory,
} from "../src/shared/masking";
import { projectSchema, commandSchema } from "../src/shared/domain";
import {
  composePrompt,
  draftFromAttempt,
  generationDraftSchema,
} from "../src/shared/generation";
import { png } from "./fixtures";

describe("native mask strokes and bounded undo history", () => {
  it("interpolates paint and eraser without changing the original or leaving gaps", () => {
    const original = new Uint8Array(100);
    const painted = paintStroke(
      original,
      10,
      10,
      { x: 1.5, y: 4.5 },
      { x: 8.5, y: 4.5 },
      0.6,
      128,
    );
    expect([...painted.slice(41, 49)]).toEqual(Array(8).fill(128));
    expect([...original]).toEqual(Array(100).fill(0));
    const erased = paintStroke(
      painted,
      10,
      10,
      { x: 4.5, y: 4.5 },
      { x: 4.5, y: 4.5 },
      0.6,
      0,
    );
    expect(erased[44]).toBe(0);
    expect(erased[43]).toBe(128);
    expect(painted[44]).toBe(128);
  });
  it("clips outside coordinates and rejects invalid strokes", () => {
    expect([
      ...paintStroke(
        new Uint8Array(4),
        2,
        2,
        { x: -100, y: -100 },
        { x: -90, y: -90 },
        1,
        255,
      ),
    ]).toEqual([0, 0, 0, 0]);
    expect(() =>
      paintStroke(
        new Uint8Array(3),
        2,
        2,
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        1,
        255,
      ),
    ).toThrow();
  });
  it("restores exact undo/redo states, clears redo after a new stroke, supports reset", () => {
    let h: MaskHistory = {
      present: new Uint8Array([0, 0]),
      past: [],
      future: [],
    };
    h = commitMask(h, new Uint8Array([255, 0]));
    h = commitMask(h, new Uint8Array([255, 128]));
    expect([...undoMask(h).present]).toEqual([255, 0]);
    expect(redoMask(undoMask(h))).toEqual(h);
    h = commitMask(undoMask(h), new Uint8Array([0, 255]));
    expect(h.future).toEqual([]);
    h = commitMask(h, new Uint8Array(2));
    expect([...h.present]).toEqual([0, 0]);
    expect([...undoMask(h).present]).toEqual([0, 255]);
  });
});
describe("deterministic RGBA8 compositing", () => {
  it("preserves EVERY protected channel including invisible RGB and alpha through PNG encode/decode", () => {
    const data = Uint8Array.from({ length: 4 * 100 }, (_, i) => (i * 47) % 256);
    data[3] = 0;
    data[7] = 1;
    data[11] = 128;
    data[19] = 0; // protected pixel with nonzero RGB under fully transparent alpha
    const master = { width: 10, height: 10, data },
      raw = { ...master, data: Uint8Array.from(data, (v) => 255 - v) };
    const weights = Uint8Array.from({ length: 100 }, (_, i) =>
      i % 3 ? 0 : 255,
    );
    const m = decodePixels(encodePixels(master)),
      r = decodePixels(encodePixels(raw));
    const output = decodePixels(
      encodePixels(
        compositePixels(m, r, decodePixels(encodeMask(10, 10, weights))),
      ),
    );
    for (let i = 0; i < 100; i++)
      for (let c = 0; c < 4; c++)
        expect(output.data[i * 4 + c]).toBe(
          weights[i] === 0 ? data[i * 4 + c] : raw.data[i * 4 + c],
        );
    expect(m.data).toEqual(Buffer.from(data));
  });
  it("defines straight-alpha rounding for gray weights and copies exact endpoints", () => {
    const m = { width: 1, height: 1, data: new Uint8Array([10, 20, 30, 0]) },
      r = { ...m, data: new Uint8Array([110, 120, 130, 255]) };
    expect([
      ...compositePixels(
        m,
        r,
        decodePixels(encodeMask(1, 1, new Uint8Array([128]))),
        1,
      ).data,
    ]).toEqual([60, 70, 80, 128]);
    expect([...m.data]).toEqual([10, 20, 30, 0]);
    expect([...r.data]).toEqual([110, 120, 130, 255]);
  });
  it("blocks mismatched dimensions and invalid non-gray/transparent masks", () => {
    const p = decodePixels(png(2, 3));
    expect(() => compositePixels(p, decodePixels(png(3, 2)), p)).toThrow(
      /Abmessungen/,
    );
    const invalid = { ...p, data: p.data.slice() };
    invalid.data[0] = 0;
    expect(() => maskWeights(invalid)).toThrow(/Graustufen/);
    invalid.data[0] = invalid.data[1];
    invalid.data[3] = 0;
    expect(() => maskWeights(invalid)).toThrow(/Graustufen/);
  });
  it("rejects WebP, 16-bit and oversized PNG before allocating image pixels", () => {
    expect(() => decodePixels(Buffer.from("RIFFtestWEBP"))).toThrow(/PNG/);
    const b = png();
    b[24] = 16;
    expect(() => decodePixels(b)).toThrow(/8 Bit/);
    const huge = png();
    huge.writeUInt32BE(16000, 16);
    huge.writeUInt32BE(16000, 20);
    expect(() => decodePixels(huge)).toThrow(/16 Megapixel/);
    expect(() => encodeMask(3, 2, new Uint8Array(3))).toThrow(/Abmessungen/);
  });
  it("bounds inflated image bytes before the PNG decoder, including interlaced paths", () => {
    const bomb = png(100, 100);
    bomb.writeUInt32BE(1, 16);
    bomb.writeUInt32BE(1, 20);
    expect(() => decodePixels(bomb)).toThrow(
      expect.objectContaining({ code: "ERR_BUFFER_TOO_LARGE" }),
    );
  });
  it("decodes RGBA8 PNG without applying display gamma", () => {
    const source = PNG.sync.write({
      gamma: 0.45455,
      width: 2,
      height: 1,
      data: Buffer.from([0, 0, 0, 255, 255, 255, 255, 255]),
    } as PNG);
    const p = decodePixels(source);
    expect([...p.data]).toEqual([0, 0, 0, 255, 255, 255, 255, 255]);
  });
});
let dir: string, service: ProjectService;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-masks-"));
  service = new ProjectService();
  await service.create(dir, "Synthetic mask project");
  await service.command({ type: "addCharacter", name: "Identity A" });
  const staged = await service.stage(png(2, 3, 10), "master.png");
  await service.command({
    type: "confirmMaster",
    characterId: service.snapshot().project.selectedCharacterId,
    token: staged.token,
  });
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});
async function saveMask(
  previousId?: string,
  weights = new Uint8Array([0, 255, 128, 0, 255, 0]),
) {
  const r = await service.command({
    type: "saveMask",
    masterId: service.snapshot().project.masters[0].id,
    name: "Face",
    weights,
    previousId,
  });
  return r.project.masks.at(-1)!;
}
async function prepare(
  mask = service.snapshot().project.masks.at(-1)!,
  providerId = "manual-import",
) {
  const p = service.snapshot().project,
    m = p.masters[0];
  const selection = {
    id: mask.id,
    sha256: mask.sha256,
    revision: mask.revision,
    mode: "hard" as const,
  };
  const prompt = composePrompt({
    mask: selection,
    characterName: "Identity A",
    master: m,
    variant: p.variants[0],
    familyLabel: p.families[0].label,
    action: "silent",
    supplementaryInstructions: "",
  });
  const r = await service.command({
    type: "prepareAttempt",
    draft: {
      mask: selection,
      characterId: m.characterId,
      masterId: m.id,
      masterSha256: m.sha256,
      variantId: p.variants[0].id,
      action: "silent",
      providerId,
      supplementaryInstructions: "",
      basePrompt: prompt,
      prompt,
    },
  });
  return r.project.attempts.at(-1)!;
}
async function importRaw(width = 2, height = 3) {
  const staged = await service.stage(png(width, height, 210), "raw.png");
  const r = await service.command({
    type: "importResult",
    attemptId: service.snapshot().project.attempts.at(-1)!.id,
    token: staged.token,
  });
  return r.project.assets.at(-1)!;
}
describe("immutable mask/review/provenance project boundary", () => {
  it("persists exact grayscale mask revisions and restores them on reopen without changing the master", async () => {
    const master = service.snapshot().project.masters[0],
      before = await fs.readFile(path.join(dir, master.file));
    const a = await saveMask();
    const b = await saveMask(a.id, new Uint8Array(6));
    expect(b.seriesId).toBe(a.seriesId);
    expect(b.revision).toBe(2);
    expect(a.sha256).not.toBe(b.sha256);
    const bytes = await fs.readFile(path.join(dir, a.file));
    expect(hashBytes(bytes)).toBe(a.sha256);
    expect([...maskWeights(decodePixels(bytes))]).toEqual([
      0, 255, 128, 0, 255, 0,
    ]);
    expect((await fs.stat(path.join(dir, a.file))).mode & 0o222).toBe(0);
    const reopened = await new ProjectService().open(dir);
    expect(reopened.project.masks).toEqual([a, b]);
    expect(await fs.readFile(path.join(dir, master.file))).toEqual(before);
    await expect(saveMask(a.id)).rejects.toThrow(/inzwischen/);
  });
  it("creates a separate unapproved composite linked to saved mask/master/raw/prompt and leaves raw immutable", async () => {
    const mask = await saveMask(),
      attempt = await prepare(),
      raw = await importRaw();
    await saveMask(mask.id, new Uint8Array(6)); // later mask never rewrites saved attempt
    const original = await fs.readFile(path.join(dir, raw.file));
    const r = await service.command({
      type: "createComposite",
      rawId: raw.id,
      registrationConfirmed: true,
    });
    const c = r.project.assets.at(-1)!;
    expect(c.id).not.toBe(raw.id);
    expect(c.status).toBe("candidate");
    expect(c.attemptId).toBe(attempt.id);
    expect(c.composite).toMatchObject({
      rawId: raw.id,
      rawSha256: raw.sha256,
      maskId: mask.id,
      maskSha256: mask.sha256,
      maskRevision: 1,
    });
    expect(r.project.assets[0]).toEqual(raw);
    expect(await fs.readFile(path.join(dir, raw.file))).toEqual(original);
    const output = decodePixels(await fs.readFile(path.join(dir, c.file)));
    expect([...output.data].filter((_, i) => i % 4 === 0)).toEqual([
      10, 210, 110, 10, 210, 10,
    ]);
    await expect(
      service.command({ type: "review", id: raw.id, status: "approved" }),
    ).rejects.toThrow(/Rohkandidat/);
    await service.command({ type: "review", id: c.id, status: "approved" });
    expect(
      (await new ProjectService().open(dir)).project.assets.at(-1)?.status,
    ).toBe("approved");
    await expect(
      service.command({
        type: "createComposite",
        rawId: raw.id,
        registrationConfirmed: true,
      }),
    ).rejects.toThrow(/bereits/);
  });
  it("blocks missing registration, mismatched result size and fabricated mask/attempt selections", async () => {
    const mask = await saveMask();
    await prepare();
    const raw = await importRaw(3, 2);
    await expect(
      service.command({
        type: "createComposite",
        rawId: raw.id,
        registrationConfirmed: true,
      }),
    ).rejects.toThrow(/Abmessungen/);
    expect(
      commandSchema.safeParse({
        type: "createComposite",
        rawId: raw.id,
        registrationConfirmed: false,
      }).success,
    ).toBe(false);
    const draft = service.snapshot().project.attempts[0];
    const p = structuredClone(service.snapshot().project);
    p.attempts[0].mask!.sha256 = "a".repeat(64);
    expect(projectSchema.safeParse(p).success).toBe(false);
    expect(
      generationDraftSchema.safeParse({
        ...draftFromAttempt(draft),
        mask: {
          id: mask.id,
          sha256: mask.sha256,
          revision: mask.revision,
          mode: "soft",
        },
      }).success,
    ).toBe(false);
  });
  it("rejects wrong character/master association and renderer supplied mask paths", async () => {
    const mask = await saveMask();
    await service.command({ type: "addCharacter", name: "Identity B" });
    const p = service.snapshot().project,
      staged = await service.stage(png(2, 3, 70), "second.png");
    await service.command({
      type: "confirmMaster",
      characterId: p.selectedCharacterId,
      token: staged.token,
    });
    await expect(
      service.command({
        type: "saveMask",
        masterId: service.snapshot().project.masters[1].id,
        previousId: mask.id,
        name: "Bad",
        weights: new Uint8Array(6),
      }),
    ).rejects.toThrow(/zuordnung/);
    const forged = service.snapshot().project;
    forged.masks[0].masterId = forged.masters[1].id;
    expect(projectSchema.safeParse(forged).success).toBe(false);
    expect(
      commandSchema.safeParse({
        type: "saveMask",
        masterId: forged.masters[0].id,
        name: "Bad",
        weights: new Uint8Array(6),
        path: "/tmp/arbitrary.png",
      }).success,
    ).toBe(false);
  });
  it.each(["corrupt", "missing", "symlink", "traversal"])(
    "rejects %s mask assets on reopen",
    async (kind) => {
      const mask = await saveMask(),
        file = path.join(dir, mask.file);
      if (kind === "traversal") {
        const p = service.snapshot().project;
        p.masks[0].file = "../escape.png";
        await fs.writeFile(path.join(dir, "laceframe.json"), JSON.stringify(p));
      } else {
        await fs.unlink(file);
        if (kind === "corrupt") await fs.writeFile(file, png(2, 3));
        if (kind === "symlink")
          await fs.symlink(
            path.join(dir, service.snapshot().project.masters[0].file),
            file,
          );
      }
      await expect(new ProjectService().open(dir)).rejects.toThrow();
    },
  );
  it("keeps pre-mask projects and approved assets readable; makes byte-exact backup only on first save", async () => {
    const staged = await service.stage(png(), "old.png");
    const first = service.snapshot().project;
    await service.command({
      type: "importCandidate",
      characterId: first.selectedCharacterId,
      variantId: first.variants[0].id,
      action: "silent",
      token: staged.token,
    });
    await service.command({
      type: "review",
      id: service.snapshot().project.assets[0].id,
      status: "approved",
    });
    const p = service.snapshot().project;
    const legacy = { ...p } as Record<string, unknown>;
    delete legacy.maskingVersion;
    delete legacy.masks;
    const bytes = Buffer.from(JSON.stringify(legacy));
    await fs.writeFile(path.join(dir, "laceframe.json"), bytes);
    service = new ProjectService();
    expect((await service.open(dir)).project.assets).toEqual(p.assets);
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(bytes);
    await saveMask();
    expect(
      await fs.readFile(path.join(dir, "laceframe.v2.pre-masking.backup.json")),
    ).toEqual(bytes);
    expect((await new ProjectService().open(dir)).project.assets).toEqual(
      p.assets,
    );
  });
  it("cannot composite missing, running, cancelled or failed native jobs", async () => {
    await saveMask();
    const attempt = await prepare(undefined, "codex-native");
    for (const status of ["running", "cancelled", "failed"] as const) {
      // Fresh attempts avoid replacing a terminal record.
      const a =
        status === "running"
          ? attempt
          : await prepare(undefined, "codex-native");
      await service.recordGeneration(a.id, {
        startedAt: new Date().toISOString(),
        durationMs: 0,
        status,
        ...(status === "running" ? {} : { endedAt: new Date().toISOString() }),
      });
      await expect(
        service.command({
          type: "createComposite",
          rawId: randomUUID(),
          registrationConfirmed: true,
        }),
      ).rejects.toThrow();
    }
    expect(service.snapshot().project.assets).toEqual([]);
  });
});
