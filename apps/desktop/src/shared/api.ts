import type { AgentEvent } from "@agent-desk/protocol";

// Single source of truth for the contextBridge surface — imported by both
// preload (which implements it) and the renderer (which types window.agentDesk
// against it). Keeping it here means the two sides can never silently drift.
export interface AgentDeskApi {
  ping(): Promise<string>;
  echo(text: string): Promise<string>;
  listTools(): Promise<string[]>;
  saveConnectorSecret(name: string, value: string): Promise<void>;
  // Never returns the decrypted secret itself — only whether it matches.
  verifyConnectorSecret(name: string, expected: string): Promise<boolean>;
  startRun(prompt: string): Promise<void>;
  cancelRun(): Promise<void>;
  // Returns an unsubscribe function — the only thing exposed here is "give
  // me events", never ipcRenderer itself.
  onAgentEvent(listener: (event: AgentEvent) => void): () => void;
}
