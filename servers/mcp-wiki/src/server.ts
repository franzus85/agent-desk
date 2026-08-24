import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { jsonRpcRequestSchema, type JsonRpcRequest } from "@agent-desk/mcp-client";
import { handleMcpRequest } from "@agent-desk/mcp-server-kit";
import { registry } from "./tools.js";

const PORT = Number(process.env["MCP_WIKI_PORT"] ?? 8934);
// Simulated network latency — this server exists to be "remote and slow"
// so we actually exercise the SSE response mode, not just plain JSON.
const SIMULATED_DELAY_MS = Number(process.env["MCP_WIKI_DELAY_MS"] ?? 300);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk: Buffer) => {
      data += chunk.toString("utf8");
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendHeaderMismatch(res: ServerResponse, id: unknown, message: string): void {
  sendJson(res, 400, { jsonrpc: "2.0", id: id ?? null, error: { code: -32020, message } });
}

function sseEvent(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

async function handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const origin = req.headers.origin;
  if (typeof origin === "string" && !isLocalOrigin(origin)) {
    res.writeHead(403);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/mcp") {
    res.writeHead(405, { Allow: "POST" });
    res.end();
    return;
  }

  const bodyText = await readBody(req);
  let raw: unknown;
  try {
    raw = JSON.parse(bodyText);
  } catch {
    sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    return;
  }

  const parsed = jsonRpcRequestSchema.safeParse(raw);
  if (!parsed.success) {
    sendJson(res, 400, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } });
    return;
  }
  const request: JsonRpcRequest = parsed.data;

  const meta = (request.params?.["_meta"] ?? {}) as Record<string, unknown>;
  if (req.headers["mcp-protocol-version"] !== meta["io.modelcontextprotocol/protocolVersion"]) {
    sendHeaderMismatch(res, request.id, "MCP-Protocol-Version header does not match body.");
    return;
  }
  if (req.headers["mcp-method"] !== request.method) {
    sendHeaderMismatch(res, request.id, "Mcp-Method header does not match body method.");
    return;
  }

  if (request.method === "tools/call") {
    if (req.headers["mcp-name"] !== request.params?.["name"]) {
      sendHeaderMismatch(res, request.id, "Mcp-Name header does not match body params.name.");
      return;
    }

    res.writeHead(200, { "Content-Type": "text/event-stream", "X-Accel-Buffering": "no" });
    res.write(
      sseEvent({
        jsonrpc: "2.0",
        method: "notifications/progress",
        params: { message: "querying wiki index..." },
      }),
    );
    await sleep(SIMULATED_DELAY_MS);
    const response = await handleMcpRequest(request, registry);
    res.write(sseEvent(response));
    res.end();
    return;
  }

  const response = await handleMcpRequest(request, registry);
  sendJson(res, 200, response);
}

const server = createServer((req, res) => {
  void handleHttpRequest(req, res);
});

server.listen(PORT, "127.0.0.1", () => {
  process.stderr.write(`[mcp-wiki] listening on http://127.0.0.1:${PORT}/mcp\n`);
});
