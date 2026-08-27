import { costUsd } from "./pricing.js";
import type { RunResult, TaskResult } from "./runner.js";

export interface TaskReport {
  taskId: string;
  passRate: number;
  // pass@k — at least one run succeeded. Flatters; useful for capability.
  passAtLeastOnce: boolean;
  // pass^k — every run succeeded. The honest reliability number to lead with.
  passEveryRun: boolean;
  meanSteps: number;
  meanLatencyMs: number;
  meanCostUsd: number;
}

export interface EvalReport {
  generatedAt: string;
  tasks: TaskReport[];
}

export interface TaskDiffEntry {
  taskId: string;
  status: "new" | "compared";
  current: TaskReport;
  previous?: TaskReport;
  passRateDelta?: number;
  meanStepsDelta?: number;
  meanLatencyMsDelta?: number;
  meanCostUsdDelta?: number;
}

export interface ReportDiff {
  entries: TaskDiffEntry[];
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function runCostUsd(run: RunResult): number {
  const finished = run.events.find((event) => event.type === "run.finished");
  if (!finished || finished.type !== "run.finished" || !finished.usage) return 0;
  return costUsd(run.model, finished.usage);
}

export function buildReport(taskResults: TaskResult[], generatedAt: string = new Date().toISOString()): EvalReport {
  const tasks = taskResults.map((taskResult): TaskReport => {
    const passedCount = taskResult.runs.filter((run) => run.passed).length;
    return {
      taskId: taskResult.taskId,
      passRate: taskResult.runs.length === 0 ? 0 : passedCount / taskResult.runs.length,
      passAtLeastOnce: taskResult.passAtLeastOnce,
      passEveryRun: taskResult.passEveryRun,
      meanSteps: mean(taskResult.runs.map((run) => run.trajectory.steps)),
      meanLatencyMs: mean(taskResult.runs.map((run) => run.durationMs)),
      meanCostUsd: mean(taskResult.runs.map(runCostUsd)),
    };
  });
  return { generatedAt, tasks };
}

export function diffReports(current: EvalReport, previous: EvalReport | undefined): ReportDiff {
  const previousByTaskId = new Map((previous?.tasks ?? []).map((task) => [task.taskId, task]));
  const entries = current.tasks.map((task): TaskDiffEntry => {
    const prev = previousByTaskId.get(task.taskId);
    if (!prev) return { taskId: task.taskId, status: "new", current: task };
    return {
      taskId: task.taskId,
      status: "compared",
      current: task,
      previous: prev,
      passRateDelta: task.passRate - prev.passRate,
      meanStepsDelta: task.meanSteps - prev.meanSteps,
      meanLatencyMsDelta: task.meanLatencyMs - prev.meanLatencyMs,
      meanCostUsdDelta: task.meanCostUsd - prev.meanCostUsd,
    };
  });
  return { entries };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}
function fmtMs(n: number): string {
  return `${Math.round(n)} ms`;
}
function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}
function fmtDelta(n: number | undefined, fmt: (n: number) => string): string {
  if (n === undefined) return "";
  const sign = n > 0 ? "+" : "";
  return ` (${sign}${fmt(n)})`;
}

export function renderHtml(report: EvalReport, diff: ReportDiff): string {
  const rows = diff.entries
    .map((entry) => {
      const t = entry.current;
      const passClass = t.passEveryRun ? "pass" : t.passAtLeastOnce ? "partial" : "fail";
      return `      <tr class="${passClass}">
        <td>${escapeHtml(t.taskId)}${entry.status === "new" ? ' <span class="badge">new</span>' : ""}</td>
        <td>${fmtPct(t.passRate)}${fmtDelta(entry.passRateDelta, fmtPct)}</td>
        <td>${t.passAtLeastOnce ? "✓" : "✗"}</td>
        <td>${t.passEveryRun ? "✓" : "✗"}</td>
        <td>${t.meanSteps.toFixed(1)}${fmtDelta(entry.meanStepsDelta, (n) => n.toFixed(1))}</td>
        <td>${fmtMs(t.meanLatencyMs)}${fmtDelta(entry.meanLatencyMsDelta, fmtMs)}</td>
        <td>${fmtUsd(t.meanCostUsd)}${fmtDelta(entry.meanCostUsdDelta, fmtUsd)}</td>
      </tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>AgentDesk eval report</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #ddd; }
  tr.pass { background: #f0fff4; }
  tr.partial { background: #fffbea; }
  tr.fail { background: #fff5f5; }
  caption { text-align: left; margin-bottom: 1rem; color: #666; }
  .badge { font-size: 0.75em; color: #666; border: 1px solid #ccc; border-radius: 3px; padding: 0 4px; }
</style>
</head>
<body>
<h1>AgentDesk eval report</h1>
<table>
  <caption>Generated ${escapeHtml(report.generatedAt)}${diff.entries.some((e) => e.status === "compared") ? " — deltas vs. previous run" : ""}</caption>
  <thead>
    <tr><th>Task</th><th>Pass rate</th><th>pass@k</th><th>pass^k</th><th>Mean steps</th><th>Mean latency</th><th>Mean cost</th></tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
</body>
</html>
`;
}
