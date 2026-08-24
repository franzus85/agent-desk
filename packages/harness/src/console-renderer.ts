import type { AgentEvent } from "@agent-desk/protocol";

export interface RenderOptions {
  writeLine?: (line: string) => void;
  writeInline?: (text: string) => void;
}

export async function renderToConsole(
  events: AsyncIterable<AgentEvent>,
  options: RenderOptions = {},
): Promise<void> {
  const writeLine = options.writeLine ?? ((line: string) => console.log(line));
  const writeInline = options.writeInline ?? ((text: string) => process.stdout.write(text));

  for await (const event of events) {
    if (event.type === "text.delta") {
      writeInline(event.delta);
      continue;
    }
    writeLine(formatEvent(event));
  }
}

export function formatEvent(event: AgentEvent): string {
  switch (event.type) {
    case "run.started":
      return `\n▶ run started: "${event.task}"`;
    case "run.finished":
      return `\n■ run finished (${event.stopReason})`;
    case "run.error":
      return `\n✖ run error: ${event.message}`;
    case "text.delta":
      return event.delta;
    case "tool.selected":
      return `→ selected ${event.chosen} (from ${event.candidates.length} candidates)`;
    case "tool.started":
      return `  ⚙ ${event.name} started (${event.toolCallId})`;
    case "tool.finished":
      return `  ✓ ${event.name} finished in ${event.durationMs}ms`;
    case "tool.failed":
      return `  ✗ ${event.name} failed: ${event.error}`;
    case "permission.requested":
      return `? permission requested: ${event.summary}`;
    case "permission.resolved":
      return `${event.decision === "approved" ? "✓" : "✗"} permission ${event.decision}`;
    case "skill.loaded":
      return `# skill loaded: ${event.name}`;
    default:
      return assertNever(event);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled event type: ${JSON.stringify(value)}`);
}
