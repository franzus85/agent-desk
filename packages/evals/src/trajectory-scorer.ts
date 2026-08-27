import type { AgentEvent } from "@agent-desk/protocol";
import type { TrajectoryExpectation } from "./schema.js";

export interface TrajectoryScore {
  passed: boolean;
  steps: number;
  toolsCalled: string[];
  missingCalls: string[];
  forbiddenCalls: string[];
  exceededMaxSteps: boolean;
}

export function scoreTrajectory(expectation: TrajectoryExpectation, events: AgentEvent[]): TrajectoryScore {
  // tool.started fires once per attempted call, whether it later succeeds
  // (tool.finished) or fails (tool.failed) — must_call/must_not_call are
  // about the path taken, not the outcome, so that's the event to read.
  const toolsCalled = events.filter((event) => event.type === "tool.started").map((event) => event.name);

  const missingCalls = expectation.must_call.filter((name) => !toolsCalled.includes(name));
  const forbiddenCalls = expectation.must_not_call.filter((name) => toolsCalled.includes(name));
  const steps = toolsCalled.length;
  const exceededMaxSteps = steps > expectation.max_steps;

  return {
    passed: missingCalls.length === 0 && forbiddenCalls.length === 0 && !exceededMaxSteps,
    steps,
    toolsCalled,
    missingCalls,
    forbiddenCalls,
    exceededMaxSteps,
  };
}
