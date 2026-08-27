// Same named-import caveat as main/index.ts: default import + destructure.
import electron from "electron";
import type { AgentEvent } from "@agent-desk/protocol";
import type { AgentDeskApi } from "../shared/api.js";
import { AGENT_EVENT_CHANNEL } from "../shared/ipc-channels.js";

const { contextBridge, ipcRenderer } = electron;

// Narrow surface, explicit channel names — never expose ipcRenderer itself,
// or the renderer could invoke/listen on any channel it likes.
const api: AgentDeskApi = {
  ping: () => ipcRenderer.invoke("ping") as Promise<string>,
  echo: (text) => ipcRenderer.invoke("echo", { text }) as Promise<string>,
  listTools: () => ipcRenderer.invoke("listTools") as Promise<string[]>,
  saveConnectorSecret: (name, value) => ipcRenderer.invoke("saveConnectorSecret", { name, value }) as Promise<void>,
  verifyConnectorSecret: (name, expected) =>
    ipcRenderer.invoke("verifyConnectorSecret", { name, expected }) as Promise<boolean>,
  startRun: (prompt) => ipcRenderer.invoke("startRun", { prompt }) as Promise<void>,
  cancelRun: () => ipcRenderer.invoke("cancelRun") as Promise<void>,
  onAgentEvent: (listener) => {
    const handler = (_ipcEvent: unknown, event: AgentEvent) => listener(event);
    ipcRenderer.on(AGENT_EVENT_CHANNEL, handler);
    return () => ipcRenderer.removeListener(AGENT_EVENT_CHANNEL, handler);
  },
};

contextBridge.exposeInMainWorld("agentDesk", api);
