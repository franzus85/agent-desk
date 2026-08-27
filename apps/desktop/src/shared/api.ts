// Single source of truth for the contextBridge surface — imported by both
// preload (which implements it) and the renderer (which types window.agentDesk
// against it). Keeping it here means the two sides can never silently drift.
export interface AgentDeskApi {
  ping(): Promise<string>;
}
