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

export interface HarnessErrorMessage {
  type: "error";
  message: string;
}

export type HarnessRequest = ListToolsRequest;
export type HarnessResponse = ListToolsResult | HarnessErrorMessage;
