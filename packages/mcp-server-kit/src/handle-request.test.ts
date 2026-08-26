import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool, ElicitationRequired, ToolRegistry } from "@agent-desk/harness";
import { handleMcpRequest } from "./handle-request.js";

function registryWithEcho(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(
    defineTool({
      name: "echo",
      description: "Echoes the given message back.",
      inputSchema: z.object({ message: z.string() }),
      handler: async (input) => ({ echoed: input.message }),
    }),
  );
  return registry;
}

function registryWithConfirmableWrite(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(
    defineTool({
      name: "write",
      description: "Writes something, asking first if it would overwrite.",
      inputSchema: z.object({ title: z.string(), confirmOverwrite: z.boolean().optional() }),
      handler: async ({ title, confirmOverwrite }) => {
        if (title === "existing" && !confirmOverwrite) {
          throw new ElicitationRequired(`"${title}" already exists. Overwrite it?`, {
            type: "object",
            properties: { confirm: { type: "boolean" } },
            required: ["confirm"],
          });
        }
        return { saved: title };
      },
    }),
  );
  return registry;
}

describe("handleMcpRequest", () => {
  it("lists tools with camelCase inputSchema", async () => {
    const response = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 1, method: "tools/list" },
      registryWithEcho(),
    )) as { result: { tools: Array<{ name: string; inputSchema: unknown }> } };

    expect(response.result.tools).toEqual([
      {
        name: "echo",
        description: "Echoes the given message back.",
        inputSchema: expect.objectContaining({ type: "object" }),
      },
    ]);
  });

  it("calls a tool and wraps the result as text content", async () => {
    const response = (await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "echo", arguments: { message: "hi" } },
      },
      registryWithEcho(),
    )) as { result: { content: Array<{ text: string }>; isError: boolean } };

    expect(response.result.isError).toBe(false);
    expect(JSON.parse(response.result.content[0]?.text ?? "{}")).toEqual({ echoed: "hi" });
  });

  it("returns a JSON-RPC protocol error for an unknown tool", async () => {
    const response = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "missing", arguments: {} } },
      registryWithEcho(),
    )) as { error: { code: number } };

    expect(response.error.code).toBe(-32602);
  });

  it("returns isError: true for invalid tool input instead of a protocol error", async () => {
    const response = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "echo", arguments: { message: 42 } } },
      registryWithEcho(),
    )) as { result: { isError: boolean } };

    expect(response.result.isError).toBe(true);
  });

  it("returns method not found for an unrecognized method", async () => {
    const response = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 5, method: "resources/list" },
      registryWithEcho(),
    )) as { error: { code: number } };

    expect(response.error.code).toBe(-32601);
  });

  it("returns input_required (MRTR) when a handler throws ElicitationRequired", async () => {
    const response = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "write", arguments: { title: "existing" } } },
      registryWithConfirmableWrite(),
    )) as {
      result: {
        resultType: string;
        inputRequests: Record<string, { method: string; params: { message: string; requestedSchema: unknown } }>;
        requestState: string;
      };
    };

    expect(response.result.resultType).toBe("input_required");
    expect(response.result.inputRequests["confirm"]?.method).toBe("elicitation/create");
    expect(response.result.inputRequests["confirm"]?.params.message).toContain("already exists");
    expect(typeof response.result.requestState).toBe("string");
  });

  it("resumes and completes the call when the retry accepts the confirmation", async () => {
    const registry = registryWithConfirmableWrite();
    const first = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "write", arguments: { title: "existing" } } },
      registry,
    )) as { result: { requestState: string } };

    const retry = (await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: {
          name: "write",
          arguments: { title: "existing" },
          inputResponses: { confirm: { action: "accept", content: { confirm: true } } },
          requestState: first.result.requestState,
        },
      },
      registry,
    )) as { result: { isError: boolean; content: Array<{ text: string }> } };

    expect(retry.result.isError).toBe(false);
    expect(JSON.parse(retry.result.content[0]?.text ?? "{}")).toEqual({ saved: "existing" });
  });

  it("reports a tool execution error when the retry declines", async () => {
    const registry = registryWithConfirmableWrite();
    const first = (await handleMcpRequest(
      { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "write", arguments: { title: "existing" } } },
      registry,
    )) as { result: { requestState: string } };

    const retry = (await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 10,
        method: "tools/call",
        params: {
          name: "write",
          arguments: { title: "existing" },
          inputResponses: { confirm: { action: "decline" } },
          requestState: first.result.requestState,
        },
      },
      registry,
    )) as { result: { isError: boolean } };

    expect(retry.result.isError).toBe(true);
  });
});
