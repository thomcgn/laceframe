import { contextBridge, ipcRenderer } from "electron";
import type { LaceframeBridge } from "../shared/bridge";
// Each operation has its own channel. No generic invoke, filesystem or Node API escapes.
const bridge: LaceframeBridge = {
  importStyleImages: (input) =>
    ipcRenderer.invoke("style:import-images", input),
  discardStyleImage: (token) =>
    ipcRenderer.invoke("style:discard-image", token),
  styleDraftSource: (token) => ipcRenderer.invoke("style:draft-source", token),
  checkStyleAnalysis: () => ipcRenderer.invoke("style:check"),
  startStyleAnalysis: (references) =>
    ipcRenderer.invoke("style:start", references),
  styleAnalysisStatus: () => ipcRenderer.invoke("style:status"),
  cancelStyleAnalysis: () => ipcRenderer.invoke("style:cancel"),
  importStyleSemantic: (input) =>
    ipcRenderer.invoke("style:import-semantic", input),
  preferences: () => ipcRenderer.invoke("app:preferences"),
  setLanguage: (language) => ipcRenderer.invoke("app:set-language", language),
  closeProject: () => ipcRenderer.invoke("project:close"),
  semanticLayers: (id) => ipcRenderer.invoke("image:semantic-layers", id),
  colorPalette: (id) => ipcRenderer.invoke("image:color-palette", id),
  colorRecipe: (id) => ipcRenderer.invoke("image:color-recipe", id),
  choosePack: (kind) => ipcRenderer.invoke("pack:choose", kind),
  exportPack: (selection) => ipcRenderer.invoke("pack:export", selection),
  cutoutSource: (id) => ipcRenderer.invoke("image:cutout-source", id),
  smartCutoutRecipe: (id) =>
    ipcRenderer.invoke("image:smart-cutout-recipe", id),
  pixelEditSource: (id) => ipcRenderer.invoke("image:pixel-edit-source", id),
  analysisSource: (id) => ipcRenderer.invoke("image:analysis-source", id),
  relightEligibility: (id) =>
    ipcRenderer.invoke("image:relight-eligibility", id),
  relightSource: (id) => ipcRenderer.invoke("image:relight-source", id),
  relightRecipe: (id) => ipcRenderer.invoke("image:relight-recipe", id),
  cutoutMask: (id) => ipcRenderer.invoke("image:cutout-mask", id),
  qualityReport: (id) => ipcRenderer.invoke("image:quality", id),
  exportAsset: (request) => ipcRenderer.invoke("image:export", request),
  checkCodex: () => ipcRenderer.invoke("generation:check"),
  startGeneration: (draft) => ipcRenderer.invoke("generation:start", draft),
  generationStatus: () => ipcRenderer.invoke("generation:status"),
  cancelGeneration: () => ipcRenderer.invoke("generation:cancel"),
  revealMaster: (id) => ipcRenderer.invoke("generation:reveal-master", id),
  providers: () => ipcRenderer.invoke("generation:providers"),
  copyPrompt: (attemptId) =>
    ipcRenderer.invoke("generation:copy-prompt", attemptId),
  openChatGPT: (url) => ipcRenderer.invoke("generation:open-external", url),
  createProject: (name) => ipcRenderer.invoke("project:create", name),
  openProject: () => ipcRenderer.invoke("project:open"),
  command: (command) => ipcRenderer.invoke("project:command", command),
  importIdentityImages: (input) => ipcRenderer.invoke("identity:import", input),
  chooseImage: (purpose?: "identity") =>
    ipcRenderer.invoke("image:choose", purpose),
  stageImage: (bytes: Uint8Array, name: string, purpose?: "identity") =>
    ipcRenderer.invoke("image:stage", {
      bytes,
      name,
      ...(purpose ? { purpose } : {}),
    }),
  discardImage: (token) => ipcRenderer.invoke("image:discard", token),
  preview: (id) => ipcRenderer.invoke("image:preview", id),
};
contextBridge.exposeInMainWorld("laceframe", bridge);
