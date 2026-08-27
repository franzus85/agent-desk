import type { z } from "zod";

// Two-axis classification (Phase 8): read/write/outbound is what the
// permission gate acts on. "read"/"write" run freely — only "outbound"
// (send, share, write to a foreign system) requires explicit confirmation.
// Unclassified tools default to "read" (free), matching every tool built
// before this phase — this is additive, not a breaking change.
export type ToolAccess = "read" | "write" | "outbound";

export interface Tool<In = unknown, Out = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<In>;
  handler: (input: In) => Promise<Out>;
  access?: ToolAccess;
}

export function defineTool<In, Out>(tool: Tool<In, Out>): Tool<In, Out> {
  return tool;
}
