import { MCP_PROTOCOL_VERSION, type JsonRpcRequest } from "./protocol.js";
import type { McpTransport } from "./transport.js";
import { McpTransportError } from "./stdio-transport.js";

export interface HttpTransportOptions {
  url: string;
  // Static extra headers, or a function called per-request (e.g. to attach a
  // bearer token that can rotate — see the mocked auth in Step 7).
  headers?: Record<string, string> | (() => Record<string, string>);
}

export class HttpTransport implements McpTransport {
  private readonly url: string;
  private readonly headersProvider: () => Record<string, string>;

  constructor(options: HttpTransportOptions) {
    this.url = options.url;
    const headers = options.headers;
    this.headersProvider = typeof headers === "function" ? headers : () => headers ?? {};
  }

  async send(message: JsonRpcRequest): Promise<unknown> {
    const meta = (message.params?.["_meta"] ?? {}) as Record<string, unknown>;
    const protocolVersion = meta["io.modelcontextprotocol/protocolVersion"];

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": typeof protocolVersion === "string" ? protocolVersion : MCP_PROTOCOL_VERSION,
      "Mcp-Method": message.method,
      ...this.headersProvider(),
    };

    const name = message.params?.["name"];
    if (typeof name === "string") {
      headers["Mcp-Name"] = name;
    }

    const response = await fetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new McpTransportError(`HTTP ${response.status} from MCP server: ${body}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      return this.readSseResponse(response);
    }
    return response.json();
  }

  // Minimal, non-resumable SSE reader: the current spec dropped resumability
  // (Last-Event-ID) entirely, so we only need to collect "data:" lines per
  // event and keep the last event that looks like a JSON-RPC result/error —
  // anything else (e.g. notifications/progress) is informational only.
  private async readSseResponse(response: Response): Promise<unknown> {
    const body = response.body;
    if (!body) {
      throw new McpTransportError("SSE response from MCP server had no body.");
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalMessage: unknown;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const rawEvents = buffer.split("\n\n");
      buffer = rawEvents.pop() ?? "";
      for (const rawEvent of rawEvents) {
        const parsed = parseSseEvent(rawEvent);
        if (parsed && (typeof parsed === "object") && ("result" in parsed || "error" in parsed)) {
          finalMessage = parsed;
        }
      }
    }

    if (finalMessage === undefined) {
      throw new McpTransportError("SSE stream from MCP server ended without a final JSON-RPC response.");
    }
    return finalMessage;
  }
}

function parseSseEvent(rawEvent: string): unknown {
  const dataLines = rawEvent
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());
  if (dataLines.length === 0) return undefined;
  try {
    return JSON.parse(dataLines.join("\n"));
  } catch {
    return undefined;
  }
}
