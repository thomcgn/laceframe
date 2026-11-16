import { z } from "zod";
export const TRANSPARENT_CHARACTER_INSTRUCTION =
  "Generate the isolated character only, on a genuinely transparent background with alpha transparency. No black, white, gray, colored, studio, gradient or illustrated background. No drop shadow, vignette, floor, environmental scenery or decorative backdrop. The character silhouette must remain complete and cleanly separated from the transparent canvas.";
export const VISUAL_STYLE_INSTRUCTION =
  "VISUAL STYLE LOCK: If style references are selected, follow them; otherwise retain the approved master rendering or identity illustration treatment. Style criteria: pixel clusters, contour treatment, flat color areas, detail density, shading levels, material rendering and degree of stylization. Do not substitute photorealism for an illustrated/pixel style. IDENTITY LOCK (face, proportions, hair, beard, glasses, tattoos) and OUTFIT are independent: never transfer identity or clothes from style references. COMPOSITION requires a complete isolated silhouette and genuine transparent canvas. Human review is required; no fidelity score or automatic approval.";
export const resolutionProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    width: z.number().int().min(1).max(4096),
    height: z.number().int().min(1).max(4096),
    sampling: z.enum(["nearest", "bilinear"]),
    fit: z.enum(["contain", "cover"]),
  })
  .strict()
  .refine((p) => p.width * p.height <= 16_000_000);
export type ResolutionProfile = z.infer<typeof resolutionProfileSchema>;
export const RESOLUTION_PROFILES: ResolutionProfile[] = [
  {
    name: "Portrait 1024",
    width: 1024,
    height: 1024,
    sampling: "bilinear",
    fit: "contain",
  },
  {
    name: "Portrait 512",
    width: 512,
    height: 512,
    sampling: "bilinear",
    fit: "contain",
  },
  {
    name: "Pixel 128",
    width: 128,
    height: 128,
    sampling: "nearest",
    fit: "contain",
  },
];
const uuid = z.uuid(),
  sha = z.string().regex(/^[a-f0-9]{64}$/);
export const qualityDerivativeSchema = z
  .object({
    id: uuid,
    sourceId: uuid,
    sourceSha256: sha,
    characterId: uuid,
    sha256: sha,
    file: z.string(),
    width: z
      .number()
      .int()
      .positive()
      .max(4096 * 4),
    height: z
      .number()
      .int()
      .positive()
      .max(4096 * 4),
    format: z.literal("png"),
    operation: z.enum(["cutout", "resolution"]),
    version: z.literal(1),
    createdAt: z.iso.datetime(),
    mask: z
      .object({
        sha256: sha,
        file: z.string(),
        type: z.literal("foreground-alpha"),
        name: z.string().trim().min(1).max(120).default("Freistellung"),
      })
      .strict()
      .optional(),
    profile: resolutionProfileSchema.optional(),
    status: z.enum(["candidate", "approved", "rejected"]),
    reviewedAt: z.iso.datetime().optional(),
    notes: z.string().max(8000).optional(),
    approvedMasterId: uuid.optional(),
    approvedExpressionId: uuid.optional(),
  })
  .strict();
export type QualityDerivative = z.infer<typeof qualityDerivativeSchema>;
export type QualityReport = {
  width: number;
  height: number;
  format: string;
  alphaCapable: boolean;
  transparent: number;
  partial: number;
  opaque: number;
  edgeTransparent: number;
  edgePixels: number;
  status: "transparent" | "suspicious" | "opaque" | "empty";
  warnings: string[];
  palette: { color: string; pixels: number }[];
  neighborChanges: number;
  neighborPairs: number;
};
export const exportAssetSchema = z
  .object({ id: uuid, raw: z.boolean(), provenance: z.boolean() })
  .strict();
export type ExportAssetRequest = z.infer<typeof exportAssetSchema>;
