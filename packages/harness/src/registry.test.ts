import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "./tool.js";
import {
  ToolInputValidationError,
  ToolNotFoundError,
  ToolRegistry,
} from "./registry.js";

const echoTool = defineTool({
  name: "echo",
  description: "Echoes the given message back.",
  inputSchema: z.object({ message: z.string() }),
  handler: async (input) => ({ echoed: input.message }),
});

describe("ToolRegistry", () => {
  it("lists registered tools with a JSON schema for their input", () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);

    const [spec] = registry.specs();
    expect(spec?.name).toBe("echo");
    expect(spec?.inputSchema).toMatchObject({
      type: "object",
      properties: { message: { type: "string" } },
    });
  });

  it("validates input and calls the handler", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);

    const result = await registry.execute("echo", { message: "hi" });
    expect(result).toEqual({ echoed: "hi" });
  });

  it("throws ToolNotFoundError for an unknown tool", async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute("missing", {})).rejects.toBeInstanceOf(ToolNotFoundError);
  });

  it("lists available tools in the ToolNotFoundError message", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);

    await expect(registry.execute("missing", {})).rejects.toThrow(
      'No tool named "missing". Available tools: echo.',
    );
  });

  it("throws ToolInputValidationError for invalid input", async () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);

    await expect(registry.execute("echo", { message: 42 })).rejects.toBeInstanceOf(
      ToolInputValidationError,
    );
  });

  it("rejects registering the same tool name twice", () => {
    const registry = new ToolRegistry();
    registry.register(echoTool);
    expect(() => registry.register(echoTool)).toThrow();
  });

  it("registerRemote skips local validation and uses the given JSON schema as-is", async () => {
    const registry = new ToolRegistry();
    registry.registerRemote({
      name: "remote.echo",
      description: "A remote tool with a pre-existing JSON schema.",
      inputSchema: { type: "object", properties: { message: { type: "string" } } },
      handler: async (input) => ({ received: input }),
    });

    const [spec] = registry.specs();
    expect(spec?.inputSchema).toEqual({ type: "object", properties: { message: { type: "string" } } });

    const result = await registry.execute("remote.echo", { message: "anything, unvalidated" });
    expect(result).toEqual({ received: { message: "anything, unvalidated" } });
  });

  it("collides when two servers' tools are merged under the same bare name", () => {
    // This is the failure mode namespacing exists to prevent: two servers
    // that each independently named a tool "search" can't coexist in one
    // registry without a prefix.
    const registry = new ToolRegistry();
    registry.registerRemote({
      name: "search",
      description: "notes server's search",
      inputSchema: {},
      handler: async () => [],
    });
    expect(() =>
      registry.registerRemote({
        name: "search",
        description: "wiki server's search",
        inputSchema: {},
        handler: async () => [],
      }),
    ).toThrow('Tool "search" is already registered.');
  });
});
