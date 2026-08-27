// Runs inside an Electron utility process (utilityProcess.fork), not the
// main or renderer process — a real, unsandboxed Node process whose job is
// the harness's real work: spawning MCP server child processes and calling
// the Anthropic API. process.parentPort is Electron's utility-process IPC
// surface, analogous to Node's own process.send/on.
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { McpClient, StdioTransport } from "@agent-desk/mcp-client";
import { registerMcpServers, runAgent, ToolRegistry } from "@agent-desk/harness";
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

// Cancel support: closing the transports mid-flight rejects any in-flight
// tool call the harness is awaiting, which the harness turns into a real
// tool.failed event — an actual aborted-in-flight signal, not a synthetic
// one. cancelled short-circuits the *next* event forwarded, so nothing
// after a cancel reaches the renderer even if a few more events are
// already queued up when it lands.
let activeTransports: { notes: StdioTransport; calendar: StdioTransport } | undefined;
let cancelled = false;

async function startRun(prompt: string): Promise<void> {
  cancelled = false;
  const notesTransport = new StdioTransport(tsxBin, [notesEntry]);
  const calendarTransport = new StdioTransport(tsxBin, [calendarEntry]);
  activeTransports = { notes: notesTransport, calendar: calendarTransport };
  try {
    const registry = new ToolRegistry();
    await registerMcpServers(registry, [
      { id: "notes", client: new McpClient({ transport: notesTransport }) },
      { id: "calendar", client: new McpClient({ transport: calendarTransport }) },
    ]);
    const client = new Anthropic();
    for await (const event of runAgent({ client, registry, task: prompt, runId: randomUUID() })) {
      if (cancelled) break;
      process.parentPort.postMessage({ type: "agent-event", event } satisfies HarnessResponse);
    }
  } catch (error) {
    if (!cancelled) {
      const message = error instanceof Error ? error.message : String(error);
      process.parentPort.postMessage({ type: "error", message } satisfies HarnessResponse);
    }
  } finally {
    notesTransport.close();
    calendarTransport.close();
    activeTransports = undefined;
  }
}

function cancelRun(): void {
  cancelled = true;
  activeTransports?.notes.close();
  activeTransports?.calendar.close();
}

process.parentPort.on("message", (portEvent) => {
  const request = portEvent.data as HarnessRequest;
  switch (request.type) {
    case "list-tools":
      void listTools()
        .then((tools) => process.parentPort.postMessage({ type: "list-tools-result", tools } satisfies HarnessResponse))
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          process.parentPort.postMessage({ type: "error", message } satisfies HarnessResponse);
        });
      break;
    case "start-run":
      void startRun(request.prompt);
      break;
    case "cancel-run":
      cancelRun();
      break;
  }
});
