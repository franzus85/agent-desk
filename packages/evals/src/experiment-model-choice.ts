// Phase 5 Step 8 — the real experiment: does a cheap executor (Haiku) hold
// up against the default (Opus) on weekly-report-happy? Real API calls, not
// run by `pnpm test`. Needs ANTHROPIC_API_KEY and costs real tokens.
//
// Run with: pnpm --filter @agent-desk/evals exec tsx src/experiment-model-choice.ts
//
// Writes evals/reports/experiment-model-choice.json — deliberately separate
// from evals/reports/latest.json (the CI baseline written by cli.ts), since
// this compares two conditions rather than tracking one baseline over time.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { loadTasksFromDir } from "./task-loader.js";
import { runTasks } from "./runner.js";
import { buildReport, diffReports, type EvalReport } from "./report.js";

const here = dirname(fileURLToPath(import.meta.url));
const evalsRoot = join(here, "..", "..", "..", "evals");
const client = new Anthropic();

const tasks = await loadTasksFromDir(join(evalsRoot, "tasks"));

async function runWithModel(model: string, thinking?: { type: "adaptive" } | null): Promise<EvalReport> {
  const results = await runTasks(tasks, {
    client,
    judgeClient: client,
    fixturesRoot: join(evalsRoot, "fixtures"),
    evalsRoot,
    model,
    thinking,
  });
  return buildReport(results);
}

console.log("Running with claude-opus-5 (default executor)...");
const opusReport = await runWithModel("claude-opus-5");

console.log("Running with claude-haiku-4-5 (cheap executor)...");
// Haiku 4.5 rejects the harness's default adaptive-thinking param outright
// (see harness/dev-run.ts, which hits the same thing) — omit it.
const haikuReport = await runWithModel("claude-haiku-4-5", null);

// Reuses diffReports from Step 6 for a condition-vs-condition comparison
// instead of its usual time-vs-time one — same delta math either way.
const diff = diffReports(haikuReport, opusReport);

const outPath = join(evalsRoot, "reports", "experiment-model-choice.json");
await writeFile(outPath, JSON.stringify({ opus: opusReport, haiku: haikuReport, diff }, null, 2), "utf8");

console.log("\nclaude-opus-5 vs claude-haiku-4-5:");
for (const entry of diff.entries) {
  const opus = entry.previous;
  const haiku = entry.current;
  console.log(
    `  ${entry.taskId}: opus pass^k=${opus?.passEveryRun} rate=${((opus?.passRate ?? 0) * 100).toFixed(0)}% cost=$${opus?.meanCostUsd.toFixed(4)}` +
      ` | haiku pass^k=${haiku.passEveryRun} rate=${(haiku.passRate * 100).toFixed(0)}% cost=$${haiku.meanCostUsd.toFixed(4)}`,
  );
}
console.log(`\nWritten to ${outPath}`);
