import { describe, expect, it } from "vitest";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { defineTool } from "./tool.js";
import { ToolRegistry } from "./registry.js";
import { runAgent, type AgentClient, type AgentMessage } from "./loop.js";
import type { AgentEvent } from "@agent-desk/protocol";

interface FakeTurn {
  deltas?: string[];
  message: AgentMessage;
}

interface StreamCall {
  messages: Anthropic.MessageParam[];
}

function createFakeClient(turns: FakeTurn[]) {
  const state = { calls: 0, streamCalls: [] as StreamCall[] };
  const client: AgentClient = {
    messages: {
      stream(params) {
        state.streamCalls.push({ messages: params.messages });
        const turn = turns[state.calls];
        state.calls += 1;
        if (!turn) {
          throw new Error("Fake client ran out of scripted turns.");
        }
        return {
          on(event, listener) {
            if (event === "text") {
              for (const delta of turn.deltas ?? []) listener(delta);
            }
          },
          finalMessage: async () => turn.message,
        };
      },
    },
  };
  return { client, state };
}

async function collect(generator: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

function toolUseTurn(id: string, name: string): FakeTurn {
  return {
    message: {
      content: [{ type: "tool_use", id, name, input: {}, caller: { type: "direct" } }],
      stop_reason: "tool_use",
    },
  };
}

const endTurn: FakeTurn = {
  deltas: ["done"],
  message: {
    content: [{ type: "text", text: "done", citations: null }],
    stop_reason: "end_turn",
  },
};

describe("runAgent", () => {
  it("completes a task needing multiple dependent tool calls", async () => {
    const registry = new ToolRegistry();
    for (const name of ["step1", "step2", "step3"]) {
      registry.register(
        defineTool({
          name,
          description: `Runs ${name}`,
          inputSchema: z.object({}),
          handler: async () => ({ ok: true }),
        }),
      );
    }

    const { client, state } = createFakeClient([
      toolUseTurn("call_1", "step1"),
      toolUseTurn("call_2", "step2"),
      toolUseTurn("call_3", "step3"),
      endTurn,
    ]);

    const events = await collect(
      runAgent({ client, registry, task: "do the thing", runId: "run-1" }),
    );

    const toolNames = events
      .filter((e) => e.type === "tool.finished")
      .map((e) => (e.type === "tool.finished" ? e.name : undefined));
    expect(toolNames).toEqual(["step1", "step2", "step3"]);

    const last = events.at(-1);
    expect(last).toMatchObject({ type: "run.finished", stopReason: "end_turn" });
    expect(state.calls).toBe(4);
  });

  it("reports a failing tool without ending the run", async () => {
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: "explode",
        description: "Always fails",
        inputSchema: z.object({}),
        handler: async () => {
          throw new Error("kaboom");
        },
      }),
    );

    const { client, state } = createFakeClient([toolUseTurn("call_1", "explode"), endTurn]);

    const events = await collect(
      runAgent({ client, registry, task: "trigger the failure", runId: "run-2" }),
    );

    expect(events).toContainEqual(
      expect.objectContaining({ type: "tool.failed", name: "explode", error: "kaboom" }),
    );
    expect(events.at(-1)).toMatchObject({ type: "run.finished", stopReason: "end_turn" });

    const secondCallResult = state.streamCalls[1]?.messages.at(-1);
    expect(secondCallResult).toMatchObject({
      role: "user",
      content: [{ type: "tool_result", is_error: true, content: "kaboom" }],
    });
  });

  it("stops at the turn budget instead of looping forever", async () => {
    const registry = new ToolRegistry();
    registry.register(
      defineTool({
        name: "loopy",
        description: "Always requests another call",
        inputSchema: z.object({}),
        handler: async () => "again",
      }),
    );

    const { client, state } = createFakeClient([
      toolUseTurn("call_1", "loopy"),
      toolUseTurn("call_2", "loopy"),
      toolUseTurn("call_3", "loopy"),
    ]);

    const events = await collect(
      runAgent({ client, registry, task: "loop forever", runId: "run-3", maxTurns: 2 }),
    );

    expect(events.at(-1)).toMatchObject({ type: "run.finished", stopReason: "turn_budget" });
    expect(state.calls).toBe(2);
  });
});
