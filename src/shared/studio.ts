import { tr } from "./locales/index";
import { newComposer, updateComposer, type ComposerState } from "./generation";
import type { Project } from "./domain";
export type Workspace =
  | "Characters"
  | "Art Direction"
  | "Expressions"
  | "Studio"
  | "Library"
  | "Motion";
/** Current form owns validation and submission; header holds no draft state. */
export type StudioGenerationAction = { generate(): void };
export type StudioMode = "master" | "expression";
export type PromptMode = "automatic" | "supplement" | "expert";
/** Ephemeral navigation intent. IDs select existing records; never alter historical references. */
export type StudioIntent = {
  serial: number;
  characterId: string;
  mode: StudioMode;
  masterId?: string;
  rebuild?: boolean;
  styleId?: string;
  candidateId?: string;
  familyId?: string;
  variantId?: string;
};
export function updateStudioPrompt(
  state: ComposerState,
  base: string,
  mode: PromptMode,
): ComposerState {
  return mode === "expert"
    ? updateComposer(state, base)
    : base === state.base && state.text === base
      ? { ...state, pendingBase: undefined }
      : newComposer(base);
}
export type Requirement = { message: string; target?: string };
export function promptRequirements(
  mode: PromptMode,
  state: ComposerState,
  base: string,
): Requirement[] {
  if (mode === "expert" && state.pendingBase !== undefined)
    return [
      {
        message: tr("studio.mef617c52e3"),
        target: "prompt-builder",
      },
    ];
  if (!state.text.trim() || (mode !== "expert" && state.base !== base))
    return [
      {
        message: tr("studio.m4a6847a574"),
        target: "prompt-builder",
      },
    ];
  return [];
}
export function libraryAssets(p: Project, characterId: string) {
  return [
    ...p.masters
      .filter(
        (a) =>
          a.characterId === characterId &&
          !("discardedAt" in a && a.discardedAt),
      )
      .map((a) => ({
        ...a,
        kind: "master" as const,
        label: tr("studio.mf483464116", { v0: a.version }),
        state: "approved" as const,
      })),
    ...p.masterCandidates
      .filter(
        (a) =>
          a.characterId === characterId &&
          !("discardedAt" in a && a.discardedAt),
      )
      .map((a, i) => ({
        ...a,
        kind: "master-candidate" as const,
        label: tr("studio.m89ca618483", { v0: i + 1 }),
        state: a.status,
      })),
    ...p.assets
      .filter(
        (a) =>
          a.characterId === characterId &&
          !("discardedAt" in a && a.discardedAt),
      )
      .map((a) => ({
        ...a,
        kind: "expression" as const,
        label: tr("studio.m255c5feafc", {
          v0:
            p.variants.find((v) => v.id === a.variantId)?.label ?? "Expression",
          v1: a.composite ? " · Composite" : "",
        }),
        state: a.status,
      })),
    ...p.qualityAssets
      .filter(
        (a) =>
          a.characterId === characterId &&
          !("discardedAt" in a && a.discardedAt),
      )
      .map((a, i) => ({
        ...a,
        kind: "quality" as const,
        label: tr("studio.m672261d1a3", { v0: i + 1, v1: a.operation }),
        state: a.status,
      })),
  ];
}

/** Resolve provenance, never the character's current master, including quality descendants. */
export function libraryMasterId(p: Project, id: string): string | undefined {
  const seen = new Set<string>();
  while (!seen.has(id)) {
    seen.add(id);
    const master = p.masters.find((a) => a.id === id);
    if (master) return master.id;
    const expression = p.assets.find((a) => a.id === id);
    if (expression) return expression.masterId;
    const candidate = p.masterCandidates.find((a) => a.id === id);
    if (candidate) return candidate.approvedMasterId;
    const quality = p.qualityAssets.find((a) => a.id === id);
    if (!quality) return undefined;
    if (quality.approvedMasterId) return quality.approvedMasterId;
    id = quality.sourceId;
  }
  return undefined;
}
