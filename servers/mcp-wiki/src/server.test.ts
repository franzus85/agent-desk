import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpClient, HttpTransport } from "@agent-desk/mcp-client";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const tsxBin = join(packageRoot, "node_modules", ".bin", "tsx");
const serverEntry = join(here, "server.ts");
const PORT = 8935;

let child: ChildProcess;
let client: McpClient;

beforeAll(async () => {
  child = spawn(tsxBin, [serverEntry], {
    env: { ...process.env, MCP_WIKI_PORT: String(PORT), MCP_WIKI_DELAY_MS: "50" },
    stdio: ["ignore", "ignore", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("mcp-wiki server did not start in time")), 5000);
    child.stderr?.on("data", (chunk: Buffer) => {
      if (chunk.toString("utf8").includes("listening on")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });

  client = new McpClient({ transport: new HttpTransport({ url: `http://127.0.0.1:${PORT}/mcp` }) });
});

afterAll(() => {
  child.kill();
});

describe("mcp-wiki server (real HTTP process)", () => {
  it("responds to tools/list as plain JSON", async () => {
    const outcome = await client.listTools();
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") throw new Error("unreachable");

    const names = (outcome.result["tools"] as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(["wiki.search", "wiki.get"]);
  });

  it("responds to tools/call over SSE (progress notification, then the result)", async () => {
    const outcome = await client.callTool("wiki.search", { query: "roadmap" });
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") throw new Error("unreachable");

    const content = outcome.result["content"] as Array<{ text: string }>;
    expect(JSON.parse(content[0]?.text ?? "[]")).toEqual([{ id: "q3-roadmap", title: "Q3 Roadmap" }]);
  });

  it("rejects a request whose Mcp-Method header does not match the body (HeaderMismatch)", async () => {
    const response = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2026-07-28",
        "Mcp-Method": "tools/list", // deliberately wrong for a tools/call body
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "wiki.search",
          arguments: { query: "x" },
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: number } };
    expect(body.error.code).toBe(-32020);
  });
});
