import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@agent-desk/protocol";
import { renderToConsole } from "./console-renderer.js";

async function* toAsyncIterable(events: AgentEvent[]): AsyncGenerator<AgentEvent> {
  for (const event of events) {
    yield event;
  }
}

describe("renderToConsole", () => {
  it("writes text.delta inline and other events as lines", async () => {
    const inline: string[] = [];
    const lines: string[] = [];

    await renderToConsole(
      toAsyncIterable([
        { type: "run.started", runId: "r1", ts: 0, task: "do it" },
        { type: "text.delta", runId: "r1", ts: 0, delta: "hel" },
        { type: "text.delta", runId: "r1", ts: 0, delta: "lo" },
        { type: "run.finished", runId: "r1", ts: 0, stopReason: "end_turn" },
      ]),
      { writeInline: (text) => inline.push(text), writeLine: (line) => lines.push(line) },
    );

    expect(inline.join("")).toBe("hello");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("run started");
    expect(lines[1]).toContain("run finished");
  });
});
