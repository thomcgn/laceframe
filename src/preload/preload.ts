import { contextBridge, ipcRenderer } from "electron";
import type { LaceframeBridge } from "../shared/bridge";
// Each operation has its own channel. No generic invoke, filesystem or Node API escapes.
const bridge: LaceframeBridge = {
  revealMaster: (id) => ipcRenderer.invoke("generation:reveal-master", id),
  providers: () => ipcRenderer.invoke("generation:providers"),
  copyPrompt: (attemptId) =>
    ipcRenderer.invoke("generation:copy-prompt", attemptId),
  openChatGPT: (url) => ipcRenderer.invoke("generation:open-external", url),
  createProject: (name) => ipcRenderer.invoke("project:create", name),
  openProject: () => ipcRenderer.invoke("project:open"),
  command: (command) => ipcRenderer.invoke("project:command", command),
  chooseImage: () => ipcRenderer.invoke("image:choose"),
  stageImage: (bytes, name) =>
    ipcRenderer.invoke("image:stage", { bytes, name }),
  discardImage: (token) => ipcRenderer.invoke("image:discard", token),
  preview: (id) => ipcRenderer.invoke("image:preview", id),
};
contextBridge.exposeInMainWorld("laceframe", bridge);
