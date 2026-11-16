import { contextBridge, ipcRenderer } from "electron";
import type { LaceframeBridge } from "../shared/bridge";
// Each operation has its own channel. No generic invoke, filesystem or Node API escapes.
const bridge: LaceframeBridge = {
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
