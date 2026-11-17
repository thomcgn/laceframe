import { structuredStyleText, type StyleContent } from "./packs";
import {
  TRANSPARENT_CHARACTER_INSTRUCTION,
  VISUAL_STYLE_INSTRUCTION,
} from "./asset-quality";
import { z } from "zod";
import { maskSelectionSchema } from "./masking";
import { styleReferenceSchema } from "./style";
import type { Master, Variant, VocalAction, Project } from "./domain";

export const generationDraftSchema = z
  .object({
    mask: maskSelectionSchema.optional(),
    characterId: z.uuid(),
    masterId: z.uuid(),
    masterSha256: z.string().regex(/^[a-f0-9]{64}$/),
    variantId: z.uuid(),
    artDirectionId: z.uuid().optional(),
    artDirectionRevision: z.number().int().positive().optional(),
    expressionPerformance: z.string().max(8000).optional(),
    styleReferences: z.array(styleReferenceSchema).max(6).optional(),
    action: z.enum(["silent", "speaking", "shouting"]),
    intensity: z.number().min(0).max(1).optional(),
    supplementaryInstructions: z.string().max(8000),
    basePrompt: z.string().min(1).max(24000),
    prompt: z.string().trim().min(1).max(24000),
    providerId: z.enum(["manual-import", "codex-native"]),
  })
  .strict();
export const generationExecutionSchema = z
  .object({
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime().optional(),
    durationMs: z.number().int().nonnegative(),
    status: z.enum(["running", "completed", "failed", "cancelled"]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.status === "running") === Boolean(value.endedAt))
      ctx.addIssue({
        code: "custom",
        message: "Invalid execution completion metadata",
      });
  });
export type GenerationExecution = z.infer<typeof generationExecutionSchema>;
export type GenerationPhase =
  | "preparing"
  | "checking-account"
  | "checking-capability"
  | "starting-model"
  | "processing"
  | "generating-image"
  | "validating-image"
  | "importing"
  | "stopping";
