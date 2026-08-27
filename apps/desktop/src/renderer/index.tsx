import { createRoot } from "react-dom/client";
import type { AgentDeskApi } from "../shared/api.js";
import { App } from "./App.js";

declare global {
  interface Window {
    agentDesk: AgentDeskApi;
  }
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
