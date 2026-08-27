// Same named-import caveat as main/index.ts: default import + destructure.
import electron from "electron";
import type { AgentDeskApi } from "../shared/api.js";

const { contextBridge, ipcRenderer } = electron;

// Narrow surface, explicit channel names — never expose ipcRenderer itself,
// or the renderer could invoke/listen on any channel it likes.
const api: AgentDeskApi = {
  ping: () => ipcRenderer.invoke("ping") as Promise<string>,
  echo: (text) => ipcRenderer.invoke("echo", { text }) as Promise<string>,
};

contextBridge.exposeInMainWorld("agentDesk", api);
