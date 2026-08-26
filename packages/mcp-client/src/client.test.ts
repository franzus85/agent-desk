import { describe, expect, it } from "vitest";
import type { JsonRpcRequest } from "./protocol.js";
import type { McpTransport } from "./transport.js";
import { McpClient } from "./client.js";
import { MissingRequiredClientCapabilityError } from "./errors.js";

function createFakeTransport(responder: (message: JsonRpcRequest) => unknown) {
  const received: JsonRpcRequest[] = [];
  const transport: McpTransport = {
    async send(message) {
      received.push(message);
      return responder(message);
    },
  };
  return { transport, received };
}

describe("McpClient", () => {
  it("attaches protocolVersion and clientCapabilities to every request", async () => {
    const { transport, received } = createFakeTransport((message) => ({
      jsonrpc: "2.0",
      id: message.id,
      result: { resultType: "complete", tools: [] },
    }));

    const client = new McpClient({
      transport,
      clientCapabilities: { elicitation: {} },
      clientInfo: { name: "agent-desk", version: "0.0.0" },
    });

    await client.listTools();

    expect(received[0]?.params?._meta).toMatchObject({
      "io.modelcontextprotocol/protocolVersion": "2026-07-28",
      "io.modelcontextprotocol/clientCapabilities": { elicitation: {} },
      "io.modelcontextprotocol/clientInfo": { name: "agent-desk", version: "0.0.0" },
    });
  });

  it("treats a missing resultType as complete (backward compatibility)", async () => {
    const { transport } = createFakeTransport((message) => ({
      jsonrpc: "2.0",
      id: message.id,
      result: { tools: ["notes.search"] },
    }));

    const client = new McpClient({ transport });
    const outcome = await client.listTools();

    expect(outcome).toEqual({ status: "complete", result: { tools: ["notes.search"] } });
  });

  it("surfaces resultType input_required distinctly from complete", async () => {
    const { transport } = createFakeTransport((message) => ({
      jsonrpc: "2.0",
      id: message.id,
      result: { resultType: "input_required", requiredFields: ["title"] },
    }));

    const client = new McpClient({ transport });
    const outcome = await client.callTool("notes.write", { body: "hi" });

    expect(outcome).toEqual({
      status: "input_required",
      inputRequest: { resultType: "input_required", requiredFields: ["title"] },
    });
  });

  it("throws MissingRequiredClientCapabilityError for code -32021", async () => {
    const { transport } = createFakeTransport((message) => ({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32021,
        message: "Missing required capability",
        data: { requiredCapabilities: ["elicitation"] },
      },
    }));

    const client = new McpClient({ transport });

    await expect(client.listTools()).rejects.toBeInstanceOf(MissingRequiredClientCapabilityError);
    try {
      await client.listTools();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MissingRequiredClientCapabilityError);
      expect((error as MissingRequiredClientCapabilityError).requiredCapabilities).toEqual([
        "elicitation",
      ]);
    }
  });

  it("uses a unique, incrementing id for each request", async () => {
    const { transport, received } = createFakeTransport((message) => ({
      jsonrpc: "2.0",
      id: message.id,
      result: { resultType: "complete" },
    }));

    const client = new McpClient({ transport });
    await client.listTools();
    await client.listTools();

    expect(received.map((message) => message.id)).toEqual([1, 2]);
  });

  it("builds tools/call params with name and arguments", async () => {
    const { transport, received } = createFakeTransport((message) => ({
      jsonrpc: "2.0",
      id: message.id,
      result: { resultType: "complete" },
    }));

    const client = new McpClient({ transport });
    await client.callTool("notes.search", { query: "q3" });

    expect(received[0]).toMatchObject({
      method: "tools/call",
      params: { name: "notes.search", arguments: { query: "q3" } },
    });
  });

  it("callToolWithElicitation resolves input_required via the elicit callback and retries", async () => {
    let calls = 0;
    const { transport, received } = createFakeTransport((message) => {
      calls++;
      if (calls === 1) {
        return {
          jsonrpc: "2.0",
          id: message.id,
          result: {
            resultType: "input_required",
            inputRequests: {
              confirm: {
                method: "elicitation/create",
                params: { mode: "form", message: "Overwrite?", requestedSchema: { type: "object" } },
              },
            },
            requestState: "opaque-state",
          },
        };
      }
      return { jsonrpc: "2.0", id: message.id, result: { resultType: "complete", content: [] } };
    });

    const client = new McpClient({ transport });
    const seenPrompts: string[] = [];
    const outcome = await client.callToolWithElicitation("write", { title: "x" }, async (prompt) => {
      seenPrompts.push(prompt.message);
      return { action: "accept", content: { confirm: true } };
    });

    expect(seenPrompts).toEqual(["Overwrite?"]);
    expect(outcome).toEqual({ status: "complete", result: { resultType: "complete", content: [] } });
    expect(received[1]?.params).toMatchObject({
      name: "write",
      arguments: { title: "x" },
      inputResponses: { confirm: { action: "accept", content: { confirm: true } } },
      requestState: "opaque-state",
    });
  });

  it("callToolWithElicitation gives up after maxRounds instead of looping forever", async () => {
    const { transport } = createFakeTransport((message) => ({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        resultType: "input_required",
        inputRequests: {
          confirm: { method: "elicitation/create", params: { message: "Again?", requestedSchema: {} } },
        },
        requestState: "still-not-done",
      },
    }));

    const client = new McpClient({ transport });
    let elicitCalls = 0;
    const outcome = await client.callToolWithElicitation(
      "write",
      { title: "x" },
      async () => {
        elicitCalls++;
        return { action: "accept", content: {} };
      },
      2,
    );

    expect(elicitCalls).toBe(2);
    expect(outcome.status).toBe("input_required");
  });
});
