import { z } from "zod";
import { styleContentSchema, packProvenanceSchema } from "./packs";
export const MAX_STYLE_REFERENCES = 6;
export const MAX_STYLE_PIXELS = 16_000_000;
export const MAX_STYLE_BYTES = 8 * 1024 * 1024;
export const styleReferenceSchema = z
  .object({ id: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const styleRules = {
  portableStyle: styleContentSchema.optional(),
  portableId: z.uuid().optional(),
  portableName: z.string().min(1).max(120).optional(),
  portableRevision: z.number().int().positive().optional(),
  portableProvenance: packProvenanceSchema.optional(),
  description: z.string().max(4000).optional(),
  lightingRules: z.string().max(4000).optional(),
  colorRules: z.string().max(4000).optional(),
  framingRules: z.string().max(4000).optional(),
  styleReferenceIds: z.array(z.uuid()).max(MAX_STYLE_REFERENCES).optional(),
};
export const revisionSchema = z
  .object({
    profileId: z.uuid(),
    revision: z.number().int().positive(),
    name: z.string().trim().min(1).max(120),
    renderRules: z
      .string()
      .min(1)
      .max(8000)
      .refine(
        (t) => t.trim().length > 0,
        "Rendering-Regeln dürfen nicht leer sein.",
      ),
    ...styleRules,
  })
  .strict();
export const styleSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("project") }).strict(),
  z.object({ mode: z.literal("master") }).strict(),
  z.object({ mode: z.literal("profile"), profileId: z.uuid() }).strict(),
]);
