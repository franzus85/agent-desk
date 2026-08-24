import { z } from "zod";
import { defineTool, ToolRegistry } from "@agent-desk/harness";

interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  attendees: string[];
}

const events: CalendarEvent[] = [
  { id: "evt-1", title: "Weekly sync", date: "2026-08-25", attendees: ["team"] },
  { id: "evt-2", title: "Q3 planning review", date: "2026-08-27", attendees: ["team", "manager"] },
  { id: "evt-3", title: "1:1 with manager", date: "2026-08-28", attendees: ["manager"] },
];

export const registry = new ToolRegistry();

registry.register(
  defineTool({
    name: "list",
    description: "Lists all calendar events, structured records with id/title/date/attendees.",
    inputSchema: z.object({}),
    handler: async () => events,
  }),
);

registry.register(
  defineTool({
    name: "search",
    description: "Searches event titles for a query substring.",
    inputSchema: z.object({ query: z.string() }),
    handler: async ({ query }) => {
      const needle = query.toLowerCase();
      return events.filter((event) => event.title.toLowerCase().includes(needle));
    },
  }),
);
