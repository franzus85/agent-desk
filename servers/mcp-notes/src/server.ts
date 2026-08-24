import { createInterface } from "node:readline";
import { jsonRpcRequestSchema } from "@agent-desk/mcp-client";
import { handleMcpRequest } from "@agent-desk/mcp-server-kit";
import { registry } from "./tools.js";

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  if (line.trim()) void handleLine(line);
});

async function handleLine(line: string): Promise<void> {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    process.stderr.write(`[mcp-notes] Ignoring non-JSON line: ${line}\n`);
    return;
  }

  const parsed = jsonRpcRequestSchema.safeParse(raw);
  if (!parsed.success) {
    process.stderr.write(`[mcp-notes] Ignoring malformed request: ${parsed.error.message}\n`);
    return;
  }

  const response = await handleMcpRequest(parsed.data, registry);
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

process.stderr.write("[mcp-notes] server ready\n");
