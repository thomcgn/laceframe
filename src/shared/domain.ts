import {
  qualityDerivativeSchema,
  resolutionProfileSchema,
} from "./asset-quality";
import { z } from "zod";
import {
  masterAttemptSchema,
  characterCreationDraftSchema,
} from "./character-creation";
import { compositeSchema, MAX_MASK_PIXELS } from "./masking";
import {
  styleRules,
  revisionSchema,
  styleSelectionSchema,
  MAX_STYLE_PIXELS,
} from "./style";
import { attemptSchema, generationDraftSchema } from "./generation";

export const idSchema = z.uuid();
const label = z.string().trim().min(1).max(120);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const actionSchema = z.enum(["silent", "speaking", "shouting"]);
const imageFields = {
  id: idSchema,
  sha256: sha,
  file: z.string(),
  width: z.number().int().positive().max(16384),
  height: z.number().int().positive().max(16384),
  format: z.enum(["png", "webp"]),
};
export const identityAssetSchema = z
  .object({
    ...imageFields,
    format: z.enum(["png", "webp", "jpg"]),
    characterId: idSchema,
    createdAt: z.iso.datetime(),
    removedAt: z.iso.datetime().optional(),
  })
  .strict()
  .refine((a) => a.width * a.height <= 16_000_000, "Identity image too large");
export const masterCandidateSchema = z
  .object({
    ...imageFields,
    characterId: idSchema,
    attemptId: idSchema,
    status: z.enum(["candidate", "approved", "rejected"]),
    createdAt: z.iso.datetime(),
    reviewedAt: z.iso.datetime().optional(),
    approvedMasterId: idSchema.optional(),
  })
  .strict();
export const masterSchema = z
  .object({
    ...imageFields,
    characterId: idSchema,
    version: z.number().int().positive(),
    previousMasterId: idSchema.optional(),
    qualitySourceId: idSchema.optional(),
    approvedAt: z.iso.datetime(),
    locked: z.literal(true),
  })
  .strict();
export const maskSchema = z
  .object({
    ...imageFields,
    format: z.literal("png"),
    characterId: idSchema,
    masterId: idSchema,
    masterSha256: sha,
    seriesId: idSchema,
    revision: z.number().int().positive(),
    name: label,
    createdAt: z.iso.datetime(),
  })
  .strict()
  .refine((m) => m.width * m.height <= MAX_MASK_PIXELS, "Mask too large");
export const assetSchema = z
  .object({
    ...imageFields,
    characterId: idSchema,
    masterId: idSchema,
    masterSha256: sha,
    variantId: idSchema,
    action: actionSchema,
    status: z.enum(["candidate", "approved", "rejected"]),
    createdAt: z.iso.datetime(),
    reviewedAt: z.iso.datetime().optional(),
    attemptId: idSchema.optional(),
    promptRevisionId: idSchema.optional(),
    providerId: z.string().min(1).max(120).optional(),
    composite: compositeSchema.optional(),
    qualitySourceId: idSchema.optional(),
  })
  .strict();
export const familySchema = z
  .object({
    id: idSchema,
    label,
    slug: label,
    order: z.number().int().nonnegative(),
  })
  .strict();
export const variantSchema = z
  .object({
    id: idSchema,
    familyId: idSchema,
    label,
    slug: label,
    prompt: z.string().max(8000),
    intensity: z.number().min(0).max(1).optional(),
    suggestedAction: actionSchema,
  })
  .strict();
export const artDirectionSchema = z
  .object({
    id: idSchema,
    name: label,
    revision: z.number().int().positive(),
    renderRules: z.string().trim().min(1).max(8000),
    ...styleRules,
  })
  .strict();
export const expressionPerformanceSchema = z
  .object({
    characterId: idSchema,
    variantId: idSchema,
    direction: z.string().trim().min(1).max(8000),
  })
  .strict();
