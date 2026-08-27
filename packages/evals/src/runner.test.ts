import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type Anthropic from "@anthropic-ai/sdk";
import type { AgentClient, AgentMessage, AgentStream } from "@agent-desk/harness";
import type { JudgeClient, JudgeVerdict } from "./judge.js";
import { parseTaskFile } from "./task-loader.js";
import { runTask } from "./runner.js";

const here = dirname(fileURLToPath(import.meta.url));
const evalsRoot = join(here, "..", "..", "..", "evals");
const fixturesRoot = join(evalsRoot, "fixtures");

const FAKE_USAGE: Anthropic.Usage = {
  input_tokens: 10,
  output_tokens: 5,
  cache_creation: null,
  cache_creation_input_tokens: null,
  cache_read_input_tokens: null,
  inference_geo: null,
  output_tokens_details: null,
  server_tool_use: null,
  service_tier: null,
};

interface FakeTurn {
  deltas?: string[];
  message: AgentMessage;
}

function toolUseTurn(id: string, name: string, input: Record<string, unknown>): FakeTurn {
  return {
    message: {
      content: [{ type: "tool_use", id, name, input, caller: { type: "direct" } }] as Anthropic.ContentBlock[],
      stop_reason: "tool_use",
      usage: FAKE_USAGE,
    },
  };
}

function endTurn(text: string): FakeTurn {
  return {
    deltas: [text],
    message: {
      content: [{ type: "text", text, citations: null }] as Anthropic.ContentBlock[],
      stop_reason: "end_turn",
      usage: FAKE_USAGE,
    },
  };
}

// The full happy-path script for the committed weekly-report-happy task:
// look at the calendar, search notes, write the report, then summarize —
// exactly what expect.trajectory.must_call requires.
function happyPathScript(): FakeTurn[] {
  return [
    toolUseTurn("call_calendar", "calendar__list", {}),
    toolUseTurn("call_search", "notes__search", { query: "Atlas" }),
    toolUseTurn(
      "call_write",
      "notes__write",
      { title: "weekly-report", body: "Project Atlas on track. Q3 planning review happened this week." },
    ),
    endTurn("Weekly report sent, covering Project Atlas and the Q3 planning review."),
  ];
}

function fakeAgentClient(script: FakeTurn[]): AgentClient {
  let index = 0;
  return {
    messages: {
      stream(): AgentStream {
        const turn = script[index];
        index += 1;
        if (!turn) throw new Error("Fake agent client ran out of scripted turns.");
        return {
          on(event, listener) {
            if (event === "text") for (const delta of turn.deltas ?? []) listener(delta);
          },
          finalMessage: async () => turn.message,
        };
      },
    },
  };
}

function fakeJudgeClient(verdict: JudgeVerdict): JudgeClient {
  return { messages: { parse: async () => ({ parsed_output: verdict }) } };
}

async function loadWeeklyReportTask() {
  const { readFile } = await import("node:fs/promises");
  const contents = await readFile(join(evalsRoot, "tasks", "weekly-report-happy.yaml"), "utf8");
  return parseTaskFile(contents, "weekly-report-happy.yaml");
}

describe("runTask", () => {
  it("runs the committed weekly-report-happy task end to end against real notes/calendar servers", async () => {
    const task = await loadWeeklyReportTask();
    const client = fakeAgentClient(happyPathScript());
    const judgeClient = fakeJudgeClient({ passed: true, reasoning: "Grouped by project, no inventions." });

    const result = await runTask(task, { client, judgeClient, fixturesRoot, evalsRoot, n: 1 });

    expect(result.taskId).toBe("weekly-report-happy");
    expect(result.runs).toHaveLength(1);
    const [run] = result.runs;
    expect(run?.outcome.passed).toBe(true);
    expect(run?.trajectory).toMatchObject({
      passed: true,
      toolsCalled: ["calendar.list", "notes.search", "notes.write"],
    });
    expect(run?.judge).toEqual({ passed: true, reasoning: "Grouped by project, no inventions." });
    expect(run?.passed).toBe(true);
    expect(result.passAtLeastOnce).toBe(true);
    expect(result.passEveryRun).toBe(true);
  }, 20000);

  it("fails the run when the judge rejects it, even though outcome and trajectory pass", async () => {
    const task = await loadWeeklyReportTask();
    const client = fakeAgentClient(happyPathScript());
    const judgeClient = fakeJudgeClient({ passed: false, reasoning: "Reads like a raw tool dump." });

    const result = await runTask(task, { client, judgeClient, fixturesRoot, evalsRoot, n: 1 });

    const [run] = result.runs;
    expect(run?.outcome.passed).toBe(true);
    expect(run?.trajectory.passed).toBe(true);
    expect(run?.judge?.passed).toBe(false);
    expect(run?.passed).toBe(false);
  }, 20000);

  it("throws when a task requires a judge but none was provided", async () => {
    const task = await loadWeeklyReportTask();
    const client = fakeAgentClient(happyPathScript());

    await expect(runTask(task, { client, fixturesRoot, evalsRoot, n: 1 })).rejects.toThrow(/requires a judge/);
  }, 20000);

  it("runs a task n times, isolating each run's fixture", async () => {
    const task = await loadWeeklyReportTask();
    const client = fakeAgentClient([...happyPathScript(), ...happyPathScript()]);
    const judgeClient = fakeJudgeClient({ passed: true, reasoning: "ok" });

    const result = await runTask(task, { client, judgeClient, fixturesRoot, evalsRoot, n: 2 });

    expect(result.runs).toHaveLength(2);
    expect(result.runs.map((run) => run.runIndex)).toEqual([0, 1]);
    expect(result.runs.every((run) => run.passed)).toBe(true);
  }, 30000);
});
