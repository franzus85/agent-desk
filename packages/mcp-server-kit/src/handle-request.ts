import type { JsonRpcRequest } from "@agent-desk/mcp-client";
import { ElicitationRequired, ToolNotFoundError, type ToolRegistry } from "@agent-desk/harness";

interface PendingCall {
  name: string;
  arguments: Record<string, unknown>;
}

function encodeRequestState(pending: PendingCall): string {
  return Buffer.from(JSON.stringify(pending), "utf8").toString("base64");
}

function decodeRequestState(requestState: string): PendingCall {
  return JSON.parse(Buffer.from(requestState, "base64").toString("utf8")) as PendingCall;
}

interface InputResponse {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>;
}

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
    const inputResponses = params["inputResponses"] as Record<string, InputResponse> | undefined;
    const requestState = params["requestState"];

    let name: unknown;
    let args: Record<string, unknown>;

    if (inputResponses && typeof requestState === "string") {
      // Resuming a call that previously asked for input — requestState is
      // the source of truth for what we were doing (MCP has no session, so
      // this is the only place that context can live between requests).
      const pending = decodeRequestState(requestState);
      name = pending.name;
      const confirmResponse = inputResponses["confirm"];
      if (confirmResponse?.action !== "accept") {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            resultType: "complete",
            content: [{ type: "text", text: "User declined the requested confirmation." }],
            isError: true,
          },
        };
      }
      args = { ...pending.arguments, confirmOverwrite: confirmResponse.content?.["confirm"] ?? true };
    } else {
      name = params["name"];
      args = (params["arguments"] ?? {}) as Record<string, unknown>;
    }

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
      if (error instanceof ElicitationRequired) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            resultType: "input_required",
            inputRequests: {
              confirm: {
                method: "elicitation/create",
                params: { mode: "form", message: error.message, requestedSchema: error.requestedSchema },
              },
            },
            requestState: encodeRequestState({ name, arguments: args }),
          },
        };
      }
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
