import { seedHistoricalMaster } from "./historical-master";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { ProjectService, hashBytes } from "../src/main/project-service";
import { projectSchema, parseProject } from "../src/shared/domain";
import {
  composePrompt,
  newComposer,
  updateComposer,
  editComposer,
  keepComposer,
  resetComposer,
  validateExternalURL,
  draftFromAttempt,
  sameDraft,
  type GenerationDraft,
} from "../src/shared/generation";
import {
  chatgptPlanProvider,
  CHATGPT_PLAN_LIMITATION,
} from "../src/main/services/providers/chatgptPlan";
import { manualImportProvider } from "../src/main/services/providers/manualImport";
import { png } from "./fixtures";
let root: string, service: ProjectService, draft: GenerationDraft;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-create-"));
  service = new ProjectService();
  await service.create(root, "Create");
  await service.command({ type: "addCharacter", name: "Reference character" });
  const characterId = service.snapshot().project.selectedCharacterId!;
  const image = await service.stage(png(17, 31), "source.png");
  await seedHistoricalMaster(service, image, characterId);
  const p = service.snapshot().project,
    master = p.masters[0],
    family = p.families.find((f) => f.slug === "angry")!,
    variant = p.variants.find(
      (v) => v.familyId === family.id && v.slug === "controlled",
    )!;
  const basePrompt = composePrompt({
    characterName: p.characters[0].name,
    master,
    variant,
    familyLabel: family.label,
    action: "silent",
    supplementaryInstructions: "Keep a subtle gaze.",
  });
  draft = {
    characterId,
    masterId: master.id,
    masterSha256: master.sha256,
    variantId: variant.id,
    action: "silent",
    providerId: "manual-import",
    supplementaryInstructions: "Keep a subtle gaze.",
    basePrompt,
    prompt: basePrompt,
  };
});
afterEach(async () => fs.rm(root, { recursive: true, force: true }));
async function prepare() {
  await service.command({ type: "prepareAttempt", draft });
  return service.snapshot().project.attempts.at(-1)!;
}
async function importResult() {
  const attempt = await prepare();
  const image = await service.stage(png(23, 40, 140), "result.png");
  await service.command({
    type: "importResult",
    attemptId: attempt.id,
    token: image.token,
  });
  return service.snapshot().project.assets.at(-1)!;
}
describe("deterministic master-locked prompt and edits", () => {
  it("includes provided image, exact master identity/hash/dimensions and editable preset", () => {
    expect(draft.prompt).toContain("Attach the actual approved master image");
    expect(draft.prompt).toContain(draft.masterSha256);
    expect(draft.prompt).toContain(draft.masterId);
    expect(draft.prompt).toContain("17 × 31");
    expect(draft.prompt).toContain("Controlled, restrained anger");
    expect(draft.prompt).toContain("Keep a subtle gaze.");
    expect(draft.prompt).toContain(
      "VOCAL ACTION (independent of emotion): silent",
    );
    const p = service.snapshot().project;
    expect(
      composePrompt({
        characterName: p.characters[0].name,
        master: p.masters[0],
        variant: p.variants.find((v) => v.id === draft.variantId)!,
        familyLabel: "Wütend",
        action: "silent",
        supplementaryInstructions: draft.supplementaryInstructions,
      }),
    ).toBe(draft.prompt);
  });
  it("keeps emotion/action/intensity orthogonal for arbitrary custom variants", () => {
    const p = service.snapshot().project;
    const text = composePrompt({
      characterName: "Reference",
      master: p.masters[0],
      variant: {
        ...p.variants[0],
        label: "Alarmiert",
        slug: "custom-alarm",
        prompt: "Widen the eyes.",
      },
      familyLabel: "Custom relief",
      action: "shouting",
      intensity: 0.6,
      supplementaryInstructions: "",
    });
    expect(text).toContain("EMOTION: Custom relief / Alarmiert");
    expect(text).toContain("VOCAL ACTION (independent of emotion): shouting");
    expect(text).toContain("INTENSITY: 0.6");
    expect(text).not.toContain("Controlled, restrained anger");
  });
  it("updates untouched text and retains manual edits until explicit keep/reset", () => {
    const first = newComposer("First preset");
    expect(updateComposer(first, "Second preset").text).toBe("Second preset");
    const edited = editComposer(first, "My custom text");
    const pending = updateComposer(edited, "New master/variant");
    expect(pending.text).toBe("My custom text");
    expect(pending.pendingBase).toBe("New master/variant");
    expect(keepComposer(pending)).toMatchObject({
      base: "New master/variant",
      text: "My custom text",
      edited: true,
    });
    expect(resetComposer(pending)).toEqual(newComposer("New master/variant"));
    expect(updateComposer(edited, "First preset").pendingBase).toBeUndefined();
  });
});
describe("provider and external boundary", () => {
  it("advertises manual import honestly and rejects generation", async () => {
    expect(manualImportProvider.descriptor.capabilities).toEqual({
      canGenerate: false,
      supportsReferenceImages: false,
      supportsEditingMasks: false,
      canImportResult: true,
    });
    expect(await manualImportProvider.authenticate()).toMatchObject({
      status: "not-required",
    });
    const request = manualImportProvider.prepare(
      service.snapshot().project,
      draft,
    );
    await expect(manualImportProvider.generateImage(request)).rejects.toThrow(
      "erzeugt keine",
    );
    await expect(manualImportProvider.editImage(request)).rejects.toThrow(
      "bearbeitet keine",
    );
    await expect(
      manualImportProvider.cancelGeneration(randomUUID()),
    ).rejects.toThrow("keine Generierung");
    expect(
      manualImportProvider.prepare(service.snapshot().project, draft)
        .referenceAssetPath,
    ).toMatch(/^assets\/originals\/[a-f0-9]{64}\.png$/);
  });
  it("blocks unavailable ChatGPT plan image operations without authentication or fake results", async () => {
    expect(chatgptPlanProvider.getCapabilities()).toEqual({
      canGenerate: false,
      supportsReferenceImages: false,
      supportsEditingMasks: false,
      canImportResult: false,
    });
    expect(await chatgptPlanProvider.authenticate()).toEqual({
      status: "unavailable",
      reason: CHATGPT_PLAN_LIMITATION,
    });
    const request = manualImportProvider.prepare(
      service.snapshot().project,
      draft,
    );
    await expect(chatgptPlanProvider.generateImage(request)).rejects.toThrow(
      CHATGPT_PLAN_LIMITATION,
    );
    await expect(chatgptPlanProvider.editImage(request)).rejects.toThrow(
      CHATGPT_PLAN_LIMITATION,
    );
    await expect(
      chatgptPlanProvider.cancelGeneration(randomUUID()),
    ).rejects.toThrow(CHATGPT_PLAN_LIMITATION);
    await expect(
      chatgptPlanProvider.getGenerationResult(
        service.snapshot().project,
        randomUUID(),
      ),
    ).rejects.toThrow(CHATGPT_PLAN_LIMITATION);
  });
  it("retrieves only real persisted manual results, including after restart", async () => {
    const a = await prepare();
    expect(
      await manualImportProvider.getGenerationResult(
        service.snapshot().project,
        a.id,
      ),
    ).toBeNull();
    const image = await service.stage(png(), "real.png");
    await service.command({
      type: "importResult",
      attemptId: a.id,
      token: image.token,
    });
    const reopened = (await new ProjectService().open(root)).project;
    expect(
      await manualImportProvider.getGenerationResult(reopened, a.id),
    ).toMatchObject({
      outputAssetPath: reopened.assets[0].file,
      prompt: a.promptRevision.prompt,
      providerId: "manual-import",
    });
    await expect(
      manualImportProvider.getGenerationResult(reopened, randomUUID()),
    ).rejects.toThrow("Unbekannter");
  });
  it.each([
    "http://chatgpt.com/",
    "https://chatgpt.com.evil.test/",
    "https://chatgpt.com/?q=secret",
    "https://chatgpt.com/#x",
    "https://evil.test",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "https://chatgpt.com@evil.test/",
  ])("rejects arbitrary external URL %s", (url) => {
    expect(() => validateExternalURL(url)).toThrow();
  });
  it("only opens the exact explicit allowlist URL", () => {
    expect(validateExternalURL("https://chatgpt.com/")).toBe(
      "https://chatgpt.com/",
    );
  });
});
describe("attempt persistence and secure approval", () => {
  it("preserves prompt revisions and adds new attempts rather than overwriting", async () => {
    const first = await prepare();
    draft = { ...draft, prompt: draft.prompt + "\nA new revision." };
    const second = await prepare();
    expect(first.id).not.toBe(second.id);
    expect(first.promptRevision.id).not.toBe(second.promptRevision.id);
    const reopened = (await new ProjectService().open(root)).project;
    expect(reopened.attempts).toHaveLength(2);
    expect(reopened.attempts[0]).toEqual(first);
    expect(reopened.attempts[1]).toEqual(second);
    expect(sameDraft(draftFromAttempt(second), draft)).toBe(true);
  });
  it("imports, warns by dimensions, approves through the existing API and reloads exact provenance", async () => {
    const source = await fs.readFile(
      path.join(root, service.snapshot().project.masters[0].file),
    );
    const asset = await importResult();
    expect(asset).toMatchObject({
      status: "candidate",
      width: 23,
      height: 40,
      masterId: draft.masterId,
      masterSha256: draft.masterSha256,
      variantId: draft.variantId,
      action: "silent",
      providerId: "manual-import",
    });
    await service.command({ type: "review", id: asset.id, status: "approved" });
    const p = (await new ProjectService().open(root)).project;
    expect(p.assets[0]).toMatchObject({
      status: "approved",
      attemptId: p.attempts[0].id,
      promptRevisionId: p.attempts[0].promptRevision.id,
    });
    expect(await fs.readFile(path.join(root, p.masters[0].file))).toEqual(
      source,
    );
  });
  it("retains rejection provenance, deletes unreferenced bytes and rejects replacing an immutable attempt", async () => {
    const asset = await importResult();
    await service.command({ type: "review", id: asset.id, status: "rejected" });
    const image = await service.stage(png(), "replacement.png");
    await expect(
      service.command({
        type: "importResult",
        attemptId: asset.attemptId,
        token: image.token,
      }),
    ).rejects.toThrow("bereits ein Ergebnis");
    expect(
      (await new ProjectService().open(root)).project.assets[0].status,
    ).toBe("rejected");
    await expect(fs.readFile(path.join(root, asset.file))).rejects.toThrow();
    expect(service.snapshot().project.assets[0].discardedAt).toBeTruthy();
  });
  it("deduplicates repeated image bytes while keeping every attempt/result ID", async () => {
    const a = await importResult(),
      b = await importResult();
    expect(a.file).toBe(b.file);
    expect(a.id).not.toBe(b.id);
    expect(a.attemptId).not.toBe(b.attemptId);
    expect(await fs.readdir(path.join(root, "assets/candidates"))).toHaveLength(
      1,
    );
  });
  it("rejects missing masters/variants, invalid images and forged master/attempt provenance", async () => {
    await expect(
      service.command({
        type: "prepareAttempt",
        draft: { ...draft, masterSha256: "0".repeat(64) },
      }),
    ).rejects.toThrow();
    await expect(
      service.command({
        type: "prepareAttempt",
        draft: { ...draft, variantId: randomUUID() },
      }),
    ).rejects.toThrow();
    await expect(
      service.stage(Buffer.from("fake png"), "fake.png"),
    ).rejects.toThrow();
    const asset = await importResult(),
      p = service.snapshot().project;
    expect(
      projectSchema.safeParse({
        ...p,
        assets: [{ ...asset, promptRevisionId: randomUUID() }],
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        ...p,
        attempts: [{ ...p.attempts[0], masterSha256: "0".repeat(64) }],
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        ...p,
        assets: [asset, { ...asset, id: randomUUID() }],
      }).success,
    ).toBe(false);
  });
  it("checks the master integrity again before preparing/importing an attempt", async () => {
    const file = await service.masterFile(draft.masterId);
    await fs.chmod(file, 0o600);
    await fs.writeFile(file, png());
    await expect(prepare()).rejects.toThrow("integrität");
    expect(service.snapshot().project.attempts).toHaveLength(0);
  });
});
describe("non-destructive v1 migration", () => {
  async function legacy() {
    const { attempts: _attempts, ...p } = service.snapshot().project;
    void _attempts;
    const bytes = Buffer.from(JSON.stringify({ ...p, schemaVersion: 1 }));
    await fs.writeFile(path.join(root, "laceframe.json"), bytes);
    return bytes;
  }
  it("opens old projects without writing and backs up exact v1 bytes before explicit saves", async () => {
    const bytes = await legacy();
    const reloaded = new ProjectService();
    const before = await reloaded.open(root);
    expect(before.project.schemaVersion).toBe(2);
    expect(before.project.attempts).toEqual([]);
    expect(await fs.readFile(path.join(root, "laceframe.json"))).toEqual(bytes);
    await reloaded.command({ type: "prepareAttempt", draft });
    expect(
      await fs.readFile(path.join(root, "laceframe.v1.backup.json")),
    ).toEqual(bytes);
    const disk = JSON.parse(
      await fs.readFile(path.join(root, "laceframe.json"), "utf8"),
    );
    expect(disk.schemaVersion).toBe(2);
    expect(disk.masters).toEqual(before.project.masters);
    expect(
      hashBytes(await fs.readFile(path.join(root, disk.masters[0].file))),
    ).toBe(draft.masterSha256);
  });
  it("rejects unsafe legacy paths, unrecognized versions and conflicting backups", async () => {
    const bytes = await legacy(),
      raw = JSON.parse(bytes.toString());
    expect(() =>
      parseProject({
        ...raw,
        masters: [{ ...raw.masters[0], file: "../../secret" }],
      }),
    ).toThrow();
    expect(() => parseProject({ ...raw, schemaVersion: 3 })).toThrow();
    const reload = new ProjectService();
    await reload.open(root);
    await fs.writeFile(path.join(root, "laceframe.v1.backup.json"), "other");
    await expect(
      reload.command({ type: "prepareAttempt", draft }),
    ).rejects.toThrow("anderem Inhalt");
    expect(await fs.readFile(path.join(root, "laceframe.json"))).toEqual(bytes);
  });
});
