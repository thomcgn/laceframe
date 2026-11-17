import { beforeEach, afterEach, describe, it, expect } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ProjectService } from "../src/main/project-service";
import { ImageDialogService } from "../src/main/image-dialog";
import { identityImportSchema } from "../src/shared/identity-import";
import type { OpenDialogOptions } from "electron";
import { png } from "./fixtures";
let root: string, project: string, service: ProjectService, characterId: string;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-multi-import-"));
  project = path.join(root, "project");
  await fs.mkdir(project);
  service = new ProjectService();
  await service.create(project, "Synthetic import");
  characterId = (await service.command({ type: "addCharacter", name: "One" }))
    .project.selectedCharacterId!;
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
const file = (shade: number) => ({
  name: `identity-${shade}.png`,
  bytes: new Uint8Array(png(4, 6, shade)),
});
const importFiles = (...shades: number[]) =>
  service.importIdentityImages({ characterId, files: shades.map(file) });
const manifest = () => fs.readFile(path.join(project, "laceframe.json"));
describe("atomic identity group", () => {
  it("imports three in order, has no pending staging, reopens and isolates characters", async () => {
    const p = (await importFiles(1, 2, 3)).project;
    expect(p.identityAssets.map((a) => a.sha256)).toHaveLength(3);
    expect(p.identityAssets.every((a) => a.characterId === characterId)).toBe(
      true,
    );
    expect(service.identitySlots(characterId)).toBe(0);
    for (let i = 0; i < 3; i++)
      expect(
        await fs.readFile(path.join(project, p.identityAssets[i].file)),
      ).toEqual(Buffer.from(file(i + 1).bytes));
    await service.open(project);
    expect(service.snapshot().project.identityAssets).toEqual(p.identityAssets);
    const second = (
      await service.command({ type: "addCharacter", name: "Two" })
    ).project.selectedCharacterId!;
    await service.importIdentityImages({
      characterId: second,
      files: [file(1)],
    });
    expect(service.identitySlots(second)).toBe(2);
    expect(service.identitySlots(characterId)).toBe(0);
  });
  it("adds two to one and rejects over-capacity before writes", async () => {
    await importFiles(1);
    await importFiles(2, 3);
    const before = await manifest();
    await expect(importFiles(4)).rejects.toThrow("0 von 3");
    expect(await manifest()).toEqual(before);
    expect(
      identityImportSchema.safeParse({
        characterId,
        files: [1, 2, 3, 4].map(file),
      }).success,
    ).toBe(false);
  });
  it("reports duplicate/corrupt names and leaves bytes, manifest and references untouched", async () => {
    await importFiles(1);
    const before = await manifest();
    await expect(
      service.importIdentityImages({
        characterId,
        files: [
          file(1),
          { name: "broken.png", bytes: new Uint8Array([1, 2, 3]) },
        ],
      }),
    ).rejects.toThrow(/identity-1.png:[\s\S]*broken.png:/);
    expect(await manifest()).toEqual(before);
    expect(
      await fs.readdir(path.join(project, "assets/identities")),
    ).toHaveLength(1);
    await expect(importFiles(2, 2)).rejects.toThrow("doppelt");
    expect(await manifest()).toEqual(before);
    // Failed groups do not leave pending staging behind.
    await importFiles(2, 3);
  });
  it("rolls back new copies on manifest conflict without deleting shared/preexisting bytes", async () => {
    await importFiles(1);
    const before = service.snapshot();
    await fs.appendFile(path.join(project, "laceframe.json"), "\n");
    const changed = await manifest();
    await expect(importFiles(2, 3)).rejects.toThrow("extern geändert");
    expect(service.snapshot()).toEqual(before);
    expect(await manifest()).toEqual(changed);
    expect(
      await fs.readdir(path.join(project, "assets/identities")),
    ).toHaveLength(1);
  });
  it("rejects unsafe/colliding destinations and retains existing references", async () => {
    await importFiles(1);
    const before = await manifest();
    const other = path.join(root, "other");
    await fs.mkdir(other);
    const identities = path.join(project, "assets/identities");
    await fs.rename(identities, identities + "-retained");
    await fs.symlink(other, identities);
    await expect(importFiles(2)).rejects.toThrow("Symlinks");
    expect(await manifest()).toEqual(before);
    expect(await fs.readdir(other)).toEqual([]);
  });
  it("uses full decoding and bounds input before persistence", async () => {
    const strict = new ProjectService(async () => {
      throw new Error("decoder rejected");
    });
    await strict.open(project);
    const before = await manifest();
    await expect(
      strict.importIdentityImages({ characterId, files: [file(1)] }),
    ).rejects.toThrow("identity-1.png: decoder rejected");
    expect(await manifest()).toEqual(before);
    expect(
      identityImportSchema.safeParse({
        characterId,
        files: [{ name: "../escape", bytes: file(1).bytes }],
      }).success,
    ).toBe(false);
    expect(
      identityImportSchema.safeParse({
        characterId,
        files: [
          { name: "large.png", bytes: new Uint8Array(16 * 1024 * 1024 + 1) },
        ],
      }).success,
    ).toBe(false);
  });
  it("atomically replaces one at capacity and preserves the original archive", async () => {
    const before = (await importFiles(1, 2, 3)).project;
    const p = (
      await service.importIdentityImages({
        characterId,
        replaceId: before.identityAssets[1].id,
        files: [file(4)],
      })
    ).project;
    expect(p.identityAssets.filter((a) => !a.removedAt)).toHaveLength(3);
    expect(p.identityAssets[0]).toEqual(before.identityAssets[0]);
    expect(p.identityAssets[2]).toEqual(before.identityAssets[2]);
    expect(p.identityAssets[1].removedAt).toBeTruthy();
    expect(
      await fs.readFile(path.join(project, before.identityAssets[1].file)),
    ).toEqual(Buffer.from(file(2).bytes));
    const bytes = await manifest();
    await expect(
      service.importIdentityImages({
        characterId,
        replaceId: p.identityAssets[0].id,
        files: [file(4)],
      }),
    ).rejects.toThrow("bereits vorhanden");
    expect(await manifest()).toEqual(bytes);
  });
  it("does not consume an unrelated staged import and never creates batch tokens", async () => {
    const staged = await service.stageIdentity(file(9).bytes, "pending.png");
    await expect(importFiles(1)).rejects.toThrow("offenen Bildimport");
    service.discard(staged.token);
    await importFiles(1);
    await expect(
      service.command({
        type: "importIdentityReference",
        characterId,
        token: staged.token,
      }),
    ).rejects.toThrow("abgelaufen");
    await importFiles(2, 3);
  });
});
describe("local image dialog preference", () => {
  it("persists across instances, preserves cancellation and falls back for a missing folder", async () => {
    const userData = path.join(root, "user"),
      images = path.join(root, "images");
    await fs.mkdir(images);
    const calls: OpenDialogOptions[] = [];
    const first = new ImageDialogService(userData, async (options) => {
      calls.push(options);
      return {
        canceled: false,
        filePaths: [path.join(images, "one.png"), path.join(images, "two.jpg")],
      };
    });
    expect(
      await first.choose({ properties: ["openFile", "multiSelections"] }),
    ).toHaveLength(2);
    expect(calls[0].defaultPath).toBeUndefined();
    const settings = path.join(userData, "image-dialog.json"),
      before = await fs.readFile(settings);
    const restarted = new ImageDialogService(userData, async (options) => {
      calls.push(options);
      return { canceled: true, filePaths: [] };
    });
    expect(await restarted.choose({ properties: ["openFile"] })).toBeNull();
    expect(calls[1].defaultPath).toBe(images);
    expect(await fs.readFile(settings)).toEqual(before);
    await fs.rmdir(images);
    await restarted.choose({ properties: ["openFile"] });
    expect(calls[2].defaultPath).toBeUndefined();
    expect(await fs.readFile(settings)).toEqual(before);
    expect((await manifest()).includes(Buffer.from(images))).toBe(false);
    expect(await fs.readdir(userData)).toEqual(["image-dialog.json"]);
    expect((await fs.stat(settings)).mode & 0o777).toBe(0o600);
  });
  it("ignores invalid preferences without changing them on cancel", async () => {
    const userData = path.join(root, "user");
    await fs.mkdir(userData);
    await fs.writeFile(path.join(userData, "image-dialog.json"), "broken");
    const dialog = new ImageDialogService(userData, async (options) => {
      expect(options.defaultPath).toBeUndefined();
      return { canceled: true, filePaths: [] };
    });
    expect(await dialog.choose({})).toBeNull();
  });
});
