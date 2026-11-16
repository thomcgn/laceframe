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
  })
  .strict();
export const DEFAULT_COMPOSITION = {
  pose: "Neutral calm expression, closed relaxed mouth, look at camera, stable head, no speech, shouting or dynamic gestures.",
  framing:
    "Head and upper body, both shoulders completely inside frame, stable centered dialogue portrait.",
  background: "Plain unobtrusive background",
  profile: "portrait-artistic",
  targetWidth: 1024,
  targetHeight: 1024,
};
export const creatorSettingsSchema = z.object({
  characterId: z.uuid(),
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
export function validateCreatorSelection(
  p: Project,
  d: CharacterCreationDraft,
) {
  const character = p.characters.find((c) => c.id === d.characterId);
  if (!character || character.masterId)
    throw new Error("Eine Entwurfsfigur ohne freigegebenen Master auswählen.");
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
  return [
    "CREATE A NEW NEUTRAL CHARACTER MASTER — not an expression edit. No approved master exists yet.",
    `IDENTITY REFERENCE — images 1–${d.identityReferences.length}: ${d.identityReferences.map((r) => `${r.id} SHA-256 ${r.sha256}`).join("; ")}. These are the SAME person/character. Preserve individual facial structure, eyes, nose, mouth, hair texture/style and distinctive features. Do not infer identity from style images.`,
    `IDENTITY NOTES: ${d.identityNotes || "Follow only the identity references."}`,
    style
      ? `STYLE REFERENCE — ${style.name} / R${style.revision}. Rendering: ${style.renderRules}. Light: ${style.lightingRules ?? "restrained"}. Color: ${style.colorRules ?? "follow rendering style"}. Framing: ${style.framingRules ?? "follow composition"}. ${d.styleReferences.length ? `Images ${d.identityReferences.length + 1}–${d.identityReferences.length + d.styleReferences.length} are STYLE ONLY: ${d.styleReferences.map((r) => `${r.id} SHA-256 ${r.sha256}`).join("; ")}.` : "Text style only; no style image is supplied."} Borrow contours, pixel/paint clusters, detail, shading and color dramaturgy ONLY. NEVER transfer faces, hair, clothing, accessories, body identity or personality from the style references.`
      : "STYLE: Follow the identity illustration's rendering, or a restrained illustrated treatment for photos; no other character is a reference.",
    `OUTFIT DESCRIPTION — ${d.outfit}. Use this outfit independently of clothes in identity photos or style references. Do not copy another character's wardrobe.`,
    `MASTER COMPOSITION — Pose: ${d.composition.pose}\nFraming: ${d.composition.framing}\nBackground: ${d.composition.background}\nAsset profile: ${d.composition.profile}\nRequested canvas: ${d.composition.targetWidth} × ${d.composition.targetHeight} pixels. This is a target, not a guaranteed output size. Do not force a 64×64 portrait conversion.`,
    "Create exactly ONE new portrait. Neutral expression, no speaking/shouting mouth or dynamic gestures. Preserve reference files unchanged. Identity fidelity and neutrality require manual human review; do not claim identity approval or pixel-perfect preservation.",
  ].join("\n\n");
}
