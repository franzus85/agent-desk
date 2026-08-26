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
    expect(names).toEqual(["list", "search", "write"]);

    const writeTool = (outcome.result["tools"] as Array<{ name: string; inputSchema: unknown }>).find(
      (t) => t.name === "write",
    );
    expect(writeTool?.inputSchema).toMatchObject({
      type: "object",
      properties: { title: { type: "string" }, body: { type: "string" } },
    });
  });

  it("writes a real file, then finds it via list and search", async () => {
    const writeOutcome = await client.callTool("write", {
      title: "sprint-42",
      body: "Shipped the MCP client.",
    });
    expect(writeOutcome.status).toBe("complete");

    const listOutcome = await client.callTool("list", {});
    if (listOutcome.status !== "complete") throw new Error("unreachable");
    const listContent = listOutcome.result["content"] as Array<{ text: string }>;
    expect(JSON.parse(listContent[0]?.text ?? "[]")).toContain("sprint-42");

    const searchOutcome = await client.callTool("search", { query: "MCP client" });
    if (searchOutcome.status !== "complete") throw new Error("unreachable");
    const searchContent = searchOutcome.result["content"] as Array<{ text: string }>;
    expect(searchContent[0]?.text).toContain("sprint-42");
  });

  it("returns isError: true (tool execution error) for invalid input, not a hang", async () => {
    const outcome = await client.callTool("write", { title: "missing-body" });
    if (outcome.status !== "complete") throw new Error("unreachable");
    expect(outcome.result["isError"]).toBe(true);
  });

  it("returns a JSON-RPC protocol error for an unknown tool", async () => {
    await expect(client.callTool("delete", {})).rejects.toMatchObject({
      code: -32602,
    });
  });

  it("asks for confirmation before overwriting, then completes once accepted", async () => {
    await client.callTool("write", { title: "sprint-42", body: "first version" });

    const secondWrite = await client.callTool("write", { title: "sprint-42", body: "second version" });
    expect(secondWrite.status).toBe("input_required");
    if (secondWrite.status !== "input_required") throw new Error("unreachable");
    const inputRequests = secondWrite.inputRequest["inputRequests"] as Record<string, { params: { message: string } }>;
    expect(inputRequests["confirm"]?.params.message).toContain("sprint-42");

    const seenMessages: string[] = [];
    const outcome = await client.callToolWithElicitation(
      "write",
      { title: "sprint-42", body: "second version" },
      async (prompt) => {
        seenMessages.push(prompt.message);
        return { action: "accept", content: { confirm: true } };
      },
    );

    expect(seenMessages).toHaveLength(1);
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") throw new Error("unreachable");
    expect(outcome.result["isError"]).toBe(false);

    const searchOutcome = await client.callTool("search", { query: "second version" });
    if (searchOutcome.status !== "complete") throw new Error("unreachable");
    const content = searchOutcome.result["content"] as Array<{ text: string }>;
    expect(content[0]?.text).toContain("second version");
  });

  it("does not overwrite when the user declines the confirmation", async () => {
    await client.callTool("write", { title: "sprint-42", body: "first version" });

    const outcome = await client.callToolWithElicitation(
      "write",
      { title: "sprint-42", body: "unwanted overwrite" },
      async () => ({ action: "decline" }),
    );

    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") throw new Error("unreachable");
    expect(outcome.result["isError"]).toBe(true);

    const searchOutcome = await client.callTool("search", { query: "first version" });
    if (searchOutcome.status !== "complete") throw new Error("unreachable");
    const content = searchOutcome.result["content"] as Array<{ text: string }>;
    expect(content[0]?.text).toContain("first version");
  });
});
