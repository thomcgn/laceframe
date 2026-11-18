import { seedHistoricalMaster } from "./historical-master";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectService } from "../src/main/project-service";
import { parseProject, projectSchema } from "../src/shared/domain";
import { composePrompt, updateComposer } from "../src/shared/generation";
import { png } from "./fixtures";

let directory: string;
let service: ProjectService;
beforeEach(async () => {
  directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "laceframe-art-direction-"),
  );
  service = new ProjectService();
  await service.create(directory, "Art Direction Test");
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

describe("Art Direction and personal expression identity", () => {
  it("opens existing v2 manifests without the additive profile fields", () => {
    const initial = service.snapshot().project;
    const legacy = JSON.parse(JSON.stringify(initial));
    delete legacy.artDirections;
    delete legacy.expressionPerformances;
    expect(parseProject(legacy).artDirections).toEqual([]);
    expect(parseProject(legacy).expressionPerformances).toEqual([]);
  });

  it("stores a shared rendering style and isolated personal emotions across reopen", async () => {
    await service.command({ type: "addCharacter", name: "Ada" });
    const ada = service.snapshot().project.selectedCharacterId!;
    const adaImage = await service.stage(png(17, 31), "ada.png");
    await seedHistoricalMaster(service, adaImage, ada);
    await service.command({ type: "addCharacter", name: "Peter" });
    const peter = service.snapshot().project.selectedCharacterId!;
    const peterImage = await service.stage(png(18, 30), "peter.png");
    await seedHistoricalMaster(service, peterImage, peter);
    await service.command({
      type: "addArtDirection",
      name: "Illustrated Noir",
      renderRules:
        "Illustrative pixel clusters, structured shading, consistent outlines.",
    });
    const project = service.snapshot().project;
    const profile = project.artDirections[0];
    const angry = project.families.find((f) => f.slug === "angry")!;
    const variant = project.variants.find(
      (v) => v.familyId === angry.id && v.slug === "controlled",
    )!;
    await service.command({
      type: "setExpressionPerformance",
      characterId: ada,
      variantId: variant.id,
      direction: "Brows drawn together, direct gaze.",
    });
    await service.command({
      type: "setExpressionPerformance",
      characterId: peter,
      variantId: variant.id,
      direction: "Tense jaw, lowered eyes.",
    });
    const after = service.snapshot().project;
    const adaInstruction = after.expressionPerformances.find(
      (v) => v.characterId === ada,
    )!;
    const peterInstruction = after.expressionPerformances.find(
      (v) => v.characterId === peter,
    )!;
    expect(after.defaultArtDirectionId).toBe(profile.id);
    expect(adaInstruction.direction).not.toBe(peterInstruction.direction);
    const adaPrompt = composePrompt({
      characterName: "Ada",
      master: after.masters.find((m) => m.characterId === ada)!,
      variant,
      familyLabel: angry.label,
      artDirection: profile,
      expressionPerformance: adaInstruction.direction,
      action: "silent",
      supplementaryInstructions: "",
    });
    const peterPrompt = composePrompt({
      characterName: "Peter",
      master: after.masters.find((m) => m.characterId === peter)!,
      variant,
      familyLabel: angry.label,
      artDirection: profile,
      expressionPerformance: peterInstruction.direction,
      action: "silent",
      supplementaryInstructions: "",
    });
    expect(adaPrompt).toContain("STYLE LOCK");
    expect(peterPrompt).toContain("STYLE LOCK");
    expect(adaPrompt).toContain("Brows drawn together");
    expect(peterPrompt).toContain("Tense jaw");
    expect(peterPrompt).not.toContain("Brows drawn together");
    await service.open(directory);
    expect(service.snapshot().project.expressionPerformances).toHaveLength(2);
    await service.command({
      type: "setExpressionPerformance",
      characterId: peter,
      variantId: variant.id,
      direction: "",
    });
    expect(service.snapshot().project.expressionPerformances).toEqual([
      {
        characterId: ada,
        variantId: variant.id,
        direction: "Brows drawn together, direct gaze.",
      },
    ]);
  });

  it("rejects cross-character references and duplicate personal directions", async () => {
    await service.command({ type: "addCharacter", name: "Ada" });
    const p = service.snapshot().project;
    const variant = p.variants[0];
    const characterId = p.selectedCharacterId!;
    await expect(
      service.command({
        type: "setExpressionPerformance",
        characterId: "00000000-0000-4000-8000-000000000000",
        variantId: variant.id,
        direction: "Wrong identity",
      }),
    ).rejects.toThrow();
    const invalid = {
      ...p,
      expressionPerformances: [
        { characterId, variantId: variant.id, direction: "A" },
        { characterId, variantId: variant.id, direction: "B" },
      ],
    };
    expect(() => projectSchema.parse(invalid)).toThrow();
  });

  it("retains saved master binary and original review state when adding style metadata", async () => {
    await service.command({ type: "addCharacter", name: "Ada" });
    const id = service.snapshot().project.selectedCharacterId!;
    const photo = await service.stage(png(17, 31), "master.png");
    await seedHistoricalMaster(service, photo, id);
    const hash = service.snapshot().project.masters[0].sha256;
    await service.command({
      type: "addArtDirection",
      name: "Noir",
      renderRules: "Dramatic shading.",
    });
    await service.open(directory);
    expect(service.snapshot().project.masters[0].sha256).toBe(hash);
  });
});

