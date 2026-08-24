import { z } from "zod";
import { defineTool, ToolRegistry } from "@agent-desk/harness";

interface WikiPage {
  id: string;
  title: string;
  body: string;
}

const pages: WikiPage[] = [
  {
    id: "onboarding",
    title: "New Engineer Onboarding",
    body: "Start by reading docs/PRD.md, then run pnpm install and pnpm test.",
  },
  {
    id: "architecture-decisions",
    title: "Architecture Decisions",
    body: "All ADRs live under docs/adr. ADR-001 covers the hand-rolled harness vs. LangGraph decision.",
  },
  {
    id: "q3-roadmap",
    title: "Q3 Roadmap",
    body: "Q3 priorities: the MCP client, the eval harness, and the Electron shell.",
  },
];

export const registry = new ToolRegistry();

registry.register(
  defineTool({
    name: "search",
    description: "Searches wiki page titles and bodies for a query substring.",
    inputSchema: z.object({ query: z.string() }),
    handler: async ({ query }) => {
      const needle = query.toLowerCase();
      return pages
        .filter((page) => page.title.toLowerCase().includes(needle) || page.body.toLowerCase().includes(needle))
        .map(({ id, title }) => ({ id, title }));
    },
  }),
);

registry.register(
  defineTool({
    name: "get",
    description: "Fetches a wiki page's full content by id.",
    inputSchema: z.object({ id: z.string() }),
    handler: async ({ id }) => {
      const page = pages.find((candidate) => candidate.id === id);
      if (!page) {
        throw new Error(`No wiki page with id "${id}". Call search to find valid ids.`);
      }
      return page;
    },
  }),
);
