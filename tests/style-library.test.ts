import { seedHistoricalMaster } from "./historical-master";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { ProjectService, hashBytes } from "../src/main/project-service";
import {
  effectiveStyle,
  projectSchema,
  referencesForStyle,
} from "../src/shared/domain";
import { composePrompt } from "../src/shared/generation";
import { supportsMultipleLocalImages } from "../src/main/services/codex/reference-capability";
import { png } from "./fixtures";
let dir: string,
  service: ProjectService,
  profileId: string,
  characterId: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-styles-"));
  service = new ProjectService();
  await service.create(dir, "Styles");
  await service.command({ type: "addCharacter", name: "Synthetic identity A" });
  characterId = service.snapshot().project.selectedCharacterId!;
  const staged = await service.stage(png(23, 31), "identity.png");
  await seedHistoricalMaster(service, staged, characterId);
  await service.command({
    type: "addArtDirection",
    name: "Shared style",
    renderRules: "Graphic contours",
    description: "Rendering only",
    lightingRules: "Soft shading",
    colorRules: "Warm/cool contrast",
    framingRules: "Frontal portrait",
  });
  profileId = service.snapshot().project.defaultArtDirectionId!;
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});
async function addReference(shade = 90) {
  const staged = await service.stage(png(12, 16, shade), `style-${shade}.png`);
  await service.command({
    type: "importStyleReference",
    profileId,
    token: staged.token,
  });
  return service.snapshot().project.styleAssets.at(-1)!;
}
function draft() {
  const p = service.snapshot().project,
    master = p.masters[0],
    variant = p.variants[0],
    style = effectiveStyle(p, characterId),
    refs = referencesForStyle(p, style);
  const prompt = composePrompt({
    characterName: p.characters[0].name,
    master,
    variant,
    familyLabel: p.families[0].label,
    artDirection: style,
    styleReferences: refs,
    action: "silent",
    supplementaryInstructions: "",
  });
  return {
    characterId,
    masterId: master.id,
    masterSha256: master.sha256,
    variantId: variant.id,
    artDirectionId: style?.id,
    artDirectionRevision: style?.revision,
    styleReferences: refs,
    action: "silent" as const,
    providerId: "manual-import" as const,
    basePrompt: prompt,
    prompt,
    supplementaryInstructions: "",
  };
}
describe("visual style assets and immutable revisions", () => {
  it("copies real PNG bytes to a safe immutable content-addressed path and preserves identity", async () => {
    const original = service.snapshot().project.masters[0];
    const ref = await addReference();
    expect(ref.file).toBe(`assets/styles/${ref.sha256}.png`);
    expect(hashBytes(await fs.readFile(path.join(dir, ref.file)))).toBe(
      ref.sha256,
    );
    expect((await fs.stat(path.join(dir, ref.file))).mode & 0o222).toBe(0);
    expect(await service.preview(ref.id)).toContain("data:image/png;base64,");
    expect(service.snapshot().project.masters[0]).toEqual(original);
    const reopened = (await new ProjectService().open(dir)).project;
    expect(reopened.styleAssets).toEqual([ref]);
    expect(reopened.artDirectionRevisions).toHaveLength(2);
  });
  it("retains historical reference bytes and exact prompt provenance after remove/edit/reuse", async () => {
    const a = await addReference(),
      b = await addReference(180);
    const saved = await service.command({
      type: "prepareAttempt",
      draft: draft(),
    });
    const attempt = saved.project.attempts[0],
      archive = structuredClone(saved.project.artDirectionRevisions);
    expect(attempt.styleReferences).toEqual([
      { id: a.id, sha256: a.sha256 },
      { id: b.id, sha256: b.sha256 },
    ]);
    expect(attempt.promptRevision.prompt).toContain("STYLE ONLY");
    expect(attempt.promptRevision.prompt).toContain("NEVER copy faces");
    await service.command({
      type: "setStyleReferences",
      profileId,
      ids: [b.id],
    });
    await service.command({
      type: "updateArtDirection",
      id: profileId,
      name: "Revised",
      renderRules: "Different render",
    });
    await service.command({
      type: "setStyleReferences",
      profileId,
      ids: [a.id, b.id],
    });
    const image = await service.stage(png(20, 30), "historical-result.png");
    await service.command({
      type: "importResult",
      attemptId: attempt.id,
      token: image.token,
    });
    const reopened = (await service.open(dir)).project;
    expect(reopened.attempts[0]).toEqual(attempt);
    expect(reopened.artDirectionRevisions.slice(0, 3)).toEqual(archive);
    expect(hashBytes(await fs.readFile(path.join(dir, a.file)))).toBe(a.sha256);
    expect(reopened.assets[0].attemptId).toBe(attempt.id);
  });
  it("reuses asset IDs across profiles without duplicating or overwriting source bytes", async () => {
    const a = await addReference();
    await service.command({
      type: "addArtDirection",
      name: "Another",
      renderRules: "Another style",
    });
    const second = service.snapshot().project.artDirections[1];
    await service.command({
      type: "setStyleReferences",
      profileId: second.id,
      ids: [a.id],
    });
    const p = service.snapshot().project;
    expect(p.styleAssets).toHaveLength(1);
    expect(p.artDirections[0].styleReferenceIds).toEqual([a.id]);
    expect(p.artDirections[1].styleReferenceIds).toEqual([a.id]);
  });
  it("allows two distinct identities to share style and a third to retain its master style", async () => {
    await addReference();
    await service.command({ type: "addCharacter", name: "Synthetic B" });
    const b = service.snapshot().project.selectedCharacterId!;
    const p = service.snapshot().project;
    expect(effectiveStyle(p, b)?.id).toBe(profileId);
    expect(effectiveStyle(p, characterId)?.id).toBe(profileId);
    await service.command({
      type: "setCharacterStyle",
      characterId: b,
      selection: { mode: "master" },
    });
    expect(effectiveStyle(service.snapshot().project, b)).toBeUndefined();
    expect(effectiveStyle(service.snapshot().project, characterId)?.id).toBe(
      profileId,
    );
    await expect(
      service.command({
        type: "setCharacterStyle",
        characterId: b,
        selection: { mode: "profile", profileId: randomUUID() },
      }),
    ).rejects.toThrow();
  });
  it("requires exact reference IDs/hashes/order before creating a new attempt", async () => {
    const ref = await addReference();
    const d = draft();
    for (const styleReferences of [
      [],
      undefined,
      [{ id: ref.id, sha256: "0".repeat(64) }],
      [{ id: randomUUID(), sha256: ref.sha256 }],
    ])
      await expect(
        service.command({
          type: "prepareAttempt",
          draft: { ...d, styleReferences },
        }),
      ).rejects.toThrow("Stilreferenzen");
    expect(service.snapshot().project.attempts).toEqual([]);
  });
  it("rejects duplicate, missing and mismatched references in profile/history", async () => {
    const a = await addReference();
    await expect(
      service.command({
        type: "setStyleReferences",
        profileId,
        ids: [a.id, a.id],
      }),
    ).rejects.toThrow();
    await expect(
      service.command({
        type: "setStyleReferences",
        profileId,
        ids: [randomUUID()],
      }),
    ).rejects.toThrow();
    const p = service.snapshot().project;
    p.artDirectionRevisions[1].styleReferenceIds = [];
    expect(projectSchema.safeParse(p).success).toBe(false);
  });
  it("limits profile references to six", async () => {
    for (let i = 0; i < 6; i++) await addReference(50 + i);
    await expect(addReference(70)).rejects.toThrow("sechs");
    expect(service.snapshot().project.styleAssets).toHaveLength(6);
  });
  it.each(["bytes", "symlink", "missing", "traversal"])(
    "rejects manipulated style %s",
    async (kind) => {
      const ref = await addReference();
      const file = path.join(dir, ref.file);
      if (kind === "bytes") {
        await fs.chmod(file, 0o600);
        await fs.writeFile(file, png(12, 16, 170));
      }
      if (kind === "symlink") {
        await fs.unlink(file);
        await fs.symlink(
          path.join(dir, service.snapshot().project.masters[0].file),
          file,
        );
      }
      if (kind === "missing") await fs.unlink(file);
      if (kind === "traversal") {
        const p = service.snapshot().project;
        p.styleAssets[0].file = "assets/styles/../../private.png";
        expect(projectSchema.safeParse(p).success).toBe(false);
        return;
      }
      await expect(service.preview(ref.id)).rejects.toThrow();
      await expect(new ProjectService().open(dir)).rejects.toThrow();
    },
  );
  it("rejects corrupt/non-image and oversized style inputs", async () => {
    await expect(
      service.stage(Buffer.from("not a png"), "bad.png"),
    ).rejects.toThrow();
    const staged = await service.stage(
      Buffer.concat([png(), Buffer.alloc(8 * 1024 * 1024)]),
      "too-large.png",
    );
    await expect(
      service.command({
        type: "importStyleReference",
        profileId,
        token: staged.token,
      }),
    ).rejects.toThrow("8 MiB");
  });
  it("migrates PR8 projects read-only and backs up exact manifest on first write", async () => {
    const file = path.join(dir, "laceframe.json"),
      old = JSON.parse(await fs.readFile(file, "utf8"));
    delete old.visualStyleVersion;
    delete old.styleAssets;
    delete old.artDirectionRevisions;
    delete old.outfits;
    old.artDirections[0].revision = 3;
    const bytes = Buffer.from(JSON.stringify(old));
    await fs.writeFile(file, bytes);
    const reopened = await service.open(dir);
    expect(await fs.readFile(file)).toEqual(bytes);
    expect(
      reopened.project.artDirectionRevisions.map((r) => r.revision),
    ).toEqual([3]); // Earlier unknown text is never invented.
    await service.command({
      type: "updateArtDirection",
      id: profileId,
      name: "New",
      renderRules: "Updated",
    });
    expect(
      await fs.readFile(
        path.join(dir, "laceframe.v2.pre-visual-style.backup.json"),
      ),
    ).toEqual(bytes);
    expect(
      (await service.open(dir)).project.artDirectionRevisions.map(
        (r) => r.revision,
      ),
    ).toEqual([3, 4]);
  });
  it("keeps project libraries independent", async () => {
    await addReference();
    const other = await fs.mkdtemp(
      path.join(os.tmpdir(), "laceframe-style-other-"),
    );
    try {
      const s = new ProjectService();
      await s.create(other, "Other");
      expect(s.snapshot().project.styleAssets).toEqual([]);
      expect(s.snapshot().project.artDirections).toEqual([]);
    } finally {
      await fs.rm(other, { recursive: true, force: true });
    }
  });
});
it("fails closed for unsupported or ambiguous local-image schemas", () => {
  const schema = {
    properties: {
      input: { type: "array", items: { $ref: "#/definitions/UserInput" } },
    },
    definitions: {
      UserInput: {
        oneOf: [
          {
            properties: {
              type: { enum: ["localImage"] },
              path: { type: "string" },
            },
            required: ["path", "type"],
          },
        ],
      },
    },
  };
  expect(supportsMultipleLocalImages(schema)).toBe(true);
  expect(
    supportsMultipleLocalImages({
      ...schema,
      properties: { input: { ...schema.properties.input, maxItems: 1 } },
    }),
  ).toBe(false);
  expect(supportsMultipleLocalImages({})).toBe(false);
});
