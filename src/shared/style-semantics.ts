import { tr } from "./locales";
import { z } from "zod";
import { parseBoundedJSON } from "./bounded-json";
export const SEMANTIC_VERSION = "lf-semantic-style-v1";
export const styleRoles = [
  "sprite",
  "portrait",
  "environment",
  "ui",
  "general",
] as const;
export const styleRoleSchema = z.enum(styleRoles);
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const sentence = z.string().trim().min(1).max(1200);
const label = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .refine((s) => !/[\r\n]/.test(s));
export const semanticResponseSchema = z
  .object({
    version: z.literal(SEMANTIC_VERSION),
    references: z
      .array(z.object({ sha256: sha, suggestedRole: styleRoleSchema }).strict())
      .min(1)
      .max(6),
    suggestedName: label,
    description: z.string().trim().max(4000),
    observations: z
      .array(
        z
          .object({
            area: z.enum([
              "contours",
              "pixelClusters",
              "shading",
              "materials",
              "abstraction",
              "texture",
              "colorTreatment",
              "lighting",
              "composition",
            ]),
            text: sentence,
            evidence: sentence,
            referenceHashes: z.array(sha).min(1).max(6),
          })
          .strict(),
      )
      .max(24),
    interpretations: z
      .array(
        z
          .object({
            kind: z.enum(["mood", "genre"]),
            label,
            confidence: z.enum(["uncertain", "plausible", "strong"]),
            evidence: sentence,
            referenceHashes: z.array(sha).min(1).max(6),
          })
          .strict(),
      )
      .max(16),
    limitations: z.array(sentence).max(12),
  })
  .strict()
  .superRefine((r, ctx) => {
    for (const area of new Set(r.observations.map((o) => o.area)))
      if (r.observations.filter((o) => o.area === area).length > 2)
        ctx.addIssue({
          code: "custom",
          message: "At most two observations per area",
        });
  });
export type SemanticResponse = z.infer<typeof semanticResponseSchema>;
export const semanticRecordSchema = z
  .object({
    version: z.literal(SEMANTIC_VERSION),
    provider: z.enum(["codex-native", "manual-import"]),
    model: z.string().min(1).max(120).optional(),
    createdAt: z.iso.datetime(),
    result: semanticResponseSchema,
  })
  .strict()
  .refine(
    (r) => r.provider !== "codex-native" || !!r.model,
    "Missing native model provenance",
  );
export type SemanticRecord = z.infer<typeof semanticRecordSchema>;
export function validateSemanticResult(
  input: unknown,
  hashes: readonly string[],
) {
  const result = semanticResponseSchema.parse(input);
  if (
    new Set(hashes).size !== hashes.length ||
    JSON.stringify(result.references.map((r) => r.sha256)) !==
      JSON.stringify(hashes) ||
    [...result.observations, ...result.interpretations].some(
      (r) =>
        new Set(r.referenceHashes).size !== r.referenceHashes.length ||
        r.referenceHashes.some((h) => !hashes.includes(h)),
    )
  )
    throw new Error(tr("styleCreator.referenceMismatch"));
  return result;
}
export function parseSemanticJSON(
  json: string,
  hashes: readonly string[],
): SemanticResponse {
  return validateSemanticResult(parseBoundedJSON(json, 128 * 1024), hashes);
}
export const creatorProvenanceSchema = z
  .object({
    version: z.literal("lf-style-creator-v1"),
    createdAt: z.iso.datetime(),
    references: z
      .array(
        z
          .object({
            sha256: sha,
            role: styleRoleSchema,
            sourceNote: z.string().max(500),
          })
          .strict(),
      )
      .min(1)
      .max(6),
    semantic: semanticRecordSchema.optional(),
    workingPalette: z.array(z.string().regex(/^#[0-9a-fA-F]{6}$/)).max(24),
    scopeReviewed: z.literal(true),
  })
  .strict()
  .superRefine((p, ctx) => {
    const hashes = p.references.map((r) => r.sha256);
    if (new Set(hashes).size !== hashes.length)
      ctx.addIssue({ code: "custom", message: "Duplicate creator reference" });
    if (p.semantic) {
      try {
        validateSemanticResult(p.semantic.result, hashes);
      } catch {
        ctx.addIssue({
          code: "custom",
          message: "Invalid semantic references",
        });
      }
    }
  });
export const styleDraftFileSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(240)
      .refine(
        (s) => !/[\\/]/.test(s) && [...s].every((c) => c.charCodeAt(0) >= 32),
      ),
    bytes: z
      .instanceof(Uint8Array)
      .refine((b) => b.length > 0 && b.length <= 8 * 1024 * 1024),
  })
  .strict();
export const styleDraftImportSchema = z
  .object({
    files: z.array(styleDraftFileSchema).min(1).max(6).optional(),
    replaceToken: z.uuid().optional(),
  })
  .strict();
export const draftReferenceSchema = z
  .object({
    token: z.uuid(),
    role: styleRoleSchema.optional(),
    sourceNote: z.string().max(500),
  })
  .strict();
export const draftReferencesSchema = z
  .array(draftReferenceSchema)
  .min(1)
  .max(6)
  .refine((r) => new Set(r.map((i) => i.token)).size === r.length);
export type StyleDraftReference = z.infer<typeof draftReferenceSchema>;
export type StyleDraftImage = {
  token: string;
  sha256: string;
  name: string;
  width: number;
  height: number;
  format: "png" | "webp" | "jpg";
  preview: string;
  known: boolean;
};
export type SemanticStatus = {
  state:
    | "idle"
    | "ready"
    | "not-installed"
    | "not-authenticated"
    | "unavailable"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
  message: string;
  model?: string;
  result?: SemanticRecord;
  jobId?: string;
};
/** Provider owns transport only. Main supplies verified bytes; never renderer paths. */
export interface SemanticStyleAnalyzer {
  check(): Promise<SemanticStatus>;
  start(
    images: {
      bytes: Uint8Array;
      sha256: string;
      format: "png" | "webp" | "jpg";
      role?: z.infer<typeof styleRoleSchema>;
    }[],
  ): SemanticStatus;
  status: SemanticStatus;
  readonly running: boolean;
  cancel(): Promise<SemanticStatus>;
  dispose(): Promise<void>;
}
