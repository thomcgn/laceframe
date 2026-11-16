import type { ImageGenerationProvider } from "../../../shared/generation";

// Verified 2026-11-16: OAuth/plan permission is not image-generation permission.
// https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
export const CHATGPT_PLAN_LIMITATION =
  "ChatGPT-Plan: Bildgenerierung und Bildbearbeitung sind über den offiziellen Plan-Zugang derzeit nicht unterstützt. Eine Anmeldung schaltet sie nicht frei. Nutze den manuellen Ergebnisimport.";
const unavailable = (): never => {
  throw new Error(CHATGPT_PLAN_LIMITATION);
};
export const chatgptPlanProvider: ImageGenerationProvider = {
  descriptor: {
    id: "chatgpt-plan",
    label: "ChatGPT-Plan · Bildgenerierung nicht verfügbar",
    capabilities: {
      canGenerate: false,
      supportsReferenceImages: false,
      supportsEditingMasks: false,
      canImportResult: false,
    },
    unavailableReason: CHATGPT_PLAN_LIMITATION,
  },
  async authenticate() {
    return { status: "unavailable", reason: CHATGPT_PLAN_LIMITATION };
  },
  getCapabilities() {
    return this.descriptor.capabilities;
  },
  async generateImage() {
    return unavailable();
  },
  async editImage() {
    return unavailable();
  },
  async cancelGeneration() {
    return unavailable();
  },
  async getGenerationResult() {
    return unavailable();
  },
  prepare: unavailable,
  acceptImportedResult: unavailable,
};