const projectObject = z
  .object({
    schemaVersion: z.literal(2),
    assetQualityVersion: z.literal(1).optional(),
    qualityAssets: z.array(qualityDerivativeSchema).max(10000).default([]),
    id: idSchema,
    name: label,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    selectedCharacterId: idSchema.optional(),
    characters: z
      .array(
        z
          .object({
            id: idSchema,
            name: label,
            // Open profile identifier; this slice creates Portrait Artistic by default.
            profile: label,
            masterId: idSchema.optional(),
            styleSelection: styleSelectionSchema.optional(),
          })
          .strict(),
      )
      .max(1000),
    masters: z.array(masterSchema).max(1000),
    families: z.array(familySchema).max(1000),
    variants: z.array(variantSchema).max(10000),
    assets: z.array(assetSchema).max(10000),
    attempts: z.array(attemptSchema).max(10000),
    artDirections: z.array(artDirectionSchema).max(100).default([]),
    defaultArtDirectionId: idSchema.optional(),
    characterCreationVersion: z.literal(1).optional(),
    identityAssets: z.array(identityAssetSchema).max(3000).default([]),
    masterAttempts: z.array(masterAttemptSchema).max(10000).default([]),
    masterCandidates: z.array(masterCandidateSchema).max(10000).default([]),
    maskingVersion: z.literal(1).optional(),
    masks: z.array(maskSchema).max(1000).default([]),
    visualStyleVersion: z.literal(1).optional(),
    styleAssets: z
      .array(
        z
          .object({ ...imageFields, name: label, createdAt: z.iso.datetime() })
          .strict()
          .refine(
            (a) => a.width * a.height <= MAX_STYLE_PIXELS,
            "Style image exceeds 16 megapixels",
          ),
      )
      .max(128)
      .default([]),
    artDirectionRevisions: z.array(revisionSchema).max(10000).default([]),
    outfits: z
      .array(
        z
          .object({
            id: idSchema,
            characterId: idSchema,
            name: label,
            notes: z.string().max(8000),
          })
          .strict(),
      )
      .max(1000)
      .default([]),
    expressionPerformances: z
      .array(expressionPerformanceSchema)
      .max(10000)
      .default([]),
  })
  .strict();
