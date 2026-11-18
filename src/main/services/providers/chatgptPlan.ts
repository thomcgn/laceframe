import { tr } from "../../../shared/locales/index";
import type { ImageGenerationProvider } from "../../../shared/generation";

// Verified 2026-11-16: OAuth/plan permission is not image-generation permission.
// https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations
export const CHATGPT_PLAN_LIMITATION = tr("common.m97941cec0b");
const unavailable = (): never => {
  throw new Error(CHATGPT_PLAN_LIMITATION);
};
export const chatgptPlanProvider: ImageGenerationProvider = {
  descriptor: {
    id: "chatgpt-plan",
    get label() {
      return tr("errors.m8239ec5e59");
    },
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
