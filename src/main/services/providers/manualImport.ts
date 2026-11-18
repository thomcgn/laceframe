import { tr } from "../../../shared/locales/index";
import { effectiveStyle, referencesForStyle } from "../../../shared/domain";
import type { ImageGenerationProvider } from "../../../shared/generation";
export const manualImportProvider: ImageGenerationProvider = {
  descriptor: {
    id: "manual-import",
    get label() {
      return tr("errors.mfcfadfe115");
    },
    capabilities: {
      canGenerate: false,
      supportsReferenceImages: false,
      supportsEditingMasks: false,
      canImportResult: true,
    },
  },
  async authenticate() {
    return {
      status: "not-required",
      reason: tr("errors.md1699710a3"),
    };
  },
  getCapabilities() {
    return this.descriptor.capabilities;
  },
  async generateImage() {
    throw new Error(tr("errors.m561d25016d"));
  },
  async editImage() {
    throw new Error(tr("errors.mfb9c6aa81f"));
  },
  async cancelGeneration() {
    throw new Error(tr("errors.m178b5b6b53"));
  },
  async getGenerationResult(project, attemptId) {
    const attempt = project.attempts.find(
      (a) => a.id === attemptId && a.providerId === "manual-import",
    );
    if (!attempt) throw new Error(tr("errors.m21412c11d4"));
    const asset = project.assets.find((a) => a.attemptId === attempt.id);
    return asset
      ? {
          providerId: "manual-import",
          outputAssetPath: asset.file,
          prompt: attempt.promptRevision.prompt,
          createdAt: asset.createdAt,
        }
      : null;
  },
  prepare(project, draft) {
    const master = project.masters.find(
      (m) =>
        m.id === draft.masterId &&
        m.characterId === draft.characterId &&
        m.sha256 === draft.masterSha256 &&
        m.locked,
    );
    if (!master || !project.variants.some((v) => v.id === draft.variantId))
      throw new Error(tr("errors.md8bcfc6d19"));
    if (draft.mask) {
      const mask = project.masks.find((m) => m.id === draft.mask!.id);
      if (
        !mask ||
        mask.masterId !== master.id ||
        mask.characterId !== draft.characterId ||
        mask.sha256 !== draft.mask.sha256 ||
        mask.revision !== draft.mask.revision
      )
        throw new Error(tr("errors.m34e1d9ac75"));
    }
    const style = effectiveStyle(project, draft.characterId);
    if (
      JSON.stringify(draft.styleReferences ?? []) !==
      JSON.stringify(referencesForStyle(project, style))
    )
      throw new Error(tr("errors.mcc75af575b"));
    if (
      draft.artDirectionId !== style?.id ||
      draft.artDirectionRevision !== style?.revision
    )
      throw new Error(tr("errors.m81c5dcf5f0"));
    const personal = project.expressionPerformances.find(
      (e) =>
        e.characterId === draft.characterId && e.variantId === draft.variantId,
    );
    if (draft.expressionPerformance !== personal?.direction)
      throw new Error(tr("errors.m088d45b141"));
    return { ...draft, projectId: project.id, referenceAssetPath: master.file };
  },
  acceptImportedResult(request, storedPath) {
    return {
      providerId: "manual-import",
      outputAssetPath: storedPath,
      prompt: request.prompt,
      createdAt: new Date().toISOString(),
    };
  },
};