export const projectSchema = projectObject.superRefine((p, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const allIds = [
    p.id,
    ...[
      ...p.characters,
      ...p.masters,
      ...p.qualityAssets,
      ...p.families,
      ...p.variants,
      ...p.assets,
      ...p.attempts,
      ...p.attempts.map((a) => a.promptRevision),
      ...p.artDirections,
      ...p.styleAssets,
      ...p.masks,
      ...p.identityAssets,
      ...p.masterAttempts,
      ...p.masterCandidates,
      ...p.masterAttempts.map((a) => a.promptRevision),
      ...p.outfits,
    ].map((x) => x.id),
  ];
  if (new Set(allIds).size !== allIds.length) fail("Duplicate IDs");
  if (
    p.selectedCharacterId &&
    !p.characters.some((c) => c.id === p.selectedCharacterId)
  )
    fail("Unknown selected character");
  for (const c of p.characters) {
    const masters = p.masters.filter((m) => m.characterId === c.id);
    if (
      (c.masterId ? masters.at(-1)?.id !== c.masterId : masters.length !== 0) ||
      masters.some(
        (m, i) =>
          m.version !== i + 1 ||
          (i
            ? m.previousMasterId !== masters[i - 1].id
            : Boolean(m.previousMasterId)),
      )
    )
      fail("Invalid locked master selection");
  }
  const qualitySources = [
    ...p.masters,
    ...p.assets,
    ...p.masterCandidates,
    ...p.qualityAssets,
  ];
  for (const q of p.qualityAssets) {
    const source = qualitySources.find((a) => a.id === q.sourceId);
    if (
      !source ||
      source.characterId !== q.characterId ||
      source.sha256 !== q.sourceSha256 ||
      q.sourceId === q.id ||
      q.file !== assetFile("quality", q.sha256, "png")
    )
      fail("Invalid quality source");
    if (
      q.operation === "cutout"
        ? !q.mask ||
          Boolean(q.profile) ||
          q.mask.file !== assetFile("cutout-masks", q.mask.sha256, "png") ||
          source?.width !== q.width ||
          source?.height !== q.height
        : !q.profile ||
          Boolean(q.mask) ||
          q.profile.width !== q.width ||
          q.profile.height !== q.height
    )
      fail("Invalid quality operation");
    const seen = new Set([q.id]);
    let ancestor = source;
    while (ancestor && "sourceId" in ancestor) {
      if (seen.has(ancestor.id)) {
        fail("Cyclic quality source");
        break;
      }
      seen.add(ancestor.id);
      const parentId = ancestor.sourceId;
      ancestor = qualitySources.find((a) => a.id === parentId);
    }
    if (
      (q.status === "candidate") === Boolean(q.reviewedAt) ||
      (q.status !== "approved" &&
        (q.approvedMasterId || q.approvedExpressionId))
    )
      fail("Invalid quality review");
    if (
      q.approvedMasterId &&
      !p.masters.some(
        (m) =>
          m.id === q.approvedMasterId &&
          m.qualitySourceId === q.id &&
          m.sha256 === q.sha256 &&
          m.characterId === q.characterId,
      )
    )
      fail("Invalid quality master");
    if (
      q.approvedExpressionId &&
      !p.assets.some(
        (a) =>
          a.id === q.approvedExpressionId &&
          a.qualitySourceId === q.id &&
          a.sha256 === q.sha256 &&
          a.characterId === q.characterId,
      )
    )
      fail("Invalid quality expression");
  }
  for (const a of [...p.masters, ...p.assets])
    if (
      a.qualitySourceId &&
      !p.qualityAssets.some(
        (q) =>
          q.id === a.qualitySourceId &&
          q.sha256 === a.sha256 &&
          q.status === "approved",
      )
    )
      fail("Invalid quality approval provenance");
  for (const m of p.masters) {
    if (!p.characters.some((c) => c.id === m.characterId))
      fail("Unknown master character");
    if (m.version > 1 && !m.qualitySourceId)
      fail("New master version requires reviewed quality provenance");
    if (m.qualitySourceId) {
      let q = p.qualityAssets.find((q) => q.id === m.qualitySourceId);
      const seen = new Set<string>();
      while (q && p.qualityAssets.some((a) => a.id === q!.sourceId)) {
        if (seen.has(q.id)) break;
        seen.add(q.id);
        q = p.qualityAssets.find((a) => a.id === q!.sourceId);
      }
      if (
        !q ||
        (m.previousMasterId
          ? q.sourceId !== m.previousMasterId
          : !p.masterCandidates.some(
              (c) => c.id === q!.sourceId && c.characterId === m.characterId,
            ))
      )
        fail("Invalid master improvement ancestry");
    }
    if (m.file !== assetFile("originals", m.sha256, m.format))
      fail("Unsafe master path");
  }
  if (
    p.defaultArtDirectionId &&
    !p.artDirections.some((a) => a.id === p.defaultArtDirectionId)
  )
    fail("Unknown default art direction");
  if (
    new Set(p.artDirections.map((a) => a.name.toLowerCase())).size !==
    p.artDirections.length
  )
    fail("Duplicate art direction names");
  if (
    new Set(
      p.expressionPerformances.map((e) => `${e.characterId}/${e.variantId}`),
    ).size !== p.expressionPerformances.length
  )
    fail("Duplicate character expression performance");
  for (const e of p.expressionPerformances)
    if (
      !p.characters.some((c) => c.id === e.characterId) ||
      !p.variants.some((v) => v.id === e.variantId)
    )
      fail("Unknown character expression performance reference");

  for (const c of p.characters)
    if (
      c.styleSelection?.mode === "profile" &&
      !p.artDirections.some(
        (a) => a.id === (c.styleSelection as { profileId: string }).profileId,
      )
    )
      fail("Unknown character style");
  for (const o of p.outfits)
    if (!p.characters.some((c) => c.id === o.characterId))
      fail("Unknown outfit character");
  for (const a of p.styleAssets)
    if (a.file !== assetFile("styles", a.sha256, a.format))
      fail("Unsafe style path");
  const validateStyleRefs = (ids: string[] = []) => {
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => !p.styleAssets.some((a) => a.id === id))
    )
      fail("Invalid style references");
  };
  for (const a of p.artDirections) validateStyleRefs(a.styleReferenceIds);
  const keys = p.artDirectionRevisions.map(
    (r) => `${r.profileId}/${r.revision}`,
  );
  if (new Set(keys).size !== keys.length) fail("Duplicate style revision");
  for (const r of p.artDirectionRevisions) {
    const current = p.artDirections.find((a) => a.id === r.profileId);
    if (!current || r.revision > current.revision)
      fail("Unknown style revision");
    validateStyleRefs(r.styleReferenceIds);
  }
  if (p.visualStyleVersion)
    for (const a of p.artDirections) {
      const { id, ...fields } = a;
      const current = p.artDirectionRevisions.find(
        (r) => r.profileId === id && r.revision === a.revision,
      );
      if (
        !current ||
        JSON.stringify(revisionSchema.parse({ ...fields, profileId: id })) !==
          JSON.stringify(revisionSchema.parse(current))
      )
        fail("Current style revision mismatch");
    }
  const maskKeys = p.masks.map((m) => `${m.seriesId}/${m.revision}`);
  if (new Set(maskKeys).size !== maskKeys.length)
    fail("Duplicate mask revision");
  for (const m of p.masks) {
    const master = p.masters.find((a) => a.id === m.masterId);
    if (
      !master ||
      master.characterId !== m.characterId ||
      master.sha256 !== m.masterSha256 ||
      master.width !== m.width ||
      master.height !== m.height
    )
      fail("Invalid mask master");
    if (m.file !== assetFile("masks", m.sha256, "png"))
      fail("Unsafe mask path");
    const series = p.masks.filter((a) => a.seriesId === m.seriesId);
    if (
      series.some((a) => a.masterId !== m.masterId) ||
      (!series.some((a) => a.revision === m.revision - 1) && m.revision !== 1)
    )
      fail("Invalid mask series");
  }
  for (const a of p.identityAssets) {
    if (
      !p.characters.some((c) => c.id === a.characterId) ||
      a.file !== `assets/identities/${a.sha256}.${a.format}`
    )
      fail("Invalid identity asset");
  }
  for (const c of p.characters)
    if (
      p.identityAssets.filter((a) => a.characterId === c.id && !a.removedAt)
        .length > 3
    )
      fail("Too many identity photos");
  for (const a of p.masterAttempts) {
    if (
      !p.characters.some((c) => c.id === a.characterId) ||
      new Set(a.identityReferences.map((r) => r.id)).size !==
        a.identityReferences.length ||
      a.identityReferences.some(
        (r) =>
          !p.identityAssets.some(
            (i) =>
              i.id === r.id &&
              i.sha256 === r.sha256 &&
              i.characterId === a.characterId,
          ),
      )
    )
      fail("Invalid master attempt identity");
    const revision = p.artDirectionRevisions.find(
      (r) =>
        r.profileId === a.artDirectionId &&
        r.revision === a.artDirectionRevision,
    );
    if (
      (a.artDirectionId === undefined) !==
        (a.artDirectionRevision === undefined) ||
      (a.artDirectionId &&
        (!revision ||
          JSON.stringify(revision.styleReferenceIds ?? []) !==
            JSON.stringify(a.styleReferences.map((r) => r.id)))) ||
      (!a.artDirectionId && a.styleReferences.length) ||
      new Set(a.styleReferences.map((r) => r.id)).size !==
        a.styleReferences.length ||
      a.styleReferences.some(
        (r) =>
          !p.styleAssets.some((i) => i.id === r.id && i.sha256 === r.sha256),
      )
    )
      fail("Invalid master attempt style");
    const results = p.masterCandidates.filter((c) => c.attemptId === a.id);
    if (
      results.length > 1 ||
      (a.execution?.status === "completed" && !results.length)
    )
      fail("Invalid master generation result");
  }
  for (const a of p.masterCandidates) {
    const attempt = p.masterAttempts.find((t) => t.id === a.attemptId);
    if (
      !attempt ||
      attempt.execution?.status !== "completed" ||
      attempt.characterId !== a.characterId ||
      a.file !== assetFile("master-candidates", a.sha256, a.format) ||
      (a.status === "candidate") === Boolean(a.reviewedAt)
    )
      fail("Invalid master candidate");
    const master = p.masters.find((m) => m.id === a.approvedMasterId);
    if (
      a.status === "approved"
        ? !master ||
          master.characterId !== a.characterId ||
          master.sha256 !== a.sha256 ||
          master.width !== a.width ||
          master.height !== a.height
        : Boolean(a.approvedMasterId)
    )
      fail("Invalid master candidate approval");
  }
  for (const v of p.variants)
    if (!p.families.some((f) => f.id === v.familyId))
      fail("Unknown variant family");
  if (new Set(p.families.map((f) => f.slug)).size !== p.families.length)
    fail("Duplicate family slug");
  if (
    new Set(p.variants.map((v) => `${v.familyId}/${v.slug}`)).size !==
    p.variants.length
  )
    fail("Duplicate variant slug");
  for (const attempt of p.attempts) {
    const master = p.masters.find((m) => m.id === attempt.masterId);
    if (
      !master ||
      master.characterId !== attempt.characterId ||
      master.sha256 !== attempt.masterSha256 ||
      !p.variants.some((v) => v.id === attempt.variantId)
    )
      fail("Invalid attempt reference");
    if (attempt.mask) {
      const mask = p.masks.find((m) => m.id === attempt.mask!.id);
      if (
        !mask ||
        mask.masterId !== attempt.masterId ||
        mask.sha256 !== attempt.mask.sha256 ||
        mask.revision !== attempt.mask.revision
      )
        fail("Invalid attempt mask provenance");
    }
    const style = p.artDirections.find((a) => a.id === attempt.artDirectionId);
    if (
      (attempt.artDirectionId === undefined) !==
        (attempt.artDirectionRevision === undefined) ||
      (attempt.artDirectionId &&
        (!style || attempt.artDirectionRevision! > style.revision))
    )
      fail("Invalid attempt art direction reference");

    if (attempt.styleReferences !== undefined) {
      const refs = attempt.styleReferences;
      if (
        new Set(refs.map((r) => r.id)).size !== refs.length ||
        refs.some(
          (r) =>
            !p.styleAssets.some((a) => a.id === r.id && a.sha256 === r.sha256),
        )
      )
        fail("Invalid attempt style provenance");
      const revision = p.artDirectionRevisions.find(
        (r) =>
          r.profileId === attempt.artDirectionId &&
          r.revision === attempt.artDirectionRevision,
      );
      if (
        attempt.artDirectionId &&
        (!revision ||
          JSON.stringify(revision.styleReferenceIds ?? []) !==
            JSON.stringify(refs.map((r) => r.id)))
      )
        fail("Invalid attempt style revision");
      if (!attempt.artDirectionId && refs.length)
        fail("Unlinked style references");
    }
    if (
      attempt.execution?.status === "completed" &&
      !p.assets.some((a) => a.attemptId === attempt.id)
    )
      fail("Completed generation has no result");
    if (
      p.assets.filter(
        (a) => a.attemptId === attempt.id && !a.composite && !a.qualitySourceId,
      ).length > 1
    )
      fail("An attempt has multiple results");
  }
  for (const a of p.assets) {
    const m = p.masters.find((m) => m.id === a.masterId);
    if (!m || m.characterId !== a.characterId || m.sha256 !== a.masterSha256)
      fail("Invalid master provenance");
    if (!p.variants.some((v) => v.id === a.variantId))
      fail("Unknown asset variant");
    if (a.file !== assetFile("candidates", a.sha256, a.format))
      fail("Unsafe candidate path");
    if ((a.status === "candidate") === Boolean(a.reviewedAt))
      fail("Invalid review timestamp");
    if (a.composite) {
      const c = a.composite,
        raw = p.assets.find((r) => r.id === c.rawId && !r.composite);
      const mask = p.masks.find((m) => m.id === c.maskId);
      const attempt = p.attempts.find((t) => t.id === a.attemptId);
      if (
        !raw ||
        !mask ||
        !attempt?.mask ||
        raw.sha256 !== c.rawSha256 ||
        mask.sha256 !== c.maskSha256 ||
        mask.revision !== c.maskRevision ||
        attempt.mask.id !== mask.id ||
        raw.attemptId !== a.attemptId ||
        mask.masterId !== a.masterId ||
        raw.width !== m?.width ||
        raw.height !== m?.height ||
        a.width !== m?.width ||
        a.height !== m?.height ||
        a.format !== "png"
      )
        fail("Invalid composite provenance");
      if (
        p.assets.filter(
          (r) =>
            !r.qualitySourceId &&
            r.composite?.rawId === c.rawId &&
            r.composite?.maskId === c.maskId,
        ).length !== 1
      )
        fail("Duplicate composite");
    }
    if (a.attemptId) {
      const attempt = p.attempts.find((x) => x.id === a.attemptId);
      if (
        !attempt ||
        attempt.characterId !== a.characterId ||
        attempt.masterId !== a.masterId ||
        attempt.masterSha256 !== a.masterSha256 ||
        attempt.variantId !== a.variantId ||
        attempt.action !== a.action ||
        attempt.promptRevision.id !== a.promptRevisionId ||
        attempt.providerId !== a.providerId
      )
        fail("Invalid attempt provenance");
    } else if (a.promptRevisionId || a.providerId)
      fail("Unlinked generation provenance");
  }
});
const legacyProjectSchema = projectObject
  .omit({ attempts: true })
  .extend({ schemaVersion: z.literal(1) })
  .strict();
