import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

const verdictSchema = z.object({
  passed: z.boolean(),
  reasoning: z.string(),
});
export type JudgeVerdict = z.infer<typeof verdictSchema>;

// Mirrors the harness's AgentClient pattern (loop.ts): a minimal structural
// interface over messages.create's plain Message shape, not messages.parse()
// — parse()'s return type is generic over output_config.format in a way
// that doesn't survive being narrowed to a simpler interface, so we do the
// JSON parse + schema validation ourselves instead.
export interface JudgeClient {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      output_config: { effort?: "low" | "medium" | "high" | "xhigh" | "max"; format: ReturnType<typeof zodOutputFormat> };
      messages: Anthropic.MessageParam[];
    }): Promise<{ content: Anthropic.ContentBlock[] }>;
  };
}

export interface JudgeContext {
  prompt: string;
  rubric: string;
  finalResponseText: string;
}

export interface JudgeOptions {
  client: JudgeClient;
  // Cheap classification task — keeps judge cost from dominating the eval
  // sweep (see PRD Phase 5 cost control) via a cheap *model* by default.
  // effort is left unset by default: Haiku-tier models reject
  // output_config.effort outright (400 invalid_request_error) — it only
  // does anything on Opus-tier models, so callers opt in explicitly when
  // they override to one of those.
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

const DEFAULT_JUDGE_MODEL = "claude-haiku-4-5";

export async function judge(context: JudgeContext, options: JudgeOptions): Promise<JudgeVerdict> {
  const { client, model = DEFAULT_JUDGE_MODEL, effort } = options;

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    output_config: { ...(effort ? { effort } : {}), format: zodOutputFormat(verdictSchema) },
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

  const textBlock = response.content.find((block): block is Anthropic.TextBlock => block.type === "text");
  const verdict = parseVerdict(textBlock?.text);
  if (!verdict) {
    return { passed: false, reasoning: "Judge response could not be parsed into a verdict." };
  }
  return verdict;
}

function parseVerdict(text: string | undefined): JudgeVerdict | undefined {
  if (!text) return undefined;
  try {
    const parsed = verdictSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
