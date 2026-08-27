import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const verdictSchema = z.object({
  passed: z.boolean(),
  reasoning: z.string(),
});
export type JudgeVerdict = z.infer<typeof verdictSchema>;

// Mirrors the harness's AgentClient pattern (loop.ts): a minimal structural
// interface instead of the full Anthropic class, so tests can pass a plain
// object and the real SDK client satisfies it without extra wiring.
export interface JudgeClient {
  messages: {
    parse(params: {
      model: string;
      max_tokens: number;
      output_config: { effort?: "low" | "medium" | "high" | "xhigh" | "max"; format: ReturnType<typeof zodOutputFormat> };
      messages: Anthropic.MessageParam[];
    }): Promise<{ parsed_output: JudgeVerdict | null }>;
  };
}

export interface JudgeContext {
  prompt: string;
  rubric: string;
  finalResponseText: string;
}

export interface JudgeOptions {
  client: JudgeClient;
  // Cheap classification task — a small model at low effort is plenty, and
  // keeps judge cost from dominating the eval sweep (see PRD Phase 5 cost
  // control). Mirrors the existing cheap-run default in harness/dev-run.ts.
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

const DEFAULT_JUDGE_MODEL = "claude-haiku-4-5";

export async function judge(context: JudgeContext, options: JudgeOptions): Promise<JudgeVerdict> {
  const { client, model = DEFAULT_JUDGE_MODEL, effort = "low" } = options;

  const response = await client.messages.parse({
    model,
    max_tokens: 1024,
    output_config: { effort, format: zodOutputFormat(verdictSchema) },
    messages: [
      {
        role: "user",
        content: [
          `Task given to the agent:\n${context.prompt}`,
          `Rubric:\n${context.rubric}`,
          `Agent's final response:\n${context.finalResponseText}`,
          "Judge whether the response satisfies the rubric. Be specific about which rubric criteria passed or failed.",
        ].join("\n\n"),
      },
    ],
  });

  if (!response.parsed_output) {
    return { passed: false, reasoning: "Judge response could not be parsed into a verdict." };
  }
  return response.parsed_output;
}