/** Opening is read-only; the service backs up v1 before its first explicit save. */
export function parseProject(input: unknown) {
  if (
    typeof input === "object" &&
    input !== null &&
    "schemaVersion" in input &&
    input.schemaVersion === 1
  ) {
    return migrateVisualStyle(
      projectSchema.parse({
        ...legacyProjectSchema.parse(input),
        schemaVersion: 2,
        attempts: [],
      }),
    );
  }
  return migrateVisualStyle(projectSchema.parse(input));
}
function migrateVisualStyle(p: z.infer<typeof projectSchema>) {
  if (!p.visualStyleVersion) {
    p.visualStyleVersion = 1;
    for (const profile of p.artDirections) {
      const { id, ...fields } = profile;
      p.artDirectionRevisions.push({ profileId: id, ...fields });
    }
  }
  return projectSchema.parse(p);
}
export type Project = z.infer<typeof projectSchema>;
export type ArtDirection = z.infer<typeof artDirectionSchema>;
export type ExpressionPerformance = z.infer<typeof expressionPerformanceSchema>;
export type Master = z.infer<typeof masterSchema>;
export type ExpressionAsset = z.infer<typeof assetSchema>;
export type Variant = z.infer<typeof variantSchema>;
export type Family = z.infer<typeof familySchema>;
export type VocalAction = z.infer<typeof actionSchema>;
export type Snapshot = { directory: string; project: Project };
export type StagedImage = {
  token: string;
  name: string;
  sha256: string;
  width: number;
  height: number;
  format: "png" | "webp";
  preview: string;
};
export type StagedIdentityImage = Omit<StagedImage, "format"> & {
  format: "png" | "webp" | "jpg";
};
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
export const assetFile = (
  kind:
    | "originals"
    | "candidates"
    | "styles"
    | "masks"
    | "master-candidates"
    | "quality"
    | "cutout-masks",
  hash: string,
  format: "png" | "webp",
) => `assets/${kind}/${hash}.${format}`;
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("createCutout"),
      sourceId: idSchema,
      name: label.default("Freistellung"),
      weights: z
        .instanceof(Uint8Array)
        .refine((v) => v.length <= MAX_MASK_PIXELS),
    })
    .strict(),
  z
    .object({
      type: z.literal("deriveResolution"),
      sourceId: idSchema,
      profile: resolutionProfileSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("reviewQuality"),
      id: idSchema,
      status: z.enum(["approved", "rejected"]),
      notes: z.string().trim().min(1).max(8000),
      confirmStyleAndSilhouette: z.literal(true),
    })
    .strict(),
  z
    .object({
      type: z.literal("importIdentityReference"),
      characterId: idSchema,
      token: idSchema,
    })
    .strict(),
  z
    .object({ type: z.literal("removeIdentityReference"), id: idSchema })
    .strict(),
  z
    .object({
      type: z.literal("prepareCharacterMaster"),
      draft: characterCreationDraftSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("reviewMasterCandidate"),
      id: idSchema,
      status: z.enum(["approved", "rejected"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("saveMask"),
      masterId: idSchema,
      previousId: idSchema.optional(),
      name: label,
      weights: z
        .instanceof(Uint8Array)
        .refine((v) => v.length <= MAX_MASK_PIXELS),
    })
    .strict(),
  z
    .object({
      type: z.literal("createComposite"),
      rawId: idSchema,
      registrationConfirmed: z.literal(true),
    })
    .strict(),
  z
    .object({ type: z.literal("prepareAttempt"), draft: generationDraftSchema })
    .strict(),
  z
    .object({
      type: z.literal("importResult"),
      attemptId: idSchema,
      token: idSchema,
    })
    .strict(),
  z.object({ type: z.literal("addCharacter"), name: label }).strict(),
  z
    .object({
      type: z.literal("addArtDirection"),
      name: label,
      renderRules: z.string().trim().min(1).max(8000),
      ...styleRules,
    })
    .strict(),
  z
    .object({
      type: z.literal("updateArtDirection"),
      id: idSchema,
      name: label,
      renderRules: z.string().trim().min(1).max(8000),
      ...styleRules,
    })
    .strict(),
  z
    .object({
      type: z.literal("importStyleReference"),
      profileId: idSchema,
      token: idSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("setStyleReferences"),
      profileId: idSchema,
      ids: z.array(idSchema).max(6),
    })
    .strict(),
  z
    .object({
      type: z.literal("setCharacterStyle"),
      characterId: idSchema,
      selection: styleSelectionSchema,
    })
    .strict(),
  z.object({ type: z.literal("setArtDirection"), id: idSchema }).strict(),
  z
    .object({
      type: z.literal("setExpressionPerformance"),
      characterId: idSchema,
      variantId: idSchema,
      direction: z.string().max(8000),
    })
    .strict(),
  z
    .object({ type: z.literal("renameCharacter"), id: idSchema, name: label })
    .strict(),
  z.object({ type: z.literal("selectCharacter"), id: idSchema }).strict(),
  z.object({ type: z.literal("addFamily"), label, slug: label }).strict(),
  z
    .object({ type: z.literal("editFamily"), id: idSchema, label, slug: label })
    .strict(),
  z
    .object({
      type: z.literal("addVariant"),
      familyId: idSchema,
      label,
      slug: label,
    })
    .strict(),
  z.object({ type: z.literal("editVariant"), variant: variantSchema }).strict(),
  z
    .object({
      type: z.literal("confirmMaster"),
      characterId: idSchema,
      token: idSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("importCandidate"),
      characterId: idSchema,
      variantId: idSchema,
      action: actionSchema,
      token: idSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("review"),
      id: idSchema,
      status: z.enum(["approved", "rejected"]),
    })
    .strict(),
]);
export type Command = z.infer<typeof commandSchema>;

export function review(
  asset: ExpressionAsset,
  status: "approved" | "rejected",
): ExpressionAsset {
  if (asset.status !== "candidate")
    throw new Error(
      "Bereits geprüft. Für eine neue Prüfung das Bild erneut importieren.",
    );
  return { ...asset, status, reviewedAt: new Date().toISOString() };
}

export function effectiveStyle(p: Project, characterId?: string) {
  const choice = p.characters.find((c) => c.id === characterId)?.styleSelection;
  const id =
    choice?.mode === "master"
      ? undefined
      : choice?.mode === "profile"
        ? choice.profileId
        : p.defaultArtDirectionId;
  return p.artDirections.find((a) => a.id === id);
}
export function referencesForStyle(p: Project, style?: ArtDirection) {
  return (style?.styleReferenceIds ?? []).map((id) => {
    const a = p.styleAssets.find((a) => a.id === id)!;
    return { id: a.id, sha256: a.sha256 };
  });
}
