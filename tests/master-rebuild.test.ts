import { beforeEach, afterEach, describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { ProjectService, hashBytes } from "../src/main/project-service";
import { decodePixels, encodePixels } from "../src/main/mask-composite";
import { analyzePixels } from "../src/main/asset-quality";
import { GenerationClock } from "../src/main/services/generation-clock";
import {
  characterCreationDraftSchema,
  composeCharacterPrompt,
  DEFAULT_COMPOSITION,
  protectMasterPrompt,
  transparencyConflicts,
} from "../src/shared/character-creation";
import { TRANSPARENT_CHARACTER_INSTRUCTION } from "../src/shared/asset-quality";
import { projectSchema } from "../src/shared/domain";
import { png, transparentPng, masterReview } from "./fixtures";
let dir: string, s: ProjectService;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-rebuild-"));
  s = new ProjectService();
  await s.create(dir, "Rebuild synthetic");
  await s.command({ type: "addCharacter", name: "Same identity" });
  const a = await s.stageIdentity(png(18, 24), "identity.png");
  await s.command({
    type: "importIdentityReference",
    characterId: s.snapshot().project.selectedCharacterId,
    token: a.token,
  });
});
afterEach(async () => fs.rm(dir, { recursive: true, force: true }));
const state = () => s.snapshot().project;
function draft(rebuild = false) {
  const p = state(),
    c = p.characters[0],
    base = p.masters.find((m) => m.id === c.masterId);
  const settings = {
    characterId: c.id,
    mode: rebuild ? ("rebuild" as const) : ("create" as const),
    ...(rebuild
      ? { baseMasterId: base?.id, baseMasterSha256: base?.sha256 }
      : {}),
    identityReferences: p.identityAssets
      .filter((a) => !a.removedAt)
      .map((a) => ({ id: a.id, sha256: a.sha256 })),
    identityNotes: "Short curly hair",
    styleReferences: [],
    outfit: "Blue coat",
    composition: DEFAULT_COMPOSITION,
  };
  return characterCreationDraftSchema.parse({
    ...settings,
    operation: "create-character-master",
    prompt: composeCharacterPrompt(p, settings),
  });
}
async function result(
  rebuild = false,
  bytes = transparentPng(),
  d = draft(rebuild),
) {
  const clock = new GenerationClock();
  await s.command({ type: "prepareCharacterMaster", draft: d });
  const a = state().masterAttempts.at(-1)!;
  await s.recordGeneration(a.id, clock.snapshot());
  await s.importMasterGeneration(a.id, bytes, () => clock.stamp("completed"));
  return state().masterCandidates.at(-1)!;
}
async function approve(id: string) {
  const a = state().masterCandidates.find((a) => a.id === id)!;
  return s.command({
    type: "reviewMasterCandidate",
    id,
    status: "approved",
    review: masterReview(a.sha256),
  });
}
async function base() {
  const c = await result();
  await approve(c.id);
  return state().masters[0];
}

