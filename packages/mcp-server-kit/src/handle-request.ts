import type { JsonRpcRequest } from "@agent-desk/mcp-client";
import { ToolNotFoundError, type ToolRegistry } from "@agent-desk/harness";

// Shared by every MCP server we write: given a parsed, already-validated
// JsonRpcRequest and the tool registry backing it, produce the JSON-RPC
// response object. Transport-specific framing (stdio newline-JSON, HTTP
// POST/SSE) stays in each server; only this dispatch logic is shared.
export async function handleMcpRequest(request: JsonRpcRequest, registry: ToolRegistry): Promise<unknown> {
  if (request.method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id: request.id,
      result: {
        resultType: "complete",
        tools: registry.specs().map((spec) => ({
          name: spec.name,
          description: spec.description,
          inputSchema: spec.inputSchema,
        })),
      },
    };
  }

  if (request.method === "tools/call") {
    const params = request.params ?? {};
    const name = params["name"];
    const args = (params["arguments"] ?? {}) as Record<string, unknown>;

    if (typeof name !== "string") {
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32602, message: "Invalid params: 'name' must be a string." },
      };
    }

    try {
      const result = await registry.execute(name, args);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          resultType: "complete",
          content: [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }],
          isError: false,
        },
      };
    } catch (error) {
      // Unknown tool is a protocol-structural problem (JSON-RPC error, like the
      // spec's own "Unknown tool" example); anything else — bad input, a
      // handler failure — is a tool execution error the model can act on.
      if (error instanceof ToolNotFoundError) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32602, message: error.message },
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          resultType: "complete",
          content: [{ type: "text", text: message }],
          isError: true,
        },
      };
    }
  }

  return {
    jsonrpc: "2.0",
    id: request.id,
    error: { code: -32601, message: `Method not found: ${request.method}` },
  };
}
