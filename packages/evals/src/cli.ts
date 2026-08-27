// Runs the full eval sweep against the real Anthropic API — not run by
// `pnpm test`. Needs credentials (ANTHROPIC_API_KEY or an `ant auth login`
// profile) and costs real tokens. Run with: pnpm eval

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { loadTasksFromDir } from "./task-loader.js";
import { runTasks } from "./runner.js";
import { buildReport } from "./report.js";
import { writeReport } from "./report-io.js";

const here = dirname(fileURLToPath(import.meta.url));
const evalsRoot = join(here, "..", "..", "..", "evals");

const client = new Anthropic();

const tasks = await loadTasksFromDir(join(evalsRoot, "tasks"));
const results = await runTasks(tasks, {
  client,
  // A real Anthropic client satisfies both AgentClient (messages.stream)
  // and JudgeClient (messages.parse) — one client, two structural roles.
  judgeClient: client,
  fixturesRoot: join(evalsRoot, "fixtures"),
  evalsRoot,
});

const report = buildReport(results);
const diff = await writeReport(evalsRoot, report);

for (const entry of diff.entries) {
  const t = entry.current;
  const delta = entry.passRateDelta !== undefined ? ` (${entry.passRateDelta >= 0 ? "+" : ""}${(entry.passRateDelta * 100).toFixed(0)}pp)` : "";
  console.log(
    `${t.taskId}: pass@k=${t.passAtLeastOnce} pass^k=${t.passEveryRun} rate=${(t.passRate * 100).toFixed(0)}%${delta} cost=$${t.meanCostUsd.toFixed(4)}`,
  );
}
console.log("Report written to evals/reports/latest.json and evals/reports/latest.html");
