import type Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent } from "@agent-desk/protocol";
import type { ToolRegistry } from "./registry.js";
import { createChannel } from "./channel.js";

export interface AgentMessage {
  content: Anthropic.ContentBlock[];
  stop_reason: string | null;
}

export interface AgentStream {
  on(event: "text", listener: (delta: string) => void): void;
  finalMessage(): Promise<AgentMessage>;
}

export interface AgentClient {
  messages: {
    stream(params: {
      model: string;
      max_tokens: number;
      thinking?: { type: "adaptive" };
      tools?: Anthropic.Tool[];
      messages: Anthropic.MessageParam[];
    }): AgentStream;
  };
}

export interface RunAgentOptions {
  client: AgentClient;
  registry: ToolRegistry;
  task: string;
  runId: string;
  model?: string;
  maxTurns?: number;
  maxTokens?: number;
  thinking?: { type: "adaptive" };
}

const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_MAX_TURNS = 8;
const DEFAULT_MAX_TOKENS = 64000;

export async function* runAgent(options: RunAgentOptions): AsyncGenerator<AgentEvent> {
  const {
    client,
    registry,
    task,
    runId,
    model = DEFAULT_MODEL,
    maxTurns = DEFAULT_MAX_TURNS,
    maxTokens = DEFAULT_MAX_TOKENS,
    thinking = { type: "adaptive" },
  } = options;

  yield { type: "run.started", runId, ts: Date.now(), task };

  const tools: Anthropic.Tool[] = registry.specs().map((spec) => ({
    name: spec.name,
    description: spec.description,
    input_schema: spec.inputSchema as Anthropic.Tool["input_schema"],
  }));

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];

  for (let turn = 0; turn < maxTurns; turn++) {
    const stream = client.messages.stream({ model, max_tokens: maxTokens, thinking, tools, messages });

    const channel = createChannel<AgentEvent>();
    stream.on("text", (delta) => {
      channel.push({ type: "text.delta", runId, ts: Date.now(), delta });
    });

    const finalMessagePromise = stream.finalMessage();
    finalMessagePromise.finally(() => channel.close());

    let message: AgentMessage;
    try {
      for await (const event of channel) {
        yield event;
      }
      message = await finalMessagePromise;
    } catch (error) {
      yield { type: "run.error", runId, ts: Date.now(), message: String(error) };
      return;
    }

    if (message.stop_reason === "end_turn") {
      yield { type: "run.finished", runId, ts: Date.now(), stopReason: "end_turn" };
      return;
    }

    if (message.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: message.content });
      continue;
    }

    if (message.stop_reason !== "tool_use") {
      yield {
        type: "run.error",
        runId,
        ts: Date.now(),
        message: `Unhandled stop_reason: ${String(message.stop_reason)}`,
      };
      return;
    }

    messages.push({ role: "assistant", content: message.content });

    const toolUseBlocks = message.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const call of toolUseBlocks) {
      yield { type: "tool.started", runId, ts: Date.now(), toolCallId: call.id, name: call.name, input: call.input };
      const startedAt = Date.now();

      try {
        const result = await registry.execute(call.name, call.input);
        yield {
          type: "tool.finished",
          runId,
          ts: Date.now(),
          toolCallId: call.id,
          name: call.name,
          result,
          durationMs: Date.now() - startedAt,
        };
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: typeof result === "string" ? result : JSON.stringify(result),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        yield {
          type: "tool.failed",
          runId,
          ts: Date.now(),
          toolCallId: call.id,
          name: call.name,
          error: errorMessage,
        };
        toolResults.push({
          type: "tool_result",
          tool_use_id: call.id,
          content: errorMessage,
          is_error: true,
        });
      }
    }

    messages.push({ role: "user", content: toolResults });
  }

  yield { type: "run.finished", runId, ts: Date.now(), stopReason: "turn_budget" };
}
