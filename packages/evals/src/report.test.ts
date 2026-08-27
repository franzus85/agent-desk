import { describe, expect, it } from "vitest";
import type { AgentEvent } from "@agent-desk/protocol";
import { buildReport, diffReports, renderHtml, type EvalReport } from "./report.js";
import type { RunResult, TaskResult } from "./runner.js";

function fakeRun(overrides: Partial<RunResult> & { steps: number; durationMs: number; passed: boolean; usage?: { inputTokens: number; outputTokens: number; cacheReadInputTokens: number; cacheCreationInputTokens: number } }): RunResult {
  const usage = overrides.usage ?? { inputTokens: 1000, outputTokens: 500, cacheReadInputTokens: 0, cacheCreationInputTokens: 0 };
  const events: AgentEvent[] = [
    { type: "run.finished", runId: "run-1", ts: 0, stopReason: "end_turn", usage },
  ];
  return {
    runIndex: 0,
    passed: overrides.passed,
    outcome: { passed: overrides.passed, results: [] },
    trajectory: { passed: overrides.passed, steps: overrides.steps, toolsCalled: [], missingCalls: [], forbiddenCalls: [], exceededMaxSteps: false },
    durationMs: overrides.durationMs,
    model: overrides.model ?? "claude-haiku-4-5",
    events,
  };
}

function fakeTaskResult(taskId: string, runs: RunResult[]): TaskResult {
  return {
    taskId,
    runs,
    passAtLeastOnce: runs.some((r) => r.passed),
    passEveryRun: runs.every((r) => r.passed),
  };
}

describe("buildReport", () => {
  it("computes pass rate, mean steps, mean latency, and mean cost per task", () => {
    const runs = [
      fakeRun({ passed: true, steps: 2, durationMs: 100 }),
      fakeRun({ passed: false, steps: 4, durationMs: 300 }),
    ];
    const report = buildReport([fakeTaskResult("task-a", runs)], "2026-08-27T10:00:00.000Z");

    expect(report.generatedAt).toBe("2026-08-27T10:00:00.000Z");
    expect(report.tasks).toHaveLength(1);
    const [task] = report.tasks;
    expect(task?.passRate).toBe(0.5);
    expect(task?.passAtLeastOnce).toBe(true);
    expect(task?.passEveryRun).toBe(false);
    expect(task?.meanSteps).toBe(3);
    expect(task?.meanLatencyMs).toBe(200);
    // haiku: $1/$5 per MTok; 1000 in + 500 out tokens per run, both runs identical.
    expect(task?.meanCostUsd).toBeCloseTo(1000 * (1 / 1_000_000) + 500 * (5 / 1_000_000), 10);
  });

  it("reports zero cost for a run whose events carry no usage", () => {
    const run = fakeRun({ passed: true, steps: 1, durationMs: 50 });
    run.events = [{ type: "run.finished", runId: "run-1", ts: 0, stopReason: "end_turn" }];
    const report = buildReport([fakeTaskResult("task-b", [run])]);
    expect(report.tasks[0]?.meanCostUsd).toBe(0);
  });
});

describe("diffReports", () => {
  it("marks a task as new when it has no counterpart in the previous report", () => {
    const current = buildReport([fakeTaskResult("task-a", [fakeRun({ passed: true, steps: 1, durationMs: 10 })])]);
    const diff = diffReports(current, undefined);
    expect(diff.entries).toEqual([{ taskId: "task-a", status: "new", current: current.tasks[0] }]);
  });

  it("computes deltas against the previous report for a matching task", () => {
    const previous: EvalReport = {
      generatedAt: "2026-08-26T00:00:00.000Z",
      tasks: [{ taskId: "task-a", passRate: 0.5, passAtLeastOnce: true, passEveryRun: false, meanSteps: 4, meanLatencyMs: 500, meanCostUsd: 0.01 }],
    };
    const current: EvalReport = {
      generatedAt: "2026-08-27T00:00:00.000Z",
      tasks: [{ taskId: "task-a", passRate: 1, passAtLeastOnce: true, passEveryRun: true, meanSteps: 3, meanLatencyMs: 400, meanCostUsd: 0.008 }],
    };
    const diff = diffReports(current, previous);
    expect(diff.entries).toEqual([
      {
        taskId: "task-a",
        status: "compared",
        current: current.tasks[0],
        previous: previous.tasks[0],
        passRateDelta: 0.5,
        meanStepsDelta: -1,
        meanLatencyMsDelta: -100,
        meanCostUsdDelta: -0.002,
      },
    ]);
  });
});

describe("renderHtml", () => {
  it("includes the task id, pass rate, and delta in the rendered table", () => {
    const current = buildReport([fakeTaskResult("weekly-report-happy", [fakeRun({ passed: true, steps: 2, durationMs: 100 })])]);
    const previous = buildReport([fakeTaskResult("weekly-report-happy", [fakeRun({ passed: false, steps: 5, durationMs: 900 })])]);
    const diff = diffReports(current, previous);
    const html = renderHtml(current, diff);

    expect(html).toContain("weekly-report-happy");
    expect(html).toContain("100%");
    expect(html).toContain("<table>");
  });

  it("escapes task ids so a malicious-looking id can't inject markup", () => {
    const current = buildReport([fakeTaskResult("<script>alert(1)</script>", [fakeRun({ passed: true, steps: 1, durationMs: 10 })])]);
    const html = renderHtml(current, diffReports(current, undefined));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
