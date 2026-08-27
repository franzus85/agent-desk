import type { AgentDeskApi } from "../shared/api.js";

declare global {
  interface Window {
    agentDesk: AgentDeskApi;
  }
}

const root = document.getElementById("root");

async function render(): Promise<void> {
  const pong = await window.agentDesk.ping();
  if (!root) return;
  root.textContent = "";

  const status = document.createElement("p");
  status.id = "status";
  status.textContent = `AgentDesk (bridge says: ${pong})`;
  root.appendChild(status);

  const button = document.createElement("button");
  button.id = "list-tools";
  button.textContent = "List tools (spawns real MCP servers in the utility process)";
  const output = document.createElement("pre");
  output.id = "tools-output";
  button.addEventListener("click", () => {
    void (async () => {
      output.textContent = "Loading…";
      const tools = await window.agentDesk.listTools();
      output.textContent = tools.join("\n");
    })();
  });
  root.appendChild(button);
  root.appendChild(output);
}

void render();
