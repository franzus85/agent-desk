import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpClient, StdioTransport } from "@agent-desk/mcp-client";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const serverEntry = join(here, "server.ts");
const tsxBin = join(packageRoot, "node_modules", ".bin", "tsx");

let transport: StdioTransport;
let client: McpClient;

beforeEach(() => {
  transport = new StdioTransport(tsxBin, [serverEntry]);
  client = new McpClient({ transport });
});

afterEach(() => {
  transport.close();
});

describe("mcp-calendar server (real process, structured records)", () => {
  it("lists structured events", async () => {
    const outcome = await client.callTool("list", {});
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") throw new Error("unreachable");

    const content = outcome.result["content"] as Array<{ text: string }>;
    const parsedEvents = JSON.parse(content[0]?.text ?? "[]") as Array<{ id: string; title: string }>;
    expect(parsedEvents.map((event) => event.id)).toEqual(["evt-1", "evt-2", "evt-3"]);
  });

  it("searches events by title", async () => {
    const outcome = await client.callTool("search", { query: "planning" });
    expect(outcome.status).toBe("complete");
    if (outcome.status !== "complete") throw new Error("unreachable");

    const content = outcome.result["content"] as Array<{ text: string }>;
    const matches = JSON.parse(content[0]?.text ?? "[]") as Array<{ id: string }>;
    expect(matches).toEqual([{ id: "evt-2", title: "Q3 planning review", date: "2026-08-27", attendees: ["team", "manager"] }]);
  });

  it("loads events from MCP_CALENDAR_DATA_FILE when set, instead of the defaults", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "mcp-calendar-test-"));
    const dataFile = join(dataDir, "calendar.json");
    await writeFile(
      dataFile,
      JSON.stringify([{ id: "evt-fixture", title: "Fixture event", date: "2026-08-17", attendees: ["me"] }]),
      "utf8",
    );

    const fixtureTransport = new StdioTransport(tsxBin, [serverEntry], {
      env: { ...process.env, MCP_CALENDAR_DATA_FILE: dataFile },
    });
    const fixtureClient = new McpClient({ transport: fixtureTransport });
    try {
      const outcome = await fixtureClient.callTool("list", {});
      expect(outcome.status).toBe("complete");
      if (outcome.status !== "complete") throw new Error("unreachable");

      const content = outcome.result["content"] as Array<{ text: string }>;
      const parsedEvents = JSON.parse(content[0]?.text ?? "[]") as Array<{ id: string }>;
      expect(parsedEvents.map((event) => event.id)).toEqual(["evt-fixture"]);
    } finally {
      fixtureTransport.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});
