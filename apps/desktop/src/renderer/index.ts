import type { AgentDeskApi } from "../shared/api.js";

declare global {
  interface Window {
    agentDesk: AgentDeskApi;
  }
}

const root = document.getElementById("root");

async function render(): Promise<void> {
  const pong = await window.agentDesk.ping();
  if (root) root.textContent = `AgentDesk (bridge says: ${pong})`;
}

void render();
