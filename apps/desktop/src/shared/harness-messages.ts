import type { AgentEvent } from "@agent-desk/protocol";

// Structured message protocol between the main process and the harness
// utility process (Electron's utilityProcess.fork + process.parentPort —
// not a full renderer, just an isolated Node process for real work the
// sandboxed renderer/preload can't do: spawning MCP server child processes,
// calling the Anthropic API).
export interface ListToolsRequest {
  type: "list-tools";
}

export interface ListToolsResult {
  type: "list-tools-result";
  tools: string[];
}

// start-run/cancel-run are fire-and-forget from main's side — the actual
// payload comes back as a *stream* of agent-event messages, not a single
// reply, so these don't go through the one-shot request/response helper.
export interface StartRunRequest {
  type: "start-run";
  prompt: string;
}

export interface CancelRunRequest {
  type: "cancel-run";
}

export interface AgentEventMessage {
  type: "agent-event";
  event: AgentEvent;
}

export interface HarnessErrorMessage {
  type: "error";
  message: string;
}

export type HarnessRequest = ListToolsRequest | StartRunRequest | CancelRunRequest;
export type HarnessResponse = ListToolsResult | AgentEventMessage | HarnessErrorMessage;
