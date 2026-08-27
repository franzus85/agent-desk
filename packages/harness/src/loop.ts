import type Anthropic from "@anthropic-ai/sdk";
import type { AgentEvent } from "@agent-desk/protocol";
import {
  ERROR_TYPE,
  GEN_AI_OPERATION_CHAT,
  GEN_AI_OPERATION_EXECUTE_TOOL,
  GEN_AI_OPERATION_INVOKE_AGENT,
  GEN_AI_OPERATION_NAME,
  GEN_AI_PROVIDER_ANTHROPIC,
  GEN_AI_PROVIDER_NAME,
  GEN_AI_REQUEST_MODEL,
  GEN_AI_TOOL_CALL_ARGUMENTS,
  GEN_AI_TOOL_CALL_ID,
  GEN_AI_TOOL_CALL_RESULT,
  GEN_AI_TOOL_NAME,
  GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS,
  GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS,
  GEN_AI_USAGE_INPUT_TOKENS,
  GEN_AI_USAGE_OUTPUT_TOKENS,
  getTracer,
  SKILL_CANDIDATES,
  SKILL_SELECTED,
} from "@agent-desk/telemetry";
import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import type { ToolRegistry } from "./registry.js";
import { createChannel } from "./channel.js";
import { stableStringify } from "./stable-stringify.js";

export interface AgentMessage {
  content: Anthropic.ContentBlock[];
  stop_reason: string | null;
  usage: Anthropic.Usage;
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
  // undefined -> default to adaptive thinking; null -> explicitly omit the
  // param (needed for older models like claude-haiku-4-5 that reject it).
  thinking?: { type: "adaptive" } | null;
  repeatLimit?: number;
  // Opt-in: attach tool call arguments/results to execute_tool spans. Off by
  // default since tool payloads can carry sensitive data (matches the GenAI
  // spec's opt-in stance on content attributes).
  captureToolContent?: boolean;
}

const DEFAULT_MODEL = "claude-opus-5";
const DEFAULT_MAX_TURNS = 8;
const DEFAULT_MAX_TOKENS = 64000;
const DEFAULT_REPEAT_LIMIT = 3;

interface ToolOutcome {
  event: AgentEvent;
  toolResult: Anthropic.ToolResultBlockParam;
}

interface CallRecord {
  name: string;
  argsSignature: string;
}

// Anthropic's tool.name must match ^[a-zA-Z0-9_-]{1,128}$ — no dots — but the
// registry namespaces tools as "server.toolName" (see mcp-bridge.ts). The API
// only ever sees the sanitized form; call.name on returned tool_use blocks is
// mapped back to the real registry name before we execute or report on it.
// message.content itself is never rewritten — it's replayed to the API
// verbatim next turn, so it must stay in the API's own vocabulary.
function toApiToolName(name: string): string {
  return name.replace(/\./g, "__");
}

function fromApiToolName(apiName: string): string {
  return apiName.replace(/__/g, ".");
}

