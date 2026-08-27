import { describe, expect, it } from "vitest";
import { evaluateGate } from "./gate.js";
import type { EvalReport, ReportDiff, TaskReport } from "./report.js";

function taskReport(overrides: Partial<TaskReport> & { taskId: string }): TaskReport {
  return {
    passRate: 1,
    passAtLeastOnce: true,
    passEveryRun: true,
    meanSteps: 3,
    meanLatencyMs: 100,
    meanCostUsd: 0.01,
    ...overrides,
  };
}

describe("evaluateGate", () => {
  it("passes when every gated task hit pass^k and no previous report exists to compare cost against", () => {
    const report: EvalReport = { generatedAt: "now", tasks: [taskReport({ taskId: "a" })] };
    const diff: ReportDiff = { entries: [{ taskId: "a", status: "new", current: report.tasks[0]! }] };

    const result = evaluateGate(report, diff, new Set(["a"]));
    expect(result).toEqual({ passed: true, failures: [] });
  });

  it("fails a task that didn't hit pass^k, even if pass@k held", () => {
    const report: EvalReport = { generatedAt: "now", tasks: [taskReport({ taskId: "a", passRate: 0.67, passEveryRun: false })] };
    const diff: ReportDiff = { entries: [{ taskId: "a", status: "new", current: report.tasks[0]! }] };

    const result = evaluateGate(report, diff, new Set(["a"]));
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([{ taskId: "a", reason: expect.stringMatching(/pass\^k failed/) }]);
  });

  it("fails a task whose cost more than tripled since the previous report", () => {
    const previous = taskReport({ taskId: "a", meanCostUsd: 0.01 });
    const current = taskReport({ taskId: "a", meanCostUsd: 0.04 });
    const report: EvalReport = { generatedAt: "now", tasks: [current] };
    const diff: ReportDiff = {
      entries: [{ taskId: "a", status: "compared", current, previous, meanCostUsdDelta: 0.03 }],
    };

    const result = evaluateGate(report, diff, new Set(["a"]));
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([{ taskId: "a", reason: expect.stringMatching(/cost increased 4\.0x/) }]);
  });

  it("allows a cost increase at or under the multiplier threshold", () => {
    const previous = taskReport({ taskId: "a", meanCostUsd: 0.01 });
    const current = taskReport({ taskId: "a", meanCostUsd: 0.03 });
    const report: EvalReport = { generatedAt: "now", tasks: [current] };
    const diff: ReportDiff = {
      entries: [{ taskId: "a", status: "compared", current, previous, meanCostUsdDelta: 0.02 }],
    };

    const result = evaluateGate(report, diff, new Set(["a"]));
    expect(result.passed).toBe(true);
  });

  it("respects a custom cost multiplier threshold", () => {
    const previous = taskReport({ taskId: "a", meanCostUsd: 0.01 });
    const current = taskReport({ taskId: "a", meanCostUsd: 0.015 });
    const report: EvalReport = { generatedAt: "now", tasks: [current] };
    const diff: ReportDiff = {
      entries: [{ taskId: "a", status: "compared", current, previous, meanCostUsdDelta: 0.005 }],
    };

    const result = evaluateGate(report, diff, new Set(["a"]), { maxCostMultiplier: 1.2 });
    expect(result.passed).toBe(false);
  });

  it("ignores tasks that aren't in the gated set", () => {
    const report: EvalReport = { generatedAt: "now", tasks: [taskReport({ taskId: "exploratory", passEveryRun: false })] };
    const diff: ReportDiff = { entries: [{ taskId: "exploratory", status: "new", current: report.tasks[0]! }] };

    const result = evaluateGate(report, diff, new Set(["quick-task"]));
    expect(result).toEqual({ passed: true, failures: [] });
  });
});
