// Runs the "quick" tier of tasks against the real Anthropic API and enforces
// the PR gate thresholds — not run by `pnpm test`. Needs credentials and
// costs real tokens. Run with: pnpm eval:gate
//
// Unlike cli.ts, this does NOT write evals/reports/latest.{json,html} — the
// nightly full-suite run (cli.ts) is the sole source of truth for that
// baseline. This only reads it, read-only, to check for cost regressions.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { loadTasksFromDir } from "./task-loader.js";
import { runTasks } from "./runner.js";
import { buildReport, diffReports } from "./report.js";
import { loadPreviousReport } from "./report-io.js";
import { evaluateGate } from "./gate.js";

const here = dirname(fileURLToPath(import.meta.url));
const evalsRoot = join(here, "..", "..", "..", "evals");

const client = new Anthropic();

const allTasks = await loadTasksFromDir(join(evalsRoot, "tasks"));
const quickTasks = allTasks.filter((task) => task.tier === "quick");

const results = await runTasks(quickTasks, {
  client,
  judgeClient: client,
  fixturesRoot: join(evalsRoot, "fixtures"),
  evalsRoot,
});

const report = buildReport(results);
const previous = await loadPreviousReport(evalsRoot);
const diff = diffReports(report, previous);
const gate = evaluateGate(report, diff, new Set(quickTasks.map((task) => task.id)));

for (const task of report.tasks) {
  console.log(`${task.taskId}: rate=${(task.passRate * 100).toFixed(0)}% pass^k=${task.passEveryRun} cost=$${task.meanCostUsd.toFixed(4)}`);
}

if (!gate.passed) {
  console.error("\nEval gate FAILED:");
  for (const failure of gate.failures) {
    console.error(`  - ${failure.taskId}: ${failure.reason}`);
  }
  process.exit(1);
}

console.log("\nEval gate passed.");
