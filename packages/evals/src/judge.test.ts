import { describe, expect, it } from "vitest";
import { judge, type JudgeClient, type JudgeVerdict } from "./judge.js";

function fakeClient(result: { parsed_output: JudgeVerdict | null }): {
  client: JudgeClient;
  calls: Array<Parameters<JudgeClient["messages"]["parse"]>[0]>;
} {
  const calls: Array<Parameters<JudgeClient["messages"]["parse"]>[0]> = [];
  return {
    calls,
    client: {
      messages: {
        parse: async (params) => {
          calls.push(params);
          return result;
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
    const { client } = fakeClient({ parsed_output: { passed: true, reasoning: "Grouped by project, no inventions." } });
    const verdict = await judge(context, { client });
    expect(verdict).toEqual({ passed: true, reasoning: "Grouped by project, no inventions." });
  });

  it("defaults to a cheap model at low effort", async () => {
    const { client, calls } = fakeClient({ parsed_output: { passed: true, reasoning: "ok" } });
    await judge(context, { client });
    expect(calls[0]?.model).toBe("claude-haiku-4-5");
    expect(calls[0]?.output_config.effort).toBe("low");
  });

  it("respects an overridden model and effort", async () => {
    const { client, calls } = fakeClient({ parsed_output: { passed: true, reasoning: "ok" } });
    await judge(context, { client, model: "claude-opus-5", effort: "medium" });
    expect(calls[0]?.model).toBe("claude-opus-5");
    expect(calls[0]?.output_config.effort).toBe("medium");
  });

  it("fails closed with a reasoning message when parsing fails", async () => {
    const { client } = fakeClient({ parsed_output: null });
    const verdict = await judge(context, { client });
    expect(verdict.passed).toBe(false);
    expect(verdict.reasoning).toMatch(/could not be parsed/);
  });

  it("includes the prompt, rubric, and final response text in the request", async () => {
    const { client, calls } = fakeClient({ parsed_output: { passed: true, reasoning: "ok" } });
    await judge(context, { client });
    const content = calls[0]?.messages[0]?.content;
    expect(content).toContain(context.prompt);
    expect(content).toContain(context.rubric);
    expect(content).toContain(context.finalResponseText);
  });
});