// True if issuing this call would complete `limit` identical calls in a row.
// Only the last (limit - 1) history entries matter — anything older is
// irrelevant to "N times consecutively".
function completesRepeat(history: CallRecord[], name: string, argsSignature: string, limit: number): boolean {
  if (limit <= 1) return true;
  const windowSize = limit - 1;
  if (history.length < windowSize) return false;
  const window = history.slice(history.length - windowSize);
  return window.every((entry) => entry.name === name && entry.argsSignature === argsSignature);
}

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
    repeatLimit = DEFAULT_REPEAT_LIMIT,
    captureToolContent = false,
  } = options;

  const tracer = getTracer();
  // One run = one trace: every model-call and tool-call span below is
  // created as a child of this span via an explicit parent context (not
  // startActiveSpan's implicit one, since async generators can't yield
  // across that callback boundary).
  const rootSpan = tracer.startSpan(GEN_AI_OPERATION_INVOKE_AGENT, {
    attributes: { [GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_INVOKE_AGENT },
  });
  const rootContext = trace.setSpan(context.active(), rootSpan);

  try {
    yield { type: "run.started", runId, ts: Date.now(), task };

    const tools: Anthropic.Tool[] = registry.specs().map((spec) => ({
      name: toApiToolName(spec.name),
      description: spec.description,
      input_schema: spec.inputSchema as Anthropic.Tool["input_schema"],
    }));

    const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];
    const callHistory: CallRecord[] = [];

    for (let turn = 0; turn < maxTurns; turn++) {
      const chatSpan = tracer.startSpan(
        `${GEN_AI_OPERATION_CHAT} ${model}`,
        {
          attributes: {
            [GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_CHAT,
            [GEN_AI_PROVIDER_NAME]: GEN_AI_PROVIDER_ANTHROPIC,
            [GEN_AI_REQUEST_MODEL]: model,
            [SKILL_CANDIDATES]: tools.length,
          },
        },
        rootContext,
      );

      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        thinking: thinking ?? undefined,
        tools,
        messages,
      });

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
        chatSpan.recordException(error instanceof Error ? error : String(error));
        chatSpan.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
        chatSpan.end();
        yield { type: "run.error", runId, ts: Date.now(), message: String(error) };
        return;
      }

      chatSpan.setAttribute(GEN_AI_USAGE_INPUT_TOKENS, message.usage.input_tokens);
      chatSpan.setAttribute(GEN_AI_USAGE_OUTPUT_TOKENS, message.usage.output_tokens);
      if (message.usage.cache_read_input_tokens != null) {
        chatSpan.setAttribute(GEN_AI_USAGE_CACHE_READ_INPUT_TOKENS, message.usage.cache_read_input_tokens);
      }
      if (message.usage.cache_creation_input_tokens != null) {
        chatSpan.setAttribute(GEN_AI_USAGE_CACHE_WRITE_INPUT_TOKENS, message.usage.cache_creation_input_tokens);
      }

      const toolUseBlocks = message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
      if (toolUseBlocks.length > 0) {
        chatSpan.setAttribute(SKILL_SELECTED, toolUseBlocks.map((call) => fromApiToolName(call.name)).join(","));
      }
      chatSpan.end();

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

      const callsWithSignature = toolUseBlocks.map((call) => ({
        call,
        realName: fromApiToolName(call.name),
        argsSignature: stableStringify(call.input),
      }));

      const wouldRepeat = callsWithSignature.some(({ realName, argsSignature }) =>
        completesRepeat(callHistory, realName, argsSignature, repeatLimit),
      );

      if (wouldRepeat) {
        yield { type: "run.finished", runId, ts: Date.now(), stopReason: "repeat_detected" };
        return;
      }

      for (const { realName, argsSignature } of callsWithSignature) {
        callHistory.push({ name: realName, argsSignature });
      }

      for (const { call, realName } of callsWithSignature) {
        yield { type: "tool.started", runId, ts: Date.now(), toolCallId: call.id, name: realName, input: call.input };
      }

      const outcomes = createChannel<ToolOutcome>();
      const tasks = callsWithSignature.map(async ({ call, realName }) => {
        const toolSpan = tracer.startSpan(
          `${GEN_AI_OPERATION_EXECUTE_TOOL} ${realName}`,
          {
            attributes: {
              [GEN_AI_OPERATION_NAME]: GEN_AI_OPERATION_EXECUTE_TOOL,
              [GEN_AI_TOOL_NAME]: realName,
              [GEN_AI_TOOL_CALL_ID]: call.id,
            },
          },
          rootContext,
        );
        if (captureToolContent) {
          toolSpan.setAttribute(GEN_AI_TOOL_CALL_ARGUMENTS, JSON.stringify(call.input));
        }
        const startedAt = Date.now();
        try {
          const result = await registry.execute(realName, call.input);
          const content = typeof result === "string" ? result : JSON.stringify(result);
          if (captureToolContent) {
            toolSpan.setAttribute(GEN_AI_TOOL_CALL_RESULT, content);
          }
          toolSpan.end();
          outcomes.push({
            event: {
              type: "tool.finished",
              runId,
              ts: Date.now(),
              toolCallId: call.id,
              name: realName,
              result,
              durationMs: Date.now() - startedAt,
            },
            toolResult: {
              type: "tool_result",
              tool_use_id: call.id,
              content,
            },
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          toolSpan.recordException(error instanceof Error ? error : errorMessage);
          toolSpan.setAttribute(ERROR_TYPE, error instanceof Error ? error.constructor.name : "UnknownError");
          toolSpan.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage });
          toolSpan.end();
          outcomes.push({
            event: {
              type: "tool.failed",
              runId,
              ts: Date.now(),
              toolCallId: call.id,
              name: realName,
              error: errorMessage,
            },
            toolResult: {
              type: "tool_result",
              tool_use_id: call.id,
              content: errorMessage,
              is_error: true,
            },
          });
        }
      });

      // Every task pushes exactly one outcome (success or caught failure), so
      // closing the channel once all settle is safe — nothing is ever dropped.
      void Promise.allSettled(tasks).then(() => outcomes.close());

      const toolResultsById = new Map<string, Anthropic.ToolResultBlockParam>();
      for await (const outcome of outcomes) {
        yield outcome.event;
        toolResultsById.set(outcome.toolResult.tool_use_id, outcome.toolResult);
      }

      // Re-order to match the original call order for a deterministic transcript —
      // tool_result blocks are matched to tool_use by id, not position, so this is
      // cosmetic, not an API requirement.
      const toolResults = toolUseBlocks.map((call) => {
        const result = toolResultsById.get(call.id);
        if (!result) {
          throw new Error(`Missing tool result for call ${call.id} — this is a bug in runAgent.`);
        }
        return result;
      });

      messages.push({ role: "user", content: toolResults });
    }

    yield { type: "run.finished", runId, ts: Date.now(), stopReason: "turn_budget" };
  } finally {
    rootSpan.end();
  }
}
