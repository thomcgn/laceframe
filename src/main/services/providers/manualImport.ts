import type { ImageGenerationProvider } from "../../../shared/generation";
export const manualImportProvider: ImageGenerationProvider = {
  descriptor: {
    id: "manual-import",
    label: "Manueller Import",
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
      reason: "Manueller Import benötigt keine Anmeldung.",
    };
  },
  getCapabilities() {
    return this.descriptor.capabilities;
  },
  async generateImage() {
    throw new Error(
      "Manueller Import erzeugt keine Bilder. Ein tatsächliches Ergebnis importieren.",
    );
  },
  async editImage() {
    throw new Error(
      "Manueller Import bearbeitet keine Bilder. Ein überarbeitetes Ergebnis importieren.",
    );
  },
  async cancelGeneration() {
    throw new Error("Im manuellen Modus läuft keine Generierung.");
  },
  async getGenerationResult(project, attemptId) {
    const attempt = project.attempts.find(
      (a) => a.id === attemptId && a.providerId === "manual-import",
    );
    if (!attempt) throw new Error("Unbekannter manueller Versuch.");
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
      throw new Error("Freigegebenen Master und gültige Variante auswählen.");
    if ((draft.artDirectionId === undefined) !== (draft.artDirectionRevision === undefined))
      throw new Error("Art Direction und Revision müssen zusammen angegeben werden.");
    if (draft.artDirectionId) {
      const style = project.artDirections.find((a) => a.id === draft.artDirectionId);
      if (!style || style.id !== project.defaultArtDirectionId ||
          style.revision !== draft.artDirectionRevision)
        throw new Error("Art Direction wurde geändert. Prompt erneut aufbauen.");
    }
    if (draft.expressionPerformance !== undefined) {
      const personal = project.expressionPerformances.find(
        (e) => e.characterId === draft.characterId && e.variantId === draft.variantId,
      );
      if (!personal || personal.direction !== draft.expressionPerformance)
        throw new Error("Persönlicher Ausdruck wurde geändert. Prompt erneut aufbauen.");
    }
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
