import { describe, expect, it } from "vitest";
import { AgentEvent } from "./events.js";

describe("AgentEvent", () => {
  it("accepts a valid tool.started event", () => {
    const result = AgentEvent.safeParse({
      type: "tool.started",
      runId: "run-1",
      ts: 0,
      toolCallId: "call-1",
      name: "notes.search",
      input: { query: "q3" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown event type", () => {
    const result = AgentEvent.safeParse({
      type: "tool.imaginary",
      runId: "run-1",
      ts: 0,
    });
    expect(result.success).toBe(false);
  });
});
