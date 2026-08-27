// Runs inside an Electron utility process (utilityProcess.fork), not the
// main or renderer process — a real, unsandboxed Node process whose only
// job is the harness's real work: spawning MCP server child processes and
// (eventually) calling the Anthropic API. process.parentPort is Electron's
// utility-process IPC surface, analogous to Node's own process.send/on.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpClient, StdioTransport } from "@agent-desk/mcp-client";
import { registerMcpServers, ToolRegistry } from "@agent-desk/harness";
import type { HarnessRequest, HarnessResponse } from "../shared/harness-messages.js";

// dist/utility/index.mjs -> repo root is four levels up.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");
const notesEntry = join(repoRoot, "servers", "mcp-notes", "src", "server.ts");
const calendarEntry = join(repoRoot, "servers", "mcp-calendar", "src", "server.ts");

async function listTools(): Promise<string[]> {
  const notesTransport = new StdioTransport(tsxBin, [notesEntry]);
  const calendarTransport = new StdioTransport(tsxBin, [calendarEntry]);
  try {
    const registry = new ToolRegistry();
    await registerMcpServers(registry, [
      { id: "notes", client: new McpClient({ transport: notesTransport }) },
      { id: "calendar", client: new McpClient({ transport: calendarTransport }) },
    ]);
    return registry.specs().map((spec) => spec.name);
  } finally {
    notesTransport.close();
    calendarTransport.close();
  }
}

async function handleRequest(request: HarnessRequest): Promise<HarnessResponse> {
  switch (request.type) {
    case "list-tools":
      return { type: "list-tools-result", tools: await listTools() };
  }
}

process.parentPort.on("message", (event) => {
  const request = event.data as HarnessRequest;
  void handleRequest(request)
    .then((response) => process.parentPort.postMessage(response))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.parentPort.postMessage({ type: "error", message } satisfies HarnessResponse);
    });
});
