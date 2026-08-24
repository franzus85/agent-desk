import type { z } from "zod";

export interface Tool<In = unknown, Out = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<In>;
  handler: (input: In) => Promise<Out>;
}

export function defineTool<In, Out>(tool: Tool<In, Out>): Tool<In, Out> {
  return tool;
}
