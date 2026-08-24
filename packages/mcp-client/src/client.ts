import { MCP_PROTOCOL_VERSION, jsonRpcResponseSchema } from "./protocol.js";
import type { JsonRpcRequest } from "./protocol.js";
import type { McpTransport } from "./transport.js";
import { McpError, McpErrorCode, toMcpError } from "./errors.js";

export interface McpClientOptions {
  transport: McpTransport;
  clientInfo?: { name: string; version: string };
  clientCapabilities?: Record<string, unknown>;
}

export type McpCallResult =
  | { status: "complete"; result: Record<string, unknown> }
  | { status: "input_required"; inputRequest: Record<string, unknown> };

export class McpClient {
  private readonly transport: McpTransport;
  private readonly clientInfo?: { name: string; version: string };
  private readonly clientCapabilities: Record<string, unknown>;
  private nextId = 1;

  constructor(options: McpClientOptions) {
    this.transport = options.transport;
    this.clientInfo = options.clientInfo;
    this.clientCapabilities = options.clientCapabilities ?? {};
  }

  async request(method: string, params: Record<string, unknown> = {}): Promise<McpCallResult> {
    const meta: Record<string, unknown> = {
      "io.modelcontextprotocol/protocolVersion": MCP_PROTOCOL_VERSION,
      "io.modelcontextprotocol/clientCapabilities": this.clientCapabilities,
    };
    if (this.clientInfo) {
      meta["io.modelcontextprotocol/clientInfo"] = this.clientInfo;
    }

    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: this.nextId++,
      method,
      params: { ...params, _meta: meta },
    };

    const raw = await this.transport.send(message);
    const parsed = jsonRpcResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new McpError(McpErrorCode.InternalError, `Malformed JSON-RPC response: ${parsed.error.message}`);
    }

    const response = parsed.data;
    if ("error" in response) {
      throw toMcpError(response.error);
    }

    const resultType = response.result.resultType ?? "complete";
    if (resultType === "input_required") {
      return { status: "input_required", inputRequest: response.result };
    }
    return { status: "complete", result: response.result };
  }

  listTools(): Promise<McpCallResult> {
    return this.request("tools/list");
  }

  callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallResult> {
    return this.request("tools/call", { name, arguments: args });
  }
}
