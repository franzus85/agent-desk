// Manual smoke test against the real Anthropic API — not run by `pnpm test`.
// Needs credentials (ANTHROPIC_API_KEY or an `ant auth login` profile) and
// costs real tokens. Run with: pnpm --filter @agent-desk/harness dev:run

import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import { initTracing } from "@agent-desk/telemetry";
import { z } from "zod";
import { defineTool } from "./tool.js";
import { ToolRegistry } from "./registry.js";
import { runAgent } from "./loop.js";
import { renderToConsole } from "./console-renderer.js";

initTracing();

const notes = new Map<string, string>([
  ["q3-plan", "Q3 focus: ship the MCP client and the eval harness."],
  ["q3-risks", "Risk: no agent-eval experience yet; mitigated by building Phase 5."],
]);

const registry = new ToolRegistry();

registry.register(
  defineTool({
    name: "notes.list",
    description: "Lists all note titles.",
    inputSchema: z.object({}),
    handler: async () => [...notes.keys()],
  }),
);

registry.register(
  defineTool({
    name: "notes.search",
    description: "Searches note titles and bodies for a query substring.",
    inputSchema: z.object({ query: z.string() }),
    handler: async ({ query }) =>
      [...notes.entries()]
        .filter(([title, body]) => title.includes(query) || body.includes(query))
        .map(([title, body]) => ({ title, body })),
  }),
);

registry.register(
  defineTool({
    name: "notes.write",
    description: "Writes a note under the given title, overwriting any existing note with that title.",
    inputSchema: z.object({ title: z.string(), body: z.string() }),
    handler: async ({ title, body }) => {
      notes.set(title, body);
      return { saved: title };
    },
  }),
);

const client = new Anthropic();

await renderToConsole(
  runAgent({
    client,
    registry,
    task: "Look up the Q3 plan and Q3 risks notes, then write a one-paragraph summary note titled 'q3-summary'.",
    runId: randomUUID(),
    model: "claude-haiku-4-5",
    thinking: null,
  }),
);
