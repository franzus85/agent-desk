import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpClient, StdioTransport, HttpTransport } from "@agent-desk/mcp-client";
import { ToolRegistry } from "./registry.js";
import { registerMcpServers } from "./mcp-bridge.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");

const notesEntry = join(repoRoot, "servers", "mcp-notes", "src", "server.ts");
const calendarEntry = join(repoRoot, "servers", "mcp-calendar", "src", "server.ts");
const wikiEntry = join(repoRoot, "servers", "mcp-wiki", "src", "server.ts");
const WIKI_PORT = 8936;

let dataDir: string;
let notesTransport: StdioTransport;
let calendarTransport: StdioTransport;
let wikiChild: ChildProcess;

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "mcp-bridge-e2e-"));
  notesTransport = new StdioTransport(tsxBin, [notesEntry], {
    env: { ...process.env, MCP_NOTES_DATA_DIR: dataDir },
  });
  calendarTransport = new StdioTransport(tsxBin, [calendarEntry]);

  wikiChild = spawn(tsxBin, [wikiEntry], {
    env: { ...process.env, MCP_WIKI_PORT: String(WIKI_PORT), MCP_WIKI_DELAY_MS: "20" },
    stdio: ["ignore", "ignore", "pipe"],
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("mcp-wiki did not start in time")), 5000);
    wikiChild.stderr?.on("data", (chunk: Buffer) => {
      if (chunk.toString("utf8").includes("listening on")) {
        clearTimeout(timeout);
        resolve();
      }
    });
    wikiChild.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
});

afterAll(async () => {
  notesTransport.close();
  calendarTransport.close();
  wikiChild.kill();
  await rm(dataDir, { recursive: true, force: true });
});

describe("Phase 2 done-when: all three servers reachable through one registry", () => {
  it("aggregates notes (stdio), calendar (stdio), and wiki (HTTP/SSE) under one namespaced registry", async () => {
    const registry = new ToolRegistry();
    await registerMcpServers(registry, [
      { id: "notes", client: new McpClient({ transport: notesTransport }) },
      { id: "calendar", client: new McpClient({ transport: calendarTransport }) },
      {
        id: "wiki",
        client: new McpClient({
          transport: new HttpTransport({
            url: `http://127.0.0.1:${WIKI_PORT}/mcp`,
            headers: { Authorization: "Bearer dev-mock-token" },
          }),
        }),
      },
    ]);

    const names = registry.specs().map((spec) => spec.name).sort();
    expect(names).toEqual(
      [
        "notes.list",
        "notes.search",
        "notes.write",
        "calendar.list",
        "calendar.search",
        "wiki.search",
        "wiki.get",
      ].sort(),
    );

    // Round-trip through each server via the exact same registry interface.
    await registry.execute("notes.write", { title: "e2e-note", body: "written via the aggregator" });
    expect(await registry.execute("notes.search", { query: "aggregator" })).toEqual([
      { title: "e2e-note", body: "written via the aggregator" },
    ]);

    expect(await registry.execute("calendar.search", { query: "planning" })).toMatchObject([{ id: "evt-2" }]);

    expect(await registry.execute("wiki.search", { query: "roadmap" })).toEqual([
      { id: "q3-roadmap", title: "Q3 Roadmap" },
    ]);
  });
});
