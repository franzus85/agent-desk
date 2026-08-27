import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpClient, StdioTransport } from "@agent-desk/mcp-client";
import { registerMcpServers, runAgent, ToolRegistry, type AgentClient } from "@agent-desk/harness";
import type { AgentEvent } from "@agent-desk/protocol";
import { seedFixture } from "./fixtures.js";
import { judge as runJudge, type JudgeClient, type JudgeVerdict } from "./judge.js";
import { scoreOutcome, type OutcomeScore } from "./outcome-scorer.js";
import { loadRubric } from "./rubrics.js";
import type { Task } from "./schema.js";
import { scoreTrajectory, type TrajectoryScore } from "./trajectory-scorer.js";

// Resolved relative to this package, same as the precedent in
// harness/mcp-bridge.e2e.test.ts — every task currently only needs notes +
// calendar (no task exercises mcp-wiki yet).
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const tsxBin = join(repoRoot, "node_modules", ".bin", "tsx");
const notesEntry = join(repoRoot, "servers", "mcp-notes", "src", "server.ts");
const calendarEntry = join(repoRoot, "servers", "mcp-calendar", "src", "server.ts");

export interface RunnerOptions {
  client: AgentClient;
  judgeClient?: JudgeClient;
  fixturesRoot: string;
  // Root that a task's expect.judge.rubric path resolves against.
  evalsRoot: string;
  // Repeats per task — PRD calls for starting at 3.
  n?: number;
  model?: string;
  maxTurns?: number;
  // Passed straight through to runAgent. Needed when overriding to a model
  // that rejects the harness's default adaptive thinking — e.g.
  // claude-haiku-4-5 (see harness/dev-run.ts, which hits the same thing).
  thinking?: { type: "adaptive" } | null;
}

export interface RunResult {
  runIndex: number;
  passed: boolean;
  outcome: OutcomeScore;
  trajectory: TrajectoryScore;
  judge?: JudgeVerdict;
  durationMs: number;
  // Recorded explicitly rather than left to runAgent's internal default —
  // the reporter (Step 6) needs to know which model ran to price it.
  model: string;
  events: AgentEvent[];
}

export interface TaskResult {
  taskId: string;
  runs: RunResult[];
  // pass@k — at least one run succeeded. Flatters; useful for capability.
  passAtLeastOnce: boolean;
  // pass^k — every run succeeded. The honest reliability number to lead with.
  passEveryRun: boolean;
}

const DEFAULT_N = 3;
// Matches the harness's own DEFAULT_MODEL (loop.ts) — kept as our own
// constant rather than relying on that default silently, since the
// reporter needs to know which model actually ran to price it.
const DEFAULT_EXECUTOR_MODEL = "claude-opus-5";

async function runOnce(task: Task, runIndex: number, options: RunnerOptions): Promise<RunResult> {
  const model = options.model ?? DEFAULT_EXECUTOR_MODEL;
  const seeded = await seedFixture(options.fixturesRoot, task.fixtures);
  const notesTransport = new StdioTransport(tsxBin, [notesEntry], {
    env: { ...process.env, MCP_NOTES_DATA_DIR: seeded.notesDir },
  });
  const calendarTransport = new StdioTransport(tsxBin, [calendarEntry], {
    env: seeded.calendarFile ? { ...process.env, MCP_CALENDAR_DATA_FILE: seeded.calendarFile } : process.env,
  });

  try {
    const registry = new ToolRegistry();
    await registerMcpServers(registry, [
      { id: "notes", client: new McpClient({ transport: notesTransport }) },
      { id: "calendar", client: new McpClient({ transport: calendarTransport }) },
    ]);

    const events: AgentEvent[] = [];
    // Buffered text resets on every tool.started: a turn's own commentary is
    // only "final" if no further tool call follows it in the same run. See
    // loop.ts — a turn's text always finishes streaming before its
    // tool.started events fire, so this always leaves the last turn's text
    // (the one that actually ended the run) once the loop exits.
    let finalResponseText = "";
    const startedAt = Date.now();
    for await (const event of runAgent({
      client: options.client,
      registry,
      task: task.prompt,
      runId: randomUUID(),
      model,
      maxTurns: options.maxTurns,
      thinking: options.thinking,
    })) {
      events.push(event);
      if (event.type === "text.delta") finalResponseText += event.delta;
      else if (event.type === "tool.started") finalResponseText = "";
    }
    const durationMs = Date.now() - startedAt;

    const outcome = await scoreOutcome(task.expect.outcome, { workspaceDir: seeded.notesDir, finalResponseText });
    const trajectory = scoreTrajectory(task.expect.trajectory, events);

    let judgeVerdict: JudgeVerdict | undefined;
    if (task.expect.judge) {
      if (!options.judgeClient) {
        throw new Error(`Task "${task.id}" requires a judge, but no judgeClient was provided.`);
      }
      const rubric = await loadRubric(options.evalsRoot, task.expect.judge.rubric);
      judgeVerdict = await runJudge({ prompt: task.prompt, rubric, finalResponseText }, { client: options.judgeClient });
    }

    return {
      runIndex,
      passed: outcome.passed && trajectory.passed && (judgeVerdict ? judgeVerdict.passed : true),
      outcome,
      trajectory,
      judge: judgeVerdict,
      durationMs,
      model,
      events,
    };
  } finally {
    notesTransport.close();
    calendarTransport.close();
    await seeded.cleanup();
  }
}

export async function runTask(task: Task, options: RunnerOptions): Promise<TaskResult> {
  const n = options.n ?? DEFAULT_N;
  const runs: RunResult[] = [];
  for (let i = 0; i < n; i++) {
    runs.push(await runOnce(task, i, options));
  }
  return {
    taskId: task.id,
    runs,
    passAtLeastOnce: runs.some((run) => run.passed),
    passEveryRun: runs.every((run) => run.passed),
  };
}

export async function runTasks(tasks: Task[], options: RunnerOptions): Promise<TaskResult[]> {
  const results: TaskResult[] = [];
  for (const task of tasks) {
    results.push(await runTask(task, options));
  }
  return results;
}
