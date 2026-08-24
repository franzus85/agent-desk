import { createInterface } from "node:readline";
import { jsonRpcRequestSchema, type JsonRpcRequest } from "@agent-desk/mcp-client";
import { ToolNotFoundError } from "@agent-desk/harness";
import { registry } from "./tools.js";

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  if (line.trim()) void handleLine(line);
});

async function handleLine(line: string): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    process.stderr.write(`[mcp-notes] Ignoring non-JSON line: ${line}\n`);
    return;
  }

  const parsed = jsonRpcRequestSchema.safeParse(raw);
  if (!parsed.success) {
    process.stderr.write(`[mcp-notes] Ignoring malformed request: ${parsed.error.message}\n`);
    return;
  }

  const response = await handleRequest(parsed.data);
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

async function handleRequest(request: JsonRpcRequest): Promise<unknown> {
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
    const name = params.name;
    const args = (params.arguments ?? {}) as Record<string, unknown>;

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

process.stderr.write("[mcp-notes] server ready\n");
