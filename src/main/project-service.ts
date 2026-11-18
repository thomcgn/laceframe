import { tr } from "../shared/locales/index";
import { hasOtherAssetReference } from "../shared/asset-retention";
import {
  applyPixelEdit,
  validateSnap,
  SPRITEFUSION_VERSION,
  type PixelEdit,
} from "../shared/pixel-snap";
import {
  replayRegionSelection,
  type RegionSelectionRecord,
  type RegionSelection,
} from "../shared/color-region";
import {
  COLOR_VERSION,
  extractPalette,
  correctColors,
  rgbHex,
} from "../shared/color-consistency";
import {
  identityImportSchema,
  type IdentityImport,
} from "../shared/identity-import";
import { protectExpressionPrompt } from "../shared/generation";
import {
  parsePackJSON,
  serializePack,
  packSelectionSchema,
  planPack,
  localImportName,
  exportStyle,
  exportExpressions,
  migrationLines,
  emptyStyle,
  type PackPreview,
  type PackSelection,
} from "../shared/packs";
import {
  selectBackground,
  validateCutoutImage,
  MAX_SMART_PIXELS,
  SMART_CUTOUT_VERSION,
  type SmartCutoutRecord,
  type CutoutDraft,
} from "../shared/smart-cutout";
import {
  ANALYSIS_VERSION,
  MAX_ANALYSIS_PIXELS,
  parameters,
  measureStyle,
  suggestRules,
  adoptedRules,
  type AnalysisResult,
} from "../shared/style-analysis";
import {
  relightPixels,
  validateRelightSize,
  RELIGHT_VERSION,
  type RelightRecord,
} from "../shared/relighting";
import { analyzePixels, cutoutPixels, resizePixels } from "./asset-quality";
import {
  TRANSPARENT_CHARACTER_INSTRUCTION,
  masterApprovalInputSchema,
  type MasterApprovalInput,
} from "../shared/asset-quality";
import { exportAssetSchema } from "../shared/asset-quality";
import type { Pixels } from "./mask-composite";
import {
  compositePixels,
  decodePixels,
  encodeMask,
  encodePixels,
  maskWeights,
} from "./mask-composite";
import {
  validateCreatorSelection,
  validateMasterTarget,
  protectMasterPrompt,
  transparencyConflicts,
  type CharacterCreationDraft,
} from "../shared/character-creation";
import { constants } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import path from "node:path";
import { imageSize } from "image-size";
import {
  assetFile,
  commandSchema,
  MAX_IMAGE_BYTES,
  projectSchema,
  parseProject,
  review,
  type ArtDirection,
  type Project,
  type Snapshot,
  type StagedImage,
  type StagedIdentityImage,
} from "../shared/domain";
import { manualImportProvider } from "./services/providers/manualImport";
import {
  type GenerationAttempt,
  type GenerationExecution,
  generationExecutionSchema,
} from "../shared/generation";
import { MAX_STYLE_BYTES, MAX_STYLE_PIXELS } from "../shared/style";
import { createPresets } from "../shared/presets";

export const hashBytes = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const manifestName = "laceframe.json";
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const exists = async (p: string) =>
  fs.lstat(p).then(
    () => true,
    (e: NodeJS.ErrnoException) => {
      if (e.code === "ENOENT") return false;
      throw e;
    },
  );

// Reject symlinks at EVERY component, including the final file; never accept renderer paths.
export async function safePath(
  root: string,
  relative: string,
): Promise<string> {
  if (
    !relative ||
    relative.includes("\\") ||
    path.posix.isAbsolute(relative) ||
    relative
      .split("/")
      .some((x) => !x || x === ".." || x === "." || x.includes(":"))
  )
    throw new Error(tr("errors.m6c13dae5c2"));
  let current = root;
  if ((await fs.lstat(root)).isSymbolicLink())
    throw new Error(tr("errors.m298231511e"));
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    if ((await exists(current)) && (await fs.lstat(current)).isSymbolicLink())
      throw new Error(tr("errors.medab4239c3"));
  }
  return current;
}
export async function readLimited(file: string, max: number): Promise<Buffer> {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > max)
    throw new Error(tr("errors.m29a3571f22"));
  const handle = await fs.open(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.size > max ||
      stat.ino !== info.ino ||
      stat.dev !== info.dev
    )
      throw new Error(tr("errors.m9ce05045b7"));
    const bytes = Buffer.alloc(Math.min(stat.size, max) + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > max) throw new Error(tr("errors.m586fc5a0ba"));
    return bytes.subarray(0, offset);
  } finally {
    await handle.close();
  }
}
export function inspectIdentityImage(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 16 * 1024 * 1024)
    throw new Error(tr("errors.mbb17100a71"));
  const info = imageSize(bytes);
  if (
    !["png", "webp", "jpg"].includes(info.type ?? "") ||
    !info.width ||
    !info.height ||
    info.width > 16384 ||
    info.height > 16384 ||
    info.width * info.height > 16_000_000
  )
    throw new Error(tr("errors.mdce29bdb7f"));
  // Match Chromium's oriented JPEG preview dimensions; retain every original byte.
  const rotated =
    info.type === "jpg" && [5, 6, 7, 8].includes(info.orientation ?? 1);
  return {
    width: rotated ? info.height : info.width,
    height: rotated ? info.width : info.height,
    format: info.type as "png" | "webp" | "jpg",
  };
}
export function inspectImage(bytes: Uint8Array): {
  width: number;
  height: number;
  format: "png" | "webp";
} {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES)
    throw new Error(tr("errors.m8939035af7"));
  const info = imageSize(bytes);
  if (
    (info.type !== "png" && info.type !== "webp") ||
    !info.width ||
    !info.height ||
    info.width > 16384 ||
    info.height > 16384 ||
    info.width * info.height > 64_000_000
  )
    throw new Error(tr("errors.m02554abb8f"));
  return { width: info.width, height: info.height, format: info.type };
}
function preview(bytes: Uint8Array, format: string) {
  return `data:image/${format === "jpg" ? "jpeg" : format};base64,${Buffer.from(bytes).toString("base64")}`;
}

