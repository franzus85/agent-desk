import { z } from "zod";
import { defineTool } from "../tool.js";

// A mock outbound tool — the exfiltration vector for the injection lab.
// No real MCP server for this exists yet in the project (none of the
// built servers write to a foreign system), so this stands in for one:
// classified "outbound", which is what actually puts it behind the
// permission gate.
export const mailSend = defineTool({
  name: "mail.send",
  description: "Sends an email.",
  access: "outbound",
  inputSchema: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
  handler: async (input) => ({ sent: true, to: input.to }),
});
