import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { judge, type JudgeClient, type JudgeVerdict } from "./judge.js";

function textResponse(text: string): { content: Anthropic.ContentBlock[] } {
  return { content: [{ type: "text", text, citations: null }] as Anthropic.ContentBlock[] };
}

function fakeClient(response: { content: Anthropic.ContentBlock[] }): {
  client: JudgeClient;
  calls: Array<Parameters<JudgeClient["messages"]["create"]>[0]>;
} {
  const calls: Array<Parameters<JudgeClient["messages"]["create"]>[0]> = [];
  return {
    calls,
    client: {
      messages: {
        create: async (params) => {
          calls.push(params);
          return response;
        },
      },
    },
  };
}

const context = {
  prompt: "Write my weekly status report.",
  rubric: "Pass only if it groups by project.",
  finalResponseText: "Project Atlas is on track. Project Beacon kicked off.",
};

describe("judge", () => {
  it("returns the parsed verdict from the client", async () => {
    const { client } = fakeClient(textResponse(JSON.stringify({ passed: true, reasoning: "Grouped by project, no inventions." })));
    const verdict = await judge(context, { client });
    expect(verdict).toEqual({ passed: true, reasoning: "Grouped by project, no inventions." });
  });

  it("defaults to a cheap model at low effort", async () => {
    const { client, calls } = fakeClient(textResponse(JSON.stringify({ passed: true, reasoning: "ok" } satisfies JudgeVerdict)));
    await judge(context, { client });
    expect(calls[0]?.model).toBe("claude-haiku-4-5");
    expect(calls[0]?.output_config.effort).toBe("low");
  });

  it("respects an overridden model and effort", async () => {
    const { client, calls } = fakeClient(textResponse(JSON.stringify({ passed: true, reasoning: "ok" } satisfies JudgeVerdict)));
    await judge(context, { client, model: "claude-opus-5", effort: "medium" });
    expect(calls[0]?.model).toBe("claude-opus-5");
    expect(calls[0]?.output_config.effort).toBe("medium");
  });

  it("fails closed with a reasoning message when the response has no text block", async () => {
    const { client } = fakeClient({ content: [] });
    const verdict = await judge(context, { client });
    expect(verdict.passed).toBe(false);
    expect(verdict.reasoning).toMatch(/could not be parsed/);
  });

  it("fails closed when the text block isn't valid JSON", async () => {
    const { client } = fakeClient(textResponse("not json"));
    const verdict = await judge(context, { client });
    expect(verdict.passed).toBe(false);
    expect(verdict.reasoning).toMatch(/could not be parsed/);
  });

  it("fails closed when the JSON doesn't match the verdict schema", async () => {
    const { client } = fakeClient(textResponse(JSON.stringify({ passed: "yes" })));
    const verdict = await judge(context, { client });
    expect(verdict.passed).toBe(false);
    expect(verdict.reasoning).toMatch(/could not be parsed/);
  });

  it("includes the prompt, rubric, and final response text in the request", async () => {
    const { client, calls } = fakeClient(textResponse(JSON.stringify({ passed: true, reasoning: "ok" } satisfies JudgeVerdict)));
    await judge(context, { client });
    const content = calls[0]?.messages[0]?.content;
    expect(content).toContain(context.prompt);
    expect(content).toContain(context.rubric);
    expect(content).toContain(context.finalResponseText);
  });
});
