import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@agent-desk/protocol";
import { scoreTrajectory } from "./trajectory-scorer.js";

function toolStarted(name: string, toolCallId = `call-${name}`): AgentEvent {
  return { type: "tool.started", runId: "run-1", ts: 0, toolCallId, name, input: {} };
}

function toolFailed(name: string, toolCallId = `call-${name}`): AgentEvent {
  return { type: "tool.failed", runId: "run-1", ts: 0, toolCallId, name, error: "boom" };
}

describe("scoreTrajectory", () => {
  it("passes when every must_call happened, no must_not_call happened, and steps are within budget", () => {
    const events = [toolStarted("calendar.list"), toolStarted("notes.search"), toolStarted("notes.write")];
    const score = scoreTrajectory(
      { must_call: ["calendar.list", "notes.write"], must_not_call: ["wiki.search"], max_steps: 8 },
      events,
    );
    expect(score).toEqual({
      passed: true,
      steps: 3,
      toolsCalled: ["calendar.list", "notes.search", "notes.write"],
      missingCalls: [],
      forbiddenCalls: [],
      exceededMaxSteps: false,
    });
  });

  it("fails and reports missing calls when a required tool was never invoked", () => {
    const score = scoreTrajectory(
      { must_call: ["calendar.list", "notes.write"], must_not_call: [], max_steps: 8 },
      [toolStarted("calendar.list")],
    );
    expect(score.passed).toBe(false);
    expect(score.missingCalls).toEqual(["notes.write"]);
  });

  it("fails and reports forbidden calls, even when the call itself failed", () => {
    // A real trace always has tool.started before tool.failed for the same call.
    const score = scoreTrajectory(
      { must_call: [], must_not_call: ["wiki.search"], max_steps: 8 },
      [toolStarted("wiki.search"), toolFailed("wiki.search")],
    );
    expect(score.passed).toBe(false);
    expect(score.forbiddenCalls).toEqual(["wiki.search"]);
  });

  it("fails when the number of tool calls exceeds max_steps", () => {
    const events = [toolStarted("notes.search"), toolStarted("notes.search"), toolStarted("notes.search")];
    const score = scoreTrajectory({ must_call: [], must_not_call: [], max_steps: 2 }, events);
    expect(score.passed).toBe(false);
    expect(score.exceededMaxSteps).toBe(true);
    expect(score.steps).toBe(3);
  });

  it("ignores non-tool events when counting steps", () => {
    const events: AgentEvent[] = [
      { type: "run.started", runId: "run-1", ts: 0, task: "do stuff" },
      toolStarted("notes.search"),
      { type: "text.delta", runId: "run-1", ts: 0, delta: "hi" },
      { type: "run.finished", runId: "run-1", ts: 0, stopReason: "end_turn" },
    ];
    const score = scoreTrajectory({ must_call: [], must_not_call: [], max_steps: 8 }, events);
    expect(score.steps).toBe(1);
  });
});
