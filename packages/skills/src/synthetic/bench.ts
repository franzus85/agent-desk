// Manual benchmark against the real Anthropic API — not run by `pnpm test`.
// Needs credentials (ANTHROPIC_API_KEY) and costs real tokens.
// Run with: pnpm --filter @agent-desk/skills bench

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { generateSyntheticSkills } from "./generate.js";
import { naiveStrategy } from "./strategies/naive.js";
import { tier1KeywordStrategy } from "./strategies/tier1-keyword.js";
import type { SelectionStrategy } from "./strategies/types.js";
import { selectionTasks } from "./tasks.js";

interface TaskRun {
  taskId: string;
  difficulty: "easy" | "hard";
  expectedTool: string;
  actualTool: string | null;
  correct: boolean;
  skillsConsidered: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

interface StrategyReport {
  strategy: string;
  taskCount: number;
  accuracy: number;
  accuracyEasy: number;
  accuracyHard: number;
  avgSkillsConsidered: number;
  avgInputTokens: number;
  avgLatencyMs: number;
  runs: TaskRun[];
}

async function runStrategy(client: Anthropic, strategy: SelectionStrategy): Promise<StrategyReport> {
  const skills = generateSyntheticSkills();
  const runs: TaskRun[] = [];

  for (const task of selectionTasks) {
    const result = await strategy.select(client, task, skills);
    runs.push({
      taskId: task.id,
      difficulty: task.difficulty,
      expectedTool: task.expectedTool,
      actualTool: result.toolName,
      correct: result.toolName === task.expectedTool,
      skillsConsidered: result.skillsConsidered,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: result.latencyMs,
    });
  }

  const accuracyOf = (subset: TaskRun[]) => (subset.length === 0 ? 0 : subset.filter((run) => run.correct).length / subset.length);
  const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    strategy: strategy.name,
    taskCount: runs.length,
    accuracy: accuracyOf(runs),
    accuracyEasy: accuracyOf(runs.filter((run) => run.difficulty === "easy")),
    accuracyHard: accuracyOf(runs.filter((run) => run.difficulty === "hard")),
    avgSkillsConsidered: avg(runs.map((run) => run.skillsConsidered)),
    avgInputTokens: avg(runs.map((run) => run.inputTokens)),
    avgLatencyMs: avg(runs.map((run) => run.latencyMs)),
    runs,
  };
}

const client = new Anthropic();
const strategies: SelectionStrategy[] = [naiveStrategy, tier1KeywordStrategy];

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "bench-reports");
await mkdir(outDir, { recursive: true });

for (const strategy of strategies) {
  const report = await runStrategy(client, strategy);

  process.stderr.write(
    `[bench] ${report.strategy}: accuracy=${(report.accuracy * 100).toFixed(0)}% ` +
      `(easy=${(report.accuracyEasy * 100).toFixed(0)}%, hard=${(report.accuracyHard * 100).toFixed(0)}%) ` +
      `avgSkillsConsidered=${report.avgSkillsConsidered.toFixed(0)} ` +
      `avgInputTokens=${report.avgInputTokens.toFixed(0)} avgLatencyMs=${report.avgLatencyMs.toFixed(0)}\n`,
  );

  const outPath = join(outDir, `${report.strategy}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2), "utf8");
  process.stderr.write(`[bench] wrote ${outPath}\n`);
}
