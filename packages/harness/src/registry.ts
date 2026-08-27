import { z } from "zod";
import type { Tool, ToolAccess } from "./tool.js";

export class ToolNotFoundError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly availableTools: string[],
  ) {
    super(
      availableTools.length > 0
        ? `No tool named "${toolName}". Available tools: ${availableTools.join(", ")}.`
        : `No tool named "${toolName}". No tools are registered.`,
    );
    this.name = "ToolNotFoundError";
  }
}

export class ToolInputValidationError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly issues: z.ZodError,
  ) {
    super(`Invalid input for tool "${toolName}": ${issues.message}`);
    this.name = "ToolInputValidationError";
  }
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: unknown;
  access: ToolAccess;
}

export interface RemoteTool {
  name: string;
  description: string;
  // Already a JSON Schema (e.g. from an MCP server's tools/list) — unlike
  // register()'s Zod-backed Tool, there is no local schema to validate
  // against, so the handler receives the raw input as-is.
  inputSchema: unknown;
  handler: (input: unknown) => Promise<unknown>;
  access?: ToolAccess;
}

interface RegisteredEntry {
  name: string;
  description: string;
  jsonSchema: unknown;
  access: ToolAccess;
  execute: (rawInput: unknown) => Promise<unknown>;
}

export class ToolRegistry {
  private readonly entries = new Map<string, RegisteredEntry>();

  // Local tool: input validated against its Zod schema before the handler runs.
  register(tool: Tool<any, any>): void {
    this.add({
      name: tool.name,
      description: tool.description,
      jsonSchema: z.toJSONSchema(tool.inputSchema),
      access: tool.access ?? "read",
      execute: async (rawInput) => {
        const parsed = tool.inputSchema.safeParse(rawInput);
        if (!parsed.success) {
          throw new ToolInputValidationError(tool.name, parsed.error);
        }
        return tool.handler(parsed.data);
      },
    });
  }

  // Remote tool (e.g. MCP-backed): schema and validation live on the far
  // side, so we register it directly — no Zod schema required here.
  registerRemote(tool: RemoteTool): void {
    this.add({
      name: tool.name,
      description: tool.description,
      jsonSchema: tool.inputSchema,
      access: tool.access ?? "read",
      execute: tool.handler,
    });
  }

  private add(entry: RegisteredEntry): void {
    if (this.entries.has(entry.name)) {
      throw new Error(`Tool "${entry.name}" is already registered.`);
    }
    this.entries.set(entry.name, entry);
  }

  specs(): ToolSpec[] {
    return [...this.entries.values()].map(({ name, description, jsonSchema, access }) => ({
      name,
      description,
      inputSchema: jsonSchema,
      access,
    }));
  }

  // Used by the permission gate (loop.ts) to decide whether a call needs
  // confirmation before execute() ever runs.
  accessOf(name: string): ToolAccess | undefined {
    return this.entries.get(name)?.access;
  }

  async execute(name: string, rawInput: unknown): Promise<unknown> {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new ToolNotFoundError(name, [...this.entries.keys()]);
    }
    return entry.execute(rawInput);
  }
}