// Synthetic projects only; these tests never start a generation process.
async function readyCharacter(name = "Ada") {
  await service.command({ type: "addCharacter", name });
  const characterId = service.snapshot().project.selectedCharacterId!;
  const image = await service.stage(png(23, 31), "synthetic.png");
  await seedHistoricalMaster(service, image, characterId);
  const p = service.snapshot().project,
    master = p.masters.find((m) => m.characterId === characterId)!,
    variant = p.variants[0];
  const prompt = composePrompt({
    characterName: name,
    master,
    variant,
    familyLabel: p.families.find((f) => f.id === variant.familyId)!.label,
    action: "silent",
    supplementaryInstructions: "",
  });
  return {
    characterId,
    master,
    variant,
    draft: {
      characterId,
      masterId: master.id,
      masterSha256: master.sha256,
      variantId: variant.id,
      providerId: "manual-import" as const,
      action: "silent" as const,
      basePrompt: prompt,
      prompt,
      supplementaryInstructions: "",
    },
  };
}
async function addStyle() {
  await service.command({
    type: "addArtDirection",
    name: "Noir",
    renderRules: "Crisp rendering only",
  });
  return service.snapshot().project.artDirections[0];
}
describe("02B validation, history and migration regressions", () => {
  it("rejects absent, stale and malformed current style/performance selections", async () => {
    const { characterId, variant, draft } = await readyCharacter();
    const style = await addStyle();
    await expect(
      service.command({ type: "prepareAttempt", draft }),
    ).rejects.toThrow("Stilgestaltung");
    const withStyle = {
      ...draft,
      artDirectionId: style.id,
      artDirectionRevision: style.revision,
    };
    await expect(
      service.command({
        type: "prepareAttempt",
        draft: { ...withStyle, artDirectionRevision: 99 },
      }),
    ).rejects.toThrow();
    await expect(
      service.command({
        type: "prepareAttempt",
        draft: { ...withStyle, artDirectionId: undefined },
      }),
    ).rejects.toThrow();
    await service.command({
      type: "setExpressionPerformance",
      characterId,
      variantId: variant.id,
      direction: "Direct gaze",
    });
    await expect(
      service.command({ type: "prepareAttempt", draft: withStyle }),
    ).rejects.toThrow("Persönlicher Ausdruck");
    await expect(
      service.command({
        type: "prepareAttempt",
        draft: { ...withStyle, expressionPerformance: "Other person" },
      }),
    ).rejects.toThrow();
    await service.command({
      type: "prepareAttempt",
      draft: { ...withStyle, expressionPerformance: "Direct gaze" },
    });
    const current = service.snapshot().project;
    expect(current.attempts).toHaveLength(1);
    for (const selection of [
      {
        artDirectionId: "00000000-0000-4000-8000-000000000000",
        artDirectionRevision: 1,
      },
      { artDirectionRevision: 1, artDirectionId: undefined },
      { artDirectionId: style.id, artDirectionRevision: 99 },
    ]) {
      const invalid = structuredClone(current);
      Object.assign(invalid.attempts[0], selection);
      expect(projectSchema.safeParse(invalid).success).toBe(false);
    }
  });
  it("imports against a saved immutable attempt after current style and performance change", async () => {
    const { characterId, variant, draft, master } = await readyCharacter();
    const style = await addStyle();
    await service.command({
      type: "setExpressionPerformance",
      characterId,
      variantId: variant.id,
      direction: "Direct gaze",
    });
    const prepared = await service.command({
      type: "prepareAttempt",
      draft: {
        ...draft,
        artDirectionId: style.id,
        artDirectionRevision: 1,
        expressionPerformance: "Direct gaze",
      },
    });
    const original = prepared.project.attempts[0];
    await service.command({
      type: "updateArtDirection",
      id: style.id,
      name: "Noir",
      renderRules: "Updated contours",
    });
    await service.command({
      type: "setExpressionPerformance",
      characterId,
      variantId: variant.id,
      direction: "Lowered gaze",
    });
    const image = await service.stage(png(31, 23), "manual-result.png");
    await service.command({
      type: "importResult",
      attemptId: original.id,
      token: image.token,
    });
    const reopened = (await service.open(directory)).project;
    expect(reopened.attempts[0]).toEqual(original);
    expect(reopened.assets[0].attemptId).toBe(original.id);
    expect(reopened.artDirections[0].revision).toBe(2);
    expect(reopened.masters[0]).toEqual(master);
    await expect(
      service.command({
        type: "prepareAttempt",
        draft: {
          ...draft,
          artDirectionId: style.id,
          artDirectionRevision: 1,
          expressionPerformance: "Direct gaze",
        },
      }),
    ).rejects.toThrow();
  });
  it("backs up pre-02B v2 once, retaining timed/untimed attempts, approvals and all image bytes", async () => {
    const { draft } = await readyCharacter();
    await service.command({ type: "prepareAttempt", draft });
    const manual = service.snapshot().project.attempts[0];
    const image = await service.stage(png(31, 23), "candidate.png");
    await service.command({
      type: "importResult",
      attemptId: manual.id,
      token: image.token,
    });
    await service.command({
      type: "review",
      id: service.snapshot().project.assets[0].id,
      status: "approved",
    });
    await service.command({
      type: "prepareAttempt",
      draft: { ...draft, providerId: "codex-native" },
    });
    const timed = service.snapshot().project.attempts[1];
    await service.recordGeneration(timed.id, {
      startedAt: "2026-11-16T12:00:00Z",
      endedAt: "2026-11-16T12:00:01Z",
      durationMs: 1000,
      status: "cancelled",
    });
    const old = JSON.parse(JSON.stringify(service.snapshot().project));
    delete old.artDirections;
    delete old.expressionPerformances;
    const file = path.join(directory, "laceframe.json"),
      bytes = Buffer.from(JSON.stringify(old));
    await fs.writeFile(file, bytes);
    const binaryPaths = [...old.masters, ...old.assets].map((a) => a.file);
    const binaryBefore = await Promise.all(
      binaryPaths.map((f) => fs.readFile(path.join(directory, f))),
    );
    await service.open(directory);
    expect(await fs.readFile(file)).toEqual(bytes);
    await addStyle();
    const backup = path.join(
      directory,
      "laceframe.v2.pre-art-direction.backup.json",
    );
    expect(await fs.readFile(backup)).toEqual(bytes);
    const after = (await service.open(directory)).project;
    expect(after.attempts).toEqual(old.attempts);
    expect(after.assets).toEqual(old.assets);
    expect(after.masters).toEqual(old.masters);
    await service.command({
      type: "renameCharacter",
      id: after.characters[0].id,
      name: "Renamed",
    });
    expect(await fs.readFile(backup)).toEqual(bytes);
    expect(
      await Promise.all(
        binaryPaths.map((f) => fs.readFile(path.join(directory, f))),
      ),
    ).toEqual(binaryBefore);
  });
  it("refuses to replace a conflicting v2 migration backup", async () => {
    const file = path.join(directory, "laceframe.json"),
      old = JSON.parse(await fs.readFile(file, "utf8"));
    delete old.artDirections;
    delete old.expressionPerformances;
    const bytes = Buffer.from(JSON.stringify(old));
    await fs.writeFile(file, bytes);
    await fs.writeFile(
      path.join(directory, "laceframe.v2.pre-art-direction.backup.json"),
      "existing unrelated backup",
    );
    await service.open(directory);
    await expect(addStyle()).rejects.toThrow("Migrationssicherung");
    expect(await fs.readFile(file)).toEqual(bytes);
  });
  it("keeps another project's style and personal settings independent", async () => {
    await readyCharacter();
    await addStyle();
    const other = await fs.mkdtemp(
      path.join(os.tmpdir(), "laceframe-other-project-"),
    );
    try {
      const second = new ProjectService();
      await second.create(other, "Other");
      expect(second.snapshot().project.artDirections).toEqual([]);
      expect(second.snapshot().project.expressionPerformances).toEqual([]);
      expect(service.snapshot().project.artDirections).toHaveLength(1);
    } finally {
      await fs.rm(other, { recursive: true, force: true });
    }
  });
});

it("retains an unedited saved prompt until a style or performance change is acknowledged", () => {
  const saved = {
    base: "Old shared style",
    text: "Old shared style",
    edited: false,
    saved: true,
  };
  expect(updateComposer(saved, "Revised shared style")).toEqual({
    ...saved,
    pendingBase: "Revised shared style",
  });
});
