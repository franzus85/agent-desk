import type { EvalReport, ReportDiff } from "./report.js";

export interface GateOptions {
  // Cost per task must not exceed this multiple of the previous run's cost.
  maxCostMultiplier?: number;
}

export interface GateFailure {
  taskId: string;
  reason: string;
}

export interface GateResult {
  passed: boolean;
  failures: GateFailure[];
}

const DEFAULT_MAX_COST_MULTIPLIER = 3;

// Checks the two thresholds the PRD calls for on the PR gate: pass^k must
// hold for every gated task, and cost per task must not have blown up
// relative to the last known-good report — so a change that buys accuracy
// with a 3x cost increase fails loudly instead of merging quietly.
export function evaluateGate(
  report: EvalReport,
  diff: ReportDiff,
  gatedTaskIds: ReadonlySet<string>,
  options: GateOptions = {},
): GateResult {
  const maxCostMultiplier = options.maxCostMultiplier ?? DEFAULT_MAX_COST_MULTIPLIER;
  const failures: GateFailure[] = [];

  for (const task of report.tasks) {
    if (!gatedTaskIds.has(task.taskId)) continue;
    if (!task.passEveryRun) {
      failures.push({
        taskId: task.taskId,
        reason: `pass^k failed: only ${(task.passRate * 100).toFixed(0)}% of runs passed.`,
      });
    }
  }

  for (const entry of diff.entries) {
    if (!gatedTaskIds.has(entry.taskId)) continue;
    if (entry.status !== "compared" || !entry.previous || entry.previous.meanCostUsd <= 0) continue;
    const multiplier = entry.current.meanCostUsd / entry.previous.meanCostUsd;
    if (multiplier > maxCostMultiplier) {
      failures.push({
        taskId: entry.taskId,
        reason: `cost increased ${multiplier.toFixed(1)}x (from $${entry.previous.meanCostUsd.toFixed(4)} to $${entry.current.meanCostUsd.toFixed(4)}), over the ${maxCostMultiplier}x threshold.`,
      });
    }
  }

  return { passed: failures.length === 0, failures };
}
