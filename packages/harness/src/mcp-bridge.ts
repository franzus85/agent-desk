import type { McpClient } from "@agent-desk/mcp-client";
import { ToolRegistry } from "./registry.js";

export interface McpServerConnection {
  // Namespace prefix applied to every tool this server exposes — this is
  // what turns a naive multi-server merge (which collides the moment two
  // servers both expose "search") into "notes.search" vs "wiki.search".
  id: string;
  client: McpClient;
}

// Extracts the plain-text result (or throws on isError) from an MCP
// tools/call result, and tries to parse it back to JSON — our own servers
// JSON.stringify structured results into a single text content block.
function unwrapToolResult(result: Record<string, unknown>, toolName: string, serverId: string): unknown {
  const content = result["content"] as Array<{ type: string; text?: string }> | undefined;
  const text = content?.map((block) => block.text ?? "").join("\n") ?? "";
  if (result["isError"] === true) {
    throw new Error(text || `Tool "${toolName}" on "${serverId}" failed.`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function registerMcpServer(registry: ToolRegistry, connection: McpServerConnection): Promise<void> {
  const outcome = await connection.client.listTools();
  if (outcome.status !== "complete") {
    throw new Error(`Listing tools from "${connection.id}" returned input_required, which isn't supported here.`);
  }

  const tools = outcome.result["tools"] as Array<{ name: string; description: string; inputSchema: unknown }>;
  for (const tool of tools) {
    registry.registerRemote({
      name: `${connection.id}.${tool.name}`,
      description: tool.description,
      inputSchema: tool.inputSchema,
      handler: async (input) => {
        const callOutcome = await connection.client.callTool(tool.name, input as Record<string, unknown>);
        if (callOutcome.status !== "complete") {
          throw new Error(`Calling "${tool.name}" on "${connection.id}" returned input_required, which isn't supported here.`);
        }
        return unwrapToolResult(callOutcome.result, tool.name, connection.id);
      },
    });
  }
}

export async function registerMcpServers(registry: ToolRegistry, connections: McpServerConnection[]): Promise<void> {
  for (const connection of connections) {
    await registerMcpServer(registry, connection);
  }
}
