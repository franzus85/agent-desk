import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { StdioTransport, McpServerExitedError } from "./stdio-transport.js";
import { McpClient } from "./client.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(here, "test-fixtures");

describe("StdioTransport", () => {
  it("sends a request and receives the matching response from a real child process", async () => {
    const transport = new StdioTransport(process.execPath, [join(fixturesDir, "echo-stdio-server.mjs")]);
    try {
      const client = new McpClient({ transport });
      const outcome = await client.request("tools/list");
      expect(outcome).toEqual({
        status: "complete",
        result: { resultType: "complete", echoedMethod: "tools/list" },
      });
    } finally {
      transport.close();
    }
  });

  it("rejects pending requests with a typed error when the server exits mid-call", async () => {
    const transport = new StdioTransport(process.execPath, [join(fixturesDir, "crashing-stdio-server.mjs")]);
    const client = new McpClient({ transport });

    await expect(client.request("tools/list")).rejects.toBeInstanceOf(McpServerExitedError);
    transport.close();
  });
});