describe("same-character master rebuild and version integrity", () => {
  it("prepares without submitting an image or replacing the active master; records genuine rebuild provenance", async () => {
    const m = await base(),
      before = await fs.readFile(path.join(dir, m.file));
    const d = draft(true);
    await s.command({ type: "prepareCharacterMaster", draft: d });
    expect(state().characters).toHaveLength(1);
    expect(state().characters[0].masterId).toBe(m.id);
    expect(state().masterCandidates).toHaveLength(1);
    const a = state().masterAttempts.at(-1)!;
    expect(a).toMatchObject({
      mode: "rebuild",
      baseMasterId: m.id,
      baseMasterSha256: m.sha256,
    });
    expect(a.execution).toBeUndefined();
    const request = await s.creatorRequest(d);
    expect(request.identityFiles).toHaveLength(1);
    expect(request.identityFiles[0].id).toBe(state().identityAssets[0].id);
    expect(request.prompt).toContain("NOT an edit/cutout");
    expect(request.prompt).not.toContain("No approved master exists");
    expect(await fs.readFile(path.join(dir, m.file))).toEqual(before);
  });
  it("continues V1 → V2 → V3, preserves expressions/masks/reference IDs and reopens the same character", async () => {
    const m = await base(),
      identity = state().identityAssets;
    const staged = await s.stage(png(41, 53, 70), "old-expression.png");
    await s.command({
      type: "importCandidate",
      characterId: m.characterId,
      variantId: state().variants[0].id,
      action: "silent",
      token: staged.token,
    });
    await s.command({
      type: "saveMask",
      masterId: m.id,
      name: "Old face",
      weights: new Uint8Array(41 * 53).fill(255),
    });
    const oldAssets = state().assets,
      oldMasks = state().masks;
    for (const v of [2, 3]) {
      const c = await result(true, transparentPng(41, 53, 100 + v));
      expect(state().characters[0].masterId).toBe(state().masters[v - 2].id);
      await approve(c.id);
    }
    expect(state().masters.map((m) => m.version)).toEqual([1, 2, 3]);
    expect(state().masters[2].previousMasterId).toBe(state().masters[1].id);
    expect(state().masters[1].sourceCandidateId).toBe(
      state().masterCandidates[1].id,
    );
    expect(state().masters[1].qualitySourceId).toBeUndefined();
    expect(state().assets).toEqual(oldAssets);
    expect(state().masks).toEqual(oldMasks);
    expect(state().identityAssets).toEqual(identity);
    expect((await new ProjectService().open(dir)).project).toEqual(state());
    expect((await s.relightEligibility(state().masters[2].id)).allowed).toBe(
      false,
    );
  });
  it("rejects stale rebuild targets at preparation and approval, and duplicate review without writes", async () => {
    const m = await base(),
      d = draft(true),
      first = await result(true),
      second = await result(true, transparentPng(41, 53, 33));
    await approve(first.id);
    const bytes = await fs.readFile(path.join(dir, "laceframe.json"));
    await expect(
      s.command({ type: "prepareCharacterMaster", draft: d }),
    ).rejects.toThrow(/veraltet/);
    await expect(approve(second.id)).rejects.toThrow(/veraltet/);
    await expect(approve(first.id)).rejects.toThrow(/Ungeprüften/);
    expect(state().masters[0].id).toBe(m.id);
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(bytes);
  });
  it.each(["failed", "cancelled"] as const)(
    "retains the current master for a %s rebuild and allows a later explicit attempt",
    async (status) => {
      const m = await base(),
        d = draft(true),
        clock = new GenerationClock();
      await s.command({ type: "prepareCharacterMaster", draft: d });
      const a = state().masterAttempts.at(-1)!;
      await s.recordGeneration(a.id, clock.finish(status));
      expect(state().characters[0].masterId).toBe(m.id);
      expect(state().masterCandidates).toHaveLength(1);
      await result(true);
    },
  );
  it("rejects wrong-character, wrong-hash and missing rebuild origins", async () => {
    await base();
    const d = draft(true);
    for (const patch of [
      { baseMasterId: randomUUID() },
      { baseMasterSha256: "a".repeat(64) },
      { mode: "create" as const },
      { baseMasterId: undefined },
    ])
      await expect(
        s.command({
          type: "prepareCharacterMaster",
          draft: { ...d, ...patch },
        }),
      ).rejects.toThrow();
    await s.command({ type: "addCharacter", name: "Other" });
    await expect(
      s.command({
        type: "prepareCharacterMaster",
        draft: { ...d, characterId: state().selectedCharacterId },
      }),
    ).rejects.toThrow();
  });
  it("keeps pending candidates across restart; rejection never changes active master", async () => {
    const m = await base(),
      c = await result(true);
    s = new ProjectService();
    await s.open(dir);
    expect(state().characters[0].masterId).toBe(m.id);
    await s.command({
      type: "reviewMasterCandidate",
      id: c.id,
      status: "rejected",
    });
    expect(state().characters[0].masterId).toBe(m.id);
    expect(state().masters).toHaveLength(1);
  });
});
describe("decoded transparency gate and manual approval", () => {
  it.each([0, 255, 90])(
    "rejects an opaque generated background shade %i with no activation or mutation",
    async (shade) => {
      const c = await result(false, png(41, 53, shade)),
        before = await fs.readFile(path.join(dir, "laceframe.json"));
      await expect(approve(c.id)).rejects.toThrow(
        /keinen echten transparenten Hintergrund/,
      );
      expect(state().masters).toHaveLength(0);
      expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(
        before,
      );
    },
  );
  it("requires explicit identity, silhouette, activation and notes even with real transparency", async () => {
    const c = await result(),
      review = masterReview(c.sha256);
    for (const key of [
      "sourceSha256",
      "identityConfirmed",
      "silhouetteConfirmed",
      "activationConfirmed",
      "rasterConfirmed",
      "notes",
    ] as const) {
      const invalid = { ...review, [key]: undefined };
      await expect(
        s.command({
          type: "reviewMasterCandidate",
          id: c.id,
          status: "approved",
          review: invalid,
        }),
      ).rejects.toThrow();
    }
    await approve(c.id);
    expect(state().masters[0].masterReview).toMatchObject({
      ...review,
      algorithm: "alpha-review-v1",
    });
  });
  it("rejects isolated transparency, partial-only alpha and empty images; reports connected exterior pixels", async () => {
    for (const kind of ["isolated", "partial", "empty"]) {
      const image = decodePixels(png(41, 53));
      if (kind === "isolated") image.data[3] = 0;
      else
        for (let i = 3; i < image.data.length; i += 4)
          image.data[i] = kind === "empty" ? 0 : 128;
      const c = await result(false, encodePixels(image));
      await expect(approve(c.id)).rejects.toThrow(/verdächtig/);
    }
    const c = await result(),
      report = await s.qualityReport(c.id);
    expect(report.exteriorTransparent).toBe(report.transparent);
    expect(report.status).toBe("transparent");
  });
  it("allows partial silhouette edges only after human review, without claiming silhouette quality", async () => {
    const p = decodePixels(transparentPng());
    p.data[(10 * 41 + 1) * 4 + 3] = 128;
    const c = await result(false, encodePixels(p));
    expect((await s.qualityReport(c.id)).partial).toBe(1);
    await approve(c.id);
    expect(state().masters[0].masterReview?.partial).toBe(1);
  });
  it.each(["hash", "corrupt", "missing"])(
    "rejects %s candidate bytes rechecked at final approval",
    async (kind) => {
      const c = await result(),
        file = path.join(dir, c.file);
      await fs.unlink(file);
      if (kind !== "missing")
        await fs.writeFile(
          file,
          kind === "hash"
            ? transparentPng(41, 53, 50)
            : Buffer.from("invalid image"),
        );
      await expect(approve(c.id)).rejects.toThrow();
      expect(state().masters).toHaveLength(0);
    },
  );
  it("rejects unknown candidate ID and a forged review hash", async () => {
    const c = await result();
    await expect(
      s.command({
        type: "reviewMasterCandidate",
        id: randomUUID(),
        status: "approved",
        review: masterReview(c.sha256),
      }),
    ).rejects.toThrow();
    await expect(
      s.command({
        type: "reviewMasterCandidate",
        id: c.id,
        status: "approved",
        review: masterReview("b".repeat(64)),
      }),
    ).rejects.toThrow(/Quellhash/);
  });
  it("rescues an opaque rebuild through the existing reviewed cutout as next version with both provenances intact", async () => {
    const m = await base(),
      c = await result(true, png(41, 53));
    const weights = new Uint8Array(41 * 53).fill(255);
    for (let y = 0; y < 53; y++)
      for (let x = 0; x < 41; x++)
        if (!x || !y || x === 40 || y === 52) weights[y * 41 + x] = 0;
    await s.command({
      type: "createCutout",
      sourceId: c.id,
      name: "Rescue",
      weights,
    });
    const q = state().qualityAssets[0];
    await s.command({
      type: "reviewQuality",
      id: q.id,
      status: "approved",
      notes: "Cutout silhouette, identity and activation explicitly reviewed",
      confirmStyleAndSilhouette: true,
      rasterConfirmed: true,
    });
    const next = state().masters[1];
    expect(next).toMatchObject({
      version: 2,
      previousMasterId: m.id,
      sourceCandidateId: c.id,
      qualitySourceId: q.id,
    });
    expect(next.sha256).not.toBe(c.sha256);
    expect((await s.relightEligibility(next.id)).allowed).toBe(true);
    expect(state().masterAttempts[1].mode).toBe("rebuild");
  });
  it("rechecks the rescue source and mask before quality approval", async () => {
    const c = await result(false, png(41, 53));
    const weights = new Uint8Array(41 * 53).fill(255);
    for (let i = 0; i < 41; i++) weights[i] = 0;
    await s.command({
      type: "createCutout",
      sourceId: c.id,
      name: "Integrity",
      weights,
    });
    const q = state().qualityAssets[0];
    await fs.unlink(path.join(dir, q.mask!.file));
    await fs.writeFile(path.join(dir, q.mask!.file), png(41, 53));
    await expect(
      s.command({
        type: "reviewQuality",
        id: q.id,
        status: "approved",
        notes: "Human review",
        confirmStyleAndSilhouette: true,
        rasterConfirmed: true,
      }),
    ).rejects.toThrow(/maske/i);
    expect(state().masters).toHaveLength(0);
  });
  it("also gates newly imported masters; preserves old untagged projects read-only", async () => {
    const c = state().characters[0];
    let image = await s.stage(png(41, 53), "opaque.png");
    await expect(
      s.command({
        type: "confirmMaster",
        characterId: c.id,
        token: image.token,
        review: masterReview(image.sha256),
      }),
    ).rejects.toThrow(/transparenten Hintergrund/);
    s.discard(image.token);
    image = await s.stage(transparentPng(), "transparent.png");
    await s.command({
      type: "confirmMaster",
      characterId: c.id,
      token: image.token,
      review: masterReview(image.sha256),
    });
    const p = state();
    delete p.masters[0].masterReview;
    const old = Buffer.from(JSON.stringify(projectSchema.parse(p)));
    await fs.writeFile(path.join(dir, "laceframe.json"), old);
    await s.open(dir);
    expect(await fs.readFile(path.join(dir, "laceframe.json"))).toEqual(old);
  });
});
describe("protected master prompts", () => {
  it("does not flag explicit negative background instructions and counts genuine exterior connectivity", () => {
    expect(
      transparencyConflicts(
        "No black background. A calm character on transparent canvas.",
      ),
    ).toBe(false);
    expect(
      transparencyConflicts("Keinen schwarzen Hintergrund verwenden."),
    ).toBe(false);
    expect(transparencyConflicts("Use a white background")).toBe(true);
    const p = decodePixels(transparentPng(41, 53));
    p.data[(20 * 41 + 20) * 4 + 3] = 0;
    const r = analyzePixels(p);
    expect(r.transparent).toBe(r.exteriorTransparent + 1);
  });

  it.each(["automatic", "supplement", "expert"])(
    "retains technical instruction in %s mode and persists actual transmitted text",
    async (mode) => {
      let d = draft();
      if (mode !== "automatic")
        d = {
          ...d,
          prompt:
            mode === "expert"
              ? "Create a neutral illustrated portrait with a blue coat."
              : d.prompt + "\nCreative restrained contours",
        };
      await s.command({ type: "prepareCharacterMaster", draft: d });
      const actual = state().masterAttempts[0].promptRevision.prompt;
      expect(actual.endsWith(TRANSPARENT_CHARACTER_INSTRUCTION)).toBe(true);
      expect((await s.creatorRequest(d)).prompt).toBe(actual);
      expect(protectMasterPrompt(actual)).toBe(actual);
      expect(actual).not.toContain("[object Object]");
    },
  );
  it("blocks explicit background conflicts before any attempt is saved", async () => {
    const d = { ...draft(), prompt: "Use a solid black background" };
    expect(transparencyConflicts(d.prompt)).toBe(true);
    await expect(
      s.command({ type: "prepareCharacterMaster", draft: d }),
    ).rejects.toThrow(/widerspricht/);
    expect(state().masterAttempts).toHaveLength(0);
  });
  it("does not invent semantic silhouette assurance from a technically transparent border", () => {
    const p = decodePixels(transparentPng());
    const r = analyzePixels(p);
    expect(r.status).toBe("transparent");
    expect(r.warnings.join(" ")).toContain("keine perfekte Freistellung");
    expect(hashBytes(p.data)).toHaveLength(64);
  });
});
