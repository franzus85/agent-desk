import { readFileSync } from "node:fs";
import { z } from "zod";
import { defineTool, ToolRegistry } from "@agent-desk/harness";

const calendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  date: z.string(),
  attendees: z.array(z.string()),
});
type CalendarEvent = z.infer<typeof calendarEventSchema>;

const DEFAULT_EVENTS: CalendarEvent[] = [
  { id: "evt-1", title: "Weekly sync", date: "2026-08-25", attendees: ["team"] },
  { id: "evt-2", title: "Q3 planning review", date: "2026-08-27", attendees: ["team", "manager"] },
  { id: "evt-3", title: "1:1 with manager", date: "2026-08-28", attendees: ["manager"] },
];

// Overridable so eval fixtures can seed a different week's events instead of
// the hardcoded defaults (mirrors MCP_NOTES_DATA_DIR in the notes server).
function loadEvents(): CalendarEvent[] {
  const dataFile = process.env["MCP_CALENDAR_DATA_FILE"];
  if (!dataFile) return DEFAULT_EVENTS;
  const raw: unknown = JSON.parse(readFileSync(dataFile, "utf8"));
  return z.array(calendarEventSchema).parse(raw);
}

const events: CalendarEvent[] = loadEvents();

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
