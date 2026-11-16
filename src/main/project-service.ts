import {
  relightPixels,
  validateRelightSize,
  RELIGHT_VERSION,
  type RelightRecord,
} from "../shared/relighting";
import { analyzePixels, cutoutPixels, resizePixels } from "./asset-quality";
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
    throw new Error("Unsicherer Projektpfad.");
  let current = root;
  if ((await fs.lstat(root)).isSymbolicLink())
    throw new Error("Projektpfad ist ein Symlink.");
  for (const part of relative.split("/")) {
    current = path.join(current, part);
    if ((await exists(current)) && (await fs.lstat(current)).isSymbolicLink())
      throw new Error("Symlinks im Projekt sind nicht erlaubt.");
  }
  return current;
}
export async function readLimited(file: string, max: number): Promise<Buffer> {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > max)
    throw new Error("Datei fehlt, ist unsicher oder zu groß.");
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
      throw new Error("Datei ist unsicher oder zu groß.");
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
    if (offset > max) throw new Error("Datei zu groß.");
    return bytes.subarray(0, offset);
  } finally {
    await handle.close();
  }
}
export function inspectIdentityImage(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 16 * 1024 * 1024)
    throw new Error("Identitätsbilder dürfen höchstens 16 MiB groß sein.");
  const info = imageSize(bytes);
  if (
    !["png", "webp", "jpg"].includes(info.type ?? "") ||
    !info.width ||
    !info.height ||
    info.width > 16384 ||
    info.height > 16384 ||
    info.width * info.height > 16_000_000
  )
    throw new Error("Identitätsbilder: PNG/JPEG/WebP bis 16 Megapixel.");
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
    throw new Error("Bilder dürfen höchstens 32 MiB groß sein.");
  const info = imageSize(bytes);
  if (
    (info.type !== "png" && info.type !== "webp") ||
    !info.width ||
    !info.height ||
    info.width > 16384 ||
    info.height > 16384 ||
    info.width * info.height > 64_000_000
  )
    throw new Error(
      "Nur PNG/WebP bis 16.384 Pixel Kantenlänge und 64 Megapixel sind erlaubt.",
    );
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
  snapshot(): Snapshot {
    if (!this.project) throw new Error("Bitte zuerst ein Projekt öffnen.");
    return {
      directory: this.directory,
      project: structuredClone(this.project),
    };
  }
  async create(directory: string, name: string): Promise<Snapshot> {
    const root = await fs.realpath(directory);
    if ((await fs.readdir(root)).length)
      throw new Error("Bitte einen leeren Projektordner auswählen.");
    const now = new Date().toISOString();
    const project = projectSchema.parse({
      schemaVersion: 2,
      visualStyleVersion: 1,
      maskingVersion: 1,
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
    ]) {
      const contents = await readLimited(
        await safePath(root, image.file),
        MAX_IMAGE_BYTES,
      );
      if (hashBytes(contents) !== image.sha256)
        throw new Error(
          "Bildintegrität verletzt. Projekt wurde nicht geöffnet.",
        );
      const identity = project.identityAssets.some((a) => a.id === image.id);
      const info = identity
        ? inspectIdentityImage(contents)
        : inspectImage(contents);
      if (
        info.width !== image.width ||
        info.height !== image.height ||
        info.format !== image.format
      )
        throw new Error("Bildmetadaten stimmen nicht überein.");
      if (identity)
        await this.decode(contents, info.width, info.height, info.format);
      if (project.masks.some((m) => m.id === image.id))
        maskWeights(decodePixels(contents));
      if (project.styleAssets.some((a) => a.id === image.id)) {
        if (contents.length > MAX_STYLE_BYTES)
          throw new Error("Stilreferenz überschreitet 8 MiB.");
        await this.decode(contents, info.width, info.height, info.format);
      }
    }
    for (const q of project.qualityAssets)
      if (q.mask) {
        const b = await readLimited(
          await safePath(root, q.mask.file),
          MAX_IMAGE_BYTES,
        );
        if (hashBytes(b) !== q.mask.sha256)
          throw new Error("Freistellungsmaske verändert.");
        const mask = decodePixels(b);
        if (mask.width !== q.width || mask.height !== q.height)
          throw new Error("Falsche Freistellungsmaske.");
        maskWeights(mask);
      }
    for (const q of project.qualityAssets)
      if (q.relighting) {
        const image = decodePixels(
          await readLimited(await safePath(root, q.file), MAX_IMAGE_BYTES),
        );
        if (hashBytes(image.data) !== q.relighting.pixelSha256)
          throw new Error("Licht-Pixelprovenienz verändert.");
        for (const r of q.relighting.regions) {
          const b = await readLimited(
            await safePath(root, r.mask.file),
            MAX_IMAGE_BYTES,
          );
          if (hashBytes(b) !== r.mask.sha256)
            throw new Error("Lichtmaske verändert.");
          const m = decodePixels(b);
          if (m.width !== q.width || m.height !== q.height)
            throw new Error("Falsche Lichtmaske.");
          maskWeights(m);
        }
      }
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
      source.assetQualityVersion !== 1
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
              : "laceframe.v2.pre-asset-quality.backup.json";
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
      throw new Error("Importvorschau abgelaufen. Bild erneut wählen.");
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
      | "relight-masks",
    token: string,
  ) {
    const { image, bytes } = this.pending(token);
    if (image.format === "jpg")
      throw new Error("JPEG ist nur als Identitätsreferenz erlaubt.");
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
        throw new Error("Asset-Kollision oder beschädigte Datei.", {
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
  private async save(project: Project) {
    const validated = projectSchema.parse({
      ...project,
      maskingVersion: 1,
      characterCreationVersion: 1,
      assetQualityVersion: 1,
    });
    const destination = await safePath(this.directory, manifestName);
    if (
      hashBytes(await readLimited(destination, MAX_MANIFEST_BYTES)) !==
      this.diskHash
    )
      throw new Error("Projekt wurde extern geändert. Bitte erneut öffnen.");
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
          throw new Error("Migrationssicherung existiert mit anderem Inhalt.", {
            cause: error,
          });
      }
    }
    const bytes = Buffer.from(JSON.stringify(validated, null, 2));
    if (bytes.length > MAX_MANIFEST_BYTES)
      throw new Error("Projektmanifest zu groß.");
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
      if (!c) throw new Error("Figur fehlt.");
      return c;
    };
    let removeFile: { file: string; sha256: string } | undefined;
    switch (cmd.type) {
      case "createRelighting": {
        if (this.staged) throw new Error("Zuerst den Bildimport abschließen.");
        const source = this.qualitySource(cmd.sourceId);
        const pixels = await this.relightSource(source.id);
        const ids = new Set(cmd.regions.map((r) => r.id));
        if (ids.size !== cmd.regions.length)
          throw new Error("Doppelte Lichtregion.");
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
              throw new Error("Ungültige wiederverwendete Bearbeitungsmaske.");
            const original = maskWeights(
              decodePixels(await this.verifiedBytes(m.id)),
            );
            if (!Buffer.from(original).equals(Buffer.from(r.weights)))
              throw new Error(
                "Wiederverwendete Maske wurde verändert; als eigene Lichtrevision speichern.",
              );
          }
        const output = relightPixels(pixels, cmd.light, cmd.regions);
        this.assertRelightLock(
          output,
          await this.relightProtectedPixels(source.id),
        );
        if (hashBytes(output.data) !== cmd.previewPixelSha256)
          throw new Error(
            "Lichtvorschau veraltet. Aktuelle Berechnung abwarten.",
          );
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
        if (this.staged)
          throw new Error("Zuerst den ausstehenden Bildimport abschließen.");
        const source = this.qualitySource(cmd.sourceId),
          bytes = await this.verifiedBytes(source.id),
          pixels = await this.pixels(bytes);
        const output =
          cmd.type === "createCutout"
            ? cutoutPixels(pixels, cmd.weights)
            : resizePixels(pixels, cmd.profile);
        if (cmd.type === "createCutout") {
          let root = source;
          const seen = new Set<string>();
          while ("sourceId" in root) {
            if (seen.has(root.id)) throw new Error("Zyklische Herkunft.");
            seen.add(root.id);
            root = this.qualitySource(root.sourceId);
          }
          const expression = p.assets.find((a) => a.id === root.id),
            attempt = p.attempts.find((a) => a.id === expression?.attemptId);
          if (attempt?.mask) {
            if (!expression?.composite)
              throw new Error("Hard Lock: Rohbild zuerst compositen.");
            const master = p.masters.find((a) => a.id === expression.masterId)!,
              saved = p.masks.find((a) => a.id === attempt.mask!.id)!;
            const m = decodePixels(await this.verifiedBytes(master.id)),
              weights = maskWeights(
                decodePixels(await this.verifiedBytes(saved.id)),
              );
            if (output.width !== m.width || output.height !== m.height)
              throw new Error(
                "Hard Lock: Freistellung benötigt ursprüngliche Pixelkoordinaten.",
              );
            for (let i = 0; i < weights.length; i++)
              if (
                weights[i] === 0 &&
                [0, 1, 2, 3].some(
                  (c) => output.data[i * 4 + c] !== m.data[i * 4 + c],
                )
              )
                throw new Error(
                  "Hard Lock schützt diese Pixel. Für Hintergrundkorrektur eine neue Masterversion freistellen.",
                );
          }
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
          throw new Error("Ungeprüfte Qualitätsversion auswählen.");
        if (cmd.status === "approved") {
          const report = await this.qualityReport(q.id);
          if (report.status !== "transparent")
            throw new Error(
              "Freistellung erforderlich: deckende, leere oder verdächtige Bilder sind nicht produktionsfertig.",
            );
          let source = this.qualitySource(q.sourceId);
          let resized = q.operation === "resolution";
          const visited = new Set<string>();
          while ("sourceId" in source) {
            if (visited.has(source.id)) throw new Error("Zyklische Herkunft.");
            visited.add(source.id);
            resized ||= source.operation === "resolution";
            source = this.qualitySource(source.sourceId);
          }
          const c = character(q.characterId),
            now = new Date().toISOString();
          if (this.staged)
            throw new Error("Zuerst den ausstehenden Bildimport abschließen.");
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
              throw new Error(
                "Hard Lock: zuerst ein Composite erstellen; Qualitätsvarianten umgehen den Schutz nicht.",
              );
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
              if (
                previous
                  ? c.masterId !== previous.id
                  : !candidate || Boolean(c.masterId)
              )
                throw new Error(
                  "Nur den aktuellen Master verbessern; veraltete oder fremde Kandidaten ersetzen keinen gesperrten Master.",
                );
              const id = randomUUID();
              p.masters.push({
                ...(await this.store("originals", staged.token)),
                id,
                characterId: c.id,
                version: previous ? previous.version + 1 : 1,
                ...(previous ? { previousMasterId: previous.id } : {}),
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
                  name: "Master V1 outfit",
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
        if (c.masterId)
          throw new Error(
            "Master ist gesperrt. Für eine neue Identität eine neue Entwurfsfigur erstellen.",
          );
        if (
          p.identityAssets.filter((a) => a.characterId === c.id && !a.removedAt)
            .length >= 3
        )
          throw new Error("Maximal drei aktive Identitätsreferenzen.");
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
          throw new Error("Identitätsbild bereits vorhanden.");
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
            throw new Error(
              "Identitätsdatei kollidiert oder wurde verändert.",
              { cause: e },
            );
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
        if (!asset) throw new Error("Aktive Identitätsreferenz fehlt.");
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
            prompt,
          },
        });
        break;
      }
      case "reviewMasterCandidate": {
        const candidate = p.masterCandidates.find((a) => a.id === cmd.id);
        if (!candidate || candidate.status !== "candidate")
          throw new Error("Ungeprüften Masterkandidaten auswählen.");
        const c = character(candidate.characterId);
        await this.preview(candidate.id);
        if (cmd.status === "approved") {
          if (c.masterId)
            throw new Error(
              "Master V1 ist gesperrt und kann nicht ersetzt werden.",
            );
          const bytes = await this.verifiedBytes(candidate.id);
          if (this.staged)
            throw new Error("Zuerst den ausstehenden Import abschließen.");
          const image = await this.stage(bytes, "approved-master");
          try {
            const id = randomUUID();
            p.masters.push({
              ...(await this.store("originals", image.token)),
              id,
              characterId: c.id,
              version: 1,
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
              name: "Master V1 outfit",
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
          throw new Error("Ungültige Masken-/Masterzuordnung.");
        if (
          previous &&
          p.masks.some(
            (m) =>
              m.seriesId === previous.seriesId &&
              m.revision > previous.revision,
          )
        )
          throw new Error(
            "Maske wurde inzwischen geändert. Aktuelle Revision laden.",
          );
        await this.preview(master.id);
        const bytes = encodeMask(master.width, master.height, cmd.weights);
        // Derived asset has its own staging lifecycle; never replace the user's pending import.
        if (this.staged)
          throw new Error("Zuerst den ausstehenden Bildimport abschließen.");
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
          throw new Error(
            "Gespeicherten Rohkandidaten und zugeordnete Maske auswählen.",
          );
        if (attempt.execution && attempt.execution.status !== "completed")
          throw new Error("Generierung ist nicht erfolgreich abgeschlossen.");
        if (
          p.assets.some(
            (a) =>
              a.composite?.rawId === raw.id && a.composite.maskId === mask.id,
          )
        )
          throw new Error("Composite existiert bereits.");
        if (raw.width !== master.width || raw.height !== master.height)
          throw new Error(
            "Hard Lock blockiert: unterschiedliche Abmessungen. Keine Skalierung.",
          );
        const pixels = await Promise.all(
          [master, raw, mask].map(async (image) => {
            await this.preview(image.id);
            const b = await readLimited(
              await safePath(this.directory, image.file),
              MAX_IMAGE_BYTES,
            );
            if (hashBytes(b) !== image.sha256)
              throw new Error("Bildintegrität verletzt.");
            return decodePixels(b);
          }),
        );
        const output = encodePixels(
          compositePixels(pixels[0], pixels[1], pixels[2]),
        );
        if (this.staged)
          throw new Error("Zuerst den ausstehenden Bildimport abschließen.");
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
            throw new Error("Bildintegrität verletzt.");
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
            prompt,
            supplementaryInstructions,
          },
        });
        break;
      }
      case "importResult": {
        const attempt = p.attempts.find((a) => a.id === cmd.attemptId);
        if (!attempt) throw new Error("Gespeicherten Versuch auswählen.");
        if (p.assets.some((a) => a.attemptId === attempt.id))
          throw new Error(
            "Versuch hat bereits ein Ergebnis. Neuen Versuch anlegen; vorheriges Ergebnis bleibt erhalten.",
          );
        if (attempt.providerId !== "manual-import")
          throw new Error(
            "Native Ergebnisse können nicht über manuellen Import zugeordnet werden.",
          );
        await this.attachResult(p, attempt, cmd.token);
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
        if (!profile) throw new Error("Art Direction fehlt.");
        const { type: _, id: __, ...fields } = cmd;
        void _;
        void __;
        for (const ref of fields.styleReferenceIds ?? [])
          await this.preview(ref);
        Object.assign(profile, fields);
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
          throw new Error(
            "Stilprofil fehlt oder hat bereits sechs Referenzen.",
          );
        const staged = this.pending(cmd.token);
        if (staged.image.width * staged.image.height > MAX_STYLE_PIXELS)
          throw new Error(
            "Stilreferenzen dürfen höchstens 16 Megapixel haben.",
          );
        if (staged.bytes.length > MAX_STYLE_BYTES)
          throw new Error("Stilreferenzen dürfen höchstens 8 MiB groß sein.");
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
          throw new Error("Stilreferenz ist bereits zugeordnet.");
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
        if (!profile) throw new Error("Stilprofil fehlt.");
        for (const id of cmd.ids) {
          const asset = p.styleAssets.find((a) => a.id === id);
          if (!asset) throw new Error("Stilreferenz fehlt.");
          await this.preview(id);
        }
        profile.styleReferenceIds = cmd.ids;
        profile.revision++;
        this.archiveStyle(p, profile);
        break;
      }
      case "setArtDirection": {
        if (!p.artDirections.some((a) => a.id === cmd.id))
          throw new Error("Art Direction fehlt.");
        p.defaultArtDirectionId = cmd.id;
        break;
      }
      case "setExpressionPerformance": {
        character(cmd.characterId);
        if (!p.variants.some((v) => v.id === cmd.variantId))
          throw new Error("Emotionsvariante fehlt.");
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
        if (!f) throw new Error("Familie fehlt.");
        Object.assign(f, { label: cmd.label, slug: cmd.slug });
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
        if (index < 0) throw new Error("Variante fehlt.");
        p.variants[index] = cmd.variant;
        break;
      }
      case "confirmMaster": {
        const c = character(cmd.characterId);
        if (c.masterId)
          throw new Error(
            "Master V1 ist gesperrt und kann nicht ersetzt werden.",
          );
        const image = await this.store("originals", cmd.token),
          id = randomUUID();
        p.masters.push({
          ...image,
          id,
          characterId: c.id,
          version: 1,
          locked: true,
          approvedAt: new Date().toISOString(),
        });
        c.masterId = id;
        break;
      }
      case "importCandidate": {
        const c = character(cmd.characterId),
          master = p.masters.find((m) => m.id === c.masterId);
        if (!master) throw new Error("Zuerst einen Master bestätigen.");
        if (!p.variants.some((v) => v.id === cmd.variantId))
          throw new Error("Variante fehlt.");
        if (this.pending(cmd.token).image.format !== "png")
          throw new Error("Kandidaten müssen PNG-Dateien sein.");
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
        if (index < 0) throw new Error("Kandidat fehlt.");
        const item = p.assets[index];
        if (
          cmd.status === "approved" &&
          !item.composite &&
          p.attempts.find((a) => a.id === item.attemptId)?.mask
        )
          throw new Error(
            "Hard-Lock-Rohkandidat: zuerst Composite erstellen und manuell prüfen.",
          );
        p.assets[index] = review(p.assets[index], cmd.status);
        break;
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
        throw new Error(
          "Referenz entfernt, aber veränderte Datei nicht gelöscht.",
        );
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
  private archiveStyle(p: Project, profile: ArtDirection) {
    const { id, ...fields } = profile;
    p.artDirectionRevisions.push(structuredClone({ ...fields, profileId: id }));
  }
  async styleFile(id: string, sha256: string) {
    const asset = this.snapshot().project.styleAssets.find(
      (a) => a.id === id && a.sha256 === sha256,
    );
    if (!asset) throw new Error("Stilreferenz fehlt oder wurde verändert.");
    await this.preview(id);
    return safePath(this.directory, asset.file);
  }
  private async attachResult(
    p: Project,
    attempt: GenerationAttempt,
    token: string,
  ) {
    if (p.assets.some((a) => a.attemptId === attempt.id))
      throw new Error("Versuch hat bereits ein Ergebnis.");
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
      throw new Error("Ungültige gespeicherte Master- oder Variantenreferenz.");
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
    if (!attempt) throw new Error("Unbekannter Codex-Versuch.");
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
      throw new Error(
        "Generierungsmetadaten fehlen oder sind bereits abgeschlossen.",
      );
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
      throw new Error("Kein offener Masterauftrag.");
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
        throw new Error("Kein erfolgreich abgeschlossenes Masterergebnis.");
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
    if (!image) throw new Error("Unbekanntes Bild.");
    const bytes = await readLimited(
      await safePath(this.directory, image.file),
      MAX_IMAGE_BYTES,
    );
    if (hashBytes(bytes) !== image.sha256)
      throw new Error("Bildintegrität verletzt.");
    return bytes;
  }
  private qualitySource(id: string) {
    const p = this.snapshot().project;
    const image = [
      ...p.masters,
      ...p.assets,
      ...p.masterCandidates,
      ...p.qualityAssets,
    ].find((a) => a.id === id);
    if (!image) throw new Error("Kein Charakterasset ausgewählt.");
    return image;
  }
  async relightSource(id: string) {
    const source = this.qualitySource(id);
    if (source.width * source.height > 4_194_304)
      throw new Error(
        "Live Relighting: maximal 4 Megapixel; keine automatische Verkleinerung.",
      );
    const pixels = await this.pixels(await this.verifiedBytes(source.id));
    validateRelightSize(pixels);
    return {
      width: pixels.width,
      height: pixels.height,
      data: new Uint8Array(pixels.data),
    };
  }
  async relightRecipe(id: string) {
    const q = this.snapshot().project.qualityAssets.find((q) => q.id === id);
    if (!q?.relighting) throw new Error("Keine gespeicherte Lichtrevision.");
    const weights = [];
    for (const r of q.relighting.regions) {
      const b = await readLimited(
        await safePath(this.directory, r.mask.file),
        MAX_IMAGE_BYTES,
      );
      if (hashBytes(b) !== r.mask.sha256)
        throw new Error("Lichtmaske verändert.");
      const m = decodePixels(b);
      if (m.width !== q.width || m.height !== q.height)
        throw new Error("Falsche Lichtmaske.");
      weights.push(maskWeights(m));
    }
    return { recipe: q.relighting, weights };
  }
  private async relightProtectedPixels(id: string) {
    const p = this.snapshot().project;
    let source = this.qualitySource(id);
    const seen = new Set<string>();
    while ("sourceId" in source) {
      if (seen.has(source.id)) throw new Error("Zyklische Herkunft.");
      seen.add(source.id);
      source = this.qualitySource(source.sourceId);
    }
    const expression = p.assets.find((a) => a.id === source.id);
    const attempt = p.attempts.find((a) => a.id === expression?.attemptId);
    if (!attempt?.mask) return undefined;
    if (!expression?.composite)
      throw new Error("Hard Lock: Rohbild zuerst compositen.");
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
      throw new Error("Hard Lock benötigt ursprüngliche Pixelkoordinaten.");
    for (let i = 0; i < lock.weights.length; i++)
      if (lock.weights[i] === 0)
        for (let c = 0; c < 4; c++)
          if (output.data[i * 4 + c] !== lock.master.data[i * 4 + c])
            throw new Error(
              "Hard Lock schützt diese Pixel. Lichtregion auf erlaubte Pixel begrenzen oder neuen Master verwenden.",
            );
  }
  async cutoutMask(id: string) {
    const q = this.snapshot().project.qualityAssets.find((q) => q.id === id);
    if (!q?.mask) throw new Error("Keine Freistellungsmaske.");
    const b = await readLimited(
      await safePath(this.directory, q.mask.file),
      MAX_IMAGE_BYTES,
    );
    if (hashBytes(b) !== q.mask.sha256) throw new Error("Maske verändert.");
    return maskWeights(decodePixels(b));
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
    if (!a) throw new Error("Unbekanntes Charakter-/Stilasset.");
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
      throw new Error(
        "Kein freigegebenes transparentes Produktionsasset. Freistellen/prüfen oder ausdrücklich als Rohbild exportieren.",
      );
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
    if (!master) throw new Error("Unbekannter Master.");
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
    if (!image) throw new Error("Unbekanntes Bild.");
    const bytes = await readLimited(
      await safePath(this.directory, image.file),
      MAX_IMAGE_BYTES,
    );
    if (hashBytes(bytes) !== image.sha256)
      throw new Error("Bildintegrität verletzt.");
    const info = p.identityAssets.some((a) => a.id === id)
      ? inspectIdentityImage(bytes)
      : inspectImage(bytes);
    if (
      info.width !== image.width ||
      info.height !== image.height ||
      info.format !== image.format
    )
      throw new Error("Bildmetadaten stimmen nicht überein.");
    if (p.identityAssets.some((a) => a.id === id))
      await this.decode(bytes, info.width, info.height, info.format);
    if (p.masks.some((m) => m.id === id)) maskWeights(decodePixels(bytes));
    if (p.styleAssets.some((a) => a.id === id))
      await this.decode(bytes, info.width, info.height, info.format);
    return preview(bytes, image.format);
  }
}
