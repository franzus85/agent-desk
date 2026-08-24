import { describe, expect, it } from "vitest";
import { McpClient, type McpTransport } from "@agent-desk/mcp-client";
import { ToolRegistry } from "./registry.js";
import { registerMcpServer, registerMcpServers } from "./mcp-bridge.js";

// A fake MCP server exposing a single "search" tool that just echoes back
// which server answered — enough to prove dispatch goes to the right place.
function fakeServerClient(serverName: string): McpClient {
  const transport: McpTransport = {
    async send(message) {
      if (message.method === "tools/list") {
        return {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            resultType: "complete",
            tools: [{ name: "search", description: `${serverName}'s search`, inputSchema: { type: "object" } }],
          },
        };
      }
      if (message.method === "tools/call") {
        const args = message.params?.["arguments"] as { query?: string } | undefined;
        if (args?.query === "boom") {
          return {
            jsonrpc: "2.0",
            id: message.id,
            result: { resultType: "complete", content: [{ type: "text", text: "simulated failure" }], isError: true },
          };
        }
        return {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            resultType: "complete",
            content: [{ type: "text", text: JSON.stringify({ answeredBy: serverName }) }],
            isError: false,
          },
        };
      }
      throw new Error(`Unexpected method in fake transport: ${message.method}`);
    },
  };
  return new McpClient({ transport });
}

describe("registerMcpServers", () => {
  it("namespaces tools by server id, avoiding the bare-name collision", async () => {
    const registry = new ToolRegistry();
    await registerMcpServers(registry, [
      { id: "notes", client: fakeServerClient("notes") },
      { id: "wiki", client: fakeServerClient("wiki") },
    ]);

    const names = registry.specs().map((spec) => spec.name);
    expect(names).toEqual(["notes.search", "wiki.search"]);
  });

  it("dispatches each namespaced tool to its own server", async () => {
    const registry = new ToolRegistry();
    await registerMcpServers(registry, [
      { id: "notes", client: fakeServerClient("notes") },
      { id: "wiki", client: fakeServerClient("wiki") },
    ]);

    expect(await registry.execute("notes.search", { query: "x" })).toEqual({ answeredBy: "notes" });
    expect(await registry.execute("wiki.search", { query: "x" })).toEqual({ answeredBy: "wiki" });
  });

  it("throws when the remote tool call reports isError: true", async () => {
    const registry = new ToolRegistry();
    await registerMcpServer(registry, { id: "notes", client: fakeServerClient("notes") });

    await expect(registry.execute("notes.search", { query: "boom" })).rejects.toThrow("simulated failure");
  });
});
