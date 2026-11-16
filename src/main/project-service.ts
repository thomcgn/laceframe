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
  type Project,
  type Snapshot,
  type StagedImage,
} from "../shared/domain";
import { manualImportProvider } from "./services/providers/manualImport";
import {
  type GenerationAttempt,
  type GenerationExecution,
  generationExecutionSchema,
  draftFromAttempt,
} from "../shared/generation";
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
async function readLimited(file: string, max: number): Promise<Buffer> {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max)
    throw new Error("Datei fehlt, ist unsicher oder zu groß.");
  const bytes = await fs.readFile(file);
  if (bytes.length > max) throw new Error("Datei zu groß.");
  return bytes;
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
  return `data:image/${format};base64,${Buffer.from(bytes).toString("base64")}`;
}

export class ProjectService {
  private directory = "";
  private project?: Project;
  private diskHash = "";
  private legacyBytes?: Buffer;
  private staged?: { image: StagedImage; bytes: Buffer };
  constructor(
    private readonly decode: (
      bytes: Uint8Array,
      width: number,
      height: number,
      format: "png" | "webp",
    ) => void | Promise<void> = () => {},
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
    for (const image of [...project.masters, ...project.assets]) {
      const contents = await readLimited(
        await safePath(root, image.file),
        MAX_IMAGE_BYTES,
      );
      if (hashBytes(contents) !== image.sha256)
        throw new Error(
          "Bildintegrität verletzt. Projekt wurde nicht geöffnet.",
        );
      const info = inspectImage(contents);
      if (
        info.width !== image.width ||
        info.height !== image.height ||
        info.format !== image.format
      )
        throw new Error("Bildmetadaten stimmen nicht überein.");
    }
    this.legacyBytes =
      (raw as { schemaVersion: number }).schemaVersion === 1
        ? bytes
        : undefined;
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
  discard(token: string) {
    if (this.staged?.image.token === token) this.staged = undefined;
  }
  private pending(token: string) {
    if (!this.staged || this.staged.image.token !== token)
      throw new Error("Importvorschau abgelaufen. Bild erneut wählen.");
    return this.staged;
  }
  private async store(kind: "originals" | "candidates", token: string) {
    const { image, bytes } = this.pending(token);
    const relative = assetFile(kind, image.sha256, image.format);
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
    const validated = projectSchema.parse(project);
    const destination = await safePath(this.directory, manifestName);
    if (
      hashBytes(await readLimited(destination, MAX_MANIFEST_BYTES)) !==
      this.diskHash
    )
      throw new Error("Projekt wurde extern geändert. Bitte erneut öffnen.");
    if (this.legacyBytes) {
      const backup = await safePath(this.directory, "laceframe.v1.backup.json");
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
    switch (cmd.type) {
      case "prepareAttempt": {
        manualImportProvider.prepare(p, cmd.draft);
        await this.preview(cmd.draft.masterId);
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
        p.artDirections.push({
          id,
          name: cmd.name,
          revision: 1,
          renderRules: cmd.renderRules,
        });
        if (!p.defaultArtDirectionId) p.defaultArtDirectionId = id;
        break;
      }
      case "updateArtDirection": {
        const profile = p.artDirections.find((a) => a.id === cmd.id);
        if (!profile) throw new Error("Art Direction fehlt.");
        profile.name = cmd.name;
        profile.renderRules = cmd.renderRules;
        profile.revision += 1;
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
          (e) => e.characterId === cmd.characterId && e.variantId === cmd.variantId,
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
        p.assets[index] = review(p.assets[index], cmd.status);
        break;
      }
    }
    p.updatedAt = new Date().toISOString();
    await this.save(p);
    if (
      cmd.type === "confirmMaster" ||
      cmd.type === "importCandidate" ||
      cmd.type === "importResult"
    )
      this.staged = undefined;
    return this.snapshot();
  }
  private async attachResult(
    p: Project,
    attempt: GenerationAttempt,
    token: string,
  ) {
    if (p.assets.some((a) => a.attemptId === attempt.id))
      throw new Error("Versuch hat bereits ein Ergebnis.");
    manualImportProvider.prepare(p, draftFromAttempt(attempt));
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
      attempt = p.attempts.find(
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
  async masterFile(id: string): Promise<string> {
    const master = this.snapshot().project.masters.find((m) => m.id === id);
    if (!master) throw new Error("Unbekannter Master.");
    await this.preview(id);
    return safePath(this.directory, master.file);
  }
  async preview(id: string): Promise<string> {
    const p = this.snapshot().project;
    const image = [...p.masters, ...p.assets].find((a) => a.id === id);
    if (!image) throw new Error("Unbekanntes Bild.");
    const bytes = await readLimited(
      await safePath(this.directory, image.file),
      MAX_IMAGE_BYTES,
    );
    if (hashBytes(bytes) !== image.sha256)
      throw new Error("Bildintegrität verletzt.");
    return preview(bytes, image.format);
  }
}
