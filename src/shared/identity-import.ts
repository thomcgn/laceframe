import { z } from "zod";
import { idSchema } from "./domain";
export const identityFileSchema = z
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
      .refine((b) => b.length > 0 && b.length <= 16 * 1024 * 1024),
  })
  .strict();
export const identityImportSchema = z
  .object({
    characterId: idSchema,
    replaceId: idSchema.optional(),
    files: z.array(identityFileSchema).min(1).max(3).optional(),
  })
  .strict();
export type IdentityImport = z.infer<typeof identityImportSchema>;
