import { z } from "zod";
import type { Tool } from "./tool.js";

export class ToolNotFoundError extends Error {
  constructor(public readonly toolName: string) {
    super(`No tool named "${toolName}".`);
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
}

export class ToolRegistry {
  // Tool<any, any>: a heterogeneous registry of Tool<In, Out> can't be stored as
  // Tool<unknown, unknown> — handler is a function-typed property, so strict
  // contravariant checking rejects narrower handlers at that slot. `any` is the
  // deliberate erasure point; each tool keeps full typing wherever it's defined.
  private readonly tools = new Map<string, Tool<any, any>>();

  register(tool: Tool<any, any>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  specs(): ToolSpec[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: z.toJSONSchema(tool.inputSchema),
    }));
  }

  async execute(name: string, rawInput: unknown): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new ToolNotFoundError(name);
    }

    const parsed = tool.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ToolInputValidationError(name, parsed.error);
    }

    return tool.handler(parsed.data);
  }
}
