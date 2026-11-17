import { seedHistoricalMaster } from "./historical-master";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ProjectService } from "../src/main/project-service";
import { composePrompt } from "../src/shared/generation";
import { png } from "./fixtures";
let root: string;
let service: ProjectService;
beforeEach(async () => {
  root = await fs.mkdtemp(
    path.join(os.tmpdir(), "laceframe-expression-designer-"),
  );
  service = new ProjectService();
  await service.create(root, "Designer");
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
describe("Expression Designer existing command contract", () => {
  it("creates and edits open-ended family/variant data and retains unrelated definitions after reopening", async () => {
    const original = service.snapshot().project;
    await service.command({
      type: "addFamily",
      label: "Anticipation",
      slug: "anticipation",
    });
    const family = service.snapshot().project.families.at(-1)!;
    await service.command({
      type: "editFamily",
      id: family.id,
      label: "Quiet anticipation",
      slug: "quiet-anticipation",
    });
    await service.command({
      type: "addVariant",
      familyId: family.id,
      label: "Waiting",
      slug: "waiting",
    });
    const variant = {
      ...service.snapshot().project.variants.at(-1)!,
      label: "Alert waiting",
      slug: "alert-waiting",
      intensity: 0.7,
      suggestedAction: "silent" as const,
      prompt: "Raised brows, watchful eyes.",
    };
    await service.command({ type: "editVariant", variant });
    await service.open(root);
    expect(service.snapshot().project.variants.at(-1)).toEqual(variant);
    expect(service.snapshot().project.families.at(-1)).toMatchObject({
      id: family.id,
      label: "Quiet anticipation",
      slug: "quiet-anticipation",
    });
    expect(
      service.snapshot().project.variants.slice(0, original.variants.length),
    ).toEqual(original.variants);
    expect(service.snapshot().project.schemaVersion).toBe(
      original.schemaVersion,
    );
  });
  it("rejects duplicate slugs without changing saved rules", async () => {
    const p = service.snapshot().project;
    await expect(
      service.command({
        type: "addFamily",
        label: "Other",
        slug: p.families[0].slug,
      }),
    ).rejects.toThrow();
    expect(service.snapshot().project.families).toEqual(p.families);
    await service.open(root);
    expect(service.snapshot().project.families).toEqual(p.families);
  });
  it("personal overrides remain scoped and clearing one restores the shared prompt", async () => {
    await service.command({ type: "addCharacter", name: "One" });
    const one = service.snapshot().project.selectedCharacterId!;
    const image = await service.stage(png(16, 18), "one.png");
    await seedHistoricalMaster(service, image, one);
    await service.command({ type: "addCharacter", name: "Two" });
    const two = service.snapshot().project.selectedCharacterId!;
    const p = service.snapshot().project;
    const variant = { ...p.variants[0], prompt: "Shared quiet expression." };
    await service.command({ type: "editVariant", variant });
    for (const [characterId, direction] of [
      [one, "One direct gaze"],
      [two, "Two lowered gaze"],
    ])
      await service.command({
        type: "setExpressionPerformance",
        characterId,
        variantId: variant.id,
        direction,
      });
    const make = (direction?: string) =>
      composePrompt({
        characterName: "One",
        master: p.masters[0],
        familyLabel: p.families[0].label,
        variant,
        expressionPerformance: direction,
        action: "silent",
        supplementaryInstructions: "Creative addition",
      });
    expect(make("One direct gaze")).toContain("One direct gaze");
    expect(make("One direct gaze")).not.toContain("Shared quiet expression.");
    await service.command({
      type: "setExpressionPerformance",
      characterId: one,
      variantId: variant.id,
      direction: "",
    });
    await service.open(root);
    expect(service.snapshot().project.expressionPerformances).toEqual([
      {
        characterId: two,
        variantId: variant.id,
        direction: "Two lowered gaze",
      },
    ]);
    expect(make()).toContain("Shared quiet expression.");
    expect(make()).toContain("Creative addition");
    expect(service.snapshot().project.variants[0]).toEqual(variant);
    expect(service.snapshot().project.masters).toEqual(p.masters);
  });
});
