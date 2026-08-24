import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { McpClient, StdioTransport } from "@agent-desk/mcp-client";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const serverEntry = join(here, "server.ts");
// Node runs .ts files natively but does not rewrite our NodeNext ".js"
// import specifiers to the sibling ".ts" files — that resolution is a
// TypeScript/tsx-specific behavior, so real (non-fixture) sources still need
// tsx to run standalone.
const tsxBin = join(packageRoot, "node_modules", ".bin", "tsx");

let dataDir: string;
let transport: StdioTransport;
let client: McpClient;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "mcp-notes-test-"));
  transport = new StdioTransport(tsxBin, [serverEntry], {
    env: { ...process.env, MCP_NOTES_DATA_DIR: dataDir },
  });
  client = new McpClient({ transport });
});

afterEach(async () => {
  transport.close();
  await rm(dataDir, { recursive: true, force: true });
});

describe("mcp-notes server (real process, real files)", () => {
  it("lists tools with camelCase inputSchema", async () => {
    const outcome = await client.listTools();
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") throw new Error("unreachable");

    const names = (outcome.result["tools"] as Array<{ name: string }>).map((t) => t.name);
    expect(names).toEqual(["notes.list", "notes.search", "notes.write"]);

    const writeTool = (outcome.result["tools"] as Array<{ name: string; inputSchema: unknown }>).find(
      (t) => t.name === "notes.write",
    );
    expect(writeTool?.inputSchema).toMatchObject({
      type: "object",
      properties: { title: { type: "string" }, body: { type: "string" } },
    });
  });

  it("writes a real file, then finds it via list and search", async () => {
    const writeOutcome = await client.callTool("notes.write", {
      title: "sprint-42",
      body: "Shipped the MCP client.",
    });
    expect(writeOutcome.status).toBe("complete");

    const listOutcome = await client.callTool("notes.list", {});
    if (listOutcome.status !== "complete") throw new Error("unreachable");
    const listContent = listOutcome.result["content"] as Array<{ text: string }>;
    expect(JSON.parse(listContent[0]?.text ?? "[]")).toContain("sprint-42");

    const searchOutcome = await client.callTool("notes.search", { query: "MCP client" });
    if (searchOutcome.status !== "complete") throw new Error("unreachable");
    const searchContent = searchOutcome.result["content"] as Array<{ text: string }>;
    expect(searchContent[0]?.text).toContain("sprint-42");
  });

  it("returns isError: true (tool execution error) for invalid input, not a hang", async () => {
    const outcome = await client.callTool("notes.write", { title: "missing-body" });
    if (outcome.status !== "complete") throw new Error("unreachable");
    expect(outcome.result["isError"]).toBe(true);
  });

  it("returns a JSON-RPC protocol error for an unknown tool", async () => {
    await expect(client.callTool("notes.delete", {})).rejects.toMatchObject({
      code: -32602,
    });
  });
});
