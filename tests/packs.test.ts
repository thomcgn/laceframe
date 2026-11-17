import { measureStyle, ANALYSIS_VERSION } from "../src/shared/style-analysis";
import { decodePixels } from "../src/main/mask-composite";
import { png } from "./fixtures";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  ProjectService,
  hashBytes,
  readLimited,
} from "../src/main/project-service";
import {
  emptyStyle,
  parsePackJSON,
  serializePack,
  planPack,
  exportStyle,
  exportExpressions,
  lintStyle,
  migrationLines,
  MAX_PACK_BYTES,
  type Pack,
} from "../src/shared/packs";
import {
  composeCharacterPrompt,
  DEFAULT_COMPOSITION,
} from "../src/shared/character-creation";
import { protectExpressionPrompt } from "../src/shared/generation";
import { TRANSPARENT_CHARACTER_INSTRUCTION } from "../src/shared/asset-quality";
import { writeExport } from "../src/main/asset-export";
let root: string, service: ProjectService;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "laceframe-packs-"));
  await fs.mkdir(path.join(root, "one"));
  service = new ProjectService();
  await service.create(path.join(root, "one"), "Synthetic one");
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
async function target() {
  const dir = path.join(root, randomUUID());
  await fs.mkdir(dir);
  const other = new ProjectService();
  await other.create(dir, "Synthetic two");
  return other;
}
async function style() {
  return (
    await service.command({
      type: "addArtDirection",
      name: "Rendering only",
      renderRules:
        "Render leather as grouped highlights.\nKeep contour clusters.",
      lightingRules: "Warm rim light",
      description: "Free text retained\r\nexactly",
      colorRules: "Restrained saturation",
      framingRules: "Centered crop",
    })
  ).project.artDirections[0];
}
// Submit only typed command fields, never the derived preview rows.
async function commit(
  s: ProjectService,
  pack: Pack,
  action: "new" | "update" | "skip" = "new",
) {
  const v = s.previewPack(serializePack(pack));
  return s.command({
    type: "importPack",
    pack: v.pack,
    projectHash: v.projectHash,
    choices: v.rows.map((r) => ({ key: r.key, action })),
  });
}
describe("portable packs", () => {
  it("roundtrips all structured style fields, extra rules, source metadata and exact legacy text across projects", async () => {
    const profile = await style(),
      pack = exportStyle(service.snapshot().project, profile);
    pack.style = {
      ...pack.style,
      intent: "Calm game illustration",
      positiveRules: ["Graphic clusters"],
      negativeRules: ["Photographic bloom"],
      contours: "Broken contours",
      pixelClusters: "Grouped",
      apparentDensity: "Unknown source grid; manual direction only",
      shading: "Three author-selected tonal groups",
      materials: "Grouped highlights",
      colorTreatment: "Muted",
      lighting: "Warm rim",
      composition: "Centered",
      additionalRules: [
        { label: "Own rendering note", text: "Preserve deliberate detail." },
      ],
      referenceHashes: ["a".repeat(64)],
    };
    const measuredBytes = png(8, 12, 130),
      measuredSha = hashBytes(measuredBytes);
    pack.style.referenceHashes.push(measuredSha);
    pack.style.findings = [
      {
        algorithm: ANALYSIS_VERSION,
        sha256: measuredSha,
        metrics: measureStyle(decodePixels(measuredBytes)),
      },
    ];
    pack.revision = 7;
    pack.provenance.note = "Author-supplied text provenance";
    const other = await target();
    const saved = await commit(other, pack);
    const imported = saved.project.artDirections[0];
    expect(imported.id).not.toBe(profile.id);
    expect(imported.portableId).toBe(pack.id);
    expect(exportStyle(saved.project, imported)).toEqual(pack);
    expect(imported.styleReferenceIds).toEqual([]);
    await other.open(saved.directory);
    expect(
      exportStyle(
        other.snapshot().project,
        other.snapshot().project.artDirections[0],
      ),
    ).toEqual(pack);
  });
  it("preserves boundary whitespace in imported free rules, without silently normalizing it", async () => {
    const profile = await style(),
      pack = exportStyle(service.snapshot().project, profile);
    pack.style.legacy.renderRules =
      "  Render clusters.\r\nKeep deliberate line breaks.  ";
    const other = await target();
    const saved = await commit(other, pack);
    expect(
      exportStyle(saved.project, saved.project.artDirections[0]).style.legacy
        .renderRules,
    ).toBe(pack.style.legacy.renderRules);
  });
  it("roundtrips multiple families/variants without personal performances or local UUID reuse", async () => {
    await service.command({
      type: "addCharacter",
      name: "Do not export this identity",
    });
    const p = service.snapshot().project;
    await service.command({
      type: "setExpressionPerformance",
      characterId: p.characters[0].id,
      variantId: p.variants[0].id,
      direction: "PRIVATE PERSONAL PERFORMANCE",
    });
    const pack = exportExpressions(
      service.snapshot().project,
      p.families.slice(0, 2).map((f) => f.id),
    );
    const other = await target();
    const baseline = other.snapshot().project;
    const saved = await commit(other, pack);
    const imported = saved.project.families.filter((f) => f.portableId);
    expect(imported).toHaveLength(2);
    expect(imported.every((f) => !p.families.some((a) => a.id === f.id))).toBe(
      true,
    );
    expect(
      exportExpressions(
        saved.project,
        imported.map((f) => f.id),
      ),
    ).toEqual(pack);
    expect(saved.project.expressionPerformances).toEqual(
      baseline.expressionPerformances,
    );
    expect(serializePack(pack)).not.toMatch(
      /PRIVATE PERSONAL|Do not export|"(?:characterId|file|masterId|mask)"\s*:/,
    );
  });
  it("detects new, same-name conflict, identical and changed by stable IDs, and never writes during preview", async () => {
    const profile = await style(),
      pack = exportStyle(service.snapshot().project, profile),
      other = await target();
    expect(planPack(other.snapshot().project, pack)[0].status).toBe("neu");
    await other.command({
      type: "addArtDirection",
      name: profile.name,
      renderRules: "Unrelated same name",
    });
    expect(planPack(other.snapshot().project, pack)[0].status).toBe("Konflikt");
    const before = await fs.readFile(
      path.join(other.snapshot().directory, "laceframe.json"),
    );
    other.previewPack(serializePack(pack));
    expect(
      await fs.readFile(
        path.join(other.snapshot().directory, "laceframe.json"),
      ),
    ).toEqual(before);
    await commit(other, pack);
    expect(planPack(other.snapshot().project, pack)[0].status).toBe(
      "identisch",
    );
    pack.style.intent = "Changed";
    expect(planPack(other.snapshot().project, pack)[0].status).toBe("geändert");
    const first = other.snapshot().project.artDirections.at(-1)!;
    await commit(other, pack, "update");
    expect(other.snapshot().project.artDirections.at(-1)!.id).toBe(first.id);
    expect(other.snapshot().project.artDirectionRevisions).toContainEqual(
      expect.objectContaining({
        profileId: first.id,
        revision: first.revision,
        portableStyle: expect.objectContaining({ intent: "" }),
      }),
    );
  });
  it("blocks stale preview, unmatched choices and unsafe direct IPC with byte-identical project retained", async () => {
    const pack = exportStyle(service.snapshot().project, await style()),
      other = await target();
    const v = other.previewPack(serializePack(pack));
    await other.command({ type: "addCharacter", name: "Concurrent write" });
    let before = await fs.readFile(
      path.join(other.snapshot().directory, "laceframe.json"),
    );
    await expect(
      other.command({
        type: "importPack",
        pack,
        projectHash: v.projectHash,
        choices: [{ key: pack.id, action: "new" }],
      }),
    ).rejects.toThrow("Vorschau");
    expect(
      await fs.readFile(
        path.join(other.snapshot().directory, "laceframe.json"),
      ),
    ).toEqual(before);
    const fresh = other.previewPack(serializePack(pack));
    await expect(
      other.command({
        type: "importPack",
        pack,
        projectHash: fresh.projectHash,
        choices: [{ key: randomUUID(), action: "new" }],
      }),
    ).rejects.toThrow("Importentscheidungen");
    pack.style.intent = "/home/private/portrait.png";
    before = await fs.readFile(
      path.join(other.snapshot().directory, "laceframe.json"),
    );
    await expect(commit(other, pack)).rejects.toThrow();
    expect(
      await fs.readFile(
        path.join(other.snapshot().directory, "laceframe.json"),
      ),
    ).toEqual(before);
  });
  it("requires an explicit update target; skip does not add definitions", async () => {
    const pack = exportStyle(service.snapshot().project, await style()),
      other = await target();
    await expect(commit(other, pack, "update")).rejects.toThrow("Importziel");
    await commit(other, pack, "skip");
    expect(other.snapshot().project.artDirections).toEqual([]);
  });
  it("retains local variants and scoped personal performances on an explicit global update", async () => {
    const pack = exportExpressions(service.snapshot().project, [
        service.snapshot().project.families[0].id,
      ]),
      other = await target();
    await commit(other, pack);
    const p = other.snapshot().project,
      f = p.families.at(-1)!,
      v = p.variants.find((v) => v.familyId === f.id)!;
    await other.command({ type: "addCharacter", name: "A" });
    const cid = other.snapshot().project.characters[0].id;
    await other.command({
      type: "setExpressionPerformance",
      characterId: cid,
      variantId: v.id,
      direction: "Scoped A only",
    });
    await other.command({
      type: "addVariant",
      familyId: f.id,
      label: "Local variant",
      slug: "local-extra",
    });
    pack.families[0].variants[0].prompt = "Changed global expression";
    await commit(other, pack, "update");
    const after = other.snapshot().project;
    expect(after.variants.find((a) => a.id === v.id)?.prompt).toBe(
      "Changed global expression",
    );
    expect(after.variants.some((a) => a.slug === "local-extra")).toBe(true);
    expect(after.expressionPerformances[0].direction).toBe("Scoped A only");
  });
  it("detects ambiguous duplicated external IDs and variant slug collisions conservatively", async () => {
    const pack = exportExpressions(service.snapshot().project, [
        service.snapshot().project.families[0].id,
      ]),
      other = await target();
    await commit(other, pack);
    pack.families[0].variants[0].id = randomUUID();
    expect(planPack(other.snapshot().project, pack)[0].status).toBe("Konflikt");
    await expect(commit(other, pack, "update")).rejects.toThrow();
    await commit(other, pack, "new");
    expect(planPack(other.snapshot().project, pack)[0].status).toBe("Konflikt");
  });
  it.each([
    "malformed",
    "version",
    "unknown",
    "path",
    "windows",
    "traversal",
    "data",
    "oversize",
    "deep",
    "duplicate",
    "prototype",
  ])("rejects %s before any write", async (kind) => {
    const profile = await style();
    const raw: Record<string, unknown> = JSON.parse(
      serializePack(exportStyle(service.snapshot().project, profile)),
    );
    let json = "";
    if (kind === "malformed") json = "{bad";
    else if (kind === "oversize") json = " ".repeat(MAX_PACK_BYTES + 1);
    else if (kind === "deep") json = "[".repeat(21) + "]".repeat(21);
    else if (kind === "duplicate") {
      const pack = exportExpressions(service.snapshot().project, [
        service.snapshot().project.families[0].id,
      ]);
      pack.families[0].variants.push(pack.families[0].variants[0]);
      json = JSON.stringify(pack);
    } else {
      if (kind === "version") raw.schemaVersion = 2;
      else if (kind === "unknown") raw.command = "run";
      else if (kind === "prototype") raw["__proto__"] = null;
      else
        (raw.style as Record<string, unknown>).intent = (
          {
            path: "/home/tom/private.png",
            windows: "C:\\private\\image.png",
            traversal: "../outside.json",
            data: "data:image/png;base64,AAAA",
          } as Record<string, string>
        )[kind];
      json =
        kind === "prototype"
          ? JSON.stringify(raw).slice(0, -1) + ',"__proto__":{}}'
          : JSON.stringify(raw);
    }
    const before = await fs.readFile(
      path.join(service.snapshot().directory, "laceframe.json"),
    );
    expect(() => service.previewPack(json)).toThrow();
    expect(
      await fs.readFile(
        path.join(service.snapshot().directory, "laceframe.json"),
      ),
    ).toEqual(before);
  });
  it("exports exclusively outside projects without overwriting existing or symlinked files", async () => {
    const profile = await style(),
      payload = service.exportPack({
        kind: "style",
        profileId: profile.id,
        styleScopeReviewed: true,
      });
    const out = path.join(root, "exports");
    await fs.mkdir(out);
    await expect(
      writeExport(
        service.snapshot().directory,
        service.snapshot().directory,
        payload,
      ),
    ).rejects.toThrow("außerhalb");
    await writeExport(out, service.snapshot().directory, payload);
    const before = await fs.readFile(path.join(out, payload.name));
    await expect(
      writeExport(out, service.snapshot().directory, payload),
    ).rejects.toThrow();
    expect(await fs.readFile(path.join(out, payload.name))).toEqual(before);
  });
  it("uses bounded nonsymlink JSON reads and exclusive exports without changing linked source bytes", async () => {
    const profile = await style(),
      payload = service.exportPack({
        kind: "style",
        profileId: profile.id,
        styleScopeReviewed: true,
      });
    const source = path.join(root, "source.json"),
      link = path.join(root, "link.json");
    await fs.writeFile(source, payload.bytes);
    await fs.symlink(source, link);
    await expect(readLimited(link, MAX_PACK_BYTES)).rejects.toThrow("unsicher");
    const huge = path.join(root, "huge.json");
    await fs.writeFile(huge, Buffer.alloc(MAX_PACK_BYTES + 1));
    await expect(readLimited(huge, MAX_PACK_BYTES)).rejects.toThrow();
    const dest = path.join(root, "export-links");
    await fs.mkdir(dest);
    await fs.symlink(source, path.join(dest, payload.name));
    await expect(
      writeExport(dest, service.snapshot().directory, payload),
    ).rejects.toThrow();
    expect(await fs.readFile(source)).toEqual(payload.bytes);
    expect(() =>
      service.exportPack({ kind: "style", profileId: profile.id }),
    ).toThrow("manueller Prüfung");
  });
  it("refuses a conflicting migration backup before any project rewrite", async () => {
    const profile = await style(),
      pack = exportStyle(service.snapshot().project, profile),
      file = path.join(service.snapshot().directory, "laceframe.json");
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    delete raw.portablePacksVersion;
    const before = Buffer.from(JSON.stringify(raw));
    await fs.writeFile(file, before);
    await service.open(service.snapshot().directory);
    await fs.writeFile(
      path.join(
        service.snapshot().directory,
        "laceframe.v2.pre-portable-packs.backup.json",
      ),
      "different backup",
    );
    await expect(commit(service, pack, "update")).rejects.toThrow(
      "Migrationssicherung",
    );
    expect(await fs.readFile(file)).toEqual(before);
  });
  it("keeps analyzer findings as typed hash-only evidence", async () => {
    const profile = await style(),
      pack = exportStyle(service.snapshot().project, profile);
    expect(pack.style.findings).toEqual([]);
    expect(() =>
      parsePackJSON(
        JSON.stringify({
          ...pack,
          style: {
            ...pack.style,
            findings: [
              { algorithm: "guessed", sha256: "a".repeat(64), metrics: {} },
            ],
          },
        }),
      ),
    ).toThrow();
  });
});
describe("style migration and prompt separation", () => {
  it("classifies material rendering separately from concrete outfit; marks uncertainty", () => {
    expect(lintStyle("render leather as grouped highlights").category).toBe(
      "style",
    );
    expect(lintStyle("keep black leather jacket").category).toBe("outfit");
    expect(
      lintStyle("Render leather but keep black leather jacket").category,
    ).toBe("outfit");
    expect(lintStyle("Use selfie identity").category).toBe("identity");
    expect(lintStyle("Neutral expression").category).toBe("expression");
    expect(lintStyle("maybe artistic").category).toBe("unclear");
  });
  it("backs up a legacy project byte-exactly on first write; preserves raw rules and history", async () => {
    const original =
      "Illustrated pixel contours\r\nkeep black leather jacket\nUse selfie identity\nNeutral expression\nCentered framing";
    const profile = (
      await service.command({
        type: "addArtDirection",
        name: "Synthetic Ada-style legacy",
        renderRules: original,
      })
    ).project.artDirections[0];
    const file = path.join(service.snapshot().directory, "laceframe.json");
    const raw = JSON.parse(await fs.readFile(file, "utf8"));
    delete raw.portablePacksVersion;
    delete raw.styleMigrations;
    const bytes = Buffer.from(JSON.stringify(raw));
    await fs.writeFile(file, bytes);
    await service.open(service.snapshot().directory);
    expect(await fs.readFile(file)).toEqual(bytes);
    const lines = migrationLines(profile);
    const saved = await service.command({
      type: "migrateStyleRules",
      profileId: profile.id,
      sourceRevision: profile.revision,
      choices: lines.map((l, index) => ({
        index,
        category: l.category,
        text: l.raw,
      })),
    });
    expect(
      await fs.readFile(
        path.join(
          saved.directory,
          "laceframe.v2.pre-portable-packs.backup.json",
        ),
      ),
    ).toEqual(bytes);
    expect(
      saved.project.artDirectionRevisions.find((r) => r.revision === 1)
        ?.renderRules,
    ).toBe(original);
    expect(saved.project.styleMigrations[0].sources[0]).toEqual({
      field: "renderRules",
      text: original,
      sha256: hashBytes(Buffer.from(original)),
    });
    const active = saved.project.artDirections[0],
      pack = exportStyle(saved.project, active);
    expect(serializePack(pack)).not.toMatch(
      /black leather jacket|selfie|Neutral expression/,
    );
    expect(pack.style.positiveRules).toEqual(["Illustrated pixel contours"]);
    await service.open(saved.directory);
    expect(service.snapshot().project.styleMigrations).toEqual(
      saved.project.styleMigrations,
    );
  });
  it("rejects stale/incomplete migration or changed original archive without rewriting the project", async () => {
    const profile = await style(),
      lines = migrationLines(profile),
      choices = lines.map((l, index) => ({
        index,
        category: l.category,
        text: l.raw,
      }));
    const file = path.join(service.snapshot().directory, "laceframe.json"),
      before = await fs.readFile(file);
    await expect(
      service.command({
        type: "migrateStyleRules",
        profileId: profile.id,
        sourceRevision: 90,
        choices,
      }),
    ).rejects.toThrow();
    await expect(
      service.command({
        type: "migrateStyleRules",
        profileId: profile.id,
        sourceRevision: profile.revision,
        choices: choices.slice(0, -1),
      }),
    ).rejects.toThrow();
    expect(await fs.readFile(file)).toEqual(before);
  });
  it("composes two separate identities/outfits against one structured style without live provider calls", async () => {
    const profile = await style();
    await service.command({
      type: "updateStructuredStyle",
      profileId: profile.id,
      sourceRevision: profile.revision,
      style: {
        ...emptyStyle(profile.name),
        materials: "Render leather as grouped highlights",
      },
    });
    const portraits = [];
    for (const name of ["Synthetic A", "Synthetic B"]) {
      await service.command({ type: "addCharacter", name });
      const p = service.snapshot().project,
        c = p.characters.at(-1)!;
      portraits.push(
        composeCharacterPrompt(p, {
          characterId: c.id,
          mode: "create",
          identityReferences: [{ id: randomUUID(), sha256: "b".repeat(64) }],
          styleReferences: [],
          artDirectionId: profile.id,
          artDirectionRevision: 2,
          identityNotes: `Identity only ${name}`,
          outfit: `Outfit only ${name}`,
          composition: DEFAULT_COMPOSITION,
        }),
      );
    }
    expect(portraits[0]).toContain("Render leather as grouped highlights");
    expect(portraits[0]).toContain("Outfit only Synthetic A");
    expect(portraits[0]).not.toContain("Outfit only Synthetic B");
    expect(portraits[1]).toContain("Identity only Synthetic B");
    expect(protectExpressionPrompt("Expert instruction only")).toContain(
      TRANSPARENT_CHARACTER_INSTRUCTION,
    );
    expect(protectExpressionPrompt(protectExpressionPrompt("X"))).toBe(
      protectExpressionPrompt("X"),
    );
  });
});
