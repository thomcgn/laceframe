import { structuredStyleText } from "./packs";
import {
  TRANSPARENT_CHARACTER_INSTRUCTION,
  VISUAL_STYLE_INSTRUCTION,
  resolutionProfileSchema,
} from "./asset-quality";
import { z } from "zod";
import { styleReferenceSchema } from "./style";
import { generationExecutionSchema } from "./generation";
import type { Project } from "./domain";
export const compositionSchema = z
  .object({
    pose: z.string().trim().min(1).max(4000),
    framing: z.string().trim().min(1).max(4000),
    background: z.string().trim().min(1).max(2000),
    profile: z.string().trim().min(1).max(120),
    targetWidth: z.number().int().min(64).max(4096),
    targetHeight: z.number().int().min(64).max(4096),
    targetResolution: resolutionProfileSchema.optional(),
  })
  .strict()
  .refine(
    (c) =>
      !c.targetResolution ||
      (c.targetResolution.width === c.targetWidth &&
        c.targetResolution.height === c.targetHeight),
    "Resolution profile and target dimensions differ",
  );
export type Composition = z.infer<typeof compositionSchema>;
export const DEFAULT_COMPOSITION = {
  pose: "Neutral calm expression, closed relaxed mouth, look at camera, stable head, no speech, shouting or dynamic gestures.",
  framing:
    "Head and upper body, both shoulders completely inside frame, stable centered dialogue portrait.",
  background: "Genuinely transparent canvas with alpha; no scenery or backdrop",
  profile: "portrait-artistic",
  targetWidth: 1024,
  targetHeight: 1024,
};
export const creatorSettingsSchema = z.object({
  characterId: z.uuid(),
  mode: z.enum(["create", "rebuild"]).optional(),
  baseMasterId: z.uuid().optional(),
  baseMasterSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  identityReferences: z.array(styleReferenceSchema).min(1).max(3),
  identityNotes: z.string().max(4000),
  artDirectionId: z.uuid().optional(),
  artDirectionRevision: z.number().int().positive().optional(),
  styleReferences: z.array(styleReferenceSchema).max(6),
  outfit: z.string().trim().min(1).max(4000),
  composition: compositionSchema,
});
export const characterCreationDraftSchema = creatorSettingsSchema
  .extend({
    operation: z.literal("create-character-master"),
    prompt: z.string().trim().min(1).max(30000),
  })
  .strict();
export const masterAttemptSchema = creatorSettingsSchema
  .extend({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    providerId: z.literal("codex-native"),
    execution: generationExecutionSchema.optional(),
    promptRevision: z
      .object({
        id: z.uuid(),
        createdAt: z.iso.datetime(),
        compositionVersion: z.literal(1),
        prompt: z.string().min(1).max(30000),
      })
      .strict(),
  })
  .strict();
export type CharacterCreationDraft = z.infer<
  typeof characterCreationDraftSchema
