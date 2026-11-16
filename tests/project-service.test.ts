import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  ProjectService,
  hashBytes,
  inspectImage,
  safePath,
} from "../src/main/project-service";
import {
  commandSchema,
  MAX_IMAGE_BYTES,
  projectSchema,
} from "../src/shared/domain";
import { png } from "./fixtures";

let root: string, directory: string, service: ProjectService;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-test-"));
  directory = path.join(root, "project");
  await fs.mkdir(directory);
  service = new ProjectService();
  await service.create(directory, "Teststudio");
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
async function withMaster() {
  await service.command({ type: "addCharacter", name: "Ada Voss" });
  const characterId = service.snapshot().project.selectedCharacterId!;
  const image = await service.stage(png(), "portrait.png");
  await service.command({
    type: "confirmMaster",
    characterId,
    token: image.token,
  });
  return { characterId, master: service.snapshot().project.masters[0] };
}
async function candidate() {
  const { characterId } = await withMaster(),
    p = service.snapshot().project;
  const image = await service.stage(png(2, 3, 140), "candidate.png");
  await service.command({
    type: "importCandidate",
    characterId,
    variantId: p.variants[0].id,
    action: "shouting",
    token: image.token,
  });
  return service.snapshot().project.assets[0];
}
describe("versioned project schema", () => {
  it("validates a new project with editable defaults including angry.shouting", () => {
    const p = service.snapshot().project;
    expect(projectSchema.parse(p)).toEqual(p);
    const family = p.families.find((f) => f.slug === "angry")!;
    expect(
      p.variants.find((v) => v.familyId === family.id && v.slug === "shouting")
        ?.suggestedAction,
    ).toBe("shouting");
  });
  it("preserves extensible character profile identifiers", async () => {
    await service.command({ type: "addCharacter", name: "Custom profile" });
    const project = service.snapshot().project;
    project.characters[0].profile = "custom-native-portrait";
    const manifest = path.join(directory, "laceframe.json");
    await fs.writeFile(manifest, JSON.stringify(project));
    expect(
      (await new ProjectService().open(directory)).project.characters[0]
        .profile,
    ).toBe("custom-native-portrait");
  });
  it("rejects unknown schema versions, duplicate IDs and fields", () => {
    const p = service.snapshot().project;
    expect(projectSchema.safeParse({ ...p, schemaVersion: 3 }).success).toBe(
      false,
    );
    expect(projectSchema.safeParse({ ...p, token: "secret" }).success).toBe(
      false,
    );
    expect(
      projectSchema.safeParse({
        ...p,
        families: [...p.families, p.families[0]],
      }).success,
    ).toBe(false);
  });
  it("rejects unknown relationships and arbitrary paths", async () => {
    await withMaster();
    const p = service.snapshot().project;
    expect(
      projectSchema.safeParse({
        ...p,
        masters: [{ ...p.masters[0], file: "../../private.png" }],
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        ...p,
        variants: [{ ...p.variants[0], familyId: randomUUID() }],
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({ ...p, selectedCharacterId: randomUUID() })
        .success,
    ).toBe(false);
  });
  it("validates narrow commands and rejects extra filesystem paths", () => {
    expect(
      commandSchema.safeParse({ type: "addCharacter", name: "  " }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: "addCharacter",
        name: "Ada",
        path: "/etc/passwd",
      }).success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        type: "review",
        id: randomUUID(),
        status: "archived",
      }).success,
    ).toBe(false);
  });
});
describe("immutable content-addressed imports", () => {
  it("leaves source bytes unchanged, preserves native dimensions and reloads master", async () => {
    const source = path.join(root, "source.png"),
      bytes = png(17, 31);
    await fs.writeFile(source, bytes);
    await service.command({ type: "addCharacter", name: "Ada Voss" });
    const characterId = service.snapshot().project.selectedCharacterId!;
    const staged = await service.stage(await fs.readFile(source), "source.png");
    expect(service.snapshot().project.masters).toHaveLength(0);
    await service.command({
      type: "confirmMaster",
      characterId,
      token: staged.token,
    });
    const master = service.snapshot().project.masters[0];
    expect(master).toMatchObject({
      width: 17,
      height: 31,
      sha256: hashBytes(bytes),
      locked: true,
      version: 1,
    });
    expect(await fs.readFile(source)).toEqual(bytes);
    expect(await fs.readFile(path.join(directory, master.file))).toEqual(bytes);
    const reload = await new ProjectService().open(directory);
    expect(reload.project).toEqual(service.snapshot().project);
  });
  it("never replaces a locked master or consumes another project’s staging token", async () => {
    const { characterId, master } = await withMaster();
    const stage = await service.stage(png(), "same.png");
    await expect(
      service.command({
        type: "confirmMaster",
        characterId,
        token: stage.token,
      }),
    ).rejects.toThrow("gesperrt");
    expect(service.snapshot().project.masters).toEqual([master]);
    await service.open(directory);
    await service.command({ type: "addCharacter", name: "Second" });
    await expect(
      service.command({
        type: "confirmMaster",
        characterId: service.snapshot().project.selectedCharacterId!,
        token: stage.token,
      }),
    ).rejects.toThrow("abgelaufen");
  });
  it("deduplicates bytes deterministically while keeping separate import IDs and provenance", async () => {
    const { characterId, master } = await withMaster(),
      variantId = service.snapshot().project.variants[0].id;
    for (let i = 0; i < 2; i++) {
      const staged = await service.stage(png(), `renamed-${i}.png`);
      await service.command({
        type: "importCandidate",
        characterId,
        variantId,
        action: "silent",
        token: staged.token,
      });
    }
    const [a, b] = service.snapshot().project.assets;
    expect(a.file).toBe(b.file);
    expect(a.sha256).toBe(master.sha256);
    expect(a.id).not.toBe(b.id);
    expect(a.masterSha256).toBe(master.sha256);
    expect(a.masterId).toBe(master.id);
    expect(
      await fs.readdir(path.join(directory, "assets/candidates")),
    ).toHaveLength(1);
  });
  it("cancels staging and rejects invalid, oversized or undecodable images", async () => {
    const staged = await service.stage(png(), "x.png");
    service.discard(staged.token);
    await expect(
      service.stage(Buffer.from("fake PNG"), "x.png"),
    ).rejects.toThrow();
    expect(() => inspectImage(Buffer.alloc(MAX_IMAGE_BYTES + 1))).toThrow(
      "32 MiB",
    );
    const header = png();
    header.writeUInt32BE(20000, 16);
    expect(() => inspectImage(header)).toThrow();
  });
  it("requires successful decoding and makes discarded previews unusable", async () => {
    const decoding = new ProjectService(() => {
      throw new Error("Decode failed");
    });
    await decoding.open(directory);
    await expect(decoding.stage(png(), "broken.png")).rejects.toThrow(
      "Decode failed",
    );
    await service.command({ type: "addCharacter", name: "Ada" });
    const staged = await service.stage(png(), "cancel.png");
    service.discard(staged.token);
    await expect(
      service.command({
        type: "confirmMaster",
        characterId: service.snapshot().project.selectedCharacterId!,
        token: staged.token,
      }),
    ).rejects.toThrow("abgelaufen");
    expect(service.snapshot().project.masters).toHaveLength(0);
  });
  it("limits preview to registered IDs and detects altered content on open/preview", async () => {
    const { master } = await withMaster();
    expect(await service.preview(master.id)).toMatch(
      /^data:image\/png;base64,/,
    );
    await expect(service.preview("../../etc/passwd")).rejects.toThrow(
      "Unbekanntes",
    );
    const file = path.join(directory, master.file);
    await fs.chmod(file, 0o600);
    await fs.writeFile(file, png(4, 4));
    await expect(service.preview(master.id)).rejects.toThrow("integrität");
    await expect(new ProjectService().open(directory)).rejects.toThrow(
      "integrität",
    );
  });
});
describe("persistent expressions and review", () => {
  it("creates/edits custom families and variants without a closed emotion enum", async () => {
    await service.command({
      type: "addFamily",
      label: "Erleichtert",
      slug: "relieved",
    });
    const family = service.snapshot().project.families.at(-1)!;
    await service.command({
      type: "editFamily",
      id: family.id,
      label: "Sehr erleichtert",
      slug: "relief",
    });
    await service.command({
      type: "addVariant",
      familyId: family.id,
      label: "Aufatmen",
      slug: "exhale",
    });
    const variant = service.snapshot().project.variants.at(-1)!;
    await service.command({
      type: "editVariant",
      variant: {
        ...variant,
        prompt: "Soft gaze",
        intensity: 0.35,
        suggestedAction: "speaking",
      },
    });
    const p = (await new ProjectService().open(directory)).project;
    expect(p.families.at(-1)?.slug).toBe("relief");
    expect(p.variants.at(-1)).toMatchObject({
      intensity: 0.35,
      suggestedAction: "speaking",
      prompt: "Soft gaze",
    });
  });
  it("rejects duplicate slugs without mutating the persisted project", async () => {
    const before = service.snapshot().project;
    await expect(
      service.command({ type: "addFamily", label: "Duplicate", slug: "angry" }),
    ).rejects.toThrow();
    expect((await new ProjectService().open(directory)).project).toEqual(
      before,
    );
  });
  it.each(["approved", "rejected"] as const)(
    "persists candidate → %s and prevents a second review",
    async (status) => {
      const asset = await candidate();
      expect(asset.status).toBe("candidate");
      await service.command({ type: "review", id: asset.id, status });
      const p = (await new ProjectService().open(directory)).project;
      expect(p.assets[0]).toMatchObject({
        status,
        masterId: asset.masterId,
        action: "shouting",
      });
      expect(p.assets[0].reviewedAt).toBeTruthy();
      await expect(
        service.command({ type: "review", id: asset.id, status }),
      ).rejects.toThrow("Bereits geprüft");
    },
  );
  it("rejects broken provenance and missing review timestamps", async () => {
    await candidate();
    const p = service.snapshot().project;
    expect(
      projectSchema.safeParse({
        ...p,
        assets: [{ ...p.assets[0], masterSha256: "0".repeat(64) }],
      }).success,
    ).toBe(false);
    expect(
      projectSchema.safeParse({
        ...p,
        assets: [{ ...p.assets[0], status: "approved" }],
      }).success,
    ).toBe(false);
  });
});
describe("filesystem boundaries and persistence", () => {
  it.each([
    "../escape",
    "/etc/passwd",
    "assets/../../escape",
    "assets\\escape",
    "C:/escape",
    "./file",
    "assets//file",
  ])("rejects unsafe path %s", async (unsafe) => {
    await expect(safePath(directory, unsafe)).rejects.toThrow();
  });
  it("rejects symlinked directories, manifests and assets", async () => {
    const { master } = await withMaster();
    const file = path.join(directory, master.file);
    await fs.unlink(file);
    const external = path.join(root, "outside.png");
    await fs.writeFile(external, png());
    await fs.symlink(external, file);
    await expect(service.preview(master.id)).rejects.toThrow("Symlink");
    await fs.unlink(file);
    await fs.rmdir(path.dirname(file));
    await fs.symlink(root, path.dirname(file), "dir");
    await expect(safePath(directory, master.file)).rejects.toThrow("Symlink");
    const manifest = path.join(directory, "laceframe.json"),
      copy = path.join(root, "manifest.json");
    await fs.rename(manifest, copy);
    await fs.symlink(copy, manifest);
    await expect(new ProjectService().open(directory)).rejects.toThrow(
      "Symlink",
    );
  });
  it("refuses to overwrite nonempty folders or externally changed manifests", async () => {
    await expect(
      new ProjectService().create(directory, "Overwrite"),
    ).rejects.toThrow("leeren");
    await fs.appendFile(path.join(directory, "laceframe.json"), "\n");
    await expect(
      service.command({ type: "addCharacter", name: "Ada" }),
    ).rejects.toThrow("extern geändert");
    expect(service.snapshot().project.characters).toHaveLength(0);
  });
  it("failed open leaves the active project intact, and writes leave no temp files", async () => {
    await withMaster();
    const before = service.snapshot();
    const invalid = path.join(root, "invalid");
    await fs.mkdir(invalid);
    await fs.writeFile(path.join(invalid, "laceframe.json"), "{");
    await expect(service.open(invalid)).rejects.toThrow();
    expect(service.snapshot()).toEqual(before);
    expect(
      (await fs.readdir(directory)).filter((f) => f.endsWith(".tmp")),
    ).toEqual([]);
  });
  it("persists character names and active selection", async () => {
    await service.command({ type: "addCharacter", name: "Ada" });
    const id = service.snapshot().project.selectedCharacterId!;
    await service.command({ type: "addCharacter", name: "Other" });
    await service.command({ type: "renameCharacter", id, name: "Ada Voss" });
    await service.command({ type: "selectCharacter", id });
    const p = (await new ProjectService().open(directory)).project;
    expect(p.selectedCharacterId).toBe(id);
    expect(p.characters[0].name).toBe("Ada Voss");
  });
});
