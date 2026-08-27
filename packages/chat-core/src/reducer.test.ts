import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@agent-desk/protocol";
import { initialConversationState, markAborted, reduceEvent } from "./reducer.js";
import type { ConversationState } from "./reducer.js";

function replay(events: AgentEvent[]): ConversationState {
  return events.reduce(reduceEvent, initialConversationState);
}

const runStarted: AgentEvent = { type: "run.started", runId: "r1", ts: 0, task: "do the thing" };

describe("reduceEvent", () => {
  it("accumulates consecutive text.delta events into one open text item", () => {
    const state = replay([
      runStarted,
      { type: "text.delta", runId: "r1", ts: 0, delta: "Hel" },
      { type: "text.delta", runId: "r1", ts: 0, delta: "lo" },
    ]);
    expect(state.items).toEqual([{ type: "text", id: "text-0", text: "Hello", done: false }]);
    expect(state.status).toBe("running");
  });

  it("starts a new text item after a tool call, closing the previous one", () => {
    const state = replay([
      runStarted,
      { type: "text.delta", runId: "r1", ts: 0, delta: "Looking that up." },
      { type: "tool.started", runId: "r1", ts: 0, toolCallId: "c1", name: "notes.search", input: { query: "q3" } },
      { type: "tool.finished", runId: "r1", ts: 0, toolCallId: "c1", name: "notes.search", result: [], durationMs: 5 },
      { type: "text.delta", runId: "r1", ts: 0, delta: "Found nothing." },
    ]);
    expect(state.items).toEqual([
      { type: "text", id: "text-0", text: "Looking that up.", done: true },
      { type: "tool_call", id: "c1", name: "notes.search", input: { query: "q3" }, status: "done", result: [], durationMs: 5 },
      { type: "text", id: "text-2", text: "Found nothing.", done: false },
    ]);
  });

  it("marks a tool call failed without disturbing other items", () => {
    const state = replay([
      runStarted,
      { type: "tool.started", runId: "r1", ts: 0, toolCallId: "c1", name: "notes.write", input: {} },
      { type: "tool.failed", runId: "r1", ts: 0, toolCallId: "c1", name: "notes.write", error: "disk full" },
    ]);
    expect(state.items).toEqual([{ type: "tool_call", id: "c1", name: "notes.write", input: {}, status: "failed", error: "disk full" }]);
  });

  it("closes an open text item and sets status done on run.finished", () => {
    const state = replay([runStarted, { type: "text.delta", runId: "r1", ts: 0, delta: "done" }, { type: "run.finished", runId: "r1", ts: 0, stopReason: "end_turn" }]);
    expect(state.status).toBe("done");
    expect(state.items[0]).toMatchObject({ done: true });
  });

  it("records run.error with the message and closes any open text", () => {
    const state = replay([runStarted, { type: "text.delta", runId: "r1", ts: 0, delta: "oops" }, { type: "run.error", runId: "r1", ts: 0, message: "boom" }]);
    expect(state.status).toBe("error");
    expect(state.errorMessage).toBe("boom");
    expect(state.items[0]).toMatchObject({ done: true });
  });

  it("keeps prior items across a new run.started — a follow-up turn appends, it doesn't erase", () => {
    const first = replay([runStarted, { type: "text.delta", runId: "r1", ts: 0, delta: "first run" }, { type: "run.finished", runId: "r1", ts: 0, stopReason: "end_turn" }]);
    const second = reduceEvent(first, { type: "run.started", runId: "r2", ts: 0, task: "again" });
    expect(second.items).toEqual([{ type: "text", id: "text-0", text: "first run", done: true }]);
    expect(second.status).toBe("running");

    const withSecondReply = reduceEvent(second, { type: "text.delta", runId: "r2", ts: 0, delta: "second run" });
    expect(withSecondReply.items).toEqual([
      { type: "text", id: "text-0", text: "first run", done: true },
      { type: "text", id: "text-1", text: "second run", done: false },
    ]);
  });

  it("ignores event types the timeline doesn't render, without losing state", () => {
    const state = replay([
      runStarted,
      { type: "text.delta", runId: "r1", ts: 0, delta: "hi" },
      { type: "tool.selected", runId: "r1", ts: 0, candidates: ["a", "b"], chosen: "a" },
      { type: "skill.loaded", runId: "r1", ts: 0, name: "weekly-status-report" },
    ]);
    expect(state.items).toEqual([{ type: "text", id: "text-0", text: "hi", done: false }]);
  });
});

describe("markAborted", () => {
  it("closes an open text item and sets status aborted, preserving everything so far", () => {
    const running = replay([runStarted, { type: "text.delta", runId: "r1", ts: 0, delta: "partial" }]);
    const aborted = markAborted(running);
    expect(aborted.status).toBe("aborted");
    expect(aborted.items).toEqual([{ type: "text", id: "text-0", text: "partial", done: true }]);
  });

  it("is a no-op when the run isn't currently running", () => {
    const done = { ...initialConversationState, status: "done" as const };
    expect(markAborted(done)).toBe(done);
  });
});