>;
export type MasterAttempt = z.infer<typeof masterAttemptSchema>;
export type CharacterMasterRequest = CharacterCreationDraft & {
  identityFiles: { id: string; sha256: string; path: string }[];
  styleFiles: { id: string; sha256: string; path: string }[];
};
/** The captured active version is a concurrency guard, never an image/edit source. */
export function validateMasterTarget(
  p: Project,
  d: {
    characterId: string;
    mode?: "create" | "rebuild";
    baseMasterId?: string;
    baseMasterSha256?: string;
  },
) {
  const c = p.characters.find((c) => c.id === d.characterId);
  if (!c) throw new Error("Figur fehlt.");
  const base = p.masters.find((m) => m.id === d.baseMasterId);
  if (d.mode === "rebuild") {
    if (
      !c.masterId ||
      !base ||
      c.masterId !== base.id ||
      base.characterId !== c.id ||
      base.sha256 !== d.baseMasterSha256
    )
      throw new Error(
        "Rebuild-Ausgangsmaster ist veraltet oder ungültig. Aktuelle Version erneut auswählen.",
      );
  } else if (c.masterId || d.baseMasterId || d.baseMasterSha256) {
    throw new Error(
      "Eine Entwurfsfigur ohne freigegebenen Master auswählen; vorhandenen Master ausdrücklich neu aufbauen.",
    );
  }
}
/** Trusted technical instruction is reattached in main even for Expert Override. */
export function protectMasterPrompt(prompt: string) {
  return `${prompt
    .replaceAll(TRANSPARENT_CHARACTER_INSTRUCTION, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()}\n\n${TRANSPARENT_CHARACTER_INSTRUCTION}`;
}
/** Conservative text hints, not a semantic guarantee. The pixel gate remains authoritative. */
export function transparencyConflicts(text: string): boolean {
  const content = text.replace(
    /\b(?:no|without|avoid|kein(?:en|e|em|er|es)?|ohne)\s+(?:black|white|colored|opaque|solid|schwarz\w*|weiß\w*|farbig\w*|deckend\w*)[ -]+(?:background|backdrop|hintergrund)\b/gi,
    "",
  );
  return /(?:black|white|colored|opaque|solid|schwarz\w*|weiß\w*|weiss\w*|farbig\w*|deckend\w*)[ -]*(?:background|backdrop|hintergrund)|(?:background|hintergrund)[ :]*(?:black|white|opaque|schwarz|weiß)|(?:no|without|ohne) (?:alpha|transparen)|(?:scenery|vignette|Kulisse)\s*(?:required|hinzufügen)/i.test(
    content,
  );
}
export function validateCreatorSelection(
  p: Project,
  d: CharacterCreationDraft,
) {
  validateMasterTarget(p, d);
  if (
    new Set(d.identityReferences.map((r) => r.id)).size !==
      d.identityReferences.length ||
    d.identityReferences.some(
      (r) =>
        !p.identityAssets.some(
          (a) =>
            a.id === r.id &&
            a.sha256 === r.sha256 &&
            a.characterId === d.characterId &&
            !a.removedAt,
        ),
    )
  )
    throw new Error(
      "Identitätsreferenzen fehlen, wurden entfernt oder gehören zu einer anderen Figur.",
    );
  const style = p.artDirections.find((s) => s.id === d.artDirectionId);
  if (
    (d.artDirectionId === undefined) !==
      (d.artDirectionRevision === undefined) ||
    (d.artDirectionId && (!style || style.revision !== d.artDirectionRevision))
  )
    throw new Error("Aktuelle Art-Direction-Revision auswählen.");
  const refs = (style?.styleReferenceIds ?? []).map((id) => {
    const a = p.styleAssets.find((a) => a.id === id)!;
    return { id: a.id, sha256: a.sha256 };
  });
  if (JSON.stringify(refs) !== JSON.stringify(d.styleReferences))
    throw new Error("Stilreferenzen wurden geändert.");
}
export function composeCharacterPrompt(
  p: Project,
  settings: z.infer<typeof creatorSettingsSchema>,
): string {
  const d = creatorSettingsSchema.parse(settings),
    style = p.artDirections.find((s) => s.id === d.artDirectionId);
  return protectMasterPrompt(
    [
      d.mode === "rebuild"
        ? `REBUILD A COMPLETE NEW NEUTRAL CHARACTER MASTER for the SAME character. This is a new generation, NOT an edit/cutout of previous master ${d.baseMasterId}. The previous master remains historical and is not an image input.`
        : "CREATE A NEW NEUTRAL CHARACTER MASTER — not an expression edit. No approved master exists yet.",
      `COMPOSITION: Fill the available canvas appropriately for the selected framing (${d.composition.framing}) and profile (${d.composition.profile}). Center the requested subject, keep framing-relevant body parts inside the image, and avoid a tiny figure in a corner or excessive empty transparent margins. Respect the chosen framing; do not force a bust portrait or crop a requested full-body figure. Requested ${d.composition.targetWidth} × ${d.composition.targetHeight} is a target, not proof of actual provider output dimensions.`,
      `IDENTITY REFERENCE — images 1–${d.identityReferences.length}: ${d.identityReferences.map((r) => `${r.id} SHA-256 ${r.sha256}`).join("; ")}. These are the SAME person/character. Preserve individual facial structure, eyes, nose, mouth, hair texture/style and distinctive features. Do not infer identity from style images.`,
      `IDENTITY NOTES: ${d.identityNotes || "Follow only the identity references."}`,
      style
        ? `STYLE REFERENCE — ${style.name} / R${style.revision}. Rendering: ${style.renderRules}. Light: ${style.lightingRules ?? "restrained"}. Color: ${style.colorRules ?? "follow rendering style"}. Framing: ${style.framingRules ?? "follow composition"}. ${d.styleReferences.length ? `Images ${d.identityReferences.length + 1}–${d.identityReferences.length + d.styleReferences.length} are STYLE ONLY: ${d.styleReferences.map((r) => `${r.id} SHA-256 ${r.sha256}`).join("; ")}.` : "Text style only; no style image is supplied."} Borrow contours, pixel/paint clusters, detail, shading and color dramaturgy ONLY. NEVER transfer faces, hair, clothing, accessories, body identity or personality from the style references.`
        : "STYLE: Follow the identity illustration's rendering, or a restrained illustrated treatment for photos; no other character is a reference.",
      structuredStyleText(style?.portableStyle),
      `OUTFIT DESCRIPTION — ${d.outfit}. Use this outfit independently of clothes in identity photos or style references. Do not copy another character's wardrobe.`,
      `MASTER COMPOSITION — Pose: ${d.composition.pose}\nFraming: ${d.composition.framing}\nBackground: ${d.composition.background}\nAsset profile: ${d.composition.profile}\nResolution profile: ${d.composition.targetResolution?.name ?? "custom native target"}\nRequested canvas: ${d.composition.targetWidth} × ${d.composition.targetHeight} pixels. This is a target, not a guaranteed output size. Do not force a 64×64 portrait conversion.`,
      TRANSPARENT_CHARACTER_INSTRUCTION,
      VISUAL_STYLE_INSTRUCTION,
      "Create exactly ONE new portrait. Neutral expression, no speaking/shouting mouth or dynamic gestures. Preserve reference files unchanged. Identity fidelity and neutrality require manual human review; do not claim identity approval or pixel-perfect preservation.",
    ].join("\n\n"),
  );
}
