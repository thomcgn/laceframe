import { z } from "zod";
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
export const masterSchema = z
  .object({
    ...imageFields,
    characterId: idSchema,
    version: z.literal(1),
    approvedAt: z.iso.datetime(),
    locked: z.literal(true),
  })
  .strict();
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
const projectObject = z
  .object({
    schemaVersion: z.literal(2),
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
          })
          .strict(),
      )
      .max(1000),
    masters: z.array(masterSchema).max(1000),
    families: z.array(familySchema).max(1000),
    variants: z.array(variantSchema).max(10000),
    assets: z.array(assetSchema).max(10000),
    attempts: z.array(attemptSchema).max(10000),
  })
  .strict();
export const projectSchema = projectObject.superRefine((p, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  const allIds = [
    p.id,
    ...[
      ...p.characters,
      ...p.masters,
      ...p.families,
      ...p.variants,
      ...p.assets,
      ...p.attempts,
      ...p.attempts.map((a) => a.promptRevision),
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
      masters.length > 1 ||
      (c.masterId ? masters[0]?.id !== c.masterId : masters.length !== 0)
    )
      fail("Invalid locked master selection");
  }
  for (const m of p.masters) {
    if (!p.characters.some((c) => c.id === m.characterId))
      fail("Unknown master character");
    if (m.file !== assetFile("originals", m.sha256, m.format))
      fail("Unsafe master path");
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
    if (p.assets.filter((a) => a.attemptId === attempt.id).length > 1)
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
    return projectSchema.parse({
      ...legacyProjectSchema.parse(input),
      schemaVersion: 2,
      attempts: [],
    });
  }
  return projectSchema.parse(input);
}
export type Project = z.infer<typeof projectSchema>;
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
export const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
export const assetFile = (
  kind: "originals" | "candidates",
  hash: string,
  format: "png" | "webp",
) => `assets/${kind}/${hash}.${format}`;
export const commandSchema = z.discriminatedUnion("type", [
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
