import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { jsonRpcRequestSchema, type JsonRpcRequest } from "@agent-desk/mcp-client";
import { handleMcpRequest } from "@agent-desk/mcp-server-kit";
import { registry } from "./tools.js";

const PORT = Number(process.env["MCP_WIKI_PORT"] ?? 8934);
// Simulated network latency — this server exists to be "remote and slow"
// so we actually exercise the SSE response mode, not just plain JSON.
const SIMULATED_DELAY_MS = Number(process.env["MCP_WIKI_DELAY_MS"] ?? 300);

// --- Mocked auth (Phase 2 Step 7) ---
// Stand-in for a real OAuth 2.1 resource-server integration, which this
// project deliberately reads about but does not build (docs/PRD.md, Phase 2:
// "read but do not build"). A real implementation would add, at minimum:
//  - RFC 9728 Protected Resource Metadata: this server would expose
//    /.well-known/oauth-protected-resource and reference it via the
//    WWW-Authenticate `resource_metadata` param on every 401, so a client
//    can discover which authorization server to use.
//  - RFC 8414 / OpenID Connect Discovery on that authorization server, plus
//    Client ID Metadata Documents (preferred as of 2026-07-28) or Dynamic
//    Client Registration for client registration.
//  - RFC 8707 Resource Indicators: the client requests a token scoped to
//    THIS server's canonical URI via a `resource` parameter on both the
//    authorization and token requests.
//  - Real audience validation here: the server MUST verify a presented
//    token was issued specifically for this resource, not merely that it's
//    *a* valid token from a trusted issuer. Skipping that check is exactly
//    what makes "token passthrough" an anti-pattern — a token minted for a
//    different resource could be replayed here and this mock would have no
//    way to tell.
//  - RFC 9207 `iss` validation client-side, against authorization mix-up
//    attacks across multiple authorization servers.
//  - 403 + `WWW-Authenticate: error="insufficient_scope"` for scope
//    step-up, instead of this mock's flat allow/deny.
const MOCK_TOKEN = process.env["MCP_WIKI_MOCK_TOKEN"] ?? "dev-mock-token";

function isAuthorized(req: IncomingMessage): boolean {
  return req.headers.authorization === `Bearer ${MOCK_TOKEN}`;
}

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

  if (!isAuthorized(req)) {
    res.writeHead(401, { "WWW-Authenticate": "Bearer" });
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