export function formatDuration(milliseconds: number): string {
  const seconds = Math.floor(
    Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0) / 1000,
  );
  return [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export function executionLabel(
  value: GenerationExecution,
  live = false,
): string {
  if (value.status === "running")
    return live
      ? `Laufzeit ${formatDuration(value.durationMs)}`
      : "Nicht abgeschlossen · keine gesicherte Endzeit";
  return `${value.status === "completed" ? "Generiert" : value.status === "failed" ? "Fehlgeschlagen" : "Abgebrochen"} in ${formatDuration(value.durationMs)}`;
}
export const attemptSchema = generationDraftSchema
  .omit({ basePrompt: true, prompt: true, supplementaryInstructions: true })
  .extend({
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    execution: generationExecutionSchema.optional(),
    promptRevision: z
      .object({
        id: z.uuid(),
        compositionVersion: z.literal(1),
        createdAt: z.iso.datetime(),
        basePrompt: z.string().min(1).max(24000),
        prompt: z.string().min(1).max(24000),
        supplementaryInstructions: z.string().max(8000),
      })
      .strict(),
  })
  .strict();
export type GenerationDraft = z.infer<typeof generationDraftSchema>;
export type GenerationAttempt = z.infer<typeof attemptSchema>;
export type GenerationCapability = {
  canGenerate: boolean;
  supportsReferenceImages: boolean;
  supportsEditingMasks: boolean;
  supportsMultipleReferences?: boolean;
  canImportResult: boolean;
};
export type ProviderDescriptor = {
  id: string;
  label: string;
  capabilities: GenerationCapability;
  unavailableReason?: string;
};
// Paths stay in the main process. The renderer submits IDs, never paths.
export type GenerationRequest = GenerationDraft & {
  projectId: string;
  referenceAssetPath: string;
  selectionContext?: string;
  styleReferenceFiles?: { id: string; sha256: string; path: string }[];
};
export type GenerationResult = {
  providerId: string;
  outputAssetPath: string;
  prompt: string;
  createdAt: string;
};
export type ProviderAuthentication =
  | { status: "authenticated"; accountLabel: string }
  | { status: "not-required" | "unavailable"; reason: string };
export interface ImageGenerationProvider {
  descriptor: ProviderDescriptor;
  prepare(project: Project, draft: GenerationDraft): GenerationRequest;
  acceptImportedResult(
    request: GenerationRequest,
    storedPath: string,
  ): GenerationResult;
  authenticate(): Promise<ProviderAuthentication>;
  getCapabilities(): GenerationCapability;
  generateImage(request: GenerationRequest): Promise<GenerationResult>;
  editImage(request: GenerationRequest): Promise<GenerationResult>;
  cancelGeneration(attemptId: string): Promise<void>;
  getGenerationResult(
    project: Project,
    attemptId: string,
  ): Promise<GenerationResult | null>;
}
export const CHATGPT_URL = "https://chatgpt.com/";
export function validateExternalURL(input: unknown): string {
  if (input !== CHATGPT_URL)
    throw new Error("Nur https://chatgpt.com/ darf extern geöffnet werden.");
  return CHATGPT_URL;
}
/** Apply technical alpha requirements to future submissions without rewriting historical records. */
export function protectExpressionPrompt(prompt: string): string {
  return prompt.includes(TRANSPARENT_CHARACTER_INSTRUCTION)
    ? prompt
    : `${prompt.trim()}\n\n${TRANSPARENT_CHARACTER_INSTRUCTION}`;
}
export function composePrompt(input: {
  mask?: z.infer<typeof maskSelectionSchema>;
  characterName: string;
  master: Master;
  familyLabel: string;
  variant: Variant;
  artDirection?: {
    name: string;
    portableStyle?: StyleContent;
    renderRules: string;
    lightingRules?: string;
    colorRules?: string;
    framingRules?: string;
  };
  styleReferences?: { id: string; sha256: string }[];
  expressionPerformance?: string;
  action: VocalAction;
  intensity?: number;
  supplementaryInstructions: string;
}): string {
  const { master, variant } = input;
  return [
    input.artDirection
      ? `STYLE LOCK — ${input.artDirection.name}\nRendering: ${input.artDirection.renderRules}\nLighting: ${input.artDirection.lightingRules?.trim() || "Follow the master"}\nColor: ${input.artDirection.colorRules?.trim() || "Follow the master"}\nFraming: ${input.artDirection.framingRules?.trim() || "Follow the master"}\nThis is the project's illustration style, NOT an instruction to copy another character's face, clothes or personality.`
      : "",
    structuredStyleText(input.artDirection?.portableStyle),
    input.styleReferences?.length
      ? `REFERENCE ROLES: Image 1 is the IDENTITY MASTER. Images 2–${input.styleReferences.length + 1} are STYLE ONLY, in the listed order: ${input.styleReferences.map((r, i) => `image ${i + 2}: ID ${r.id}, SHA-256 ${r.sha256}`).join("; ")}. Borrow rendering, lighting and palette treatment only. NEVER copy faces, hair, freckles, gender presentation, clothing, accessories, poses or personality from style references. Identity and outfit come ONLY from image 1. Edit image 1; style pictures are not edit targets.`
      : "",
    input.mask
      ? `LOCAL HARD PIXEL LOCK: mask ${input.mask.id}, revision ${input.mask.revision}, SHA-256 ${input.mask.sha256}. Laceframe composites locally AFTER generation. No inpainting mask is sent to Codex. Return the exact original canvas dimensions and aligned origin; do not crop or scale. This does not constrain the AI to a region; manual registration and identity review remain required.`
      : "",
    "CHARACTER LOCK — EDIT THE PROVIDED APPROVED MASTER IMAGE",
    `Attach the actual approved master image as the reference. A filename, ID or hash alone is NOT an image reference. Use the PROVIDED IMAGE of ${input.characterName}; do not invent or redesign the character.`,
    `Master V${master.version} | ID: ${master.id} | SHA-256: ${master.sha256}`,
    input.artDirection
      ? `Preserve the original ${master.width} × ${master.height} pixel canvas, framing, camera and existing transparent silhouette. Apply the selected STYLE LOCK to rendering, lighting and color treatment only. Preserve the identity, hair, clothing and accessories of the identity master. Do not resample, crop, quantize or convert to a 64×64 sprite.`
      : `Preserve the original ${master.width} × ${master.height} pixel canvas, framing, camera, art style, palette and existing transparent silhouette. Do not resample, crop, quantize or convert to a 64×64 sprite.`,
    "Keep facial identity, hair, freckles/skin details, clothes and accessories unchanged. Change only the facial features needed for the requested expression. If an edit mask is provided, edit only inside it; no mask is supplied automatically. These instructions do not guarantee pixel or identity preservation: manual review is required.",
    `EMOTION: ${input.familyLabel} / ${variant.label} (${variant.slug}).`,
    input.expressionPerformance?.trim()
      ? `PERSONAL EXPRESSION PERFORMANCE for ${input.characterName}: ${input.expressionPerformance.trim()}\nThis character-specific direction overrides the shared expression template; it does not change other characters.`
      : variant.prompt
        ? `EXPRESSION DIRECTION: ${variant.prompt}`
        : "EXPRESSION DIRECTION: Follow the selected expression; keep changes restrained and identity consistent.",
    input.intensity === undefined
      ? "INTENSITY: unspecified; do not assume a calibrated visual continuum."
      : `INTENSITY: ${input.intensity} (organizational guidance, not a calibrated visual continuum).`,
    TRANSPARENT_CHARACTER_INSTRUCTION,
    VISUAL_STYLE_INSTRUCTION,
    `VOCAL ACTION (independent of emotion): ${input.action}. ${input.action === "silent" ? "No speech or shouting; keep the mouth pose consistent with a silent expression." : input.action === "speaking" ? "Use a speaking mouth pose, without implying a different emotion or synthesizing animation." : "Use an open shouting mouth and tense jaw while preserving the selected emotion and character identity."}`,
    input.supplementaryInstructions.trim()
      ? `ADDITIONAL USER INSTRUCTIONS:\n${input.supplementaryInstructions.trim()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
export type ComposerState = {
  base: string;
  text: string;
  edited: boolean;
  saved?: boolean;
  pendingBase?: string;
};
export const newComposer = (base: string): ComposerState => ({
  base,
  text: base,
  edited: false,
});
export function updateComposer(
  state: ComposerState,
  base: string,
): ComposerState {
  if (base === state.base) return { ...state, pendingBase: undefined };
  return state.edited || state.saved
    ? { ...state, pendingBase: base }
    : newComposer(base);
}
export const editComposer = (
  state: ComposerState,
  text: string,
): ComposerState => ({ ...state, text, edited: text !== state.base });
export const resetComposer = (state: ComposerState): ComposerState =>
  newComposer(state.pendingBase ?? state.base);
export const keepComposer = (state: ComposerState): ComposerState => ({
  base: state.pendingBase ?? state.base,
  text: state.text,
  edited: true,
});
export function draftFromAttempt(attempt: GenerationAttempt): GenerationDraft {
  const {
    id: _id,
    createdAt: _created,
    promptRevision,
    execution: _execution,
    ...selection
  } = attempt;
  void _execution;
  void _id;
  void _created;
  return {
    ...selection,
    basePrompt: promptRevision.basePrompt,
    prompt: promptRevision.prompt,
    supplementaryInstructions: promptRevision.supplementaryInstructions,
  };
}

export function sameDraft(a: GenerationDraft, b: GenerationDraft): boolean {
  const left = generationDraftSchema.safeParse(a),
    right = generationDraftSchema.safeParse(b);
  return (
    left.success &&
    right.success &&
    JSON.stringify(left.data) === JSON.stringify(right.data)
  );
}

export type CodexStatus = {
  state:
    | "not-installed"
    | "not-authenticated"
    | "unavailable"
    | "ready"
    | "running"
    | "completed"
    | "failed"
    | "cancelled";
  message: string;
  attemptId?: string;
  available?: boolean;
  multipleReferences?: boolean;
  phase?: GenerationPhase;
  execution?: GenerationExecution;
};