export class ProjectService {
  private directory = "";
  private project?: Project;
  private diskHash = "";
  private legacyBytes?: Buffer;
  private legacyBackupName = "laceframe.v1.backup.json";
  private staged?: { image: StagedIdentityImage; bytes: Buffer };
  constructor(
    private readonly decode: (
      bytes: Uint8Array,
      width: number,
      height: number,
      format: "png" | "webp" | "jpg",
    ) => void | Promise<void> = () => {},
    private readonly pixels: (
      bytes: Uint8Array,
    ) => Pixels | Promise<Pixels> = decodePixels,
  ) {}
  close() {
    this.project = undefined;
    this.directory = "";
    this.diskHash = "";
    this.legacyBytes = undefined;
    this.legacyBackupName = "laceframe.v1.backup.json";
    this.staged = undefined;
  }
  snapshot(): Snapshot {
    if (!this.project) throw new Error(tr("errors.m97f49487e9"));
    return {
      directory: this.directory,
      project: structuredClone(this.project),
    };
  }
  async create(directory: string, name: string): Promise<Snapshot> {
    const root = await fs.realpath(directory);
    if ((await fs.readdir(root)).length)
      throw new Error(tr("errors.m2d0e9b2a52"));
    const now = new Date().toISOString();
    const project = projectSchema.parse({
      schemaVersion: 2,
      portablePacksVersion: 1,
      visualStyleVersion: 1,
      maskingVersion: 1,
      smartCutoutVersion: 1,
      characterCreationVersion: 1,
      assetQualityVersion: 1,
      identityAssets: [],
      masterAttempts: [],
      masterCandidates: [],
      masks: [],
      styleAssets: [],
      artDirectionRevisions: [],
      outfits: [],
      id: randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
      characters: [],
      masters: [],
      assets: [],
      attempts: [],
      artDirections: [],
      expressionPerformances: [],
      ...createPresets(randomUUID),
    });
    await fs.mkdir(path.join(root, "assets", "originals"), { recursive: true });
    await fs.mkdir(path.join(root, "assets", "candidates"), {
      recursive: true,
    });
    // Exclusive initial creation; never replace an existing project.
    await fs.writeFile(
      path.join(root, manifestName),
      JSON.stringify(project, null, 2),
      { flag: "wx" },
    );
    return this.open(root);
  }
  async open(directory: string): Promise<Snapshot> {
    const root = await fs.realpath(directory);
    const bytes = await readLimited(
      await safePath(root, manifestName),
      MAX_MANIFEST_BYTES,
    );
    const raw: unknown = JSON.parse(bytes.toString("utf8"));
    const project = parseProject(raw);
    for (const image of [
      ...project.masters,
      ...project.assets,
      ...project.styleAssets,
      ...project.masks,
      ...project.identityAssets,
      ...project.masterCandidates,
      ...project.qualityAssets,
    ].filter((a) => !("discardedAt" in a && a.discardedAt))) {
      const contents = await readLimited(
        await safePath(root, image.file),
        MAX_IMAGE_BYTES,
      );
      if (hashBytes(contents) !== image.sha256)
        throw new Error(tr("errors.ma083c96fee"));
      const identity = project.identityAssets.some((a) => a.id === image.id);
      const info = identity
        ? inspectIdentityImage(contents)
        : inspectImage(contents);
      if (
        info.width !== image.width ||
        info.height !== image.height ||
        info.format !== image.format
      )
        throw new Error(tr("errors.m9dc99fcf96"));
      if (identity)
        await this.decode(contents, info.width, info.height, info.format);
      if (project.masks.some((m) => m.id === image.id))
        maskWeights(decodePixels(contents));
      if (project.styleAssets.some((a) => a.id === image.id)) {
        if (contents.length > MAX_STYLE_BYTES)
          throw new Error(tr("errors.m36eee0b538"));
        await this.decode(contents, info.width, info.height, info.format);
      }
    }
    for (const q of project.qualityAssets.filter((q) => !q.discardedAt))
      if (q.mask) {
        const b = await readLimited(
          await safePath(root, q.mask.file),
          MAX_IMAGE_BYTES,
        );
        if (hashBytes(b) !== q.mask.sha256)
          throw new Error(tr("errors.mb794cb3526"));
        const mask = decodePixels(b);
        if (mask.width !== q.width || mask.height !== q.height)
          throw new Error(tr("errors.m01d9424e5c"));
        maskWeights(mask);
      }
    for (const q of project.qualityAssets.filter((q) => !q.discardedAt))
      if (q.smartCutout) {
        for (const role of ["manual", "protected", "forced"] as const) {
          const m = q.smartCutout.masks[role],
            b = await readLimited(
              await safePath(root, m.file),
              MAX_IMAGE_BYTES,
            );
          if (hashBytes(b) !== m.sha256)
            throw new Error(tr("errors.mbb0e46ac2e"));
          const pixels = decodePixels(b);
          if (pixels.width !== q.width || pixels.height !== q.height)
            throw new Error(tr("errors.m1814712cef"));
          const weights = maskWeights(pixels);
          if (role !== "manual" && weights.some((v) => v !== 0 && v !== 255))
            throw new Error(tr("errors.m22600e4b5d"));
        }
        if (
          hashBytes(
            decodePixels(
              await readLimited(await safePath(root, q.file), MAX_IMAGE_BYTES),
            ).data,
          ) !== q.smartCutout.pixelSha256
        )
          throw new Error(tr("errors.m81903bad1f"));
      }
    for (const q of project.qualityAssets.filter((q) => !q.discardedAt))
      if (q.relighting) {
        const image = decodePixels(
          await readLimited(await safePath(root, q.file), MAX_IMAGE_BYTES),
        );
        if (hashBytes(image.data) !== q.relighting.pixelSha256)
          throw new Error(tr("errors.mfb47732004"));
        for (const r of q.relighting.regions) {
          const b = await readLimited(
            await safePath(root, r.mask.file),
            MAX_IMAGE_BYTES,
          );
          if (hashBytes(b) !== r.mask.sha256)
            throw new Error(tr("errors.m1b18ddcdc5"));
          const m = decodePixels(b);
          if (m.width !== q.width || m.height !== q.height)
            throw new Error(tr("errors.maafb16215e"));
          maskWeights(m);
        }
      }
    const readColorMask = async (
      ref: { file: string; sha256: string },
      width: number,
      height: number,
    ) => {
      const bytes = await readLimited(
        await safePath(root, ref.file),
        MAX_IMAGE_BYTES,
      );
      if (hashBytes(bytes) !== ref.sha256)
        throw new Error(tr("errors.m9178d201d8"));
      const pixels = decodePixels(bytes);
      if (pixels.width !== width || pixels.height !== height)
        throw new Error(tr("errors.m5545bbda0f"));
      return new Uint8Array(maskWeights(pixels));
    };
    for (const palette of project.masterPalettes) {
      const master = project.masters.find((m) => m.id === palette.masterId)!;
      const pixels = await this.pixels(
        await readLimited(await safePath(root, master.file), MAX_IMAGE_BYTES),
      );
      for (const r of palette.regions) {
        const weights = await readColorMask(
          r.mask,
          master.width,
          master.height,
        );
        if (r.selection) {
          const selection = {
            ...r.selection,
            base: await readColorMask(
              r.selection.base,
              master.width,
              master.height,
            ),
            override: await readColorMask(
              r.selection.override,
              master.width,
              master.height,
            ),
            values: await readColorMask(
              r.selection.values,
              master.width,
              master.height,
            ),
          };
          if (
            !Buffer.from(replayRegionSelection(pixels, selection)).equals(
              Buffer.from(weights),
            )
          )
            throw new Error(tr("errors.m28534643a6"));
        }
        if (
          JSON.stringify(extractPalette(pixels, weights)) !==
          JSON.stringify(r.colors)
        )
          throw new Error(tr("errors.m182a3b43ec"));
      }
    }
    for (const q of project.qualityAssets.filter((q) => !q.discardedAt))
      if (q.colorCorrection) {
        for (const mask of [
          q.colorCorrection.protectedMask,
          ...q.colorCorrection.regions.map((r) => r.mask),
        ])
          await readColorMask(mask, q.width, q.height);
        const pixels = decodePixels(
          await readLimited(await safePath(root, q.file), MAX_IMAGE_BYTES),
        );
        if (hashBytes(pixels.data) !== q.colorCorrection.pixelSha256)
          throw new Error(tr("errors.m0d7576f70e"));
      }
    for (const q of project.qualityAssets.filter((q) => !q.discardedAt))
      if (q.pixelEdit) {
        const source = [
          ...project.masters,
          ...project.assets,
          ...project.masterCandidates,
          ...project.qualityAssets,
        ].find((a) => a.id === q.sourceId)!;
        const pixels = await this.pixels(
          await readLimited(await safePath(root, source.file), MAX_IMAGE_BYTES),
        );
        const protection = await readColorMask(
          q.pixelEdit.protectedMask,
          source.width,
          source.height,
        );
        const e = q.pixelEdit.edit;
        const edit: PixelEdit =
          e.kind !== "color"
            ? e
            : {
                kind: "color",
                rule: e.rule,
                weights: await readColorMask(e.mask, q.width, q.height),
              };
        const expected = applyPixelEdit(pixels, edit, protection);
        const actual = decodePixels(
          await readLimited(await safePath(root, q.file), MAX_IMAGE_BYTES),
        );
        if (
          expected.width !== q.width ||
          expected.height !== q.height ||
          hashBytes(actual.data) !== q.pixelEdit.pixelSha256 ||
          !Buffer.from(expected.data).equals(actual.data)
        )
          throw new Error(tr("errors.mee293dfecc"));
      }
    for (const migration of project.styleMigrations)
      for (const source of migration.sources)
        if (hashBytes(Buffer.from(source.text)) !== source.sha256)
          throw new Error(tr("errors.me1e90985ed"));
    const source = raw as Record<string, unknown>;
    const versionOne = source.schemaVersion === 1;
    const needsArtMigration =
      !Object.hasOwn(source, "artDirections") ||
      !Object.hasOwn(source, "expressionPerformances");
    this.legacyBytes =
      versionOne ||
      needsArtMigration ||
      source.visualStyleVersion !== 1 ||
      source.maskingVersion !== 1 ||
      source.characterCreationVersion !== 1 ||
      source.assetQualityVersion !== 1 ||
      !Object.hasOwn(source, "styleAnalyses") ||
      source.smartCutoutVersion !== 1 ||
      source.portablePacksVersion !== 1 ||
      !Object.hasOwn(source, "masterPalettes")
        ? bytes
        : undefined;
    this.legacyBackupName = versionOne
      ? "laceframe.v1.backup.json"
      : needsArtMigration
        ? "laceframe.v2.pre-art-direction.backup.json"
        : source.visualStyleVersion !== 1
          ? "laceframe.v2.pre-visual-style.backup.json"
          : source.maskingVersion !== 1
            ? "laceframe.v2.pre-masking.backup.json"
            : source.characterCreationVersion !== 1
              ? "laceframe.v2.pre-character-creation.backup.json"
              : source.assetQualityVersion !== 1
                ? "laceframe.v2.pre-asset-quality.backup.json"
                : !Object.hasOwn(source, "styleAnalyses")
                  ? "laceframe.v2.pre-style-analysis.backup.json"
                  : source.smartCutoutVersion !== 1
                    ? "laceframe.v2.pre-smart-cutout.backup.json"
                    : source.portablePacksVersion !== 1
                      ? "laceframe.v2.pre-portable-packs.backup.json"
                      : "laceframe.v2.pre-color-consistency.backup.json";
    this.directory = root;
    this.project = project;
    this.diskHash = hashBytes(bytes);
    this.staged = undefined;
    return this.snapshot();
  }
  async stage(bytes: Uint8Array, name: string): Promise<StagedImage> {
    this.snapshot();
    const owned = Buffer.from(bytes);
    const info = inspectImage(owned);
    await this.decode(owned, info.width, info.height, info.format);
    const image = {
      ...info,
      token: randomUUID(),
      name,
      sha256: hashBytes(owned),
      preview: preview(owned, info.format),
      quality: await Promise.resolve()
        .then(() => this.pixels(owned))
        .then((p) => analyzePixels(p, info.format))
        .catch(() => undefined),
    };
    this.staged = { image, bytes: owned };
    return image;
  }
  async stageIdentity(
    bytes: Uint8Array,
    name: string,
  ): Promise<StagedIdentityImage> {
    this.snapshot();
    const owned = Buffer.from(bytes),
      info = inspectIdentityImage(owned);
    await this.decode(owned, info.width, info.height, info.format);
    const image = {
      ...info,
      token: randomUUID(),
      name,
      sha256: hashBytes(owned),
      preview: preview(owned, info.format),
    };
    this.staged = { image, bytes: owned };
    return image;
  }
  discard(token: string) {
    if (this.staged?.image.token === token) this.staged = undefined;
  }
  private pending(token: string) {
    if (!this.staged || this.staged.image.token !== token)
      throw new Error(tr("errors.m744e69aace"));
    return this.staged;
  }
  private async store(
    kind:
      | "originals"
      | "candidates"
      | "styles"
      | "masks"
      | "master-candidates"
      | "quality"
      | "cutout-masks"
      | "relight-masks"
      | "color-masks",
    token: string,
  ) {
    const { image, bytes } = this.pending(token);
    if (image.format === "jpg") throw new Error(tr("errors.md95c6841ea"));
    const relative = assetFile(kind, image.sha256, image.format);
    if (kind !== "originals" && kind !== "candidates")
      await fs.mkdir(await safePath(this.directory, `assets/${kind}`), {
        recursive: true,
      });
    const file = await safePath(this.directory, relative);
    try {
      await fs.writeFile(file, bytes, { flag: "wx", mode: 0o444 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (!(await readLimited(file, MAX_IMAGE_BYTES)).equals(bytes))
        throw new Error(tr("errors.m82282ed9a5"), {
          cause: error,
        });
    }
    return {
      sha256: image.sha256,
      file: relative,
      width: image.width,
      height: image.height,
      format: image.format,
    };
  }
  identitySlots(characterId: string, replaceId?: string) {
    const p = this.snapshot().project;
    if (!p.characters.some((c) => c.id === characterId))
      throw new Error(tr("errors.m0b88139e9c"));
    const active = p.identityAssets.filter(
      (a) => a.characterId === characterId && !a.removedAt,
    );
    if (replaceId && !active.some((a) => a.id === replaceId))
      throw new Error(tr("errors.m348d56db5b"));
    return replaceId ? 1 : 3 - active.length;
  }
  async importIdentityImages(input: IdentityImport): Promise<Snapshot> {
    const request = identityImportSchema.parse(input),
      slots = this.identitySlots(request.characterId, request.replaceId),
      files = request.files;
    if (!files?.length) throw new Error(tr("errors.m91d7f63c5a"));
    if (files.length > slots)
      throw new Error(tr("errors.mda4aff8a61", { v0: slots }));
    if (this.staged) throw new Error(tr("errors.m6ad511cb61"));
    const p = this.snapshot().project,
      hashes = new Set(
        p.identityAssets
          .filter((a) => a.characterId === request.characterId && !a.removedAt)
          .map((a) => a.sha256),
      ),
      prepared = [],
      errors: string[] = [];
    // Validate the complete group before any project write; no staging tokens are created.
    for (const file of files) {
      try {
        const bytes = Buffer.from(file.bytes),
          info = inspectIdentityImage(bytes),
          sha256 = hashBytes(bytes);
        await this.decode(bytes, info.width, info.height, info.format);
        if (hashes.has(sha256)) throw new Error(tr("errors.mc0842e89ad"));
        hashes.add(sha256);
        prepared.push({ bytes, ...info, sha256, name: file.name });
      } catch (error) {
        errors.push(
          `${file.name}: ${error instanceof Error ? error.message : tr("common.mf2689163c6")}`,
        );
      }
    }
    if (errors.length) throw new Error(errors.join("\n"));
    const created: string[] = [];
    try {
      await fs.mkdir(await safePath(this.directory, "assets/identities"), {
        recursive: true,
      });
      for (const image of prepared) {
        const file = `assets/identities/${image.sha256}.${image.format}`,
          destination = await safePath(this.directory, file);
        try {
          const handle = await fs.open(destination, "wx", 0o444);
          created.push(destination);
          try {
            await handle.writeFile(image.bytes);
          } finally {
            await handle.close();
          }
        } catch (error) {
          if (
            (error as NodeJS.ErrnoException).code !== "EEXIST" ||
            !(await readLimited(destination, 16 * 1024 * 1024)).equals(
              image.bytes,
            )
          )
            throw new Error(tr("errors.ma7d129a4c1", { v0: image.name }), {
              cause: error,
            });
        }
        p.identityAssets.push({
          id: randomUUID(),
          characterId: request.characterId,
          file,
          sha256: image.sha256,
          width: image.width,
          height: image.height,
          format: image.format,
          createdAt: new Date().toISOString(),
        });
      }
      // Retain old source bytes and historical provenance during an explicit replacement.
      if (request.replaceId)
        p.identityAssets.find((a) => a.id === request.replaceId)!.removedAt =
          new Date().toISOString();
      p.updatedAt = new Date().toISOString();
      await this.save(p);
    } catch (error) {
      for (const file of created) {
        if (process.platform === "win32") await fs.chmod(file, 0o600);
        await fs.unlink(file);
      }
      throw error;
    }
    return this.snapshot();
  }
  private async save(project: Project) {
    const validated = projectSchema.parse({
      ...project,
      portablePacksVersion: 1,
      maskingVersion: 1,
      smartCutoutVersion: 1,
      characterCreationVersion: 1,
      assetQualityVersion: 1,
    });
    const destination = await safePath(this.directory, manifestName);
    if (
      hashBytes(await readLimited(destination, MAX_MANIFEST_BYTES)) !==
      this.diskHash
    )
      throw new Error(tr("errors.m66f87397d0"));
    if (this.legacyBytes) {
      const backup = await safePath(this.directory, this.legacyBackupName);
      try {
        await fs.writeFile(backup, this.legacyBytes, {
          flag: "wx",
          mode: 0o444,
        });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        if (
          !(await readLimited(backup, MAX_MANIFEST_BYTES)).equals(
            this.legacyBytes,
          )
        )
          throw new Error(tr("errors.m1fbd17e879"), {
            cause: error,
          });
      }
    }
    const bytes = Buffer.from(JSON.stringify(validated, null, 2));
    if (bytes.length > MAX_MANIFEST_BYTES)
      throw new Error(tr("errors.m073701c8df"));
    const temp = await safePath(
      this.directory,
      `.laceframe-${randomUUID()}.tmp`,
    );
    try {
      const handle = await fs.open(temp, "wx", 0o600);
      try {
        await handle.writeFile(bytes);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temp, destination);
    } finally {
      await fs.rm(temp, { force: true });
    }
    this.legacyBytes = undefined;
    this.project = validated;
    this.diskHash = hashBytes(bytes);
  }
  async command(input: unknown): Promise<Snapshot> {
    const cmd = commandSchema.parse(input);
    const p = this.snapshot().project;
    const character = (id: string) => {
      const c = p.characters.find((c) => c.id === id);
      if (!c) throw new Error(tr("errors.m0b88139e9c"));
      return c;
    };
    let removeFile: { file: string; sha256: string } | undefined;
    switch (cmd.type) {
      case "updateStructuredStyle": {
        const profile = p.artDirections.find((a) => a.id === cmd.profileId);
        if (!profile || profile.revision !== cmd.sourceRevision)
          throw new Error(tr("errors.m8a404636d7"));
        // Only text data; imported reference hashes are descriptive, never filesystem commands.
        parsePackJSON(
          JSON.stringify({
            format: "laceframe.style",
            schemaVersion: 1,
            id: profile.id,
            revision: profile.revision,
            style: cmd.style,
            provenance: { application: "laceframe", note: "" },
          }),
        );
        profile.portableStyle = structuredClone(cmd.style);
        profile.revision++;
        this.archiveStyle(p, profile);
        break;
      }
      case "migrateStyleRules": {
        const profile = p.artDirections.find((a) => a.id === cmd.profileId);
        if (!profile || profile.revision !== cmd.sourceRevision)
          throw new Error(tr("errors.m8a404636d7"));
        const lines = migrationLines(profile);
        if (
          lines.length !== cmd.choices.length ||
          new Set(cmd.choices.map((c) => c.index)).size !== lines.length ||
          cmd.choices.some((c) => c.index >= lines.length)
        )
          throw new Error(tr("errors.mf8dc207d83"));
        const clean = emptyStyle(profile.name);
        clean.positiveRules = cmd.choices
          .filter((c) => c.category === "style" && c.text.trim())
          .map((c) => c.text);
        clean.composition = cmd.choices
          .filter((c) => c.category === "composition")
          .map((c) => c.text)
          .join("\n");
        if (!clean.positiveRules.length)
          throw new Error(tr("errors.m3bbfc50fa0"));
        clean.referenceHashes = (profile.styleReferenceIds ?? []).map(
          (id) => p.styleAssets.find((a) => a.id === id)!.sha256,
        );
        const sources = (
          [
            "renderRules",
            "description",
            "lightingRules",
            "colorRules",
            "framingRules",
          ] as const
        )
          .filter((field) => profile[field] !== undefined)
          .map((field) => ({
            field,
            text: profile[field]!,
            sha256: hashBytes(Buffer.from(profile[field]!)),
          }));
        p.styleMigrations.push({
          id: randomUUID(),
          profileId: profile.id,
          sourceRevision: profile.revision,
          createdAt: new Date().toISOString(),
          sources,
          choices: structuredClone(cmd.choices),
        });
        profile.portableStyle = clean;
        profile.renderRules = "Structured rendering rules below.";
        profile.description = "";
        profile.lightingRules = "";
        profile.colorRules = "";
        profile.framingRules = "";
        profile.revision++;
        this.archiveStyle(p, profile);
        break;
      }
      case "importPack": {
        // Revalidate the same bounded wire format even for direct IPC commands.
        const pack = parsePackJSON(JSON.stringify(cmd.pack));
        if (cmd.projectHash !== hashBytes(Buffer.from(JSON.stringify(p))))
          throw new Error(tr("errors.mf5dc2e0f7b"));
        const rows = planPack(p, pack);
        if (
          cmd.choices.length !== rows.length ||
          new Set(cmd.choices.map((c) => c.key)).size !== rows.length ||
          rows.some((r) => !cmd.choices.some((c) => c.key === r.key))
        )
          throw new Error(tr("errors.mb22b7e7ea8"));
        for (const row of rows) {
          const choice = cmd.choices.find((c) => c.key === row.key)!;
          if (choice.action === "skip") continue;
          if (
            choice.action === "update" &&
            (!row.targetId || row.status === "Konflikt")
          )
            throw new Error(tr("errors.m2d8a2925d9"));
          if (pack.format === "laceframe.style") {
            const data = pack.style;
            const target =
              choice.action === "update"
                ? p.artDirections.find((a) => a.id === row.targetId)
                : undefined;
            const refs = p.styleAssets
              .filter((a) => data.referenceHashes.includes(a.sha256))
              .map((a) => a.id)
              .slice(0, 6);
            for (const id of refs) await this.preview(id);
            const fields = {
              name: localImportName(
                data.name,
                p.artDirections
                  .filter((a) => a.id !== target?.id)
                  .map((a) => a.name),
              ),
              portableName: data.name,
              ...data.legacy,
              renderRules: data.legacy.renderRules,
              portableId: pack.id,
              portableRevision: pack.revision,
              portableProvenance: structuredClone(pack.provenance),
              portableStyle: structuredClone(data),
              styleReferenceIds: refs,
            };
            const profile = target ?? {
              id: randomUUID(),
              revision: 0,
              ...fields,
            };
            if (target)
              for (const key of [
                "description",
                "lightingRules",
                "colorRules",
                "framingRules",
              ] as const)
                delete target[key];
            Object.assign(profile, fields);
            profile.revision++;
            if (!target) p.artDirections.push(profile);
            this.archiveStyle(p, profile, false);
            if (!p.defaultArtDirectionId) p.defaultArtDirectionId = profile.id;
          } else {
            const f = pack.families.find((f) => f.id === row.key)!;
            const target =
              choice.action === "update"
                ? p.families.find((a) => a.id === row.targetId)
                : undefined;
            const family = target ?? {
              id: randomUUID(),
              label: f.label,
              slug: f.slug,
              order: p.families.length,
            };
            Object.assign(family, {
              label: f.label,
              slug: localImportName(
                f.slug,
                p.families
                  .filter((a) => a.id !== target?.id)
                  .map((a) => a.slug),
              ),
              portableSlug: f.slug,
              portableId: f.id,
              portableOrigin: {
                id: pack.id,
                revision: pack.revision,
                provenance: structuredClone(pack.provenance),
              },
            });
            if (!target) p.families.push(family);
            for (const v of f.variants) {
              const targets = target
                ? p.variants.filter(
                    (a) =>
                      a.familyId === family.id &&
                      (a.portableId ?? a.id) === v.id,
                  )
                : [];
              if (targets.length > 1) throw new Error(tr("errors.mf24a2879e1"));
              const existing = targets[0];
              const { id: externalId, ...fields } = v;
              if (existing) Object.assign(existing, fields);
              else
                p.variants.push({
                  ...fields,
                  id: randomUUID(),
                  familyId: family.id,
                  portableId: externalId,
                });
            }
          }
        }
        break;
      }
      case "saveMasterPalette": {
        if (this.staged) throw new Error(tr("errors.mf47c9d482e"));
        const master = p.masters.find((m) => m.id === cmd.masterId);
        if (!master || master.sha256 !== cmd.masterSha256)
          throw new Error(tr("errors.m6b6163c0cd"));
        if (new Set(cmd.regions.map((r) => r.id)).size !== cmd.regions.length)
          throw new Error(tr("errors.mcdaf9c9a83"));
        const pixels = await this.analysisSource(master.id);
        const colors = cmd.regions.map((r) => {
          if (
            r.selection &&
            !Buffer.from(replayRegionSelection(pixels, r.selection)).equals(
              Buffer.from(r.weights),
            )
          )
            throw new Error(tr("errors.m4732dcdeb4"));
          return extractPalette(pixels, r.weights);
        });
        await this.colorBackup();
        if (
          cmd.regions.some((r) => r.selection) &&
          !p.masterPalettes.some((p) => p.regions.some((r) => r.selection)) &&
          !p.qualityAssets.some((q) =>
            q.colorCorrection?.regions.some((r) => r.transferGroups),
          )
        )
          await this.colorSelectionBackup();
        const regions = [];
        for (const [i, r] of cmd.regions.entries()) {
          const { weights, selection, ...meta } = r;
          regions.push({
            ...meta,
            ...(selection
              ? {
                  selection: await this.storeRegionSelection(
                    master.width,
                    master.height,
                    selection,
                  ),
                }
              : {}),
            colors: colors[i],
            mask: await this.storeColorMask(
              master.width,
              master.height,
              weights,
            ),
          });
        }
        p.masterPalettes.push({
          id: randomUUID(),
          masterId: master.id,
          masterSha256: master.sha256,
          characterId: master.characterId,
          revision:
            p.masterPalettes.filter((a) => a.masterId === master.id).length + 1,
          createdAt: new Date().toISOString(),
          algorithm: COLOR_VERSION,
          regions,
        });
        break;
      }
      case "createColorCorrection": {
        if (this.staged) throw new Error(tr("errors.mf47c9d482e"));
        const source = this.qualitySource(cmd.sourceId),
          expression = this.colorExpression(source.id);
        const { palette } = await this.colorPalette(cmd.paletteId);
        if (
          palette.masterId !== expression.masterId ||
          palette.characterId !== source.characterId ||
          source.sha256 !== cmd.sourceSha256
        )
          throw new Error(tr("errors.m7eb116c461"));
        if (
          new Set(cmd.regions.map((r) => r.paletteRegionId)).size !==
          cmd.regions.length
        )
          throw new Error(tr("errors.md1c5ae9a8d"));
        const pixels = await this.analysisSource(source.id);
        await this.validateColorTargets(palette.id, cmd.regions);
        const output = correctColors(pixels, {
          paletteId: cmd.paletteId,
          alignmentConfirmed: true,
          regions: cmd.regions,
          protectedWeights: cmd.protectedWeights,
        });
        this.assertRelightLock(
          output,
          await this.relightProtectedPixels(source.id),
        );
        if (hashBytes(output.data) !== cmd.previewPixelSha256)
          throw new Error(tr("errors.md141ff2408"));
        const regions = [];
        for (const { weights, ...r } of cmd.regions)
          regions.push({
            ...r,
            mask: await this.storeColorMask(
              source.width,
              source.height,
              weights,
            ),
          });
        if (
          cmd.regions.some((r) => r.transferGroups) &&
          !p.masterPalettes.some((p) => p.regions.some((r) => r.selection)) &&
          !p.qualityAssets.some((q) =>
            q.colorCorrection?.regions.some((r) => r.transferGroups),
          )
        )
          await this.colorSelectionBackup();
        const protectedMask = await this.storeColorMask(
          source.width,
          source.height,
          cmd.protectedWeights,
        );
        const image = await this.stage(
          encodePixels(output),
          "color-corrected.png",
        );
        try {
          p.qualityAssets.push({
            ...(await this.store("quality", image.token)),
            format: "png",
            id: randomUUID(),
            sourceId: source.id,
            sourceSha256: source.sha256,
            characterId: source.characterId,
            operation: "color-correction",
            version: 1,
            createdAt: new Date().toISOString(),
            status: "candidate",
            colorCorrection: {
              paletteId: palette.id,
              alignmentConfirmed: true,
              algorithm: COLOR_VERSION,
              revision:
                p.qualityAssets.filter(
                  (a) => a.sourceId === source.id && a.colorCorrection,
                ).length + 1,
              pixelSha256: hashBytes(output.data),
              regions,
              protectedMask,
            },
          });
        } finally {
          this.discard(image.token);
        }
        break;
      }

      case "createPixelEdit": {
        if (this.staged) throw new Error(tr("errors.mf47c9d482e"));
        const source = this.qualitySource(cmd.sourceId);
        if (source.sha256 !== cmd.sourceSha256)
          throw new Error(tr("errors.ma3e3b35f28"));
        const pixels = await this.pixelEditSource(source.id);
        if (
          cmd.protectedWeights.length !== pixels.protectedWeights.length ||
          pixels.protectedWeights.some((v, i) => v && !cmd.protectedWeights[i])
        )
          throw new Error(tr("errors.mb94aef9fa1"));
        const output = applyPixelEdit(pixels, cmd.edit, cmd.protectedWeights);
        this.assertRelightLock(
          output,
          await this.relightProtectedPixels(source.id),
        );
        if (hashBytes(output.data) !== cmd.previewPixelSha256)
          throw new Error(tr("errors.md10143792a"));
        if (
          cmd.edit.kind === "spritefusion" &&
          !p.qualityAssets.some(
            (q) => q.pixelEdit?.algorithm === SPRITEFUSION_VERSION,
          ) &&
          !this.legacyBytes
        ) {
          this.legacyBytes = await readLimited(
            await safePath(this.directory, "laceframe.json"),
            MAX_MANIFEST_BYTES,
          );
          this.legacyBackupName = "laceframe.v2.pre-spritefusion.backup.json";
        }
        if (!p.qualityAssets.some((q) => q.pixelEdit) && !this.legacyBytes) {
          this.legacyBytes = await readLimited(
            await safePath(this.directory, "laceframe.json"),
            MAX_MANIFEST_BYTES,
          );
          this.legacyBackupName = "laceframe.v2.pre-pixel-edit.backup.json";
        }
        const protectedMask = await this.storeColorMask(
          source.width,
          source.height,
          cmd.protectedWeights,
        );
        const edit =
          cmd.edit.kind !== "color"
            ? cmd.edit
            : {
                kind: "color" as const,
                rule: cmd.edit.rule,
                mask: await this.storeColorMask(
                  source.width,
                  source.height,
                  cmd.edit.weights,
                ),
              };
        const image = await this.stage(
          output.png ?? encodePixels(output),
          "pixel-edit.png",
        );
        const operation =
          cmd.edit.kind !== "color"
            ? ("pixel-snap" as const)
            : ("color-adjustment" as const);
        try {
          p.qualityAssets.push({
            ...(await this.store("quality", image.token)),
            format: "png",
            id: randomUUID(),
            sourceId: source.id,
            sourceSha256: source.sha256,
            characterId: source.characterId,
            operation,
            version: 1,
            createdAt: new Date().toISOString(),
            status: "candidate",
            pixelEdit: {
              algorithm:
                cmd.edit.kind === "spritefusion"
                  ? SPRITEFUSION_VERSION
                  : "spritefusion-native-rgba-v1",
              revision:
                p.qualityAssets.filter(
                  (q) => q.sourceId === source.id && q.operation === operation,
                ).length + 1,
              pixelSha256: hashBytes(output.data),
              protectedMask,
              edit,
            },
          });
        } finally {
          this.discard(image.token);
        }
        break;
      }

      case "createRelighting": {
        if (this.staged) throw new Error(tr("errors.mf47c9d482e"));
        const source = this.qualitySource(cmd.sourceId);
        const pixels = await this.relightSource(source.id);
        if (pixels.sha256 !== cmd.sourceSha256)
          throw new Error(tr("errors.m80b205ce63"));
        const ids = new Set(cmd.regions.map((r) => r.id));
        if (ids.size !== cmd.regions.length)
          throw new Error(tr("errors.mb823555270"));
        for (const r of cmd.regions)
          if (r.reusedExpressionMask) {
            const m = p.masks.find((m) => m.id === r.reusedExpressionMask!.id);
            if (
              !m ||
              m.characterId !== source.characterId ||
              m.width !== source.width ||
              m.height !== source.height ||
              m.sha256 !== r.reusedExpressionMask.sha256 ||
              m.revision !== r.reusedExpressionMask.revision
            )
              throw new Error(tr("errors.mfb821e3cd7"));
            const original = maskWeights(
              decodePixels(await this.verifiedBytes(m.id)),
            );
            if (!Buffer.from(original).equals(Buffer.from(r.weights)))
              throw new Error(tr("errors.m4a65bba6ef"));
          }
        const output = relightPixels(pixels, cmd.light, cmd.regions);
        this.assertRelightLock(
          output,
          await this.relightProtectedPixels(source.id),
        );
        if (hashBytes(output.data) !== cmd.previewPixelSha256)
          throw new Error(tr("errors.mb9e22aca9b"));
        // First semantic relighting write keeps an exact pre-feature manifest for older strict readers.
        if (!p.qualityAssets.some((q) => q.relighting) && !this.legacyBytes) {
          this.legacyBytes = await readLimited(
            await safePath(this.directory, manifestName),
            MAX_MANIFEST_BYTES,
          );
          this.legacyBackupName = "laceframe.v2.pre-relighting.backup.json";
        }
        const regions: RelightRecord["regions"] = [];
        for (const { weights, ...r } of cmd.regions) {
          const image = await this.stage(
            encodeMask(source.width, source.height, weights),
            "lighting-mask.png",
          );
          try {
            const m = await this.store("relight-masks", image.token);
            const previous = p.qualityAssets
              .flatMap((q) => q.relighting?.regions ?? [])
              .filter((old) => old.id === r.id)
              .sort((a, b) => b.revision - a.revision)[0];
            regions.push({
              ...r,
              revision: previous
                ? previous.mask.sha256 === m.sha256
                  ? previous.revision
                  : previous.revision + 1
                : 1,
              mask: { sha256: m.sha256, file: m.file, type: "lighting-weight" },
            });
          } finally {
            this.discard(image.token);
          }
        }
        const image = await this.stage(encodePixels(output), "relit.png");
        try {
          p.qualityAssets.push({
            ...(await this.store("quality", image.token)),
            format: "png",
            id: randomUUID(),
            characterId: source.characterId,
            sourceId: source.id,
            sourceSha256: source.sha256,
            operation: "relighting",
            version: 1,
            createdAt: new Date().toISOString(),
            status: "candidate",
            relighting: {
              revision:
                p.qualityAssets.filter(
                  (q) => q.sourceId === source.id && q.relighting,
                ).length + 1,
              algorithm: RELIGHT_VERSION,
              geometry: "2d-gradient-no-normals",
              light: cmd.light,
              pixelSha256: hashBytes(output.data),
              regions,
            },
          });
        } finally {
          this.discard(image.token);
        }
        break;
      }
      case "createCutout":
      case "deriveResolution": {
        if (this.staged) throw new Error(tr("errors.mb35383fb68"));
        const source = this.qualitySource(cmd.sourceId),
          bytes = await this.verifiedBytes(source.id),
          pixels = await this.pixels(bytes);
        let smartRecord: SmartCutoutRecord | undefined;
        if (cmd.type === "createCutout" && cmd.smart) {
          const result = selectBackground(pixels, cmd.smart);
          if (!Buffer.from(result.weights).equals(Buffer.from(cmd.weights)))
            throw new Error(tr("errors.m42110201eb"));
          const previous = cmd.smart.previousId
            ? p.qualityAssets.find((q) => q.id === cmd.smart!.previousId)
            : undefined;
          if (
            cmd.smart.previousId &&
            (!previous?.smartCutout ||
              previous.sourceId !== source.id ||
              previous.characterId !== source.characterId)
          )
            throw new Error(tr("errors.m4f13951bb0"));
        }
        const output =
          cmd.type === "createCutout"
            ? cutoutPixels(pixels, cmd.weights)
            : resizePixels(pixels, cmd.profile);
        if (cmd.type === "createCutout") {
          let root = source;
          const seen = new Set<string>();
          while ("sourceId" in root) {
            if (seen.has(root.id)) throw new Error(tr("errors.m9a125cf039"));
            seen.add(root.id);
            root = this.qualitySource(root.sourceId);
          }
          const expression = p.assets.find((a) => a.id === root.id),
            attempt = p.attempts.find((a) => a.id === expression?.attemptId);
          if (attempt?.mask) {
            if (!expression?.composite)
              throw new Error(tr("errors.m55dc009e4e"));
            const master = p.masters.find((a) => a.id === expression.masterId)!,
              saved = p.masks.find((a) => a.id === attempt.mask!.id)!;
            const m = decodePixels(await this.verifiedBytes(master.id)),
              weights = maskWeights(
                decodePixels(await this.verifiedBytes(saved.id)),
              );
            if (output.width !== m.width || output.height !== m.height)
              throw new Error(tr("errors.mc37f44e59f"));
            for (let i = 0; i < weights.length; i++)
              if (
                weights[i] === 0 &&
                [0, 1, 2, 3].some(
                  (c) => output.data[i * 4 + c] !== m.data[i * 4 + c],
                )
              )
                throw new Error(tr("errors.m6a54034318"));
          }
        }
        if (cmd.type === "createCutout" && cmd.smart) {
          const previous = cmd.smart.previousId
            ? p.qualityAssets.find((q) => q.id === cmd.smart!.previousId)
            : undefined;
          const masks = {} as SmartCutoutRecord["masks"];
          for (const role of ["manual", "protected", "forced"] as const) {
            const image = await this.stage(
              encodeMask(source.width, source.height, cmd.smart[role]),
              `${role}.png`,
            );
            try {
              const stored = await this.store("cutout-masks", image.token),
                prior = previous?.smartCutout?.masks[role];
              masks[role] = {
                file: stored.file,
                sha256: stored.sha256,
                type: (
                  {
                    manual: "manual-retention",
                    protected: "protected-foreground",
                    forced: "forced-background",
                  } as const
                )[role],
                revision: prior
                  ? prior.revision + Number(prior.sha256 !== stored.sha256)
                  : 1,
              };
            } finally {
              this.discard(image.token);
            }
          }
          smartRecord = {
            algorithm: SMART_CUTOUT_VERSION,
            revision: previous?.smartCutout
              ? previous.smartCutout.revision + 1
              : 1,
            ...(previous ? { previousId: previous.id } : {}),
            settings: cmd.smart.settings,
            masks,
            pixelSha256: "",
          };
        }
        let mask:
          | {
              sha256: string;
              file: string;
              type: "foreground-alpha";
              name: string;
            }
          | undefined;
        if (cmd.type === "createCutout") {
          const b = encodeMask(source.width, source.height, cmd.weights),
            image = await this.stage(b, "foreground-mask.png");
          try {
            const stored = await this.store("cutout-masks", image.token);
            mask = {
              sha256: stored.sha256,
              file: stored.file,
              type: "foreground-alpha",
              name: cmd.name,
            };
          } finally {
            this.discard(image.token);
          }
        }
        const image = await this.stage(encodePixels(output), "quality.png");
        try {
          p.qualityAssets.push({
            ...(await this.store("quality", image.token)),
            format: "png",
            id: randomUUID(),
            characterId: source.characterId,
            sourceId: source.id,
            sourceSha256: source.sha256,
            operation: cmd.type === "createCutout" ? "cutout" : "resolution",
            version: 1,
            createdAt: new Date().toISOString(),
            status: "candidate",
            ...(mask ? { mask } : {}),
            ...(smartRecord
              ? {
                  smartCutout: {
                    ...smartRecord,
                    pixelSha256: hashBytes(output.data),
                  },
                }
              : {}),
            ...(cmd.type === "deriveResolution"
              ? { profile: cmd.profile }
              : {}),
          });
        } finally {
          this.discard(image.token);
        }
        break;
      }
      case "reviewQuality": {
        const q = p.qualityAssets.find((a) => a.id === cmd.id);
        if (!q || q.status !== "candidate")
          throw new Error(tr("errors.m8157c9d3e2"));
        if (cmd.status === "approved") {
          await this.verifyPendingQuality(q.id);
          const report = await this.qualityReport(q.id);
          if (report.status !== "transparent")
            throw new Error(tr("errors.med661664f7"));
          let source = this.qualitySource(q.sourceId);
          let resized = q.operation === "resolution";
          const visited = new Set<string>();
          while ("sourceId" in source) {
            if (visited.has(source.id))
              throw new Error(tr("errors.m9a125cf039"));
            visited.add(source.id);
            resized ||= source.operation === "resolution";
            source = this.qualitySource(source.sourceId);
          }
          const c = character(q.characterId),
            now = new Date().toISOString();
          if (this.staged) throw new Error(tr("errors.mb35383fb68"));
          const staged = await this.stage(
            await this.verifiedBytes(q.id),
            "quality-approved.png",
          );
          try {
            const expression = p.assets.find((a) => a.id === source.id);
            // This gate also applies to export-only scaled derivatives, never just promoted expressions.
            if (
              expression &&
              !expression.composite &&
              p.attempts.find((a) => a.id === expression.attemptId)?.mask
            )
              throw new Error(tr("errors.m272a5c68b8"));
            // Resolution derivatives remain independent exports; only native-coordinate cutouts promote assets.
            if (expression && !resized) {
              const id = randomUUID();
              p.assets.push({
                ...expression,
                ...(await this.store("candidates", staged.token)),
                id,
                qualitySourceId: q.id,
                status: "approved",
                createdAt: now,
                reviewedAt: now,
              });
              q.approvedExpressionId = id;
            } else if (!resized) {
              const previous = p.masters.find((m) => m.id === source.id),
                candidate = p.masterCandidates.find((m) => m.id === source.id);
              if (candidate) {
                if (candidate.status !== "candidate")
                  throw new Error(tr("errors.mc179ee4877"));
                validateMasterTarget(
                  p,
                  p.masterAttempts.find((a) => a.id === candidate.attemptId)!,
                );
              }
              if (previous ? c.masterId !== previous.id : !candidate)
                throw new Error(tr("errors.m6b69846fe8"));
              const id = randomUUID();
              p.masters.push({
                ...(await this.store("originals", staged.token)),
                id,
                characterId: c.id,
                version:
                  (p.masters.find((m) => m.id === c.masterId)?.version ?? 0) +
                  1,
                ...(c.masterId ? { previousMasterId: c.masterId } : {}),
                ...(candidate ? { sourceCandidateId: candidate.id } : {}),
                masterReview: await this.checkMasterApproval(q.id, {
                  sourceSha256: q.sha256,
                  identityConfirmed: true,
                  silhouetteConfirmed: true,
                  activationConfirmed: true,
                  rasterConfirmed: cmd.rasterConfirmed,
                  notes: cmd.notes,
                }),
                qualitySourceId: q.id,
                locked: true,
                approvedAt: now,
              });
              c.masterId = id;
              q.approvedMasterId = id;
              if (candidate) {
                const attempt = p.masterAttempts.find(
                  (a) => a.id === candidate.attemptId,
                )!;
                c.profile = attempt.composition.profile;
                c.styleSelection = attempt.artDirectionId
                  ? { mode: "profile", profileId: attempt.artDirectionId }
                  : { mode: "master" };
                p.outfits.push({
                  id: randomUUID(),
                  characterId: c.id,
                  name: tr("errors.m87055258fa", {
                    v0: p.masters.at(-1)!.version,
                  }),
                  notes: attempt.outfit,
                });
              }
            }
          } finally {
            this.discard(staged.token);
          }
        }
        q.status = cmd.status;
        q.notes = cmd.notes;
        q.reviewedAt = new Date().toISOString();
        break;
      }
      case "importIdentityReference": {
        const c = character(cmd.characterId);

        if (
          p.identityAssets.filter((a) => a.characterId === c.id && !a.removedAt)
            .length >= 3
        )
          throw new Error(tr("errors.mc957c9df71"));
        const { image, bytes } = this.pending(cmd.token);
        inspectIdentityImage(bytes);
        await this.decode(bytes, image.width, image.height, image.format);
        if (
          p.identityAssets.some(
            (a) =>
              a.characterId === c.id &&
              a.sha256 === image.sha256 &&
              !a.removedAt,
          )
        )
          throw new Error(tr("errors.m08dc356275"));
        const file = `assets/identities/${image.sha256}.${image.format}`;
        await fs.mkdir(await safePath(this.directory, "assets/identities"), {
          recursive: true,
        });
        const destination = await safePath(this.directory, file);
        try {
          await fs.writeFile(destination, bytes, { flag: "wx", mode: 0o444 });
        } catch (e) {
          if (
            (e as NodeJS.ErrnoException).code !== "EEXIST" ||
            !(await readLimited(destination, MAX_IMAGE_BYTES)).equals(bytes)
          )
            throw new Error(tr("errors.m414bbe0825"), { cause: e });
        }
        p.identityAssets.push({
          id: randomUUID(),
          file,
          characterId: c.id,
          sha256: image.sha256,
          width: image.width,
          height: image.height,
          format: image.format,
          createdAt: new Date().toISOString(),
        });
        break;
      }
      case "removeIdentityReference": {
        const asset = p.identityAssets.find(
          (a) => a.id === cmd.id && !a.removedAt,
        );
        if (!asset) throw new Error(tr("errors.m348d56db5b"));
        await this.preview(asset.id);
        const referenced = p.masterAttempts.some((a) =>
          a.identityReferences.some((r) => r.id === asset.id),
        );
        if (referenced) asset.removedAt = new Date().toISOString();
        else {
          p.identityAssets = p.identityAssets.filter((a) => a.id !== asset.id);
          if (!p.identityAssets.some((a) => a.file === asset.file))
            removeFile = { file: asset.file, sha256: asset.sha256 };
        }
        break;
      }
      case "prepareCharacterMaster": {
        validateCreatorSelection(p, cmd.draft);
        if (cmd.draft.baseMasterId) await this.preview(cmd.draft.baseMasterId);
        if (
          transparencyConflicts(
            cmd.draft.prompt.replaceAll(TRANSPARENT_CHARACTER_INSTRUCTION, ""),
          )
        )
          throw new Error(tr("errors.md4dc2ff574"));
        for (const r of [
          ...cmd.draft.identityReferences,
          ...cmd.draft.styleReferences,
        ])
          await this.preview(r.id);
        const { operation: _, prompt, ...selection } = cmd.draft;
        void _;
        const now = new Date().toISOString();
        p.masterAttempts.push({
          ...selection,
          id: randomUUID(),
          providerId: "codex-native",
          createdAt: now,
          promptRevision: {
            id: randomUUID(),
            createdAt: now,
            compositionVersion: 1,
            prompt: protectMasterPrompt(prompt),
          },
        });
        break;
      }
      case "reviewMasterCandidate": {
        const candidate = p.masterCandidates.find((a) => a.id === cmd.id);
        if (!candidate || candidate.status !== "candidate")
          throw new Error(tr("errors.mf1242c9e53"));
        const c = character(candidate.characterId);
        await this.preview(candidate.id);
        if (cmd.status === "approved") {
          const attempt = p.masterAttempts.find(
            (a) => a.id === candidate.attemptId,
          )!;
          validateMasterTarget(p, attempt);
          const masterReview = await this.checkMasterApproval(
            candidate.id,
            cmd.review,
          );
          const previous = p.masters.find((m) => m.id === c.masterId);
          const bytes = await this.verifiedBytes(candidate.id);
          if (this.staged) throw new Error(tr("errors.m58fcdba47b"));
          const image = await this.stage(bytes, "approved-master");
          try {
            const id = randomUUID();
            p.masters.push({
              ...(await this.store("originals", image.token)),
              id,
              characterId: c.id,
              version: (previous?.version ?? 0) + 1,
              ...(previous ? { previousMasterId: previous.id } : {}),
              sourceCandidateId: candidate.id,
              masterReview,
              locked: true,
              approvedAt: new Date().toISOString(),
            });
            c.masterId = id;
            candidate.approvedMasterId = id;
            const attempt = p.masterAttempts.find(
              (a) => a.id === candidate.attemptId,
            )!;
            c.profile = attempt.composition.profile;
            c.styleSelection = attempt.artDirectionId
              ? { mode: "profile", profileId: attempt.artDirectionId }
              : { mode: "master" };
            p.outfits.push({
              id: randomUUID(),
              characterId: c.id,
              name: tr("errors.m87055258fa", { v0: p.masters.at(-1)!.version }),
              notes: attempt.outfit,
            });
          } finally {
            this.discard(image.token);
          }
        }
        candidate.status = cmd.status;
        candidate.reviewedAt = new Date().toISOString();
        break;
      }
      case "saveMask": {
        const master = p.masters.find((m) => m.id === cmd.masterId);
        const previous = p.masks.find((m) => m.id === cmd.previousId);
        if (
          !master ||
          (cmd.previousId && (!previous || previous.masterId !== master.id))
        )
          throw new Error(tr("errors.mc55071f62a"));
        if (
          previous &&
          p.masks.some(
            (m) =>
              m.seriesId === previous.seriesId &&
              m.revision > previous.revision,
          )
        )
          throw new Error(tr("errors.ma7c491f1b6"));
        await this.preview(master.id);
        const bytes = encodeMask(master.width, master.height, cmd.weights);
        // Derived asset has its own staging lifecycle; never replace the user's pending import.
        if (this.staged) throw new Error(tr("errors.mb35383fb68"));
        const staged = await this.stage(bytes, "mask.png");
        try {
          p.masks.push({
            ...(await this.store("masks", staged.token)),
            format: "png",
            id: randomUUID(),
            name: cmd.name,
            characterId: master.characterId,
            masterId: master.id,
            masterSha256: master.sha256,
            seriesId: previous?.seriesId ?? randomUUID(),
            revision: (previous?.revision ?? 0) + 1,
            createdAt: new Date().toISOString(),
          });
        } finally {
          this.discard(staged.token);
        }
        break;
      }
      case "createComposite": {
        const raw = p.assets.find((a) => a.id === cmd.rawId && !a.composite);
        const attempt = p.attempts.find((a) => a.id === raw?.attemptId);
        const mask = p.masks.find((m) => m.id === attempt?.mask?.id);
        const master = p.masters.find((m) => m.id === raw?.masterId);
        if (
          !raw ||
          !attempt?.mask ||
          !mask ||
          !master ||
          mask.masterId !== master.id
        )
          throw new Error(tr("errors.mc516e84d84"));
        if (attempt.execution && attempt.execution.status !== "completed")
          throw new Error(tr("errors.m2dee9e8bb7"));
        if (
          p.assets.some(
            (a) =>
              a.composite?.rawId === raw.id && a.composite.maskId === mask.id,
          )
        )
          throw new Error(tr("errors.mb6459c16f4"));
        if (raw.width !== master.width || raw.height !== master.height)
          throw new Error(tr("errors.m3a1ea2b9ab"));
        const pixels = await Promise.all(
          [master, raw, mask].map(async (image) => {
            await this.preview(image.id);
            const b = await readLimited(
              await safePath(this.directory, image.file),
              MAX_IMAGE_BYTES,
            );
            if (hashBytes(b) !== image.sha256)
              throw new Error(tr("errors.ma64f97b724"));
            return decodePixels(b);
          }),
        );
        const output = encodePixels(
          compositePixels(pixels[0], pixels[1], pixels[2]),
        );
        if (this.staged) throw new Error(tr("errors.mb35383fb68"));
        const staged = await this.stage(output, "composite.png");
        try {
          const { reviewedAt: _, composite: __, ...source } = raw;
          void _;
          void __;
          p.assets.push({
            ...source,
            ...(await this.store("candidates", staged.token)),
            id: randomUUID(),
            status: "candidate",
            createdAt: new Date().toISOString(),
            composite: {
              rawId: raw.id,
              rawSha256: raw.sha256,
              maskId: mask.id,
              maskSha256: mask.sha256,
              maskRevision: mask.revision,
              version: 2,
              rule: "rgba8-premultiplied-round",
              registration: "user-confirmed-origin",
            },
          });
        } finally {
          this.discard(staged.token);
        }
        break;
      }
      case "prepareAttempt": {
        manualImportProvider.prepare(p, cmd.draft);
        await this.preview(cmd.draft.masterId);
        if (cmd.draft.mask) {
          await this.preview(cmd.draft.mask.id);
          const master = p.masters.find((m) => m.id === cmd.draft.masterId)!;
          const bytes = await readLimited(
            await safePath(this.directory, master.file),
            MAX_IMAGE_BYTES,
          );
          if (hashBytes(bytes) !== master.sha256)
            throw new Error(tr("errors.ma64f97b724"));
          decodePixels(bytes); // Unsupported master formats fail before any native image turn.
        }
        const { basePrompt, prompt, supplementaryInstructions, ...selection } =
          cmd.draft;
        const now = new Date().toISOString();
        p.attempts.push({
          ...selection,
          id: randomUUID(),
          createdAt: now,
          promptRevision: {
            id: randomUUID(),
            compositionVersion: 1,
            createdAt: now,
            basePrompt,
            prompt: protectExpressionPrompt(prompt),
            supplementaryInstructions,
          },
        });
        break;
      }
      case "importResult": {
        const attempt = p.attempts.find((a) => a.id === cmd.attemptId);
        if (!attempt) throw new Error(tr("errors.m4c73bac592"));
        if (p.assets.some((a) => a.attemptId === attempt.id))
          throw new Error(tr("errors.mc173d86c3f"));
        if (attempt.providerId !== "manual-import")
          throw new Error(tr("errors.m615a6c40c1"));
        await this.attachResult(p, attempt, cmd.token);
        break;
      }
      case "adoptStyleAnalysis": {
        if (this.staged) throw new Error(tr("errors.mf47c9d482e"));
        const profile = p.artDirections.find((a) => a.id === cmd.profileId);
        if (!profile || profile.revision !== cmd.expectedRevision)
          throw new Error(tr("errors.m42fb08aa8a"));
        if (p.styleAnalyses.length >= 100)
          throw new Error(tr("errors.m84c082bccc"));
        const references: AnalysisResult[] = [];
        for (const ref of cmd.references) {
          const source = await this.analysisSource(ref.id);
          references.push({
            ...ref,
            sha256: source.sha256,
            metrics: measureStyle(source, ref.roi),
          });
        }
        const suggestions = suggestRules(references);
        const fields = adoptedRules(suggestions, cmd.edits);
        if (!fields.renderRules.trim())
          throw new Error(tr("errors.md3a40bd21f"));
        // Explicit adoption also binds these immutable originals as style-only references.
        const images = [];
        for (const ref of references) {
          const source = this.qualitySourceOrStyle(ref.id);
          const bytes = await this.verifiedBytes(ref.id);
          if (bytes.length > MAX_STYLE_BYTES)
            throw new Error(tr("errors.m65158053e3"));
          images.push({ source, bytes, type: ref.type });
        }
        const newHashes = new Set(
          images
            .filter(
              (i) =>
                !p.styleAssets.some(
                  (a) =>
                    a.sha256 === i.source.sha256 &&
                    a.format === i.source.format,
                ),
            )
            .map((i) => i.source.sha256),
        );
        if (p.styleAssets.length + newHashes.size > 128)
          throw new Error(tr("errors.mf03e734434"));
        const ids: string[] = [];
        for (const { source, bytes, type } of images) {
          let asset = p.styleAssets.find(
            (a) => a.sha256 === source.sha256 && a.format === source.format,
          );
          if (!asset) {
            const staged = await this.stage(
              bytes,
              `${type}-${source.id.slice(0, 8)}.${source.format}`,
            );
            try {
              asset = {
                ...(await this.store("styles", staged.token)),
                id: randomUUID(),
                name: staged.name,
                createdAt: new Date().toISOString(),
              };
              p.styleAssets.push(asset);
            } finally {
              this.discard(staged.token);
            }
          }
          if (!ids.includes(asset.id)) ids.push(asset.id);
        }
        Object.assign(profile, fields, { styleReferenceIds: ids });
        profile.revision++;
        this.archiveStyle(p, profile);
        p.styleAnalyses.push({
          id: randomUUID(),
          version: ANALYSIS_VERSION,
          profileId: profile.id,
          profileRevision: profile.revision,
          createdAt: new Date().toISOString(),
          parameters: {
            ...parameters,
            comparisonSteps: [...parameters.comparisonSteps],
          },
          references,
          suggestions,
          edits: structuredClone(cmd.edits),
        });
        break;
      }
      case "addArtDirection": {
        const id = randomUUID();
        const { type: _, ...fields } = cmd;
        void _;
        for (const ref of fields.styleReferenceIds ?? [])
          await this.preview(ref);
        const profile = { id, revision: 1, ...fields };
        p.artDirections.push(profile);
        this.archiveStyle(p, profile);
        if (!p.defaultArtDirectionId) p.defaultArtDirectionId = id;
        break;
      }
      case "updateArtDirection": {
        const profile = p.artDirections.find((a) => a.id === cmd.id);
        if (!profile) throw new Error(tr("errors.mec49f156ff"));
        const { type: _, id: __, ...fields } = cmd;
        void _;
        void __;
        for (const ref of fields.styleReferenceIds ?? [])
          await this.preview(ref);
        Object.assign(profile, fields);
        if (profile.portableName) profile.portableName = fields.name;
        profile.revision += 1;
        this.archiveStyle(p, profile);
        break;
      }
      case "setCharacterStyle": {
        const c = character(cmd.characterId);
        c.styleSelection = cmd.selection;
        break;
      }
      case "importStyleReference": {
        const profile = p.artDirections.find((a) => a.id === cmd.profileId);
        if (!profile || (profile.styleReferenceIds ?? []).length >= 6)
          throw new Error(tr("errors.m6a5072c794"));
        const staged = this.pending(cmd.token);
        if (staged.image.width * staged.image.height > MAX_STYLE_PIXELS)
          throw new Error(tr("errors.m62f1486973"));
        if (staged.bytes.length > MAX_STYLE_BYTES)
          throw new Error(tr("errors.m83b29bab94"));
        const image = await this.store("styles", cmd.token);
        let asset = p.styleAssets.find(
          (a) => a.sha256 === image.sha256 && a.format === image.format,
        );
        if (!asset) {
          asset = {
            ...image,
            id: randomUUID(),
            name: staged.image.name.slice(0, 120),
            createdAt: new Date().toISOString(),
          };
          p.styleAssets.push(asset);
        }
        if ((profile.styleReferenceIds ?? []).includes(asset.id))
          throw new Error(tr("errors.m8918870101"));
        profile.styleReferenceIds = [
          ...(profile.styleReferenceIds ?? []),
          asset.id,
        ];
        profile.revision++;
        this.archiveStyle(p, profile);
        break;
      }
      case "setStyleReferences": {
        const profile = p.artDirections.find((a) => a.id === cmd.profileId);
        if (!profile) throw new Error(tr("errors.m4aa30c9318"));
        for (const id of cmd.ids) {
          const asset = p.styleAssets.find((a) => a.id === id);
          if (!asset) throw new Error(tr("errors.m36305d11df"));
          await this.preview(id);
        }
        profile.styleReferenceIds = cmd.ids;
        profile.revision++;
        this.archiveStyle(p, profile);
        break;
      }
      case "setArtDirection": {
        if (!p.artDirections.some((a) => a.id === cmd.id))
          throw new Error(tr("errors.mec49f156ff"));
        p.defaultArtDirectionId = cmd.id;
        break;
      }
      case "setExpressionPerformance": {
        character(cmd.characterId);
        if (!p.variants.some((v) => v.id === cmd.variantId))
          throw new Error(tr("errors.med0f136abc"));
        const index = p.expressionPerformances.findIndex(
          (e) =>
            e.characterId === cmd.characterId && e.variantId === cmd.variantId,
        );
        const direction = cmd.direction.trim();
        if (!direction) {
          if (index >= 0) p.expressionPerformances.splice(index, 1);
        } else if (index >= 0) {
          p.expressionPerformances[index].direction = direction;
        } else {
          p.expressionPerformances.push({
            characterId: cmd.characterId,
            variantId: cmd.variantId,
            direction,
          });
        }
        break;
      }
      case "addCharacter": {
        const id = randomUUID();
        p.characters.push({ id, name: cmd.name, profile: "portrait-artistic" });
        p.selectedCharacterId = id;
        break;
      }
      case "renameCharacter":
        character(cmd.id).name = cmd.name;
        break;
      case "selectCharacter":
        character(cmd.id);
        p.selectedCharacterId = cmd.id;
        break;
      case "addFamily":
        p.families.push({
          id: randomUUID(),
          label: cmd.label,
          slug: cmd.slug,
          order: p.families.length,
        });
        break;
      case "editFamily": {
        const f = p.families.find((f) => f.id === cmd.id);
        if (!f) throw new Error(tr("errors.me5d9a7f08c"));
        Object.assign(f, { label: cmd.label, slug: cmd.slug });
        if (f.portableSlug) f.portableSlug = cmd.slug;
        if (f.portableOrigin) f.portableOrigin.revision++;
        break;
      }
      case "addVariant":
        p.variants.push({
          id: randomUUID(),
          familyId: cmd.familyId,
          label: cmd.label,
          slug: cmd.slug,
          prompt: "",
          suggestedAction: "silent",
        });
        break;
      case "editVariant": {
        const index = p.variants.findIndex((v) => v.id === cmd.variant.id);
        if (index < 0) throw new Error(tr("errors.m5f8c77fd64"));
        p.variants[index] = cmd.variant;
        const family = p.families.find((f) => f.id === cmd.variant.familyId);
        if (family?.portableOrigin) family.portableOrigin.revision++;
        break;
      }
      case "confirmMaster": {
        const c = character(cmd.characterId);
        if (c.masterId) throw new Error(tr("errors.m221821d259"));
        const pending = this.pending(cmd.token);
        const review = masterApprovalInputSchema.parse(cmd.review);
        if (review.sourceSha256 !== pending.image.sha256)
          throw new Error(tr("errors.mb34b88dd4c"));
        const report = analyzePixels(
          await this.pixels(pending.bytes),
          pending.image.format,
        );
        this.requireMasterTransparency(report);
        const masterReview = this.masterReviewRecord(review, report);
        const image = await this.store("originals", cmd.token),
          id = randomUUID();
        p.masters.push({
          ...image,
          id,
          characterId: c.id,
          version: 1,
          masterReview,
          locked: true,
          approvedAt: new Date().toISOString(),
        });
        c.masterId = id;
        break;
      }
      case "importCandidate": {
        const c = character(cmd.characterId),
          master = p.masters.find((m) => m.id === c.masterId);
        if (!master) throw new Error(tr("errors.m5d8bd159d0"));
        if (!p.variants.some((v) => v.id === cmd.variantId))
          throw new Error(tr("errors.m5f8c77fd64"));
        if (this.pending(cmd.token).image.format !== "png")
          throw new Error(tr("errors.me739225d7a"));
        const image = await this.store("candidates", cmd.token);
        p.assets.push({
          ...image,
          id: randomUUID(),
          characterId: c.id,
          masterId: master.id,
          masterSha256: master.sha256,
          variantId: cmd.variantId,
          action: cmd.action,
          status: "candidate",
          createdAt: new Date().toISOString(),
        });
        break;
      }
      case "review": {
        const index = p.assets.findIndex((a) => a.id === cmd.id);
        if (index < 0) throw new Error(tr("errors.m9624621831"));
        const item = p.assets[index];
        if (
          cmd.status === "approved" &&
          !item.composite &&
          p.attempts.find((a) => a.id === item.attemptId)?.mask
        )
          throw new Error(tr("errors.m9e40d80417"));
        p.assets[index] = review(p.assets[index], cmd.status);
        break;
      }
    }
    if (
      (cmd.type === "review" ||
        cmd.type === "reviewMasterCandidate" ||
        cmd.type === "reviewQuality") &&
      cmd.status === "rejected"
    ) {
      const candidate = [
        ...p.assets,
        ...p.masterCandidates,
        ...p.qualityAssets,
      ].find((a) => a.id === cmd.id);
      if (candidate && !hasOtherAssetReference(p, candidate.id)) {
        // Mark metadata before deleting bytes; history prevents reusing an immutable attempt.
        candidate.discardedAt = new Date().toISOString();
        const otherFiles = [
          ...p.masters,
          ...p.assets,
          ...p.masterCandidates,
          ...p.qualityAssets,
          ...p.identityAssets,
          ...p.styleAssets,
        ];
        if (
          !otherFiles.some(
            (a) =>
              a.id !== candidate.id &&
              a.file === candidate.file &&
              !("discardedAt" in a && a.discardedAt),
          )
        )
          removeFile = candidate;
      }
    }
    if (!this.legacyBytes) {
      const before = this.snapshot().project;
      const firstRaster =
        p.masters.some((m) => m.masterReview?.rasterConfirmed) &&
        !before.masters.some((m) => m.masterReview?.rasterConfirmed);
      const candidates = (project: Project) => [
        ...project.assets,
        ...project.masterCandidates,
        ...project.qualityAssets,
      ];
      const firstDiscard =
        candidates(p).some((a) => a.discardedAt) &&
        !candidates(before).some((a) => a.discardedAt);
      if (firstRaster || firstDiscard) {
        this.legacyBytes = await readLimited(
          await safePath(this.directory, "laceframe.json"),
          MAX_MANIFEST_BYTES,
        );
        this.legacyBackupName = firstDiscard
          ? "laceframe.v2.pre-candidate-cleanup.backup.json"
          : "laceframe.v2.pre-raster-review.backup.json";
      }
    }
    p.updatedAt = new Date().toISOString();
    await this.save(p);
    if (removeFile) {
      const file = await safePath(this.directory, removeFile.file);
      if (
        hashBytes(await readLimited(file, MAX_IMAGE_BYTES)) !==
        removeFile.sha256
      )
        throw new Error(tr("errors.m3d9d080fe1"));
      if (process.platform === "win32") await fs.chmod(file, 0o600);
      await fs.unlink(file);
    }
    if (
      cmd.type === "importIdentityReference" ||
      cmd.type === "confirmMaster" ||
      cmd.type === "importCandidate" ||
      cmd.type === "importResult" ||
      cmd.type === "importStyleReference"
    )
      this.staged = undefined;
    return this.snapshot();
  }
  previewPack(json: string): PackPreview {
    const p = this.snapshot().project,
      pack = parsePackJSON(json);
    return {
      pack,
      rows: planPack(p, pack),
      projectHash: hashBytes(Buffer.from(JSON.stringify(p))),
    };
  }
  exportPack(input: PackSelection) {
    const request = packSelectionSchema.parse(input),
      p = this.snapshot().project;
    const profile = p.artDirections.find((a) => a.id === request.profileId);
    if (request.kind === "style" && !profile)
      throw new Error(tr("errors.m5801686dac"));
    if (request.kind === "style" && request.styleScopeReviewed !== true)
      throw new Error(tr("errors.maca29913e3"));
    const pack =
      request.kind === "style"
        ? exportStyle(p, profile!)
        : exportExpressions(
            p,
            request.familyIds ?? p.families.map((f) => f.id),
          );
    return {
      name: tr("errors.mb165f0f395", {
        v0: request.kind,
        v1: pack.id,
        v2: pack.revision,
      }),
      bytes: Buffer.from(serializePack(pack)),
    };
  }
  private archiveStyle(
    p: Project,
    profile: ArtDirection,
    incrementPortable = true,
  ) {
    if (incrementPortable && profile.portableRevision)
      profile.portableRevision++;

    const { id, ...fields } = profile;
    p.artDirectionRevisions.push(structuredClone({ ...fields, profileId: id }));
  }
  async styleFile(id: string, sha256: string) {
    const asset = this.snapshot().project.styleAssets.find(
      (a) => a.id === id && a.sha256 === sha256,
    );
    if (!asset) throw new Error(tr("errors.m304002ede0"));
    await this.preview(id);
    return safePath(this.directory, asset.file);
  }
  private async attachResult(
    p: Project,
    attempt: GenerationAttempt,
    token: string,
  ) {
    if (p.assets.some((a) => a.attemptId === attempt.id))
      throw new Error(tr("errors.ma5f4a85aa9"));
    // An imported result belongs to the saved immutable attempt, even after
    // the project's active style/performance has changed. New drafts are
    // validated against live settings in prepareAttempt, not retroactively here.
    const master = p.masters.find(
      (m) =>
        m.id === attempt.masterId &&
        m.characterId === attempt.characterId &&
        m.sha256 === attempt.masterSha256 &&
        m.locked,
    );
    if (!master || !p.variants.some((v) => v.id === attempt.variantId))
      throw new Error(tr("errors.mb3ff181658"));
    await this.preview(attempt.masterId);
    const image = await this.store("candidates", token);
    p.assets.push({
      ...image,
      id: randomUUID(),
      characterId: attempt.characterId,
      masterId: attempt.masterId,
      masterSha256: attempt.masterSha256,
      variantId: attempt.variantId,
      action: attempt.action,
      status: "candidate",
      createdAt: new Date().toISOString(),
      attemptId: attempt.id,
      promptRevisionId: attempt.promptRevision.id,
      providerId: attempt.providerId,
    });
  }
  /** Main-only native result ingestion. Never callable with renderer-provided paths. */
  async importGeneratedResult(
    attemptId: string,
    bytes: Uint8Array,
    complete?: () => GenerationExecution,
  ): Promise<Snapshot> {
    const p = this.snapshot().project,
      attempt = p.attempts.find(
        (a) => a.id === attemptId && a.providerId === "codex-native",
      );
    if (!attempt) throw new Error(tr("errors.m99da10decf"));
    const staged = await this.stage(bytes, "codex-result");
    try {
      await this.attachResult(p, attempt, staged.token);
      if (complete)
        attempt.execution = generationExecutionSchema.parse(complete());
      p.updatedAt = new Date().toISOString();
      await this.save(p);
      return this.snapshot();
    } finally {
      this.discard(staged.token);
    }
  }
  /** Main-only metadata update; prompt/reference records and binary inputs stay immutable. */
  async recordGeneration(
    attemptId: string,
    execution: GenerationExecution,
  ): Promise<void> {
    const p = this.snapshot().project,
      attempt = [...p.attempts, ...p.masterAttempts].find(
        (a) => a.id === attemptId && a.providerId === "codex-native",
      );
    if (!attempt || attempt.execution?.endedAt)
      throw new Error(tr("errors.m6464a1a1fc"));
    attempt.execution = generationExecutionSchema.parse(execution);
    p.updatedAt = new Date().toISOString();
    await this.save(p);
  }
  async creatorRequest(draft: CharacterCreationDraft) {
    const p = this.snapshot().project;
    validateCreatorSelection(p, draft);
    const files = async (refs: { id: string; sha256: string }[]) =>
      Promise.all(
        refs.map(async (r) => {
          await this.preview(r.id);
          const a = [...p.identityAssets, ...p.styleAssets].find(
            (a) => a.id === r.id && a.sha256 === r.sha256,
          )!;
          return { ...r, path: await safePath(this.directory, a.file) };
        }),
      );
    return {
      ...draft,
      prompt: protectMasterPrompt(draft.prompt),
      identityFiles: await files(draft.identityReferences),
      styleFiles: await files(draft.styleReferences),
    };
  }
  async importMasterGeneration(
    attemptId: string,
    bytes: Uint8Array,
    complete: () => GenerationExecution,
  ) {
    const p = this.snapshot().project,
      attempt = p.masterAttempts.find((a) => a.id === attemptId);
    if (
      !attempt ||
      attempt.execution?.status !== "running" ||
      p.masterCandidates.some((c) => c.attemptId === attemptId)
    )
      throw new Error(tr("errors.m163109f071"));
    const staged = await this.stage(bytes, "master-candidate");
    try {
      p.masterCandidates.push({
        ...(await this.store("master-candidates", staged.token)),
        id: randomUUID(),
        characterId: attempt.characterId,
        attemptId,
        status: "candidate",
        createdAt: new Date().toISOString(),
      });
      const execution = generationExecutionSchema.parse(complete());
      if (execution.status !== "completed")
        throw new Error(tr("errors.mcff07d9d6b"));
      attempt.execution = execution;
      p.updatedAt = new Date().toISOString();
      await this.save(p);
      return this.snapshot();
    } finally {
      this.discard(staged.token);
    }
  }
  private async verifiedBytes(id: string) {
    const p = this.snapshot().project;
    const image = [
      ...p.masters,
      ...p.assets,
      ...p.styleAssets,
      ...p.masks,
      ...p.identityAssets,
      ...p.masterCandidates,
      ...p.qualityAssets,
    ].find((a) => a.id === id);
    if (!image) throw new Error(tr("errors.m6966c74212"));
    const bytes = await readLimited(
      await safePath(this.directory, image.file),
      MAX_IMAGE_BYTES,
    );
    if (hashBytes(bytes) !== image.sha256)
      throw new Error(tr("errors.ma64f97b724"));
    return bytes;
  }
  private async validateColorTargets(
    paletteId: string,
    rules: {
      paletteRegionId: string;
      targetColor: string;
      transferGroups?: { sourceColor: string; targetColor: string }[];
    }[],
  ) {
    const { palette, regions: referenceRegions } =
      await this.colorPalette(paletteId);
    const master = await this.analysisSource(palette.masterId);
    for (const rule of rules) {
      const ref = referenceRegions.find((r) => r.id === rule.paletteRegionId);
      if (!ref) throw new Error(tr("errors.m005b48f925"));
      const targets = new Set([
        rule.targetColor,
        ...(rule.transferGroups ?? []).map((g) => g.targetColor),
      ]);
      for (let i = 0; i < ref.weights.length && targets.size; i++)
        if (ref.weights[i] >= 128 && master.data[i * 4 + 3] >= 128)
          targets.delete(rgbHex(master.data.subarray(i * 4, i * 4 + 3)));
      if (targets.size) throw new Error(tr("errors.m735e571f03"));
    }
  }

  private async readRegionSelection(
    r: RegionSelectionRecord,
    width: number,
    height: number,
  ): Promise<RegionSelection> {
    return {
      ...r,
      base: await this.colorMask(r.base, width, height),
      override: await this.colorMask(r.override, width, height),
      values: await this.colorMask(r.values, width, height),
    };
  }
  private async storeRegionSelection(
    width: number,
    height: number,
    r: RegionSelection,
  ): Promise<RegionSelectionRecord> {
    return {
      ...r,
      base: await this.storeColorMask(width, height, r.base),
      override: await this.storeColorMask(width, height, r.override),
      values: await this.storeColorMask(width, height, r.values),
    };
  }
  private async colorSelectionBackup() {
    const bytes = await readLimited(
      await safePath(this.directory, manifestName),
      MAX_MANIFEST_BYTES,
    );
    const file = path.join(
      this.directory,
      "laceframe.v2.pre-color-selection.backup.json",
    );
    try {
      await fs.writeFile(file, bytes, { flag: "wx", mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      if (
        !Buffer.from(
          await readLimited(
            await safePath(this.directory, path.basename(file)),
            MAX_MANIFEST_BYTES,
          ),
        ).equals(Buffer.from(bytes))
      )
        throw new Error(tr("errors.m7753638c71"), { cause: e });
    }
  }

  private async colorMask(
    ref: { file: string; sha256: string },
    width: number,
    height: number,
  ) {
    if (ref.file !== assetFile("color-masks", ref.sha256, "png"))
      throw new Error(tr("errors.m56c0c39c32"));
    const bytes = await readLimited(
      await safePath(this.directory, ref.file),
      MAX_IMAGE_BYTES,
    );
    if (hashBytes(bytes) !== ref.sha256)
      throw new Error(tr("errors.m9178d201d8"));
    const p = decodePixels(bytes);
    if (p.width !== width || p.height !== height)
      throw new Error(tr("errors.m8e5309b171"));
    return new Uint8Array(maskWeights(p));
  }
  async colorPalette(id: string) {
    const palette = this.snapshot().project.masterPalettes.find(
      (p) => p.id === id,
    );
    if (!palette) throw new Error(tr("errors.m03a913cc57"));
    const master = await this.analysisSource(palette.masterId);
    if (master.sha256 !== palette.masterSha256)
      throw new Error(tr("errors.mb9ae947de7"));
    const regions = [];
    for (const r of palette.regions) {
      const weights = await this.colorMask(r.mask, master.width, master.height);
      if (
        JSON.stringify(extractPalette(master, weights)) !==
        JSON.stringify(r.colors)
      )
        throw new Error(tr("errors.m8f293d8552"));
      const selection = r.selection
        ? await this.readRegionSelection(
            r.selection,
            master.width,
            master.height,
          )
        : undefined;
      if (
        selection &&
        !Buffer.from(replayRegionSelection(master, selection)).equals(
          Buffer.from(weights),
        )
      )
        throw new Error(tr("errors.m28534643a6"));
      regions.push({ ...r, weights, selection });
    }
    return { palette, regions };
  }
  private colorExpression(id: string) {
    let source = this.qualitySource(id);
    const seen = new Set<string>();
    while ("sourceId" in source) {
      if (seen.has(source.id) || seen.size >= 64)
        throw new Error(tr("errors.m476ae426c8"));
      seen.add(source.id);
      source = this.qualitySource(source.sourceId);
    }
    const expression = this.snapshot().project.assets.find(
      (a) => a.id === source.id,
    );
    if (!expression) throw new Error(tr("errors.ma017143896"));
    return expression;
  }
  async colorRecipe(id: string) {
    const q = this.snapshot().project.qualityAssets.find((a) => a.id === id);
    if (!q?.colorCorrection) throw new Error(tr("errors.m559e6b89f4"));
    const recipe = q.colorCorrection;
    const regions = [];
    for (const { mask, ...r } of recipe.regions)
      regions.push({
        ...r,
        weights: await this.colorMask(mask, q.width, q.height),
      });
    return {
      paletteId: recipe.paletteId,
      alignmentConfirmed: true as const,
      regions,
      protectedWeights: await this.colorMask(
        recipe.protectedMask,
        q.width,
        q.height,
      ),
    };
  }
  private async storeColorMask(
    width: number,
    height: number,
    weights: Uint8Array,
  ) {
    const image = await this.stage(
      encodeMask(width, height, weights),
      "color-mask.png",
    );
    try {
      const m = await this.store("color-masks", image.token);
      return { file: m.file, sha256: m.sha256 };
    } finally {
      this.discard(image.token);
    }
  }
  private async colorBackup() {
    if (!this.legacyBytes && !this.snapshot().project.masterPalettes.length) {
      this.legacyBytes = await readLimited(
        await safePath(this.directory, manifestName),
        MAX_MANIFEST_BYTES,
      );
      this.legacyBackupName = "laceframe.v2.pre-color-consistency.backup.json";
    }
  }

  private qualitySource(id: string) {
    const p = this.snapshot().project;
    const image = [
      ...p.masters,
      ...p.assets,
      ...p.masterCandidates,
      ...p.qualityAssets,
    ].find((a) => a.id === id);
    if (!image) throw new Error(tr("errors.m05772dd2f6"));
    return image;
  }
  async pixelEditSource(id: string) {
    const source = this.qualitySource(id);
    const pixels = await this.analysisSource(id);
    validateSnap(pixels);
    await this.verifyPendingQuality(id);
    const protectedWeights = new Uint8Array(source.width * source.height);
    const lock = await this.relightProtectedPixels(id);
    if (lock) {
      if (
        lock.master.width !== source.width ||
        lock.master.height !== source.height
      )
        throw new Error(tr("errors.me673d6086c"));
      lock.weights.forEach((v, i) => {
        if (!v) protectedWeights[i] = 255;
      });
    }
    // Preserve explicit inherited edit protections; never reinterpret cutout masks as protection.
    let ancestor = source;
    const seen = new Set<string>();
    while ("sourceId" in ancestor && !seen.has(ancestor.id)) {
      seen.add(ancestor.id);
      if (ancestor.pixelEdit) {
        const r = await this.pixelRecipe(ancestor.id);
        r.protectedWeights.forEach((v, i) => {
          if (v) protectedWeights[i] = 255;
        });
      }
      if (ancestor.colorCorrection) {
        const r = await this.colorRecipe(ancestor.id);
        r.protectedWeights.forEach((v, i) => {
          if (v) protectedWeights[i] = 255;
        });
      }
      ancestor = this.qualitySource(ancestor.sourceId);
    }
    return { ...pixels, protectedWeights };
  }
  private async pixelRecipe(id: string) {
    const q = this.snapshot().project.qualityAssets.find((q) => q.id === id);
    if (!q?.pixelEdit) throw new Error(tr("errors.m53bd2927ee"));
    const source = this.qualitySource(q.sourceId);
    const load = async (m: { file: string; sha256: string }) => {
      const bytes = await readLimited(
        await safePath(this.directory, m.file),
        MAX_IMAGE_BYTES,
      );
      if (hashBytes(bytes) !== m.sha256)
        throw new Error(tr("errors.m7b3919e07d"));
      const p = decodePixels(bytes);
      if (p.width !== source.width || p.height !== source.height)
        throw new Error(tr("errors.m80f7aa18bf"));
      return maskWeights(p);
    };
    const protectedWeights = await load(q.pixelEdit.protectedMask),
      e = q.pixelEdit.edit;
    const edit: PixelEdit =
      e.kind !== "color"
        ? e
        : {
            kind: "color",
            rule: e.rule,
            weights: new Uint8Array(await load(e.mask)),
          };
    return { edit, protectedWeights };
  }
  async analysisSource(id: string) {
    const source = this.qualitySourceOrStyle(id);
    if (source.width * source.height > MAX_ANALYSIS_PIXELS)
      throw new Error(tr("errors.m3f5a74a34e"));
    const pixels = await this.pixels(await this.verifiedBytes(id));
    return {
      width: pixels.width,
      height: pixels.height,
      data: new Uint8Array(pixels.data),
      sha256: source.sha256,
    };
  }
  /** Trusted, bounded ancestry and byte verification. Old records remain readable/exportable. */
  private async checkedRelightSource(id: string) {
    const p = projectSchema.parse(this.snapshot().project);
    const all = [
      ...p.masters,
      ...p.assets,
      ...p.masterCandidates,
      ...p.qualityAssets,
    ];
    const source = all.find((a) => a.id === id);
    if (!source) throw new Error(tr("errors.m05772dd2f6"));
    if (source.width * source.height > 4_194_304)
      throw new Error(tr("errors.m143b5d733b"));
    const chain: typeof all = [],
      seen = new Set<string>();
    let node = source,
      cutoutId: string | undefined;
    while (true) {
      if (seen.has(node.id) || chain.length >= 64)
        throw new Error(tr("errors.m70589fe480"));
      seen.add(node.id);
      chain.push(node);
      if (node.characterId !== source.characterId)
        throw new Error(tr("errors.m1b63993855"));
      let parentId: string | undefined;
      if ("sourceId" in node) {
        if (
          (!cutoutId || node.operation === "cutout") &&
          (node.status !== "approved" ||
            !node.reviewedAt ||
            !node.notes?.trim())
        )
          throw new Error(tr("errors.m8a115ef97f"));
        if (node.operation === "cutout") cutoutId ??= node.id;
        parentId = node.sourceId;
      } else if ("qualitySourceId" in node && node.qualitySourceId) {
        const qualityId = node.qualitySourceId;
        const q = p.qualityAssets.find((q) => q.id === qualityId);
        if (
          !q ||
          q.status !== "approved" ||
          q.sha256 !== node.sha256 ||
          q.width !== node.width ||
          q.height !== node.height ||
          ("locked" in node
            ? q.approvedMasterId !== node.id
            : q.approvedExpressionId !== node.id)
        )
          throw new Error(tr("errors.mafe126b308"));
        parentId = q.id;
      }
      if (!parentId) break;
      const parent = all.find((a) => a.id === parentId);
      if (!parent) throw new Error(tr("errors.m87d5bde11e"));
      if ("sourceId" in node && parent.sha256 !== node.sourceSha256)
        throw new Error(tr("errors.m148e959df8"));
      node = parent;
    }
    if (!cutoutId) throw new Error(tr("errors.m58fec20563"));
    const pixels = await this.verifyQualityChain(chain.reverse());
    if (
      !pixels ||
      analyzePixels(pixels, source.format).status !== "transparent"
    )
      throw new Error(tr("errors.md0670c97a7"));
    validateRelightSize(pixels);
    return {
      width: pixels.width,
      height: pixels.height,
      data: new Uint8Array(pixels.data),
      sha256: source.sha256,
      cutoutId,
    };
  }
  /** Shared byte/provenance validation for pending quality approval and relighting. */
  private async verifyQualityChain(
    chain: ReturnType<ProjectService["qualitySource"]>[],
  ) {
    let pixels: Pixels | undefined;
    for (const a of chain) {
      const actual = await this.pixels(await this.verifiedBytes(a.id));
      if (actual.width !== a.width || actual.height !== a.height)
        throw new Error(tr("errors.mc01b21282a"));
      if ("sourceId" in a) {
        if (!pixels) throw new Error(tr("errors.m2bab45584c"));
        let expected: Pixels;
        if (a.operation === "cutout") {
          if (!a.mask) throw new Error(tr("errors.m908dcf7850"));
          const bytes = await readLimited(
            await safePath(this.directory, a.mask.file),
            MAX_IMAGE_BYTES,
          );
          if (hashBytes(bytes) !== a.mask.sha256)
            throw new Error(tr("errors.mb794cb3526"));
          const mask = decodePixels(bytes);
          if (mask.width !== a.width || mask.height !== a.height)
            throw new Error(tr("errors.m01d9424e5c"));
          const weights = maskWeights(mask);
          if (a.smartCutout) {
            const draft = await this.smartCutoutRecipe(a.id);
            const verified = selectBackground(pixels, draft);
            if (!Buffer.from(verified.weights).equals(Buffer.from(weights)))
              throw new Error(tr("errors.m92175966a2"));
            if (hashBytes(actual.data) !== a.smartCutout.pixelSha256)
              throw new Error(tr("errors.m81903bad1f"));
          }
          expected = cutoutPixels(pixels, weights);
        } else if (a.operation === "color-correction") {
          if (!a.colorCorrection) throw new Error(tr("errors.mc779a46cb6"));
          const recipe = await this.colorRecipe(a.id);
          await this.validateColorTargets(recipe.paletteId, recipe.regions);
          expected = correctColors(pixels, recipe);
          this.assertRelightLock(
            expected,
            await this.relightProtectedPixels(a.sourceId),
          );
          if (hashBytes(actual.data) !== a.colorCorrection.pixelSha256)
            throw new Error(tr("errors.m0d7576f70e"));
        } else if (a.pixelEdit) {
          const recipe = await this.pixelRecipe(a.id);
          expected = applyPixelEdit(
            pixels,
            recipe.edit,
            recipe.protectedWeights,
          );
          this.assertRelightLock(
            expected,
            await this.relightProtectedPixels(a.sourceId),
          );
          if (hashBytes(actual.data) !== a.pixelEdit.pixelSha256)
            throw new Error(tr("errors.mbf43ec0000"));
        } else if (a.operation === "relighting") {
          if (!a.relighting) throw new Error(tr("errors.m8536133dd4"));
          const recipe = await this.relightRecipe(a.id);
          expected = relightPixels(
            pixels,
            recipe.recipe.light,
            recipe.recipe.regions.map((r, i) => ({
              ...r,
              weights: recipe.weights[i],
            })),
          );
          if (hashBytes(actual.data) !== a.relighting.pixelSha256)
            throw new Error(tr("errors.mfb47732004"));
        } else {
          if (!a.profile) throw new Error(tr("errors.mb88db96a4f"));
          expected = resizePixels(pixels, a.profile);
        }
        if (
          expected.width !== actual.width ||
          expected.height !== actual.height ||
          !Buffer.from(expected.data).equals(Buffer.from(actual.data))
        )
          throw new Error(tr("errors.m3b3c77e140"));
      } else if (
        pixels &&
        (!Buffer.from(pixels.data).equals(Buffer.from(actual.data)) ||
          pixels.width !== actual.width ||
          pixels.height !== actual.height)
      ) {
        throw new Error(tr("errors.m4bff4ab8cf"));
      }
      pixels = actual;
    }
    if (!pixels) throw new Error(tr("errors.mc7482db03d"));
    return pixels;
  }
  private async verifyPendingQuality(id: string) {
    const chain: ReturnType<ProjectService["qualitySource"]>[] = [],
      seen = new Set<string>();
    let a = this.qualitySource(id);
    const characterId = a.characterId;
    while (true) {
      if (seen.has(a.id) || chain.length >= 64 || a.characterId !== characterId)
        throw new Error(tr("errors.m3a9ba80336"));
      seen.add(a.id);
      chain.push(a);
      const parentId =
        "sourceId" in a
          ? a.sourceId
          : "qualitySourceId" in a
            ? a.qualitySourceId
            : undefined;
      if (!parentId) break;
      const parent = this.qualitySource(parentId);
      if ("sourceId" in a && a.sourceSha256 !== parent.sha256)
        throw new Error(tr("errors.m93b923826d"));
      a = parent;
    }
    return this.verifyQualityChain(chain.reverse());
  }
  async relightEligibility(id: string) {
    const selected = this.qualitySource(id);
    if ("discardedAt" in selected && selected.discardedAt)
      return {
        allowed: false,
        reason: tr("errors.m6ef7690686"),
      };
    try {
      const source = await this.checkedRelightSource(id);
      return {
        allowed: true,
        reason: tr("errors.m63553a7cf4"),
        sourceSha256: source.sha256,
        cutoutId: source.cutoutId,
      };
    } catch (error) {
      return {
        allowed: false,
        reason:
          error instanceof Error &&
          !/ENOENT|EACCES|ENOTDIR|ZodError/.test(error.message)
            ? error.message
            : tr("common.m6d82ed6a77"),
      };
    }
  }
  async relightSource(id: string) {
    return this.checkedRelightSource(id);
  }
  async relightRecipe(id: string) {
    const q = this.snapshot().project.qualityAssets.find((q) => q.id === id);
    if (!q?.relighting) throw new Error(tr("errors.m1890f86eb7"));
    const weights = [];
    for (const r of q.relighting.regions) {
      const b = await readLimited(
        await safePath(this.directory, r.mask.file),
        MAX_IMAGE_BYTES,
      );
      if (hashBytes(b) !== r.mask.sha256)
        throw new Error(tr("errors.m1b18ddcdc5"));
      const m = decodePixels(b);
      if (m.width !== q.width || m.height !== q.height)
        throw new Error(tr("errors.maafb16215e"));
      weights.push(maskWeights(m));
    }
    return { recipe: q.relighting, weights };
  }
  private async relightProtectedPixels(id: string) {
    const p = this.snapshot().project;
    let source = this.qualitySource(id);
    const seen = new Set<string>();
    while ("sourceId" in source) {
      if (seen.has(source.id)) throw new Error(tr("errors.m9a125cf039"));
      seen.add(source.id);
      source = this.qualitySource(source.sourceId);
    }
    const expression = p.assets.find((a) => a.id === source.id);
    const attempt = p.attempts.find((a) => a.id === expression?.attemptId);
    if (!attempt?.mask) return undefined;
    if (!expression?.composite) throw new Error(tr("errors.m55dc009e4e"));
    const mask = p.masks.find((m) => m.id === attempt.mask!.id)!;
    return {
      master: decodePixels(await this.verifiedBytes(expression.masterId)),
      weights: maskWeights(decodePixels(await this.verifiedBytes(mask.id))),
    };
  }
  private assertRelightLock(
    output: Pixels,
    lock?: { master: Pixels; weights: Uint8Array },
  ) {
    if (!lock) return;
    if (
      output.width !== lock.master.width ||
      output.height !== lock.master.height
    )
      throw new Error(tr("errors.mfa7de2aa3f"));
    for (let i = 0; i < lock.weights.length; i++)
      if (lock.weights[i] === 0)
        for (let c = 0; c < 4; c++)
          if (output.data[i * 4 + c] !== lock.master.data[i * 4 + c])
            throw new Error(tr("errors.mda59e44857"));
  }
  async cutoutSource(id: string) {
    const source = this.qualitySource(id);
    if (source.width * source.height > MAX_SMART_PIXELS)
      throw new Error(tr("errors.m52540a3b1f"));
    const p = await this.pixels(await this.verifiedBytes(id));
    validateCutoutImage(p);
    return { width: p.width, height: p.height, data: new Uint8Array(p.data) };
  }
  async smartCutoutRecipe(id: string): Promise<CutoutDraft> {
    const q = this.snapshot().project.qualityAssets.find((a) => a.id === id);
    if (!q?.smartCutout) throw new Error(tr("errors.ma7d9245ef2"));
    const result: CutoutDraft = {
      previousId: q.id,
      settings: q.smartCutout.settings,
      manual: new Uint8Array(),
      protected: new Uint8Array(),
      forced: new Uint8Array(),
    };
    for (const role of ["manual", "protected", "forced"] as const) {
      const m = q.smartCutout.masks[role],
        b = await readLimited(
          await safePath(this.directory, m.file),
          MAX_IMAGE_BYTES,
        );
      if (hashBytes(b) !== m.sha256) throw new Error(tr("errors.m6d3267f51b"));
      const p = decodePixels(b);
      if (p.width !== q.width || p.height !== q.height)
        throw new Error(tr("errors.m1814712cef"));
      result[role] = new Uint8Array(maskWeights(p));
    }
    return result;
  }
  async cutoutMask(id: string) {
    const q = this.snapshot().project.qualityAssets.find((q) => q.id === id);
    if (!q?.mask) throw new Error(tr("errors.ma074eb24b8"));
    const b = await readLimited(
      await safePath(this.directory, q.mask.file),
      MAX_IMAGE_BYTES,
    );
    if (hashBytes(b) !== q.mask.sha256)
      throw new Error(tr("errors.mb4d72d1264"));
    return maskWeights(decodePixels(b));
  }
  private requireMasterTransparency(
    report: import("../shared/asset-quality").QualityReport,
  ) {
    if (report.status !== "transparent")
      throw new Error(
        report.status === "opaque"
          ? "Dieser Master-Kandidat hat keinen echten transparenten Hintergrund. Hintergrund freistellen oder erneut generieren."
          : tr("common.md3fc2de0c9"),
      );
  }
  private masterReviewRecord(
    review: MasterApprovalInput,
    report: import("../shared/asset-quality").QualityReport,
  ) {
    if (!review.rasterConfirmed) throw new Error(tr("errors.m0ce17de191"));
    return {
      ...review,
      checkedAt: new Date().toISOString(),
      algorithm: "alpha-review-v1" as const,
      transparent: report.transparent,
      partial: report.partial,
      opaque: report.opaque,
      edgeTransparent: report.edgeTransparent,
      exteriorTransparent: report.exteriorTransparent,
    };
  }
  private async checkMasterApproval(id: string, input: unknown) {
    const source = this.qualitySource(id),
      review = masterApprovalInputSchema.parse(input);
    if (source.sha256 !== review.sourceSha256)
      throw new Error(tr("errors.m4b9671131c"));
    const bytes = await this.verifiedBytes(id),
      pixels = await this.pixels(bytes);
    if (pixels.width !== source.width || pixels.height !== source.height)
      throw new Error(tr("errors.mebe14d9202"));
    const report = analyzePixels(pixels, source.format);
    this.requireMasterTransparency(report);
    return this.masterReviewRecord(review, report);
  }
  async qualityReport(id: string) {
    const source = this.qualitySourceOrStyle(id);
    return analyzePixels(
      await this.pixels(await this.verifiedBytes(id)),
      source.format,
    );
  }
  private qualitySourceOrStyle(id: string) {
    const p = this.snapshot().project;
    const a = [
      ...p.masters,
      ...p.assets,
      ...p.masterCandidates,
      ...p.qualityAssets,
      ...p.styleAssets,
    ].find((a) => a.id === id);
    if (!a) throw new Error(tr("errors.mcf830faf3d"));
    return a;
  }
  /** Main-only export payload; renderer supplies IDs, never destination paths or bytes. */
  async exportPayload(input: unknown) {
    const request = exportAssetSchema.parse(input),
      source = this.qualitySource(request.id),
      p = this.snapshot().project;
    const bytes = await this.verifiedBytes(source.id),
      pixels = await this.pixels(bytes),
      report = analyzePixels(pixels, source.format);
    const approved =
      "locked" in source ||
      ("status" in source && source.status === "approved");
    if (!request.raw && (!approved || report.status !== "transparent"))
      throw new Error(tr("errors.me1f1acb378"));
    const c = p.characters.find((c) => c.id === source.characterId)!;
    const safe = (text: string) =>
      text
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9_-]+/g, "_")
        .slice(0, 100) || "Character";
    const kind =
      "version" in source && "locked" in source
        ? `Master_V${source.version}`
        : "variantId" in source
          ? safe(
              p.variants.find((v) => v.id === source.variantId)?.label ??
                "Expression",
            )
          : "Candidate";
    const name = `${safe(c.name)}_${kind}_${source.width}x${source.height}${request.raw ? "_RAW" : ""}.png`;
    const output = source.format === "png" ? bytes : encodePixels(pixels);
    return {
      name,
      bytes: output,
      provenance: request.provenance
        ? JSON.stringify(
            {
              exportVersion: 1,
              exportedSha256: hashBytes(output),
              pixelDecoding:
                source.format === "png"
                  ? "exact RGBA8 samples"
                  : "Chromium WebP RGBA; hidden transparent RGB may be normalized",
              raw: request.raw,
              source,
              quality: report,
              character: { id: c.id, name: c.name },
              masters: p.masters.filter((m) => m.characterId === c.id),
              masterPalettes: p.masterPalettes.filter(
                (m) => m.characterId === c.id,
              ),
              derivatives: p.qualityAssets.filter(
                (q) => q.characterId === c.id,
              ),
              attempts: p.attempts.filter((a) => a.characterId === c.id),
              masterAttempts: p.masterAttempts.filter(
                (a) => a.characterId === c.id,
              ),
              outfits: p.outfits.filter((a) => a.characterId === c.id),
            },
            null,
            2,
          )
        : undefined,
    };
  }
  async masterFile(id: string): Promise<string> {
    const master = this.snapshot().project.masters.find((m) => m.id === id);
    if (!master) throw new Error(tr("errors.m8a99e53409"));
    await this.preview(id);
    return safePath(this.directory, master.file);
  }
  async preview(id: string): Promise<string> {
    const p = this.snapshot().project;
    const image = [
      ...p.masters,
      ...p.assets,
      ...p.styleAssets,
      ...p.masks,
      ...p.identityAssets,
      ...p.masterCandidates,
      ...p.qualityAssets,
    ].find((a) => a.id === id);
    if (!image) throw new Error(tr("errors.m6966c74212"));
    const bytes = await readLimited(
      await safePath(this.directory, image.file),
      MAX_IMAGE_BYTES,
    );
    if (hashBytes(bytes) !== image.sha256)
      throw new Error(tr("errors.ma64f97b724"));
    const info = p.identityAssets.some((a) => a.id === id)
      ? inspectIdentityImage(bytes)
      : inspectImage(bytes);
    if (
      info.width !== image.width ||
      info.height !== image.height ||
      info.format !== image.format
    )
      throw new Error(tr("errors.m9dc99fcf96"));
    if (p.identityAssets.some((a) => a.id === id))
      await this.decode(bytes, info.width, info.height, info.format);
    if (p.masks.some((m) => m.id === id)) maskWeights(decodePixels(bytes));
    if (p.styleAssets.some((a) => a.id === id))
      await this.decode(bytes, info.width, info.height, info.format);
    return preview(bytes, image.format);
  }
}
