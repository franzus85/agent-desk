import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool, ToolRegistry } from "@agent-desk/harness";
import { handleMcpRequest } from "./handle-request.js";

function registryWithEcho(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(
    defineTool({
      name: "echo",
      description: "Echoes the given message back.",
      inputSchema: z.object({ message: z.string() }),
      handler: async (input) => ({ echoed: input.message }),
    }),
  );
  return registry;
}

describe("handleMcpRequest", () => {
  it("lists tools with camelCase inputSchema", async () => {
    const response = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      registryWithEcho(),
    )) as { result: { tools: Array<{ name: string; inputSchema: unknown }> } };

    expect(response.result.tools).toEqual([
      {
        name: "echo",
        description: "Echoes the given message back.",
        inputSchema: expect.objectContaining({ type: "object" }),
      },
    ]);
  });

  it("calls a tool and wraps the result as text content", async () => {
    const response = (await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "echo", arguments: { message: "hi" } },
      },
      registryWithEcho(),
    )) as { result: { content: Array<{ text: string }>; isError: boolean } };

    expect(response.result.isError).toBe(false);
    expect(JSON.parse(response.result.content[0]?.text ?? "{}")).toEqual({ echoed: "hi" });
  });

  it("returns a JSON-RPC protocol error for an unknown tool", async () => {
    const response = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "missing", arguments: {} } },
      registryWithEcho(),
    )) as { error: { code: number } };

    expect(response.error.code).toBe(-32602);
  });

  it("returns isError: true for invalid tool input instead of a protocol error", async () => {
    const response = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "echo", arguments: { message: 42 } } },
      registryWithEcho(),
    )) as { result: { isError: boolean } };

    expect(response.result.isError).toBe(true);
  });

  it("returns method not found for an unrecognized method", async () => {
    const response = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 5, method: "resources/list" },
      registryWithEcho(),
    )) as { error: { code: number } };

    expect(response.error.code).toBe(-32601);
  });
});
