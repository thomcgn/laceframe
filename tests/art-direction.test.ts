import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectService } from "../src/main/project-service";
import { parseProject, projectSchema } from "../src/shared/domain";
import { composePrompt } from "../src/shared/generation";
import { png } from "./fixtures";

let directory: string;
let service: ProjectService;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-art-direction-"));
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
    await service.command({ type: "confirmMaster", characterId: ada, token: adaImage.token });
    await service.command({ type: "addCharacter", name: "Peter" });
    const peter = service.snapshot().project.selectedCharacterId!;
    const peterImage = await service.stage(png(18, 30), "peter.png");
    await service.command({ type: "confirmMaster", characterId: peter, token: peterImage.token });
    await service.command({
      type: "addArtDirection",
      name: "Illustrated Noir",
      renderRules: "Illustrative pixel clusters, structured shading, consistent outlines.",
    });
    const project = service.snapshot().project;
    const profile = project.artDirections[0];
    const angry = project.families.find((f) => f.slug === "angry")!;
    const variant = project.variants.find((v) => v.familyId === angry.id && v.slug === "controlled")!;
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
    const adaInstruction = after.expressionPerformances.find((v) => v.characterId === ada)!;
    const peterInstruction = after.expressionPerformances.find((v) => v.characterId === peter)!;
    expect(after.defaultArtDirectionId).toBe(profile.id);
    expect(adaInstruction.direction).not.toBe(peterInstruction.direction);
    const adaPrompt = composePrompt({
      characterName: "Ada", master: after.masters.find((m) => m.characterId === ada)!,
      variant, familyLabel: angry.label, artDirection: profile,
      expressionPerformance: adaInstruction.direction, action: "silent",
      supplementaryInstructions: "",
    });
    const peterPrompt = composePrompt({
      characterName: "Peter", master: after.masters.find((m) => m.characterId === peter)!,
      variant, familyLabel: angry.label, artDirection: profile,
      expressionPerformance: peterInstruction.direction, action: "silent",
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
      type: "setExpressionPerformance", characterId: peter, variantId: variant.id, direction: "",
    });
    expect(service.snapshot().project.expressionPerformances).toEqual([
      { characterId: ada, variantId: variant.id, direction: "Brows drawn together, direct gaze." },
    ]);
  });

  it("rejects cross-character references and duplicate personal directions", async () => {
    await service.command({ type: "addCharacter", name: "Ada" });
    const p = service.snapshot().project;
    const variant = p.variants[0];
    const characterId = p.selectedCharacterId!;
    await expect(service.command({
      type: "setExpressionPerformance",
      characterId: "00000000-0000-4000-8000-000000000000",
      variantId: variant.id, direction: "Wrong identity",
    })).rejects.toThrow();
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
    await service.command({ type: "confirmMaster", characterId: id, token: photo.token });
    const hash = service.snapshot().project.masters[0].sha256;
    await service.command({ type: "addArtDirection", name: "Noir", renderRules: "Dramatic shading." });
    await service.open(directory);
    expect(service.snapshot().project.masters[0].sha256).toBe(hash);
  });
});
