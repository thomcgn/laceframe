import { z } from "zod";
import type { ColorPixels } from "./color-consistency";
import { tr } from "./locales";
export const MAX_LAYER_PIXELS = 4_194_304;
export const MAX_LAYERS = 32;
const id = z.uuid(),
  sha = z.string().regex(/^[a-f0-9]{64}$/);
export const layerRoleSchema = z.enum([
  "hair",
  "skin",
  "eyes",
  "mouth",
  "clothing",
  "accessory",
  "custom",
]);
export type SemanticLayerRole = z.infer<typeof layerRoleSchema>;
const layerFields = {
  id,
  name: z.string().trim().min(1).max(120),
  role: layerRoleSchema,
  visible: z.boolean(),
  locked: z.boolean(),
  order: z.number().int().min(0).max(31),
  masterLayerId: id.optional(),
  importedFrom: z
    .object({ paletteId: id, regionId: id, maskSha256: sha })
    .strict()
    .optional(),
};
export const semanticLayerSchema = z
  .object({
    ...layerFields,
    mask: z.object({ file: z.string(), sha256: sha }).strict(),
  })
  .strict();
export const semanticLayerInputSchema = z
  .object({
    ...layerFields,
    weights: z
      .instanceof(Uint8Array)
      .refine((w) => w.length <= MAX_LAYER_PIXELS),
  })
  .strict();
export const layerSetSchema = z
  .object({
    id,
    characterId: id,
    masterId: id,
    masterSha256: sha,
    sourceId: id,
    sourceSha256: sha,
    templateSetId: id.optional(),
    revision: z.number().int().positive(),
    width: z.number().int().positive().max(16384),
    height: z.number().int().positive().max(16384),
    createdAt: z.iso.datetime(),
    layers: z.array(semanticLayerSchema).min(0).max(MAX_LAYERS),
  })
  .strict()
  .refine(
    (s) =>
      s.width * s.height <= MAX_LAYER_PIXELS &&
      s.width * s.height * s.layers.length <= 64 * 1024 * 1024,
  );
export const saveLayerSetSchema = z
  .object({
    sourceId: id,
    sourceSha256: sha,
    baseSetId: id.optional(),
    templateSetId: id.optional(),
    layers: z.array(semanticLayerInputSchema).min(0).max(MAX_LAYERS),
  })
  .strict();
export type SemanticLayer = z.infer<typeof semanticLayerSchema>;
export type CharacterLayerSet = z.infer<typeof layerSetSchema>;
export type LayerDraft = z.infer<typeof semanticLayerInputSchema>;
export type LayerSetInput = z.infer<typeof saveLayerSetSchema>;
export function validateLayerMasks(source: ColorPixels, layers: LayerDraft[]) {
  const n = source.width * source.height;
  if (
    !n ||
    n > MAX_LAYER_PIXELS ||
    source.data.length !== n * 4 ||
    layers.length > MAX_LAYERS ||
    n * layers.length > 64 * 1024 * 1024
  )
    throw new Error(tr("layers.invalidMask"));
  const occupied = new Uint8Array(n);
  let visible = 0,
    classified = 0,
    conflicts = 0;
  for (let i = 0; i < n; i++) if (source.data[i * 4 + 3]) visible++;
  for (const layer of layers) {
    if (layer.weights.length !== n) throw new Error(tr("layers.invalidMask"));
    for (let i = 0; i < n; i++)
      if (layer.weights[i]) {
        if (!source.data[i * 4 + 3]) throw new Error(tr("layers.transparent"));
        if (occupied[i] === 1) conflicts++;
        if (!occupied[i]) classified++;
        occupied[i] = Math.min(2, occupied[i] + 1);
      }
  }
  return { visible, classified, unclassified: visible - classified, conflicts };
}
/** Role-matched extraction is shared with future Palette Lock, without recoloring. */
export function semanticRegion(layers: LayerDraft[], role: SemanticLayerRole) {
  const out = new Uint8Array(layers[0]?.weights.length ?? 0);
  for (const layer of layers)
    if (layer.role === role)
      layer.weights.forEach((v, i) => {
        out[i] = Math.max(out[i], v);
      });
  return out;
}
/** Explicit seed import only. Palette bytes/revisions are never modified. */
export function layerFromColorRegion(
  source: ColorPixels,
  region: {
    id: string;
    name: string;
    role: string;
    weights: Uint8Array;
    mask: { sha256: string };
  },
  paletteId: string,
  id: string,
  order: number,
  clipTransparent = false,
): LayerDraft {
  if (region.weights.length !== source.width * source.height)
    throw new Error(tr("layers.invalidMask"));
  const weights = new Uint8Array(region.weights);
  for (let i = 0; i < weights.length; i++)
    if (weights[i] && !source.data[i * 4 + 3]) {
      if (!clipTransparent) throw new Error(tr("layers.importTransparent"));
      weights[i] = 0;
    }
  return {
    id,
    name: region.name,
    role:
      region.role === "clothes"
        ? "clothing"
        : layerRoleSchema.parse(region.role),
    visible: true,
    locked: false,
    order,
    weights,
    importedFrom: {
      paletteId,
      regionId: region.id,
      maskSha256: region.mask.sha256,
    },
  };
}
/** Reuse meaning/identity only; Expression coordinates are never inferred from Master masks. */
export function expressionLayerDraft(
  template: CharacterLayerSet,
  width: number,
  height: number,
  newId: () => string,
): LayerDraft[] {
  if (
    width * height > MAX_LAYER_PIXELS ||
    width * height * template.layers.length > 64 * 1024 * 1024
  )
    throw new Error(tr("layers.invalidMask"));
  return template.layers.map((layer) => ({
    id: newId(),
    masterLayerId: layer.id,
    name: layer.name,
    role: layer.role,
    visible: true,
    locked: false,
    order: layer.order,
    weights: new Uint8Array(width * height),
  }));
}
