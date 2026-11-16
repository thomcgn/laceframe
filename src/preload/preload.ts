import { contextBridge, ipcRenderer } from "electron";
import type { LaceframeBridge } from "../shared/bridge";
// Each operation has its own channel. No generic invoke, filesystem or Node API escapes.
const bridge: LaceframeBridge = {
  analysisSource: (id) => ipcRenderer.invoke("image:analysis-source", id),
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
